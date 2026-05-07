const { loadImage } = require('@napi-rs/canvas');
const axios = require('axios');
const path = require('path');
const { refreshDiscordUrls } = require('../services/storageService');
const logger = require('./logger');

/**
 * Centralized Visual Utilities for Card Generators
 */

/**
 * Normalizes a Hex color to be high-contrast and premium for dark mode.
 * Caps saturation and clamps lightness to prevent "neon" or "washed out" colors.
 * @param {string} hex 
 * @returns {string} Normalized Hex
 */
const normalizeColor = (hex) => {
    if (!hex || !hex.startsWith('#')) return hex || '#FFACD1'; // Fallback to default pink

    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) h = s = 0;
    else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h /= 6;
    }

    // SOPHISTICATED CONSTRAINTS (Muted & Deep)
    s = Math.min(s, 0.55); // Aggressive Saturation Cap
    l = Math.max(0.4, Math.min(l, 0.65)); // Clamp Lightness (prevent too dark or too white)

    const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = x => Math.round(hue2rgb(p, q, x) * 255).toString(16).padStart(2, '0');

    return `#${f(h + 1 / 3)}${f(h)}${f(h - 1 / 3)}`.toUpperCase();
};

/**
 * Generates a full Material You-inspired color palette from a single dominant hex.
 * @param {string} hex 
 * @returns {object} Palette tokens
 */
const generateColorTokens = (hex) => {
    const primary = normalizeColor(hex);
    
    // Convert Primary to HSL for manipulation
    let r = parseInt(primary.slice(1, 3), 16) / 255;
    let g = parseInt(primary.slice(3, 5), 16) / 255;
    let b = parseInt(primary.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) h = s = 0;
    else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h /= 6;
    }

    const toHex = (h, s, l) => {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1; if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const f = x => Math.round(hue2rgb(p, q, x) * 255).toString(16).padStart(2, '0');
        return `#${f(h + 1/3)}${f(h)}${f(h - 1/3)}`.toUpperCase();
    };

    return {
        primary,
        secondary: toHex(h + 0.1, s * 0.5, 0.4),
        tertiary: toHex(h - 0.1, s * 0.5, 0.4),
        primaryContainer: toHex(h, s * 0.7, 0.18),
        secondaryContainer: toHex(h + 0.1, s * 0.3, 0.2),
        surface: toHex(h, s * 0.1, 0.05),
        surfaceVariant: toHex(h, s * 0.15, 0.12),
        onSurface: '#FFFFFF',
        onSurfaceVariant: 'rgba(255, 255, 255, 0.7)',
        outline: toHex(h, s * 0.2, 0.2),
        glow: toHex(h, s * 0.6, 0.4) 
    };
};

/**
 * Sanitizes a title by removing unrenderable decorative characters (like Japanese brackets)
 * that often result in "boxes" if the system font doesn't support them.
 * @param {string} text 
 * @returns {string}
 */
const sanitizeTitle = (text) => {
    if (!text) return '';
    // 1. Specifically target known offenders: Japanese full-width brackets/quotes
    let clean = text.replace(/[【】「」『』（）［］]/g, '');
    
    // 2. Remove non-printable characters and suspicious symbols that often fail
    // We keep standard Latin, common punctuation, and some extended Latin
    // This regex matches printable ASCII + some common symbols
    clean = clean.replace(/[^\x20-\x7E\s]/g, ''); 

    return clean.replace(/\s+/g, ' ' ).trim();
};

/**
 * Extracts metadata tags (Season, Part, Cour, etc.) from a title and returns the cleaned title.
 * @param {string} fullTitle 
 * @returns {{ title: string, tags: string[] }}
 */
const parseMetadata = (fullTitle) => {
    let title = sanitizeTitle(fullTitle);
    let tags = [];

    const patterns = [
        { regex: /Season\s+(\d+)/i, type: 'SEASON' },
        { regex: /Cour\s+(\d+)/i, type: 'COUR' },
        { regex: /Part\s+(\d+)/i, type: 'PART' },
        { regex: /\bS(\d+)\b/i, type: 'SEASON' },
        { regex: /(\d+)(?:st|nd|rd|th)\s+Season/i, type: 'SEASON' },
        { regex: /Final\s+Season/i, type: 'FINAL SEASON', literal: true },
        { regex: /The\s+Final\s+Chapters/i, type: 'FINAL CHAPTERS', literal: true },
        { regex: /Special\s+(\d+)/i, type: 'SPECIAL' },
        { regex: /\bSpecial\b/i, type: 'SPECIAL', literal: true }
    ];

    for (const p of patterns) {
        let match;
        while ((match = title.match(p.regex)) !== null) {
            if (p.literal) tags.push(p.type);
            else tags.push(`${p.type} ${match[1]}`);
            title = title.replace(match[0], '').trim();
        }
    }

    // Scrub trailing separators
    title = title.replace(/[:\-–\s]+$/, '');

    return { title, tags };
};
/**
 * Resolves a banner configuration into a usable URL string.
 * Orchestrates Discord API fetching for Profile/Server banners.
 */
