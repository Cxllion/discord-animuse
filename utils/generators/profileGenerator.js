const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const { refreshDiscordUrls } = require('../services/storageService');
const logger = require('../core/logger');
const CONFIG = require('../config');
const { secureLoadImage } = require('../core/visualUtils');


// --- COLOR MIXING ARCHITECTURE ---
const hexToRgbArr = (hex) => {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
    }
    return [r, g, b];
};

const rgbToHex = (r, g, b) => {
    return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1);
};

const mixColors = (hex1, hex2, weight) => {
    const [r1, g1, b1] = hexToRgbArr(hex1);
    const [r2, g2, b2] = hexToRgbArr(hex2);
    const w = Math.max(0, Math.min(1, weight));
    const w1 = 1 - w;
    const r = Math.round(r1 * w1 + r2 * w);
    const g = Math.round(g1 * w1 + g2 * w);
    const b = Math.round(b1 * w1 + b2 * w);
    return rgbToHex(r, g, b);
};

const hexToRgba = (hex, opacity) => {
    const [r, g, b] = hexToRgbArr(hex);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

// --- VERTICAL WIDGET ARCHITECTURE ---
const CARD_WIDTH = 400;
const CARD_HEIGHT_LINKED = 500;
const CARD_HEIGHT_UNLINKED = 320;
const FONT_STACK = "'monalqo', 'Times New Roman', serif";

// --- CACHING & PERFORMANCE ARCHITECTURE ---
const patternCache = new Map();
let noiseTile = null;

const getNoiseTile = () => {
    if (noiseTile) return noiseTile;
    const tileW = 400, tileH = 500; // Large enough for all modes
    const canvas = createCanvas(tileW, tileH);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#826e5a';
    for (let i = 0; i < (tileW * tileH * 0.15); i++) {
        const x = Math.random() * tileW;
        const y = Math.random() * tileH;
        ctx.fillRect(x, y, 1, 1);
    }
    noiseTile = canvas;
    return noiseTile;
};

const drawNoise = (ctx, w, h, opacity = 0.03) => {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(getNoiseTile(), 0, 0, w, h);
    ctx.restore();
};

const drawSeigaihaPattern = (ctx, width, height, themeColor) => {
    const cacheKey = `${themeColor}_${width}_${height}`;
    if (patternCache.has(cacheKey)) {
        ctx.drawImage(patternCache.get(cacheKey), 0, 0);
        return;
    }

    const offscreen = createCanvas(width, height);
    const octx = offscreen.getContext('2d');
    octx.strokeStyle = themeColor ? hexToRgba(themeColor, 0.06) : 'rgba(255, 255, 255, 0.015)';
    octx.lineWidth = 1;
    const radius = 18;
    for (let y = 0; y < height + radius * 2; y += radius) {
        for (let x = 0; x < width + radius * 2; x += radius * 2) {
            const offsetX = (y / radius) % 2 === 0 ? 0 : radius;
            const cx = x + offsetX;
            [radius, radius - 4, radius - 8].forEach(r => {
                octx.beginPath(); octx.arc(cx, y, r, Math.PI, 0); octx.stroke();
            });
        }
    }
    patternCache.set(cacheKey, offscreen);
    ctx.drawImage(offscreen, 0, 0);
};

const formatStat = (num) => {
    const n = parseFloat(num) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    if (n % 1 !== 0) return n.toFixed(1);
    return n.toLocaleString();
};

const fitText = (ctx, text, fontFamilies, baseSize, baseWeight, maxWidth) => {
    let size = baseSize;
    ctx.font = `${baseWeight} ${size}px ${fontFamilies}`;
    while (ctx.measureText(text).width > maxWidth && size > 1) {
        size -= 0.5;
        ctx.font = `${baseWeight} ${size}px ${fontFamilies}`;
    }
    return ctx.font;
};

const generateProfileCard = async (discordUser, userData, favorites, bannerUrl = null, primaryColor = null, displayName = null, onBannerFailure = null) => {
    const isCompact = !userData.anilist_synced;
    let CARD_HEIGHT = isCompact ? CARD_HEIGHT_UNLINKED : CARD_HEIGHT_LINKED;

    // --- 1. RESOLVE BANNER PRIORITY & DYNAMIC DIMENSIONS ---
    let bannerPriority = [];
    if (bannerUrl && typeof bannerUrl === 'object') {
        bannerPriority.push(bannerUrl.customUrl || bannerUrl.anilistBanner || bannerUrl.url);
    } else if (bannerUrl) {
        bannerPriority.push(bannerUrl);
    }
    if (userData.discordBannerUrl) bannerPriority.push(userData.discordBannerUrl);

    const isPremium = userData.isPremium || userData.is_premium || userData.isBooster || userData.is_booster;
    if (!isPremium) bannerPriority = [];

    // Filter out invalid sources
    bannerPriority = bannerPriority.filter(url => url && typeof url === 'string');
    const hasBanner = bannerPriority.length > 0;
    const Y_OFFSET = hasBanner ? 0 : 86; // Collapse top if no banner exists or user is non-premium

    const SCALE = 2.5;
    const canvas = createCanvas(Math.floor(CARD_WIDTH * SCALE), Math.floor((CARD_HEIGHT - Y_OFFSET) * SCALE));
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    // Shift coordinate system for no-banner mode
    if (!hasBanner) ctx.translate(0, -Y_OFFSET);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // --- 2. DYNAMIC COLOR PALETTE SYSTEM ---
    const THEME_ACCENT = primaryColor || '#FFACD1';
    const COLOR_BG = '#21232a';

    // UI Elements 
    const COLOR_HIGHLIGHT = mixColors('#ffffff', THEME_ACCENT, 0.8);
    const COLOR_SHADOW = mixColors('#000000', THEME_ACCENT, 0.4);

    // Deep, un-muddied ink for text - Guaranteed contrast on parchment
    const COLOR_INK = mixColors('#1a1a1a', THEME_ACCENT, 0.35);
    
    // High-contrast version of theme color for icons/decors
    const COLOR_DECOR = mixColors('#111111', THEME_ACCENT, 0.65);

    // True Leather Mixed with Theme Accent
    const COLOR_LEATHER_DARK = mixColors('#110905', THEME_ACCENT, 0.15);
    const COLOR_LEATHER_MID = mixColors('#3e2418', THEME_ACCENT, 0.15);
    const COLOR_LEATHER_LIGHT = mixColors('#5c3523', THEME_ACCENT, 0.15);

    ctx.clearRect(0, Y_OFFSET, CARD_WIDTH, CARD_HEIGHT);

    try {
        const defaultBg = path.join(__dirname, 'images', 'profile_background_default.png');
        const defaultAv = path.join(__dirname, 'images', 'unnamed.jpg');

        let avatarPriority = [];
        const discordAvatarUrl = discordUser.displayAvatarURL({ extension: 'png', size: 512 });
        const avConfig = userData.avatarConfig || { source: 'DISCORD_GLOBAL' };

        if (avConfig.source === 'DISCORD_GUILD' && userData.guildAvatarUrl) {
            avatarPriority.push(userData.guildAvatarUrl);
        } else if (avConfig.source === 'ANILIST') {
            avatarPriority.push(avConfig.anilistAvatar || userData.anilistAvatar);
        } else if (avConfig.source === 'CUSTOM') {
            avatarPriority.push(avConfig.customUrl || userData.customAvatarUrl);
        }
        if (!avatarPriority.includes(discordAvatarUrl)) avatarPriority.push(discordAvatarUrl);

        // --- 3. PARALLEL NETWORK ARCHIVE FETCH ---
        const [bgImg, avatar] = await Promise.all([
            hasBanner ? secureLoadImage(bannerPriority, defaultBg) : Promise.resolve(null),
            secureLoadImage(avatarPriority, defaultAv)
        ]);

        // --- 4. BASE CARD ---
        ctx.save();
        ctx.beginPath(); ctx.roundRect(0, Y_OFFSET, CARD_WIDTH, CARD_HEIGHT - Y_OFFSET, 16);
        ctx.fillStyle = COLOR_BG;
        ctx.fill();
        ctx.clip();
        drawSeigaihaPattern(ctx, CARD_WIDTH, CARD_HEIGHT, THEME_ACCENT);
        ctx.restore();

        // --- 5. VINTAGE TOP BANNER (Optional) ---
        const bannerH = 135;
        if (hasBanner && bgImg) {
            ctx.save();
            ctx.beginPath(); ctx.roundRect(0, 0, CARD_WIDTH, bannerH, [16, 16, 0, 0]); ctx.clip();
            const ratio = Math.max(CARD_WIDTH / bgImg.width, bannerH / bgImg.height);
            const bgW = bgImg.width * ratio, bgH = bgImg.height * ratio;
            ctx.drawImage(bgImg, (CARD_WIDTH - bgW) / 2, (bannerH - bgH) / 2, bgW, bgH);
            ctx.restore();

            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetY = 3;
            ctx.beginPath(); ctx.moveTo(0, bannerH); ctx.lineTo(CARD_WIDTH, bannerH);
            ctx.strokeStyle = THEME_ACCENT; ctx.lineWidth = 2.5; ctx.stroke();
            ctx.restore();
        }

        // --- 6. CLASSIC PORTRAIT ---
        const avX = 85, avY = 148, avR = 42;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 5;

        const bezelGrad = ctx.createLinearGradient(avX - avR, avY - avR, avX + avR, avY + avR);
        bezelGrad.addColorStop(0, COLOR_HIGHLIGHT);
        bezelGrad.addColorStop(0.5, THEME_ACCENT);
        bezelGrad.addColorStop(1, COLOR_SHADOW);

        ctx.beginPath(); ctx.arc(avX, avY, avR + 4.5, 0, Math.PI * 2);
        ctx.fillStyle = bezelGrad; ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.beginPath(); ctx.arc(avX, avY, avR + 1.5, 0, Math.PI * 2);
        ctx.fillStyle = COLOR_BG; ctx.fill();

        if (avatar) {
            ctx.save();
            ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(avatar, avX - avR, avY - avR, avR * 2, avR * 2);
            ctx.restore();
        }
        ctx.restore();

        // --- 7. LITERARY IDENTITY ---
        const avatarBottomY = avY + avR + 4.5;
        const titleY = avatarBottomY + 6; // Shifted down 7px from previous (-1) to give breathing room from banner
        const nameY = titleY - 32; // Maintained breathing room between name and title
        const nameX = 145;

        const nameText = ((displayName || discordUser.username).length > 20 ? (displayName || discordUser.username).substring(0, 20) + '...' : (displayName || discordUser.username)).toUpperCase();

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = fitText(ctx, nameText, `'monalqo', 'monalqo', ${FONT_STACK}`, 34, 'normal', 240);
        ctx.textAlign = 'left';
        ctx.fillText(nameText, nameX, nameY);

        ctx.shadowColor = 'transparent';

        const titleText = userData.title || 'Chart Librarian';
        ctx.fillStyle = THEME_ACCENT;
        ctx.font = fitText(ctx, titleText, `'pacifico', 'alexbrush', 'Dancing Script', 'Lucida Handwriting', 'Brush Script MT', 'monalqo', cursive, ${FONT_STACK}`, 24, 'normal', 240);
        ctx.fillText(titleText, nameX, titleY);
        ctx.restore();

        // --- 5. FADING DIVIDER ---
        const panelX = 30, panelW = CARD_WIDTH - 60;
        const ribbonY = 215;

        const lineGrad = ctx.createLinearGradient(panelX, ribbonY, panelX + panelW, ribbonY);
        lineGrad.addColorStop(0, hexToRgba(THEME_ACCENT, 0));
        lineGrad.addColorStop(0.15, THEME_ACCENT);
        lineGrad.addColorStop(0.85, THEME_ACCENT);
        lineGrad.addColorStop(1, hexToRgba(THEME_ACCENT, 0));

        ctx.beginPath(); ctx.moveTo(panelX, ribbonY); ctx.lineTo(panelX + panelW, ribbonY);
        ctx.strokeStyle = lineGrad; ctx.lineWidth = 1; ctx.stroke();

        // --- 6. LIBRARY RECORD PANEL ---
        let panelBottomY = ribbonY;
        if (userData.anilist_synced) {
            const panelY = 232;
            const panelH = 168;
            const panelR = 8;
            const stats = userData.anilist || {};

            ctx.save();

            ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 15; ctx.shadowOffsetY = 8;
            ctx.beginPath(); ctx.roundRect(panelX, panelY, panelW, panelH, panelR);
            ctx.fillStyle = '#f8f4e6';
            ctx.fill();

            ctx.shadowColor = 'transparent';
            ctx.save();
            ctx.clip();

            const vignette = ctx.createRadialGradient(panelX + panelW / 2, panelY + panelH / 2, panelH * 0.2, panelX + panelW / 2, panelY + panelH / 2, panelW * 0.7);
            vignette.addColorStop(0, 'rgba(0,0,0,0)');
            vignette.addColorStop(1, hexToRgba(THEME_ACCENT, 0.12));
            ctx.fillStyle = vignette;
            ctx.fill();

            drawNoise(ctx, CARD_WIDTH, CARD_HEIGHT, 0.04);
            ctx.restore();

            // Inner Engraved Frames
            ctx.strokeStyle = hexToRgba(THEME_ACCENT, 0.6);
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.roundRect(panelX + 6, panelY + 6, panelW - 12, panelH - 12, panelR - 2); ctx.stroke();
            ctx.strokeStyle = hexToRgba(THEME_ACCENT, 0.2);
            ctx.beginPath(); ctx.roundRect(panelX + 9, panelY + 9, panelW - 18, panelH - 18, panelR - 4); ctx.stroke();

            // --- DYNAMIC ARCHIVAL TIER BOOKMARK ---
            const isPremium = userData.is_premium;
            const isBooster = userData.is_booster;
            
            const bookmarkX = panelX + panelW - 55, bookmarkW = 34, bookmarkH = 58; // Slightly longer
            const bookmarkTopY = panelY - 4;

            ctx.save();
            
            // Tier-Specific Colors & Effects
            let bmColor = THEME_ACCENT;
            if (isPremium) bmColor = '#D4AF37'; // Antique Gold
            if (isBooster) bmColor = '#A855F7'; // Royal Booster Purple

            if (isBooster || isPremium) {
                ctx.shadowColor = hexToRgba(bmColor, 0.6);
                ctx.shadowBlur = 12;
            } else {
                ctx.shadowColor = 'rgba(0,0,0,0.5)';
                ctx.shadowBlur = 8;
            }
            ctx.shadowOffsetY = 5;

            ctx.beginPath();
            ctx.moveTo(bookmarkX, bookmarkTopY);
            ctx.lineTo(bookmarkX + bookmarkW, bookmarkTopY);
            ctx.lineTo(bookmarkX + bookmarkW, bookmarkTopY + bookmarkH);
            ctx.lineTo(bookmarkX + bookmarkW / 2, bookmarkTopY + bookmarkH - 14);
            ctx.lineTo(bookmarkX, bookmarkTopY + bookmarkH);
            ctx.closePath();

            // 1. Solid Base
            ctx.fillStyle = bmColor;
            ctx.fill();

            // 2. High-Fidelity Satin Shading
            const bmRoll = ctx.createLinearGradient(bookmarkX, 0, bookmarkX + bookmarkW, 0);
            bmRoll.addColorStop(0, 'rgba(0,0,0,0.4)');
            bmRoll.addColorStop(0.2, 'rgba(0,0,0,0.1)');
            bmRoll.addColorStop(0.5, 'rgba(255,255,255,0.45)');
            bmRoll.addColorStop(0.8, 'rgba(0,0,0,0.2)');
            bmRoll.addColorStop(1, 'rgba(0,0,0,0.4)');
            ctx.fillStyle = bmRoll;
            ctx.fill();

            // 3. Gold/Silver Thread for Premium/Booster
            if (isPremium || isBooster) {
                ctx.save();
                ctx.globalCompositeOperation = 'overlay';
                ctx.fillStyle = 'rgba(255,255,255,0.2)';
                for(let i=0; i<15; i++) {
                    ctx.fillRect(bookmarkX + (Math.random()*bookmarkW), bookmarkTopY, 1, bookmarkH);
                }
                ctx.restore();
            }

            ctx.shadowColor = 'transparent';

            // Top Fold Detail
            ctx.save();
            ctx.clip();
            const bmFold = ctx.createLinearGradient(0, bookmarkTopY, 0, bookmarkTopY + 14);
            bmFold.addColorStop(0, 'rgba(0,0,0,0.6)');
            bmFold.addColorStop(0.4, 'rgba(0,0,0,0.1)');
            bmFold.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = bmFold;
            ctx.fill();
            ctx.restore();

            // Outer Stroke
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // 4. Tier Emblems
            const emblemX = bookmarkX + bookmarkW / 2;
            const emblemY = bookmarkTopY + bookmarkH - 30;

            if (isBooster) {
                // Ethereal Crystal Emblem
                ctx.save();
                ctx.translate(emblemX, emblemY);
                ctx.beginPath();
                ctx.moveTo(0, -8); ctx.lineTo(5, 0); ctx.lineTo(0, 8); ctx.lineTo(-5, 0); ctx.closePath();
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = '#ffffff';
                ctx.shadowBlur = 10;
                ctx.fill();
                
                // Cross Glint
                ctx.strokeStyle = 'rgba(255,255,255,0.8)';
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.stroke();
                ctx.restore();
            } else if (isPremium) {
                // Golden Star Emblem
                ctx.save();
                ctx.translate(emblemX, emblemY);
                ctx.beginPath();
                for (let i = 0; i < 5; i++) {
                    ctx.lineTo(Math.cos((18 + i * 72) / 180 * Math.PI) * 7, -Math.sin((18 + i * 72) / 180 * Math.PI) * 7);
                    ctx.lineTo(Math.cos((54 + i * 72) / 180 * Math.PI) * 3, -Math.sin((54 + i * 72) / 180 * Math.PI) * 3);
                }
                ctx.closePath();
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = '#ffffff';
                ctx.shadowBlur = 8;
                ctx.fill();
                ctx.restore();
            }

            // 5. Decorative Stitching
            const st = 4;
            const drawStitchPath = () => {
                ctx.beginPath();
                ctx.moveTo(bookmarkX + st, bookmarkTopY + 2);
                ctx.lineTo(bookmarkX + st, bookmarkTopY + bookmarkH - st - 4);
                ctx.lineTo(bookmarkX + bookmarkW / 2, bookmarkTopY + bookmarkH - 14 - st + 2);
                ctx.lineTo(bookmarkX + bookmarkW - st, bookmarkTopY + bookmarkH - st - 4);
                ctx.lineTo(bookmarkX + bookmarkW - st, bookmarkTopY + 2);
            };

            drawStitchPath();
            ctx.strokeStyle = 'rgba(0,0,0,0.5)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.stroke();

            ctx.translate(0, -0.5);
            drawStitchPath();
            ctx.strokeStyle = (isPremium || isBooster) ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.setLineDash([]);
            ctx.restore();

            // Record Panel Data
            const alignX = panelX + 26;
            const titleRowY = panelY + 32;

            ctx.fillStyle = COLOR_INK;
            ctx.font = `24px 'gunty', ${FONT_STACK}`;
            ctx.fillText('Library Record', alignX, titleRowY);

            ctx.save();
            const headUnderline = ctx.createLinearGradient(alignX, 0, alignX + 150, 0);
            headUnderline.addColorStop(0, hexToRgba(THEME_ACCENT, 0.6));
            headUnderline.addColorStop(1, hexToRgba(THEME_ACCENT, 0));
            ctx.strokeStyle = headUnderline;
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(alignX, panelY + 42); ctx.lineTo(alignX + 150, panelY + 42); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(alignX, panelY + 45); ctx.lineTo(alignX + 120, panelY + 45); ctx.stroke();

            const rowStartY = panelY + 74;
            const rowSpacing = 32;

            const drawRow = (centerY, label, value, iconType) => {
                const ix = alignX + 10;
                ctx.beginPath(); ctx.arc(ix, centerY, 13, 0, Math.PI * 2);
                ctx.fillStyle = hexToRgba(COLOR_DECOR, 0.1);
                ctx.fill();

                // Vibrant Theme Icons - Adaptive Contrast
                ctx.strokeStyle = COLOR_DECOR;
                ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
                ctx.fillStyle = COLOR_DECOR;

                if (iconType === 'anime') {
                    ctx.beginPath();
                    ctx.roundRect(ix - 7, centerY - 5.5, 14, 11, 2);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(ix - 1.5, centerY - 2.5);
                    ctx.lineTo(ix + 3.5, centerY);
                    ctx.lineTo(ix - 1.5, centerY + 2.5);
                    ctx.closePath();
                    ctx.fill();
                } else if (iconType === 'manga') {
                    ctx.beginPath();
                    ctx.moveTo(ix - 7, centerY - 4); ctx.lineTo(ix - 7, centerY + 5);
                    ctx.moveTo(ix + 7, centerY - 4); ctx.lineTo(ix + 7, centerY + 5);
                    ctx.moveTo(ix, centerY - 3); ctx.lineTo(ix, centerY + 6);
                    ctx.moveTo(ix - 7, centerY - 4); ctx.quadraticCurveTo(ix - 3.5, centerY - 5.5, ix, centerY - 3);
                    ctx.moveTo(ix, centerY - 3); ctx.quadraticCurveTo(ix + 3.5, centerY - 5.5, ix + 7, centerY - 4);
                    ctx.moveTo(ix - 7, centerY + 5); ctx.quadraticCurveTo(ix - 3.5, centerY + 3.5, ix, centerY + 6);
                    ctx.moveTo(ix, centerY + 6); ctx.quadraticCurveTo(ix + 3.5, centerY + 3.5, ix + 7, centerY + 5);
                    ctx.stroke();
                } else {
                    ctx.beginPath();
                    ctx.moveTo(ix - 5, centerY - 7); ctx.lineTo(ix + 5, centerY - 7);
                    ctx.moveTo(ix - 5, centerY + 7); ctx.lineTo(ix + 5, centerY + 7);
                    ctx.moveTo(ix - 5, centerY - 7); ctx.lineTo(ix + 5, centerY + 7);
                    ctx.moveTo(ix + 5, centerY - 7); ctx.lineTo(ix - 5, centerY + 7);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(ix - 5, centerY + 7); ctx.lineTo(ix, centerY); ctx.lineTo(ix + 5, centerY + 7);
                    ctx.fill();
                }

                ctx.textBaseline = 'middle';
                const labelX = alignX + 34;

                ctx.fillStyle = mixColors('#333333', THEME_ACCENT, 0.4);
                ctx.font = `16px 'monalqo', ${FONT_STACK}`;
                ctx.fillText(label, labelX, centerY + 1);

                const valText = formatStat(value);
                const valX = panelX + panelW - 23;
                ctx.font = `bold 16px 'monalqo', ${FONT_STACK}`;
                ctx.textAlign = 'right';
                ctx.fillStyle = COLOR_INK;
                ctx.fillText(valText, valX, centerY + 1);
                ctx.textAlign = 'left';

                const labelW = ctx.measureText(label).width;
                ctx.font = `bold 16px 'monalqo', ${FONT_STACK}`;
                const valW = ctx.measureText(valText).width;

                const dotStartX = labelX + labelW + 12;
                const dotEndX = valX - valW - 12;

                if (dotEndX > dotStartX) {
                    ctx.strokeStyle = hexToRgba(COLOR_DECOR, 0.4);
                    ctx.lineWidth = 1.5;
                    ctx.setLineDash([2, 5]);
                    ctx.beginPath();
                    ctx.moveTo(dotStartX, centerY + 5);
                    ctx.lineTo(dotEndX, centerY + 5);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }

                ctx.textBaseline = 'alphabetic';
            };

            drawRow(rowStartY, 'Anime Watched', stats.completed || 0, 'anime');
            drawRow(rowStartY + rowSpacing, 'Manga Read', stats.manga_completed || 0, 'manga');
            drawRow(rowStartY + rowSpacing * 2, 'Days Archived', stats.days || 0, 'days');

            ctx.restore();
            panelBottomY = panelY + panelH;
        }

        // --- 7. READING PROGRESS ---
        const termY = isCompact ? panelBottomY + 20 : panelBottomY + 28;
        const currentXP = userData.current || 0;
        const requiredXP = userData.required || 1;
        const levelPercent = Math.min(1, currentXP / requiredXP) || 0;

        ctx.textBaseline = 'alphabetic';

        ctx.fillStyle = '#f1ecd8';
        ctx.font = `20px 'gunty', ${FONT_STACK}`;
        ctx.fillText('Musing Progress', 30, termY);

        // --- PREMIUM THEME-TINTED XP PLATE ---
        ctx.save();
        const curText = formatStat(currentXP);
        const reqText = `${formatStat(requiredXP)} XP`;

        ctx.font = `bold 13px 'monalqo', ${FONT_STACK}`;
        const curW = ctx.measureText(curText).width;
        const reqW = ctx.measureText(reqText).width;

        const padH = 16;
        const divW = 24;
        const boxW = curW + reqW + divW + (padH * 2);
        const boxH = 24;
        const boxX = CARD_WIDTH - 30 - boxW;
        const boxY = termY - 18;

        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;

        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxW, boxH, 2);

        const themedPlateGrad = ctx.createLinearGradient(boxX, boxY, boxX + boxW, boxY + boxH);
        themedPlateGrad.addColorStop(0, mixColors('#ffffff', THEME_ACCENT, 0.6));
        themedPlateGrad.addColorStop(0.5, THEME_ACCENT);
        themedPlateGrad.addColorStop(1, mixColors('#000000', THEME_ACCENT, 0.5));
        ctx.fillStyle = themedPlateGrad;

        ctx.fill();
        ctx.shadowColor = 'transparent';

        ctx.beginPath();
        ctx.roundRect(boxX + 2, boxY + 2, boxW - 4, boxH - 4, 1);
        ctx.fillStyle = '#f2ebda';
        ctx.fill();

        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const drawRivet = (rx, ry) => {
            ctx.beginPath();
            ctx.arc(rx, ry, 1.2, 0, Math.PI * 2);
            ctx.fillStyle = mixColors('#000000', THEME_ACCENT, 0.6);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(rx - 0.3, ry - 0.3, 0.4, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        };
        drawRivet(boxX + 4, boxY + 4);
        drawRivet(boxX + boxW - 4, boxY + 4);
        drawRivet(boxX + 4, boxY + boxH - 4);
        drawRivet(boxX + boxW - 4, boxY + boxH - 4);

        const divX = boxX + padH + curW + (divW / 2);
        ctx.strokeStyle = hexToRgba(COLOR_INK, 0.4);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(divX, boxY + 6);
        ctx.lineTo(divX, boxY + boxH - 6);
        ctx.stroke();

        ctx.fillStyle = COLOR_INK;
        ctx.beginPath(); ctx.arc(divX, boxY + 6, 1, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(divX, boxY + boxH - 6, 1, 0, Math.PI * 2); ctx.fill();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.fillStyle = COLOR_INK;
        ctx.font = `bold 13px 'monalqo', ${FONT_STACK}`;
        ctx.fillText(curText, boxX + padH + (curW / 2), boxY + (boxH / 2) + 1);

        ctx.fillStyle = COLOR_DECOR;
        ctx.font = `11px 'monalqo', ${FONT_STACK}`;
        ctx.fillText(reqText, boxX + boxW - padH - (reqW / 2), boxY + (boxH / 2) + 1);

        ctx.restore();
        ctx.textAlign = 'left';

        // --- PHYSICAL BOOK SPINE & SEAL ---
        const barY = termY + 22;
        const barH = 24;

        const levelNum = userData.level || 0;
        const sealX = 50;
        const sealR = 24;
        const sealY = barY + (barH / 2);

        const barX = sealX + sealR - 10;
        const barW = CARD_WIDTH - 30 - barX;

        ctx.save();

        const drawBindingLine = (ctx, t, offset, color) => {
            const R = barH / 2;
            const pathR = R - offset;
            ctx.beginPath();
            ctx.moveTo(barX + barW, barY + offset);
            ctx.lineTo(barX + R, barY + offset);
            ctx.arc(barX + R, barY + R, pathR, 1.5 * Math.PI, 0.5 * Math.PI, true);
            ctx.lineTo(barX + barW, barY + barH - offset);

            ctx.strokeStyle = color;
            ctx.lineWidth = t;
            ctx.lineCap = 'butt';
            ctx.stroke();
        };

        const tCover = 4.5;
        const leatherCoverGrad = ctx.createLinearGradient(barX, barY, barX, barY + barH);
        leatherCoverGrad.addColorStop(0, COLOR_LEATHER_DARK);
        leatherCoverGrad.addColorStop(0.2, COLOR_LEATHER_MID);
        leatherCoverGrad.addColorStop(0.8, COLOR_LEATHER_MID);
        leatherCoverGrad.addColorStop(1, COLOR_LEATHER_DARK);

        drawBindingLine(ctx, tCover, tCover / 2, leatherCoverGrad);
        drawBindingLine(ctx, 1.2, tCover + 0.6, THEME_ACCENT);

        const tGap = 2;
        const offsetGap = tCover + 1.2 + (tGap / 2);
        drawBindingLine(ctx, tGap, offsetGap, '#16181d');

        const inset = tCover + 1.2 + tGap;
        const pageY = barY + inset;
        const pageW = barW - (inset * 2);
        const pageH = barH - (inset * 2);
        const tailDepth = 3.5;

        const claspW = 14;
        const claspH = 30;
        const claspX = barX + barW - 28;
        const claspY = barY - ((claspH - barH) / 2);

        const buildPagePath = () => {
            ctx.beginPath();
            ctx.moveTo(barX + barW, pageY);
            ctx.lineTo(barX + (barH / 2), pageY);
            ctx.arc(barX + (barH / 2), barY + (barH / 2), (barH / 2) - inset, 1.5 * Math.PI, 0.5 * Math.PI, true);
            ctx.lineTo(barX + barW, pageY + pageH);
            ctx.bezierCurveTo(barX + barW - tailDepth, pageY + pageH * 0.7, barX + barW - tailDepth, pageY + pageH * 0.3, barX + barW, pageY);
            ctx.closePath();
        };

        buildPagePath();
        ctx.fillStyle = '#f2ebda';
        ctx.fill();

        ctx.save();
        buildPagePath();
        ctx.clip();

        const vellumLineGrad = ctx.createLinearGradient(barX + inset, 0, barX + barW, 0);
        vellumLineGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vellumLineGrad.addColorStop(0.2, hexToRgba(COLOR_INK, 0.15));
        vellumLineGrad.addColorStop(0.8, hexToRgba(COLOR_INK, 0.15));
        vellumLineGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.strokeStyle = vellumLineGrad;
        ctx.lineWidth = 0.8;

        const lineSpacing = pageH / 4;
        for (let i = 1; i <= 3; i++) {
            ctx.beginPath();
            ctx.moveTo(barX + inset, pageY + lineSpacing * i);
            ctx.lineTo(barX + barW, pageY + lineSpacing * i);
            ctx.stroke();
        }

        if (levelPercent > 0) {
            const startX = barX + inset;
            const maxInkWidth = (claspX + claspW / 2) - startX;
            const fillWidth = maxInkWidth * levelPercent;

            ctx.beginPath();
            const startY = pageY + pageH / 2;
            ctx.moveTo(startX, startY);

            const amplitude = pageH * 0.35;
            const frequency = 0.32;

            for (let x = startX; x <= startX + fillWidth; x += 1) {
                const relX = x - startX;
                const y = startY + Math.sin(relX * frequency) * amplitude;
                ctx.lineTo(x, y);
            }

            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = COLOR_INK;
            ctx.lineWidth = 2.5;
            ctx.stroke();

            const finalRelX = fillWidth;
            const endY = startY + Math.sin(finalRelX * frequency) * amplitude;
            ctx.beginPath();
            ctx.arc(startX + fillWidth, endY, 3, 0, Math.PI * 2);
            ctx.fillStyle = COLOR_INK;
            ctx.fill();
        }
        ctx.restore();

        // True Textured Leather Index Clasp Rendering
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetY = 2;

        ctx.beginPath();
        ctx.roundRect(claspX, claspY, claspW, claspH, 3);

        const leatherGrad = ctx.createLinearGradient(claspX, 0, claspX + claspW, 0);
        leatherGrad.addColorStop(0, COLOR_LEATHER_DARK);
        leatherGrad.addColorStop(0.3, COLOR_LEATHER_LIGHT);
        leatherGrad.addColorStop(0.7, COLOR_LEATHER_MID);
        leatherGrad.addColorStop(1, COLOR_LEATHER_DARK);
        ctx.fillStyle = leatherGrad;
        ctx.fill();
        ctx.shadowColor = 'transparent';

        // Porous Leather Texture Overlay
        ctx.save();
        ctx.clip();
        drawNoise(ctx, CARD_WIDTH, CARD_HEIGHT, 0.12);
        ctx.restore();

        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(claspX, claspY + 4); ctx.lineTo(claspX + claspW, claspY + 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(claspX, claspY + claspH - 4); ctx.lineTo(claspX + claspW, claspY + claspH - 4); ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath(); ctx.moveTo(claspX, claspY + 5); ctx.lineTo(claspX + claspW, claspY + 5); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(claspX, claspY + claspH - 3); ctx.lineTo(claspX + claspW, claspY + claspH - 3); ctx.stroke();

        const rivetX = claspX + (claspW / 2);
        const rivetY = claspY + (claspH / 2);
        const rivetR = 2.5;

        // Brass rivets tinted to theme
        ctx.beginPath(); ctx.arc(rivetX, rivetY, rivetR + 1, 0, Math.PI * 2); ctx.fillStyle = mixColors('#b89947', THEME_ACCENT, 0.2); ctx.fill();
        ctx.beginPath(); ctx.arc(rivetX, rivetY, rivetR, 0, Math.PI * 2); ctx.fillStyle = mixColors('#e5c97c', THEME_ACCENT, 0.1); ctx.fill();
        ctx.beginPath(); ctx.arc(rivetX, rivetY, rivetR - 1.5, 0, Math.PI * 2); ctx.fillStyle = mixColors('#7a622a', THEME_ACCENT, 0.3); ctx.fill();
        ctx.restore();
        ctx.restore();

        // --- PREMIUM 9/10 WAX SEAL ---
        ctx.save();
        const drawSealPath = (radius) => {
            ctx.beginPath();
            for (let a = 0; a < Math.PI * 2; a += 0.15) {
                const r = radius + (Math.sin(a * 7) * 1.8) + (Math.cos(a * 11) * 1.2);
                const lx = sealX + Math.cos(a) * r;
                const ly = sealY + Math.sin(a) * r;
                if (a === 0) ctx.moveTo(lx, ly);
                else ctx.lineTo(lx, ly);
            }
            ctx.closePath();
        };

        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;

        drawSealPath(sealR);
        const waxGrad = ctx.createRadialGradient(sealX - 8, sealY - 8, 4, sealX, sealY, sealR);
        waxGrad.addColorStop(0, mixColors('#ffffff', THEME_ACCENT, 0.9)); // Luminous core
        waxGrad.addColorStop(0.6, mixColors('#ffffff', THEME_ACCENT, 0.8)); // Lightened body
        waxGrad.addColorStop(1, THEME_ACCENT); // Theme-tinted edge
        ctx.fillStyle = waxGrad;
        ctx.fill();
        ctx.shadowColor = 'transparent';

        ctx.save();
        ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for (let i = 0; i < 30; i++) {
            ctx.beginPath();
            ctx.arc(sealX + (Math.random() - 0.5) * sealR * 2, sealY + (Math.random() - 0.5) * sealR * 2, 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.beginPath(); ctx.arc(sealX, sealY, sealR - 6, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.beginPath(); ctx.arc(sealX, sealY, sealR - 7.5, 0, Math.PI * 2); ctx.stroke();

        const glossGrad = ctx.createLinearGradient(sealX - 15, sealY - 15, sealX + 5, sealY + 5);
        glossGrad.addColorStop(0, 'rgba(255,255,255,0.3)');
        glossGrad.addColorStop(0.5, 'rgba(255,255,255,0)');
        ctx.beginPath();
        ctx.arc(sealX, sealY, sealR - 3, 1.1 * Math.PI, 1.7 * Math.PI);
        ctx.strokeStyle = glossGrad;
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 2;
        ctx.shadowOffsetY = 1;

        ctx.font = `bold 8px 'monalqo', ${FONT_STACK}`;
        ctx.fillStyle = hexToRgba(COLOR_INK, 0.65);
        ctx.fillText('LVL', sealX, sealY - 8);

        const lvlStr = levelNum.toString();
        let lvlFontSize = 20;
        if (lvlStr.length === 3) lvlFontSize = 16;
        else if (lvlStr.length >= 4) lvlFontSize = 12;

        ctx.font = `bold ${lvlFontSize}px 'monalqo', ${FONT_STACK}`;
        ctx.fillStyle = COLOR_DECOR;
        ctx.fillText(lvlStr, sealX, sealY + 3);



        ctx.restore();
        ctx.textBaseline = 'alphabetic';

        // --- ARCHIVAL FOOTER WATERMARK ---
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '700 7px monalqo, sans-serif';
        if (ctx.letterSpacing !== undefined) ctx.letterSpacing = '6.5px';
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        const footerText = isCompact ? 'ANIMUSE PROFILE | UNLINKED' : 'ANIMUSE PROFILE';
        ctx.fillText(footerText, CARD_WIDTH / 2, CARD_HEIGHT - 8);
        ctx.restore();

    } catch (err) { console.error('Canvas Generation Error:', err); }

    return await canvas.encode('png');
};

const getDominantColor = async (imageUrl) => { return '#3B82F6'; };
module.exports = { generateProfileCard, getDominantColor };