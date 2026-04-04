const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const axios = require('axios');
const logger = require('../core/logger');
const CONFIG = require('../config');

// --- PREMIUM ASSET CACHE ---
const staticAssetCache = new Map();

/**
 * Loads a local asset with in-memory caching to prevent disk thrashing.
 */
const getCachedLocalImage = async (assetPath) => {
    if (!assetPath) return null;
    if (staticAssetCache.has(assetPath)) return staticAssetCache.get(assetPath);
    
    try {
        const img = await loadImage(assetPath);
        staticAssetCache.set(assetPath, img);
        return img;
    } catch (e) {
        logger.error(`Archival Cache Failed: Could not load ${assetPath}`, e, 'Generator');
        return null;
    }
};

// --- TACTICAL ASSET ACQUISITION ---
const secureLoadImage = async (url, fallbackPath = null) => {
    // 1. Check if we're requesting a local fallback directly
    if (!url && fallbackPath) return await getCachedLocalImage(fallbackPath);
    if (!url) return null;
    
    // 2. Local File Optimization (Skip remote uplink)
    if (typeof url === 'string' && (url.startsWith('/') || url.includes(':\\'))) {
        return await getCachedLocalImage(url);
    }

    // 3. Remote Uplink with Active Timeout (8s)
    try {
        const response = await axios.get(url, { 
            responseType: 'arraybuffer', 
            timeout: 8000,
            headers: { 'User-Agent': 'AniMuse-Archivist/1.0' }
        });
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        return await loadImage(Buffer.from(response.data));
    } catch (err) {
        logger.warn(`Asset Uplink Interrupted: ${url} (${err.message}). Falling back to archives.`, 'Generator');
        if (fallbackPath) {
            return await getCachedLocalImage(fallbackPath);
        }
    }
    return null;
};

// --- VERTICAL WIDGET ARCHITECTURE (V5: The Premium Polish) ---
const CARD_WIDTH = 400;
const CARD_HEIGHT_LINKED = 495;
const CARD_HEIGHT_UNLINKED = 355;

// Universal premium font stack
const FONT_STACK = "'-apple-system', 'Helvetica Neue', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const formatStat = (num) => {
    const n = parseFloat(num) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return n.toLocaleString();
};

const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// --- TECHNICAL UTILITY: AUTO-FIT PRECISION SCALING ---
const fitText = (ctx, text, fontFamilies, baseSize, baseWeight, maxWidth) => {
    let size = baseSize;
    ctx.font = `${baseWeight} ${size}px ${fontFamilies}`;
    while (ctx.measureText(text).width > maxWidth && size > 1) {
        size -= 0.5;
        ctx.font = `${baseWeight} ${size}px ${fontFamilies}`;
    }
    return ctx.font;
};

const drawScanlines = (ctx, w, h) => {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 0.5;
    for (let y = 0; y < h; y += 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
    }
    ctx.restore();
};