const resolveBannerUrl = async (user, member, bannerConfig) => {
    if (!bannerConfig) return null;
    const { source, customUrl } = bannerConfig;

    if (source === 'CUSTOM' || source === 'PRESET') return customUrl;
    
    try {
        if (source === 'ANILIST') {
            const { getLinkedAnilist } = require('./database');
            const { getAniListProfile } = require('../services/anilistService');
            
            const linked = await getLinkedAnilist(user.id, member?.guild?.id || null);
            if (linked) {
                const profile = await getAniListProfile(linked);
                return profile.banner;
            }
        }
        if (source === 'DISCORD_USER') {
            const fetched = await user.fetch(true);
            return fetched.bannerURL({ size: 1024, extension: 'png' });
        }
        if (source === 'DISCORD_GUILD' && member) {
            const fetched = await member.fetch(true);
            return fetched.bannerURL({ size: 1024, extension: 'png' });
        }
    } catch (e) {
        // Fallback
    }
    return null;
};

/**
 * Checks if a string contains only characters that are likely supported by custom decorative fonts.
 * @param {string} text 
 * @returns {boolean}
 */
const isFontSafe = (text) => {
    if (!text) return true;
    // Basic printable ASCII range: 0x20 (space) to 0x7E (~)
    // We also allow standard whitespace characters
    return /^[\x20-\x7E\s]*$/.test(text);
};

/**
 * Resolves a member's name for display on graphics. 
 * Falls back to username if display name contains unsafe characters.
 * @param {object} member Discord GuildMember
 * @returns {string}
 */
const getResolvableName = (member) => {
    if (!member) return 'Unknown User';
    const displayName = member.displayName;
    const username = member.user.username;

    if (!isFontSafe(displayName)) {
        return username;
    }
    return displayName;
};

/**
 * Safely updates an interaction, accounting for deferred or replied states.
 * Supports both Component Interactions (update) and Commands (editReply).
 */
const safeUpdate = async (i, options) => {
    try {
        if (i.isMessageComponent()) {
            if (i.deferred || i.replied) return await i.editReply(options);
            return await i.update(options);
        }
        
        if (i.deferred || i.replied) return await i.editReply(options);
        return await i.reply({ ...options, flags: MessageFlags.Ephemeral });
    } catch (err) {
        if (err.code === 10062 || err.code === 40060) return;
        const logger = require('./logger');
        logger.error('safeUpdate Error:', err, 'VisualUtils');
    }
};

/**
 * Safely defers an interaction, accounting for already acknowledged states.
 * Supports both Component Interactions (deferUpdate) and Commands (deferReply).
 */
const safeDefer = async (i, ephemeral = true) => {
    try {
        if (i.deferred || i.replied) return;
        if (i.isMessageComponent()) {
            await i.deferUpdate().catch(() => {});
        } else {
            await i.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined }).catch(() => {});
        }
    } catch (err) {
        // Ignored: code 10062/40060 handled by Discord.js or catch block
    }
};

// --- PREMIUM ASSET CACHE ---
const staticAssetCache = new Map();

/**
 * Loads and caches local assets to prevent redundant I/O.
 */
const getCachedLocalImage = async (assetPath) => {
    if (!assetPath) return null;
    if (staticAssetCache.has(assetPath)) return staticAssetCache.get(assetPath);

    try {
        const img = await loadImage(assetPath);
        staticAssetCache.set(assetPath, img);
        return img;
    } catch (e) {
        logger.error(`Archival Cache Failed: Could not load ${assetPath}`, e, 'VisualUtils');
        return null;
    }
};

/**
 * Robust image loader with Discord URL refreshing, retries, and local caching.
 */
const secureLoadImage = async (urls, fallbackPath = null) => {
    let urlList = Array.isArray(urls) ? urls : [urls];
    urlList = urlList.filter(u => u && typeof u === 'string');

    // 1. Priority Cache Check
    for (const url of urlList) {
        if (staticAssetCache.has(url)) return staticAssetCache.get(url);
    }

    // 2. Archival URL Refresh
    try {
        const { refreshDiscordUrls } = require('../services/storageService');
        urlList = await refreshDiscordUrls(urlList);
    } catch (e) {
        // Fallback to original URLs
    }

    // 3. Intelligent Priority Fetch
    logger.debug(`Initiating Archival Wave for ${urlList.length} assets...`, 'VisualUtils');
    for (let i = 0; i < urlList.length; i++) {
        const url = urlList[i];
        try {
            // Speed optimization: Don't stall on slow custom URLs
            // Give the last available remote URL more time (8s), others get 5s
            const timeout = (i === urlList.length - 1) ? 8000 : 5000;

            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout,
                headers: { 'User-Agent': 'AniMuse/5.0' }
            });
            
            const image = await loadImage(Buffer.from(response.data));
            staticAssetCache.set(url, image);
            return image;
        } catch (e) {
            logger.warn(`Archival Wave Failed [Priority ${i}] (${url.substring(0, 30)}...): ${e.message}`, 'VisualUtils');
        }
    }

    // 4. Ground-Truth Fallback
    if (fallbackPath) {
        return await getCachedLocalImage(fallbackPath);
    }
    return null;
};

module.exports = {
    normalizeColor,
    generateColorTokens,
    parseMetadata,
    sanitizeTitle,
    resolveBannerUrl,
    isFontSafe,
    getResolvableName,
    safeUpdate,
    safeDefer,
    secureLoadImage,
    getCachedLocalImage
};