const generateProfileCard = async (discordUser, userData, favorites, bannerUrl = null, primaryColor = CONFIG.COLORS.PRIMARY, displayName = null, onBannerFailure = null) => {
    const isCompact = !userData.anilist_synced;
    const CARD_HEIGHT = isCompact ? CARD_HEIGHT_UNLINKED : CARD_HEIGHT_LINKED;

    const SCALE = 3; // Ultra High-Definition Rendering
    const canvas = createCanvas(Math.floor(CARD_WIDTH * SCALE), Math.floor(CARD_HEIGHT * SCALE));
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    // Premium Rendering Settings
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const TEXT_MAIN = '#FFFFFF';
    const TEXT_SUB = '#A1A1AA';
    const THEME_COLOR = primaryColor || CONFIG.COLORS.PRIMARY;

    ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    try {
        // --- 1. AMBIENT BACKGROUND SYSTEM ---
        const defaultBg = path.join(__dirname, 'images', 'profile_background_default.png');
        
        // Handle bannerUrl as both string or config object { source, customUrl }
        const finalBannerUrl = (bannerUrl && typeof bannerUrl === 'object') ? bannerUrl.customUrl : bannerUrl;
        const bgImg = await secureLoadImage(finalBannerUrl, defaultBg);

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 20;
        ctx.beginPath(); ctx.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 40);
        ctx.fillStyle = '#09090B'; ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.clip();

        if (bgImg) {
            ctx.filter = 'blur(60px) brightness(0.35) saturate(1.5)';
            ctx.drawImage(bgImg, -100, -100, CARD_WIDTH + 200, CARD_HEIGHT + 200);
            ctx.filter = 'none';
        }

        const vignette = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
        vignette.addColorStop(0, 'rgba(0, 0, 0, 0.1)'); vignette.addColorStop(1, 'rgba(0, 0, 0, 0.75)');
        ctx.fillStyle = vignette; ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

        const cardBorderGrad = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
        cardBorderGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
        cardBorderGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)');
        cardBorderGrad.addColorStop(1, hexToRgba(THEME_COLOR, 0.15));
        ctx.strokeStyle = cardBorderGrad; ctx.lineWidth = 1.5; ctx.strokeRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
        
        // V4: GROUNDING GRID (Scanlines)
        drawScanlines(ctx, CARD_WIDTH, CARD_HEIGHT);
        
        ctx.restore();

        // --- 2. CRISP TOP BANNER (High Immersion) ---
        const bannerX = 10, bannerY = 10, bannerW = 380, bannerH = 160, bannerR = 28;
        if (bgImg) {
            ctx.save(); ctx.beginPath(); ctx.roundRect(bannerX, bannerY, bannerW, bannerH, bannerR); ctx.clip();
            const ratio = Math.max(bannerW / bgImg.width, bannerH / bgImg.height);
            const bgW = bgImg.width * ratio, bgH = bgImg.height * ratio;
            ctx.drawImage(bgImg, bannerX + (bannerW - bgW) / 2, bannerY + (bannerH - bgH) / 2, bgW, bgH);

            const fade = ctx.createLinearGradient(0, bannerY + bannerH - 40, 0, bannerY + bannerH);
            fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,0.6)');
            ctx.fillStyle = fade; ctx.fillRect(bannerX, bannerY, bannerW, bannerH);
            ctx.restore();
        }

        // --- 3. NEON AVATAR CLUSTER (V4: IDENTITY SHELF) ---
        const avX = 64, avY = 150, avR = 36; 
        
        // V4: Identity Shelf (Glass Platform) - Grounded to the left edge
        ctx.save();
        ctx.beginPath(); ctx.roundRect(10, avY - 20, 260, 110, 24);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.025)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'; ctx.lineWidth = 1; ctx.stroke();
        
        // Technical Corner Accent (Cyber Detail)
        ctx.strokeStyle = hexToRgba(THEME_COLOR, 0.4); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(20, avY - 20); ctx.lineTo(10, avY - 20); ctx.lineTo(10, avY - 10); ctx.stroke();
        
        // V4.2: Technical HEX Meta-Tag (Microscopic)
        ctx.fillStyle = hexToRgba(TEXT_SUB, 0.4); ctx.font = `700 6.5px 'exton'`; ctx.textAlign = 'right';
        ctx.fillText(`UID_NODE [0x${discordUser.id.slice(-4).toUpperCase()}]`, 260, avY + 84);
        ctx.restore();
        ctx.textAlign = 'left'; // Reset

        ctx.beginPath(); ctx.arc(avX, avY, avR + 2, 0, Math.PI * 2);
        ctx.shadowColor = THEME_COLOR; ctx.shadowBlur = 25; ctx.fillStyle = THEME_COLOR; ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.beginPath(); ctx.arc(avX, avY, avR + 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 15, 20, 0.9)'; ctx.fill();

        // V4.10: Precision Avatar Resolution
        let avatarUrl = discordUser.displayAvatarURL({ extension: 'png', size: 1024 });
        
        const avConfig = userData.avatarConfig || { source: 'DISCORD_GLOBAL' };
        if (avConfig.source === 'DISCORD_GUILD' && userData.guildAvatarUrl) {
            avatarUrl = userData.guildAvatarUrl;
        } else if (avConfig.source === 'ANILIST' && avConfig.anilistAvatar) {
            avatarUrl = avConfig.anilistAvatar;
        } else if (avConfig.source === 'CUSTOM' && avConfig.customUrl) {
            avatarUrl = avConfig.customUrl;
        }

        const avatar = await secureLoadImage(avatarUrl);
        if (avatar) {
            ctx.save(); ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(avatar, avX - avR, avY - avR, avR * 2, avR * 2); ctx.restore();
        }

        // --- 4. IDENTITY CLUSTER (Left) ---
        const nameY = 225;
        const nameText = (displayName || discordUser.username).length > 20 ? (displayName || discordUser.username).substring(0, 20) + '...' : (displayName || discordUser.username);

        ctx.fillStyle = TEXT_MAIN;
        // Dynamic Username Scaling (Priority: Digital Galaxy)
        ctx.font = fitText(ctx, nameText, `'digitalgalaxy', 'exton', ${FONT_STACK}`, 34, '900', 250); 
        const nameWidth = ctx.measureText(nameText).width;
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 15;
        ctx.fillText(nameText, 20, nameY); 
        ctx.shadowColor = 'transparent';

        // Refined Title Badge (Adaptive Alignment)
        const titleText = (userData.title || 'MUSE READER').toUpperCase();
        // Dynamic Title Scaling (Priority: Exton)
        ctx.font = fitText(ctx, titleText, `'exton', ${FONT_STACK}`, 11, '700', 120); 
        ctx.letterSpacing = '1px';
        
        const tagW = ctx.measureText(titleText).width + 24, tagH = 24;
        const tagX = 20;
        const tagY = nameY + 12;

        ctx.beginPath(); ctx.roundRect(tagX, tagY, tagW, tagH, tagH / 2);
        // Deep Theme-Tinted Glass
        ctx.fillStyle = hexToRgba(THEME_COLOR, 0.1); ctx.fill(); 
        
        const tagBorderGrad = ctx.createLinearGradient(tagX, tagY, tagX + tagW, tagY);
        tagBorderGrad.addColorStop(0, hexToRgba(THEME_COLOR, 0.4));
        tagBorderGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
        tagBorderGrad.addColorStop(1, hexToRgba(THEME_COLOR, 0.4));
        
        ctx.strokeStyle = tagBorderGrad; ctx.lineWidth = 1.2; ctx.stroke();
        
        // Subtle Inner Glow
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.roundRect(tagX + 1, tagY + 1, tagW - 2, tagH - 2, (tagH - 2) / 2); ctx.stroke();

        ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center';
        ctx.shadowColor = hexToRgba(THEME_COLOR, 0.3); ctx.shadowBlur = 4;
        ctx.fillText(titleText, tagX + tagW / 2, tagY + 16.5);
        ctx.shadowBlur = 0;
        ctx.letterSpacing = '0px';

        // --- 5. DYNAMIC MEMBERSHIP BADGE (Right) ---
        const pillR = 21, pillX = 380 - pillR * 2, pillY = nameY - 36;
        const isBooster = userData.is_booster || false;
        const isPremium = (userData.is_premium || userData.premium || false) && !isBooster;

        ctx.save();
        ctx.beginPath(); ctx.arc(pillX + pillR, pillY + pillR, pillR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'; ctx.fill(); // Glass base
        
        const pillGrad = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillR * 2);
        if (isBooster) {
            pillGrad.addColorStop(0, '#C084FC'); pillGrad.addColorStop(1, '#7C3AED'); // Sacred Purple
            ctx.strokeStyle = pillGrad; ctx.lineWidth = 2.2; ctx.stroke();
            ctx.shadowColor = 'rgba(124, 58, 237, 0.8)'; ctx.shadowBlur = 16;
        } else if (isPremium) {
            pillGrad.addColorStop(0, '#F5D17E'); pillGrad.addColorStop(1, '#AA812A'); // Premium Gold
            ctx.strokeStyle = pillGrad; ctx.lineWidth = 1.8; ctx.stroke();
            ctx.shadowColor = 'rgba(170, 129, 42, 0.6)'; ctx.shadowBlur = 12;
        } else {
            pillGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)'); pillGrad.addColorStop(1, hexToRgba(THEME_COLOR, 0.1));
            ctx.strokeStyle = pillGrad; ctx.lineWidth = 1.2; ctx.stroke();
        }

        // Draw Dynamic Book Icon
        const bx = pillX + pillR - 10, by = pillY + pillR - 8.5, bw = 20, bh = 17;
        const iconColor = isBooster ? '#E9D5FF' : (isPremium ? '#F5D17E' : THEME_COLOR);
        
        ctx.strokeStyle = iconColor;
        ctx.lineWidth = (isBooster || isPremium) ? 2.2 : 1.8;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';

        // Base Book Geometry
        ctx.beginPath();
        ctx.moveTo(bx + bw / 2, by); ctx.lineTo(bx + bw / 2, by + bh); // Spine
        ctx.moveTo(bx + bw / 2, by); 
        ctx.quadraticCurveTo(bx + bw * 0.75, by - 2, bx + bw, by + 1.5); ctx.lineTo(bx + bw, by + bh - 3.5); ctx.quadraticCurveTo(bx + bw * 0.75, by + bh - 7, bx + bw / 2, by + bh);
        ctx.moveTo(bx + bw / 2, by);
        ctx.quadraticCurveTo(bx + bw * 0.25, by - 2, bx, by + 1.5); ctx.lineTo(bx, by + bh - 3.5); ctx.quadraticCurveTo(bx + bw * 0.25, by + bh - 7, bx + bw / 2, by + bh);
        ctx.stroke();

        if (isBooster || isPremium) {
            // Extra "Detailed" pages
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(bx + bw * 0.7, by + 4); ctx.lineTo(bx + bw * 0.9, by + 4);
            ctx.moveTo(bx + bw * 0.7, by + 7.5); ctx.lineTo(bx + bw * 0.9, by + 7.5);
            ctx.moveTo(bx + bw * 0.3, by + 4); ctx.lineTo(bx + bw * 0.1, by + 4);
            ctx.moveTo(bx + bw * 0.3, by + 7.5); ctx.lineTo(bx + bw * 0.1, by + 7.5);
            
            if (isBooster) {
                // Tier 3: Sacred Muse Ultra-Details
                ctx.moveTo(bx + bw * 0.7, by + 11); ctx.lineTo(bx + bw * 0.9, by + 11);
                ctx.moveTo(bx + bw * 0.3, by + 11); ctx.lineTo(bx + bw * 0.1, by + 11);
                
                // 1. Mystical Bookmark
                ctx.moveTo(bx + bw * 0.6, by + bh - 1);
                ctx.quadraticCurveTo(bx + bw * 0.65, by + bh + 4, bx + bw * 0.55, by + bh + 6);
                
                // 2. Cover "Spark" Symbol
                ctx.stroke();
                ctx.beginPath(); ctx.arc(bx + bw * 0.25, by + bh / 2, 0.8, 0, Math.PI * 2);
                ctx.arc(bx + bw * 0.75, by + bh / 2, 0.8, 0, Math.PI * 2);
                ctx.fillStyle = '#FFF'; ctx.fill();

                // 3. Crystalline Aura Ring (Inner)
                ctx.beginPath(); ctx.arc(pillX + pillR, pillY + pillR, pillR - 4, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; ctx.lineWidth = 0.5; ctx.stroke();
                
                // Glowing Spine dot
                ctx.beginPath(); ctx.arc(bx + bw/2, by + 2, 1.2, 0, Math.PI * 2);
                ctx.fillStyle = '#FFF'; ctx.fill();
            } else {
                ctx.stroke();
            }
        }
        ctx.restore();

        // --- 6. V5 WIDGETS: REFINED APP NODES ---
        const statY = 285; // Shifted down for vertical header stack
        const statW = 110, statH = 88, statGap = 15;
        const stats = userData.anilist || {};

        const drawStatNode = (x, hexColor, value, label, drawIconLogic) => {
            const r = 24; // Precision-cut corners
            ctx.save();
            
            // 1. BASE: DEEP CYBER-GLASS (Tactical Contrast)
            ctx.beginPath(); ctx.roundRect(x, statY, statW, statH, r);
            const cardGrad = ctx.createLinearGradient(x, statY, x, statY + statH);
            cardGrad.addColorStop(0, 'rgba(255, 255, 255, 0.02)');
            cardGrad.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
            ctx.fillStyle = cardGrad; ctx.fill();

            // Surgical Shell Outlining
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'; ctx.lineWidth = 1; ctx.stroke();

            // 2. TEXTURE: TECHNICAL GRID SUB-DECK
            ctx.save();
            ctx.beginPath(); ctx.roundRect(x, statY, statW, statH, r); ctx.clip();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)'; ctx.lineWidth = 0.5;
            const gridSize = 14;
            for (let gl = x; gl <= x + statW; gl += gridSize) {
                ctx.beginPath(); ctx.moveTo(gl, statY); ctx.lineTo(gl, statY + statH); ctx.stroke();
            }
            for (let gh = statY; gh <= statY + statH; gh += gridSize) {
                ctx.beginPath(); ctx.moveTo(x, gh); ctx.lineTo(x + statW, gh); ctx.stroke();
            }
            ctx.restore();

            // 3. ACCENTS: ILLUMINATED TACTICAL BRACKETS
            const bS = 8, bL = 1.8; ctx.strokeStyle = hexToRgba(hexColor, 0.45); ctx.lineWidth = bL;
            ctx.lineCap = 'butt';
            // Top-Left Frame
            ctx.beginPath(); ctx.moveTo(x + bS, statY + 2.5); ctx.lineTo(x + 2.5, statY + 2.5); ctx.lineTo(x + 2.5, statY + bS); ctx.stroke();
            // Bottom-Right Frame
            ctx.beginPath(); ctx.moveTo(x + statW - bS, statY + statH - 2.5); ctx.lineTo(x + statW - 2.5, statY + statH - 2.5); ctx.lineTo(x + statW - 2.5, statY + statH - bS); ctx.stroke();

            // 4. HEADER: UNIFIED COMMAND POD (Integrated [Icon | Label])
            const hW = statW - 24, hH = 22, hX = x + 12, hY = statY + 12;
            ctx.beginPath(); ctx.roundRect(hX, hY, hW, hH, hH / 2);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; ctx.fill();
            const hubBorder = ctx.createLinearGradient(hX, hY, hX + hW, hY);
            hubBorder.addColorStop(0, hexToRgba(hexColor, 0.4));
            hubBorder.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
            ctx.strokeStyle = hubBorder; ctx.lineWidth = 1; ctx.stroke();

            // Dynamic Icon Hub
            const iSize = 14, iX = hX + 8, iY = hY + (hH - iSize) / 2;
            ctx.save();
            ctx.strokeStyle = hexColor; ctx.fillStyle = hexColor;
            ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            drawIconLogic(iX, iY, iSize);
            ctx.restore();

            // Command Label (Integrated Metadata)
            ctx.fillStyle = TEXT_SUB;
            // Dynamic Scaling for Tactical Headers (Priority: Exton)
            ctx.font = fitText(ctx, label.toUpperCase(), `'exton', ${FONT_STACK}`, 8.5, '700', hW - 32); 
            ctx.textAlign = 'right';
            ctx.letterSpacing = '1.5px';
            ctx.fillText(label.toUpperCase(), hX + hW - 10, hY + 14);
            ctx.letterSpacing = '0px';

            // 5. DATA BODY: HIGH-POWER NUMERICAL DISPLAY (Dynamic Scaling)
            ctx.fillStyle = '#FFFFFF';
            // Scale dynamically (Priority: Neo-Externo)
            ctx.font = fitText(ctx, value, `'neo', 'exomoon', 'orbitron', ${FONT_STACK}`, 32, '900', statW - 24);
            ctx.textAlign = 'center';
            ctx.shadowColor = hexToRgba(hexColor, 0.4); ctx.shadowBlur = 12;
            ctx.fillText(value, x + statW / 2, statY + statH - 18);
            ctx.shadowBlur = 0;

            // 6. ENERGY FOOTER: LINEAR DATA PULSE
            const pulseY = statY + statH - 10, pulseW = statW - 32;
            ctx.beginPath(); ctx.moveTo(x + 16, pulseY); ctx.lineTo(x + 16 + pulseW, pulseY);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'; ctx.lineWidth = 1; ctx.stroke();
            
            // Real-time Pulse Point (Surgical Detail)
            const pPos = x + 16 + (pulseW * 0.75);
            ctx.beginPath(); ctx.arc(pPos, pulseY, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = hexColor; ctx.shadowColor = hexColor; ctx.shadowBlur = 8; ctx.fill();
            
            ctx.restore();
        };

        const drawAnimeIcon = (ix, iy, size) => {
            const ox = ix + size / 2 - 8, oy = iy + size / 2 - 6;
            ctx.beginPath(); ctx.roundRect(ox, oy, 16, 12, 3); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(ox + 6, oy + 3); ctx.lineTo(ox + 11, oy + 6); ctx.lineTo(ox + 6, oy + 9); ctx.fill();
        };

        const drawMangaIcon = (ix, iy, size) => {
            const ox = ix + size / 2 - 7, oy = iy + size / 2 - 6.5;
            for (let i = 0; i < 3; i++) {
                const offY = oy + i * 4.2;
                ctx.beginPath(); ctx.roundRect(ox, offY, 14, 3.8, 0.5); ctx.stroke();
            }
        };

        const drawDaysIcon = (ix, iy, size) => {
            const ox = ix + size / 2, oy = iy + size / 2;
            ctx.beginPath(); ctx.arc(ox, oy, 6.5, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(ox, oy - 4); ctx.lineTo(ox, oy); ctx.lineTo(ox + 3, oy + 2); ctx.stroke();
        };

        if (userData.anilist_synced) {
            drawStatNode(20, THEME_COLOR, formatStat(stats.completed || 0), 'Anime', drawAnimeIcon);
            drawStatNode(20 + statW + statGap, THEME_COLOR, formatStat(stats.manga_completed || 0), 'Manga', drawMangaIcon);
            drawStatNode(20 + (statW + statGap) * 2, THEME_COLOR, formatStat(stats.days || 0), 'Days', drawDaysIcon);
            
            // Maintenance Guard Overlay (Clinical UI)
            if (userData.anilist_maintenance) {
                const hudX = 20, hudY = statY, hudW = CARD_WIDTH - 40, hudH = statH;
                ctx.save();
                ctx.beginPath(); ctx.roundRect(hudX, hudY, hudW, hudH, 20); ctx.clip();
                
                // Frosted Dark Filter
                ctx.fillStyle = 'rgba(9, 9, 11, 0.75)'; ctx.fillRect(hudX, hudY, hudW, hudH);
                
                // Warning Notification
                ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF';
                ctx.font = `800 13px ${FONT_STACK}`; ctx.letterSpacing = '1px';
                ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10;
                ctx.fillText('ANILIST API CURRENTLY OFFLINE', hudX + hudW / 2, hudY + hudH / 2 + 5);
                ctx.restore();
            }
        }

        // --- 7. PROGRESSION TERMINAL (Hyper-Premium HUD) ---
        const termY = isCompact ? 255 : 395;
        const termH = 80;

        ctx.save();
        ctx.beginPath(); ctx.roundRect(20, termY, CARD_WIDTH - 40, termH, 22);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)'; ctx.fill();
        const termBorderGrad = ctx.createLinearGradient(20, termY, 20, termY + termH);
        termBorderGrad.addColorStop(0, 'rgba(255,255,255,0.1)');
        termBorderGrad.addColorStop(1, 'rgba(255,255,255,0.02)');
        ctx.strokeStyle = termBorderGrad; ctx.lineWidth = 1; ctx.stroke();

        const currentXP = userData.current || 0;
        const requiredXP = userData.required || 1;
        const levelPercent = Math.min(1, currentXP / requiredXP) || 0;

        // 1. DATA CORE: BOLD LEVEL INDICATOR
        const levelText = (userData.level || '0').toString();
        const levelBaseX = 64, levelY = termY + termH / 2 + 15;
        
        ctx.fillStyle = '#FFFFFF';
        // Massive Level Signature (Standardized Data Font: Neo)
        ctx.font = fitText(ctx, levelText, `'neo', ${FONT_STACK}`, 52, '900', 70); 
        ctx.textAlign = 'center';
        ctx.shadowColor = hexToRgba(THEME_COLOR, 0.4); ctx.shadowBlur = 15;
        ctx.fillText(levelText, levelBaseX, levelY + 5);
        ctx.shadowBlur = 0;

        // V4.2: Level Label (Micro-Exton) - Tightened
        ctx.font = `700 8.5px 'exton'`; ctx.fillStyle = TEXT_SUB;
        ctx.fillText('LVL', levelBaseX, levelY - 33);

        // 2. METADATA: HUD LABELS (Exton Signature)
        const barX = 115, barW = CARD_WIDTH - barX - 25, barY = termY + 48, barH = 5, barR = 2.5; 
        
        ctx.textAlign = 'left';
        ctx.fillStyle = TEXT_SUB; 
        ctx.font = fitText(ctx, 'EXPERIENCE', `'exton', ${FONT_STACK}`, 10, '700', 100);
        ctx.letterSpacing = '1.8px';
        ctx.fillText('EXPERIENCE', barX, termY + 28);
        ctx.letterSpacing = '0px';

        ctx.textAlign = 'right';
        const xpText = `${formatStat(userData.current)} / ${formatStat(userData.required)} XP`.toUpperCase();
        // V4: Data Stats (Exomoon)
        ctx.font = fitText(ctx, xpText, `'exomoon', ${FONT_STACK}`, 11, '700', 150);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(xpText, barX + barW, termY + 28);

        // Heavy-Duty Progress Bar Tracks (V4: Precision Meter)
        ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, barR);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();

        // The Progress Fill
        if (levelPercent > 0) {
            const fillWidth = Math.max(barR * 2, levelPercent * barW);
            ctx.save();
            ctx.beginPath(); ctx.roundRect(barX, barY, fillWidth, barH, barR); ctx.clip();
            
            const activeGrad = ctx.createLinearGradient(barX, barY, barX + fillWidth, barY);
            activeGrad.addColorStop(0, hexToRgba(THEME_COLOR, 0.6));
            activeGrad.addColorStop(0.85, THEME_COLOR);
            activeGrad.addColorStop(1, '#FFFFFF'); 
            
            ctx.fillStyle = activeGrad;
            ctx.shadowColor = THEME_COLOR; ctx.shadowBlur = 10;
            ctx.fill();
            
            // Pulse Point (Precision Lead)
            ctx.beginPath(); ctx.arc(barX + fillWidth, barY + barH / 2, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF'; ctx.fill();
            
            // V4.2: Instrumentation Precision Ticks
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; ctx.lineWidth = 0.5;
            for (let i = 0; i <= 5; i++) {
                const tx = barX + (barW * (i / 5));
                ctx.beginPath(); ctx.moveTo(tx, barY + barH + 2); ctx.lineTo(tx, barY + barH + 5); ctx.stroke();
            }
            
            ctx.restore();
        }

        ctx.restore();

    } catch (err) { console.error('Canvas Generation Error:', err); }

    return await canvas.encode('png');
};

const getDominantColor = async (imageUrl) => { return '#3B82F6'; };
module.exports = { generateProfileCard, getDominantColor };