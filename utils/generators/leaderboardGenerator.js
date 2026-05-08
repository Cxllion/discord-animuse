const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const axios = require('axios');
const { refreshDiscordUrls } = require('../services/storageService');
const logger = require('../core/logger');

// --- CACHE & HELPERS ---
const staticAssetCache = new Map();
const getCachedLocalImage = async (assetPath) => {
    if (!assetPath) return null;
    if (staticAssetCache.has(assetPath)) return staticAssetCache.get(assetPath);
    try {
        const img = await loadImage(assetPath);
        staticAssetCache.set(assetPath, img);
        return img;
    } catch (e) {
        return null;
    }
};

const secureLoadImage = async (urls, fallbackPath = null) => {
    let urlList = await refreshDiscordUrls(Array.isArray(urls) ? urls : [urls]);
    for (const url of urlList) {
        if (!url) continue;
        if (staticAssetCache.has(url)) return staticAssetCache.get(url);

        if (typeof url === 'string' && (url.startsWith('/') || url.includes(':\\'))) {
            const img = await getCachedLocalImage(url);
            if (img) return img;
        } else if (typeof url === 'string' && url.startsWith('http')) {
            try {
                const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 8000 });
                if (res.status === 200) {
                    const img = await loadImage(Buffer.from(res.data));
                    staticAssetCache.set(url, img);
                    return img;
                }
            } catch (err) { }
        }
    }
    return fallbackPath ? await getCachedLocalImage(fallbackPath) : null;
};

// --- COLOR MATH ---
const hexToRgbArr = h => {
    let r = 0, g = 0, b = 0;
    if (h?.length === 4) { r = parseInt(h[1] + h[1], 16); g = parseInt(h[2] + h[2], 16); b = parseInt(h[3] + h[3], 16); }
    else if (h?.length === 7) { r = parseInt(h.slice(1, 3), 16); g = parseInt(h.slice(3, 5), 16); b = parseInt(h.slice(5, 7), 16); }
    return [r, g, b];
};
const hexToRgba = (h, a) => {
    if (!h) return `rgba(0,0,0,${a})`;
    const [r, g, b] = hexToRgbArr(h);
    return `rgba(${r},${g},${b},${a})`;
};
const mixColors = (h1, h2, w) => {
    const [r1, g1, b1] = hexToRgbArr(h1 || '#000000'), [r2, g2, b2] = hexToRgbArr(h2 || '#ffffff');
    const m = (x, y) => Math.round(x * (1 - w) + y * w).toString(16).padStart(2, '0');
    return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`;
};

// --- CONSTANTS ---
const CARD_WIDTH = 800;
const CARD_HEIGHT = 510;
const FONT_STACK = "'monalqo', 'Times New Roman', 'Georgia', serif";

const drawNoise = (ctx, w, h, opacity = 0.03) => {
    ctx.save();
    ctx.fillStyle = `rgba(130, 110, 90, ${opacity})`;
    for (let i = 0; i < (w * h * 0.1); i++) ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    ctx.restore();
};

const drawSeigaihaPattern = (ctx, w, h, themeColor) => {
    ctx.save();
    ctx.strokeStyle = themeColor ? hexToRgba(themeColor, 0.06) : 'rgba(255,255,255,0.015)';
    ctx.lineWidth = 1;
    const rad = 22;
    for (let y = 0; y < h + rad * 2; y += rad) {
        for (let x = 0; x < w + rad * 2; x += rad * 2) {
            const cx = x + ((y / rad) % 2 === 0 ? 0 : rad);
            [rad, rad - 5, rad - 10].forEach(r => { ctx.beginPath(); ctx.arc(cx, y, r, Math.PI, 0); ctx.stroke(); });
        }
    }
    ctx.restore();
};

const formatStat = n => {
    n = parseFloat(n) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    if (n % 1 !== 0) return n.toFixed(1);
    return n.toLocaleString();
};

const fitText = (ctx, text, fontFamilies, baseSize, baseWeight, maxWidth) => {
    let size = baseSize;
    ctx.font = `${baseWeight} ${size}px ${fontFamilies}`;
    while (ctx.measureText(text).width > maxWidth && size > 8) {
        size -= 0.5;
        ctx.font = `${baseWeight} ${size}px ${fontFamilies}`;
    }
    return ctx.font;
};

// --- REUSABLE ARTIFACT FUNCTIONS ---
const drawSatinRibbon = (ctx, x, y, w, h, color, status = {}, dropShadow = true) => {
    const { isPremium, isBooster } = status;
    ctx.save();
    
    // 1. Path Definition
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    if (isBooster) {
        ctx.lineTo(x + w / 2, y + h + 10); // Diamond Point
    } else if (isPremium) {
        ctx.bezierCurveTo(x + w, y + h + 10, x, y + h + 10, x, y + h); // Rounded Strap
    } else {
        ctx.lineTo(x + w / 2, y + h - 12); // Classic Archival
    }
    ctx.lineTo(x, y + h);
    ctx.closePath();

    if (dropShadow) {
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 6;
    }

    // 2. Base Leather Material
    const materialGrad = ctx.createRadialGradient(x + w/2, y + h/2, 5, x + w/2, y + h/2, h);
    const darkLeather = mixColors('#000000', color, 0.4);
    materialGrad.addColorStop(0, color);
    materialGrad.addColorStop(1, darkLeather);
    ctx.fillStyle = materialGrad;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    // 3. Texture & Embossing
    ctx.save();
    ctx.clip();
    
    // Leather Grain
    drawNoise(ctx, CARD_WIDTH, CARD_HEIGHT, 0.12);
    
    // Edge Burnishing (Vignette)
    const burnGrad = ctx.createLinearGradient(x, 0, x + w, 0);
    burnGrad.addColorStop(0, 'rgba(0,0,0,0.3)');
    burnGrad.addColorStop(0.15, 'rgba(0,0,0,0)');
    burnGrad.addColorStop(0.85, 'rgba(0,0,0,0)');
    burnGrad.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = burnGrad;
    ctx.fill();

    if (isBooster) {
        // Embossed Crystalline Pattern
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        for(let i=0; i<6; i++) {
            ctx.beginPath();
            ctx.moveTo(x, y + i * 18); ctx.lineTo(x + w, y + i * 18 + 12);
            ctx.stroke();
        }
    } else if (isPremium) {
        // Gold-Pressed Floral Stamps
        ctx.fillStyle = 'rgba(212, 175, 55, 0.2)';
        ctx.font = '12px serif';
        for(let i=0; i<3; i++) {
            ctx.fillText('⚜', x + w/2 - 6, y + 22 + i * 22);
        }
    }
    ctx.restore();

    // 4. Physical Stitching (Heavy Thread)
    const st = 4;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + st, y);
    ctx.lineTo(x + st, y + h - st);
    if (isBooster) {
        ctx.lineTo(x + w / 2, y + h + 10 - st);
        ctx.lineTo(x + w - st, y + h - st);
    } else if (isPremium) {
        ctx.bezierCurveTo(x + st, y + h + 10 - st, x + w - st, y + h + 10 - st, x + w - st, y + h - st);
    } else {
        ctx.lineTo(x + w / 2, y + h - 12 - st);
        ctx.lineTo(x + w - st, y + h - st);
    }
    ctx.lineTo(x + w - st, y);

    // Stitch Shadow (for depth)
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.stroke();

    // Actual Thread
    ctx.translate(-0.5, -0.5);
    if (isBooster) {
        ctx.strokeStyle = '#E0FFFF'; 
    } else if (isPremium) {
        ctx.strokeStyle = '#FFD700'; // Pure Gold Thread
    } else {
        ctx.strokeStyle = mixColors('#ffffff', color, 0.3);
    }
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    // 5. Connection Pin (Detail at top)
    ctx.save();
    const pinColor = isBooster ? '#E0FFFF' : (isPremium ? '#D4AF37' : '#999');
    ctx.shadowBlur = 6; ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.fillStyle = pinColor;
    ctx.beginPath(); ctx.arc(x + w/2, y + 4, 3.5, 0, Math.PI * 2); ctx.fill();
    
    // Pin Glint
    ctx.fillStyle = '#FFF';
    ctx.beginPath(); ctx.arc(x + w/2 - 1, y + 3, 1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.restore();
};

const drawMetallicBezel = (ctx, x, y, r, cShad, cHigh, cMid) => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;

    const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, cHigh);
    g.addColorStop(0.5, cMid);
    g.addColorStop(1, cShad);

    ctx.beginPath();
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.beginPath();
    ctx.arc(x, y, r + 1, 0, Math.PI * 2);
    ctx.fillStyle = '#21232a';
    ctx.fill();

    ctx.restore();
};

const drawRankBadge = (ctx, x, y, rank, pal, inkColor) => {
    const bw = 32, bh = 26;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;

    ctx.beginPath();
    ctx.moveTo(x - bw / 2, y);
    ctx.lineTo(x + bw / 2, y);
    ctx.lineTo(x + bw / 2, y + bh - 8);
    ctx.lineTo(x, y + bh);
    ctx.lineTo(x - bw / 2, y + bh - 8);
    ctx.closePath();
    ctx.fillStyle = pal.m;
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.strokeStyle = pal.h;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - bw / 2 + 2.5, y + 2);
    ctx.lineTo(x + bw / 2 - 2.5, y + 2);
    ctx.lineTo(x + bw / 2 - 2.5, y + bh - 9.5);
    ctx.lineTo(x, y + bh - 3.5);
    ctx.lineTo(x - bw / 2 + 2.5, y + bh - 9.5);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = inkColor;
    ctx.font = `bold 12px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`#${rank}`, x, y + bh / 2 - 2);
    ctx.restore();
};

// --- MAIN GENERATOR ---
const generateLeaderboard = async (challenger, challengerData, topUsers, backgroundUrl = null, primaryColor = '#FFACD1', challengerName = null, challengerAvatarUrl = null, page = 1) => {
    const SCALE = 2.0;
    const canvas = createCanvas(Math.floor(CARD_WIDTH * SCALE), Math.floor(CARD_HEIGHT * SCALE));
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const ACCENT = primaryColor || '#FFACD1';
    const COLOR_BG = '#21232a';
    const COLOR_INK = mixColors('#0a0a0a', ACCENT, 0.3);
    const COLOR_HIGHLIGHT = mixColors('#ffffff', ACCENT, 0.8);
    const COLOR_SHADOW = mixColors('#000000', ACCENT, 0.4);

    const COLOR_LEATHER_DARK = '#110905';
    const COLOR_LEATHER_MID = '#3e2418';

    // Clear everything for a true transparent base
    ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // --- ROBUST PROFILE BANNER RESOLUTION ---
    let bannerPriority = [];
    if (backgroundUrl && typeof backgroundUrl === 'object') {
        bannerPriority.push(backgroundUrl.customUrl || backgroundUrl.anilistBanner || backgroundUrl.url);
    } else if (backgroundUrl) {
        bannerPriority.push(backgroundUrl);
    }

    const bData = challengerData?.bannerUrl || challengerData?.banner;
    if (bData && typeof bData === 'object') {
        bannerPriority.push(bData.customUrl || bData.anilistBanner || bData.url);
    } else if (bData) {
        bannerPriority.push(bData);
    }

    if (challengerData?.discordBannerUrl) bannerPriority.push(challengerData.discordBannerUrl);
    if (challengerData?.customBannerUrl) bannerPriority.push(challengerData.customBannerUrl);
    if (challenger?.banner) bannerPriority.push(typeof challenger.banner === 'string' ? challenger.banner : challenger.banner.url);
    if (challenger?.bannerURL) bannerPriority.push(challenger.bannerURL({ size: 1024 }));

    bannerPriority = bannerPriority.filter(url => url && typeof url === 'string');

    // Robust Avatar Extraction
    let cAvUrl = challengerAvatarUrl;
    if (!cAvUrl && challenger?.displayAvatarURL) {
        cAvUrl = challenger.displayAvatarURL({ extension: 'png', size: 512 });
    }

    // Load All Required Images
    const urls = [...bannerPriority, cAvUrl, ...(topUsers || []).map(u => u?.avatarUrl || u?.avatar)].flat().filter(Boolean);
    const imageMap = new Map();
    await Promise.all([...new Set(urls)].map(async u => {
        try { const img = await secureLoadImage(u); if (img) imageMap.set(u, img); } catch (e) { }
    }));
    const getImg = u => {
        if (Array.isArray(u)) for (const x of u) if (imageMap.has(x)) return imageMap.get(x);
        return imageMap.get(u) || null;
    };

    // --- GRIDDING CONSTANTS ---
    const islandY = 20;
    const islandH = 465;

    // --- 3. CHALLENGER DOSSIER (LEFT) ---
    const lX = 24, lY = islandY, lW = 260, lH = islandH, cX = lX + lW / 2;
    const bannerH_left = 110;
    const cAvR = 44, cAvY = lY + bannerH_left;

    // Base Parchment (Full Height)
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 10;
    ctx.beginPath();
    ctx.roundRect(lX, lY, lW, lH, 12);
    ctx.fillStyle = '#f8f4e6';
    ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.clip();
    const vig = ctx.createRadialGradient(cX, lY + lH / 2, lH * 0.2, cX, lY + lH / 2, lW * 0.9);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, hexToRgba(ACCENT, 0.12));
    ctx.fillStyle = vig;
    ctx.fill();
    drawNoise(ctx, CARD_WIDTH, CARD_HEIGHT, 0.04);
    ctx.restore();

    // A. The Squircle Banner Overlay
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(lX, lY, lW, bannerH_left, [12, 12, 0, 0]);
    ctx.clip();

    let cBannerImg = null;
    for (const url of bannerPriority) {
        cBannerImg = getImg(url);
        if (cBannerImg) break;
    }

    if (cBannerImg) {
        const ratio = Math.max(lW / cBannerImg.width, bannerH_left / cBannerImg.height);
        const bw = cBannerImg.width * ratio;
        const bh = cBannerImg.height * ratio;
        ctx.drawImage(cBannerImg, lX + (lW - bw) / 2, lY + (bannerH_left - bh) / 2, bw, bh);

        const bGrad = ctx.createLinearGradient(0, lY, 0, lY + bannerH_left);
        bGrad.addColorStop(0, 'rgba(0,0,0,0.4)');
        bGrad.addColorStop(1, 'rgba(0,0,0,0.1)');
        ctx.fillStyle = bGrad;
        ctx.fill();
    } else {
        const bGrad = ctx.createLinearGradient(0, lY, 0, lY + bannerH_left);
        bGrad.addColorStop(0, mixColors('#000', ACCENT, 0.4));
        bGrad.addColorStop(1, mixColors('#000', ACCENT, 0.8));
        ctx.fillStyle = bGrad;
        ctx.fill();
    }
    ctx.restore();

    // B. The Imperial Leather Seam & Drop Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
    ctx.beginPath();
    ctx.moveTo(lX, cAvY);
    ctx.lineTo(lX + lW, cAvY);
    ctx.strokeStyle = COLOR_LEATHER_DARK;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.strokeStyle = mixColors('#b89947', ACCENT, 0.2);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lX, cAvY - 1.5);
    ctx.lineTo(lX + lW, cAvY - 1.5);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath(); ctx.rect(lX, cAvY, lW, lH - bannerH_left); ctx.clip();
    const shadowGrad = ctx.createLinearGradient(0, cAvY, 0, cAvY + 12);
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0.4)');
    shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadowGrad;
    ctx.fillRect(lX, cAvY, lW, 12);
    ctx.restore();

    // C. Engraved Borders (Masked below seam)
    ctx.save();
    ctx.beginPath(); ctx.rect(lX, cAvY, lW, lH - bannerH_left); ctx.clip();

    ctx.strokeStyle = hexToRgba(ACCENT, 0.6);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(lX + 8, lY + 8, lW - 16, lH - 16, 8); ctx.stroke();

    ctx.strokeStyle = hexToRgba(ACCENT, 0.2);
    ctx.beginPath(); ctx.roundRect(lX + 12, lY + 12, lW - 24, lH - 24, 6); ctx.stroke();

    const dotR = 2.5;
    ctx.fillStyle = mixColors('#b89947', ACCENT, 0.2);
    [{ x: lX + 10, y: cAvY + 10 }, { x: lX + lW - 10, y: cAvY + 10 }, { x: lX + 10, y: lY + lH - 10 }, { x: lX + lW - 10, y: lY + lH - 10 }].forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();

    // D. The Imperial Bookmark (Hanging under the PFP)
    const bmW = 40, bmH = 80, bmX = cX - bmW / 2;
    const bmY = cAvY;

    const bmStatus = { isPremium: challengerData?.isPremium, isBooster: challengerData?.isBooster };
    drawSatinRibbon(ctx, bmX - 4, bmY, bmW + 8, bmH + 8, COLOR_LEATHER_DARK, bmStatus, true);
    drawSatinRibbon(ctx, bmX, bmY, bmW, bmH, ACCENT, bmStatus, false);

    ctx.fillStyle = COLOR_INK;
    ctx.font = `bold 18px ${FONT_STACK}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`#${challengerData?.rank || '--'}`, cX, bmY + 62);

    // E. The Straddling Avatar
    drawMetallicBezel(ctx, cX, cAvY, cAvR, COLOR_SHADOW, COLOR_HIGHLIGHT, ACCENT);
    const cImgData = getImg(cAvUrl);
    if (cImgData) {
        ctx.save();
        ctx.beginPath(); ctx.arc(cX, cAvY, cAvR, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(cImgData, cX - cAvR, cAvY - cAvR, cAvR * 2, cAvR * 2);
        ctx.restore();
    }

    // F. Flourished Typography 
    const cName = (challengerName || challenger?.username || challengerData?.username || 'Unknown').toUpperCase();
    ctx.fillStyle = mixColors('#1a1a1a', ACCENT, 0.4);
    const cNameY = lY + 235;
    ctx.font = fitText(ctx, cName, `'monalqo', ${FONT_STACK}`, 28, 'normal', lW - 60);
    ctx.fillText(cName, cX, cNameY);

    const nW_name = ctx.measureText(cName).width;
    ctx.fillStyle = hexToRgba(ACCENT, 0.6);
    const drawDiamond = (x, y) => {
        ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y); ctx.fill();
    };
    drawDiamond(cX - nW_name / 2 - 16, cNameY);
    drawDiamond(cX + nW_name / 2 + 16, cNameY);

    ctx.fillStyle = ACCENT;
    const cTitleY = lY + 265;
    ctx.font = fitText(ctx, challengerData?.title || 'Chart Librarian', `'alexbrush', 'Dancing Script', 'Lucida Handwriting', 'Brush Script MT', 'monalqo', cursive, ${FONT_STACK}`, 28, 'normal', 240);
    ctx.fillText(challengerData?.title || 'Chart Librarian', cX, cTitleY);

    const cDivY = lY + 315;
    const lDiv = ctx.createLinearGradient(lX + 30, 0, lX + lW - 30, 0);
    lDiv.addColorStop(0, 'transparent');
    lDiv.addColorStop(0.5, hexToRgba(ACCENT, 0.5));
    lDiv.addColorStop(1, 'transparent');
    ctx.strokeStyle = lDiv; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(lX + 30, cDivY); ctx.lineTo(lX + lW - 30, cDivY); ctx.stroke();

    ctx.beginPath(); ctx.arc(cX, cDivY, 3, 0, Math.PI * 2); ctx.fillStyle = ACCENT; ctx.fill();
    ctx.beginPath(); ctx.arc(cX - 12, cDivY, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cX + 12, cDivY, 1.5, 0, Math.PI * 2); ctx.fill();

    // G. Tiered Archive Progress Tracker
    const barW = lW - 48;
    const barH = 16;
    const barX = lX + 24;
    const barY = lY + 395;
    const lvlPct = Math.min(1, Math.max(0, (challengerData?.current || 0) / (challengerData?.required || 1)));

    ctx.save();
    
    // Housing & Outline Logic
    let hTop = COLOR_LEATHER_DARK, hMid = COLOR_LEATHER_MID, hBot = COLOR_LEATHER_DARK;
    let strokeCol = mixColors('#b89947', ACCENT, 0.3);
    
    if (challengerData?.isBooster) {
        hTop = '#2E1A47'; hMid = '#4B0082'; hBot = '#2E1A47'; // Indigo Nebula
        strokeCol = '#E0FFFF';
    } else if (challengerData?.isPremium) {
        hTop = '#8B4513'; hMid = '#D4AF37'; hBot = '#8B4513'; // Gold Archival
        strokeCol = '#FFF8DC';
    }

    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
    const housingGrad = ctx.createLinearGradient(barX, barY, barX, barY + barH);
    housingGrad.addColorStop(0, hTop); housingGrad.addColorStop(0.5, hMid); housingGrad.addColorStop(1, hBot);
    ctx.beginPath(); ctx.roundRect(barX - 4, barY - 4, barW + 8, barH + 8, 8);
    ctx.fillStyle = housingGrad; ctx.fill();
    ctx.shadowColor = 'transparent';

    ctx.strokeStyle = strokeCol; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(barX - 2, barY - 2, barW + 4, barH + 4, 6); ctx.stroke();

    ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 4);
    ctx.fillStyle = 'rgba(10, 10, 12, 0.8)'; ctx.fill();
    ctx.clip();

    // Internal Tick Marks
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    for (let t = barX + 10; t < barX + barW; t += 10) {
        ctx.beginPath(); ctx.moveTo(t, barY); ctx.lineTo(t, barY + 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(t, barY + barH); ctx.lineTo(t, barY + barH - 4); ctx.stroke();
    }

    if (lvlPct > 0) {
        const fillW = barW * lvlPct;
        const fluidGrad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
        
        if (challengerData?.isBooster) {
            fluidGrad.addColorStop(0, '#4B0082'); fluidGrad.addColorStop(0.5, '#00CED1'); fluidGrad.addColorStop(1, '#FFFFFF');
        } else if (challengerData?.isPremium) {
            fluidGrad.addColorStop(0, '#B8860B'); fluidGrad.addColorStop(0.8, '#D4AF37'); fluidGrad.addColorStop(1, '#FFF8DC');
        } else {
            fluidGrad.addColorStop(0, hexToRgba(ACCENT, 0.3)); fluidGrad.addColorStop(0.8, ACCENT); fluidGrad.addColorStop(1, mixColors('#ffffff', ACCENT, 0.5));
        }

        ctx.beginPath(); ctx.roundRect(barX, barY, fillW, barH, [4, 0, 0, 4]);
        if (lvlPct === 1) ctx.roundRect(barX, barY, fillW, barH, 4);
        ctx.fillStyle = fluidGrad; ctx.fill();

        // High-Gloss Specular
        const specGrad = ctx.createLinearGradient(0, barY, 0, barY + barH / 2);
        specGrad.addColorStop(0, 'rgba(255,255,255,0.4)');
        specGrad.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = specGrad; ctx.fillRect(barX, barY, fillW, barH / 2);

        // Terminal Nib
        const nibX = barX + fillW - 4;
        ctx.fillStyle = challengerData?.isBooster ? '#E0FFFF' : (challengerData?.isPremium ? '#FFF8DC' : mixColors('#ffffff', ACCENT, 0.8));
        ctx.beginPath(); ctx.roundRect(nibX, barY, 4, barH, 2); ctx.fill();
        
        // Crystalline Particles (Booster Only)
        if (challengerData?.isBooster) {
            ctx.fillStyle = '#FFF';
            for(let i=0; i<8; i++) {
                const pX = barX + Math.random() * fillW;
                const pY = barY + Math.random() * barH;
                ctx.beginPath(); ctx.arc(pX, pY, 0.8, 0, Math.PI*2); ctx.fill();
            }
        }
    }
    ctx.restore();

    // Hovering Level Crest (Advanced Physical Archival Theme)
    const badgeR = 24;
    const badgeY = barY - badgeR + 5;
    
    if (challengerData?.isBooster) {
        // --- BOOSTER: Radiant Crystalline Diamond ---
        ctx.save();
        ctx.shadowColor = hexToRgba(ACCENT, 0.8); ctx.shadowBlur = 20;
        
        // Draw Diamond Rhombus Base
        ctx.beginPath();
        ctx.moveTo(cX, badgeY - badgeR - 4);     // Top
        ctx.lineTo(cX + badgeR + 6, badgeY);      // Right
        ctx.lineTo(cX, badgeY + badgeR + 4);      // Bottom
        ctx.lineTo(cX - badgeR - 6, badgeY);      // Left
        ctx.closePath();
        
        const crystGrad = ctx.createRadialGradient(cX, badgeY, 0, cX, badgeY, badgeR + 10);
        crystGrad.addColorStop(0, '#FFFFFF');
        crystGrad.addColorStop(0.2, '#B0E0E6'); // Powder Blue
        crystGrad.addColorStop(0.5, '#9370DB'); // Medium Purple
        crystGrad.addColorStop(1, '#4B0082');   // Indigo
        ctx.fillStyle = crystGrad; ctx.fill();
        
        // Internal Facet Lines
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cX, badgeY - badgeR - 4); ctx.lineTo(cX, badgeY + badgeR + 4);
        ctx.moveTo(cX - badgeR - 6, badgeY); ctx.lineTo(cX + badgeR + 6, badgeY);
        ctx.stroke();
        
        // Radiant Glints & Sparkles (Shimmering Crystalline Atmosphere)
        for(let i=0; i<12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * (badgeR + 15);
            const sX = cX + Math.cos(angle) * dist;
            const sY = badgeY + Math.sin(angle) * dist;
            const size = 0.8 + Math.random() * 1.5;
            
            ctx.save();
            ctx.shadowColor = '#FFF'; ctx.shadowBlur = 5;
            if (i % 4 === 0) {
                // High-Intensity Star Glint
                const len = size * 4;
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 + Math.random() * 0.5})`;
                ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(sX - len, sY); ctx.lineTo(sX + len, sY); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(sX, sY - len); ctx.lineTo(sX, sY + len); ctx.stroke();
            } else {
                // Soft Particle
                ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + Math.random() * 0.6})`;
                ctx.beginPath(); ctx.arc(sX, sY, size, 0, Math.PI*2); ctx.fill();
            }
            ctx.restore();
        }
        
        ctx.shadowBlur = 4; ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.fillStyle = '#FFF';
        ctx.font = `bold 22px ${FONT_STACK}`; ctx.fillText(challengerData?.level || '0', cX, badgeY + 6);
        ctx.font = `bold 9px ${FONT_STACK}`; ctx.fillText('LVL', cX, badgeY - 14);
        ctx.restore();
    } else if (challengerData?.isPremium) {
        // --- PREMIUM: Golden Wax Seal with Ribbons ---
        ctx.save();
        
        // Seal Ribbons
        ctx.fillStyle = '#8B0000'; // Deep Red Ribbon
        ctx.beginPath(); ctx.moveTo(cX - 15, badgeY); ctx.lineTo(cX - 20, badgeY + 40); ctx.lineTo(cX - 5, badgeY + 35); ctx.lineTo(cX - 5, badgeY); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cX + 15, badgeY); ctx.lineTo(cX + 20, badgeY + 40); ctx.lineTo(cX + 5, badgeY + 35); ctx.lineTo(cX + 5, badgeY); ctx.fill();
        
        // Irregular Wax Seal Edges
        ctx.beginPath();
        for (let i = 0; i < 30; i++) {
            const angle = (i / 30) * Math.PI * 2;
            const r = badgeR + 3 + Math.sin(i * 1.5) * 2;
            const x = cX + r * Math.cos(angle);
            const y = badgeY + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        const goldGrad = ctx.createLinearGradient(cX - badgeR, badgeY - badgeR, cX + badgeR, badgeY + badgeR);
        goldGrad.addColorStop(0, '#FFD700'); goldGrad.addColorStop(0.5, '#D4AF37'); goldGrad.addColorStop(1, '#B8860B');
        ctx.fillStyle = goldGrad; ctx.fill();
        
        // Inner Stamped Bezel
        ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cX, badgeY, badgeR - 4, 0, Math.PI * 2); ctx.stroke();
        
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; // Stamped look
        ctx.font = `bold 20px ${FONT_STACK}`; ctx.fillText(challengerData?.level || '0', cX + 1, badgeY + 5);
        ctx.font = `bold 9px ${FONT_STACK}`; ctx.fillText('LVL', cX + 1, badgeY - 11);
        
        ctx.fillStyle = '#3E2723'; // Darker gold/brown
        ctx.font = `bold 20px ${FONT_STACK}`; ctx.fillText(challengerData?.level || '0', cX, badgeY + 4);
        ctx.font = `bold 9px ${FONT_STACK}`; ctx.fillText('LVL', cX, badgeY - 12);
        ctx.restore();
    } else {
        // --- REGULAR: Standard Metallic Bezel ---
        drawMetallicBezel(ctx, cX, badgeY, badgeR, COLOR_SHADOW, COLOR_HIGHLIGHT, ACCENT);
        ctx.fillStyle = '#fff';
        ctx.font = `bold 20px ${FONT_STACK}`; ctx.fillText(challengerData?.level || '0', cX, badgeY + 4);
        ctx.font = `bold 9px ${FONT_STACK}`; ctx.fillText('LVL', cX, badgeY - 12);
    }

    const expY = barY + barH + 24;
    ctx.fillStyle = mixColors('#1a1a1a', ACCENT, 0.4);
    ctx.font = `14px 'gunty', ${FONT_STACK}`;
    ctx.textAlign = 'left';
    ctx.fillText('PROGRESS', barX, expY);

    ctx.textAlign = 'right'; ctx.fillStyle = ACCENT;
    ctx.font = `bold 12px ${FONT_STACK}`;
    ctx.fillText(`${formatStat(challengerData?.current || 0)} / ${formatStat(challengerData?.required || 1)} XP`, barX + barW, expY);

    // --- 4. GRAND ARCHIVE LEDGER (Right Panel) ---
    const rX = lX + lW + 24;
    const rW = CARD_WIDTH - rX - 24;
    const rH = islandH;
    const rY = islandY;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 15; ctx.shadowOffsetY = 5;
    ctx.beginPath(); ctx.roundRect(rX, rY, rW, rH, 12);

    ctx.fillStyle = COLOR_BG;
    ctx.fill();
    ctx.clip();
    
    drawSeigaihaPattern(ctx, CARD_WIDTH, CARD_HEIGHT, ACCENT);

    const rVig = ctx.createRadialGradient(rX + rW / 2, rY + rH / 2, rH * 0.2, rX + rW / 2, rY + rH / 2, rW * 0.8);
    rVig.addColorStop(0, 'transparent');
    rVig.addColorStop(1, 'rgba(10, 10, 12, 0.6)');
    ctx.fillStyle = rVig;
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = hexToRgba(ACCENT, 0.3); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(rX + 6, rY + 6, rW - 12, rH - 12, 8); ctx.stroke();
    ctx.strokeStyle = hexToRgba(ACCENT, 0.1);
    ctx.beginPath(); ctx.roundRect(rX + 10, rY + 10, rW - 20, rH - 20, 6); ctx.stroke();

    // Header
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = mixColors('#ffffff', ACCENT, 0.6);
    ctx.font = `18px 'gunty', ${FONT_STACK}`;
    ctx.letterSpacing = '3px';
    ctx.fillText('ANIMUSE RANKINGS', rX + rW / 2, rY + 26);
    ctx.letterSpacing = '0px';

    const rDiv = ctx.createLinearGradient(rX + 50, 0, rX + rW - 50, 0);
    rDiv.addColorStop(0, 'transparent'); rDiv.addColorStop(0.5, hexToRgba(ACCENT, 0.4)); rDiv.addColorStop(1, 'transparent');
    ctx.strokeStyle = rDiv; ctx.beginPath(); ctx.moveTo(rX + 50, rY + 44); ctx.lineTo(rX + rW - 50, rY + 44); ctx.stroke();

    // --- PODIUM (Top 3) ---
    const pCY = rY + 110;
    const pStep = rW / 3;
    const podiumNameY = rY + 185;
    const podiumLvlY = rY + 205;

    const drawPod = (u, rank, x, y, sz) => {
        if (!u) return;
        const pal = rank === 1 ? { h: '#FFF8DC', m: '#D4AF37', s: '#996515' } :
            rank === 2 ? { h: '#FFFFFF', m: '#C0C0C0', s: '#696969' } :
                { h: '#FFDAB9', m: '#CD7F32', s: '#8B4513' };

        drawMetallicBezel(ctx, x, y, sz, pal.s, pal.h, pal.m);
        const img = getImg(u?.avatarUrl || u?.avatar);
        if (img) {
            ctx.save();
            ctx.beginPath(); ctx.arc(x, y, sz, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(img, x - sz, y - sz, sz * 2, sz * 2);
            ctx.restore();
        }

        drawRankBadge(ctx, x, y + sz - 8, rank, pal, COLOR_INK);

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 4;
        ctx.fillStyle = '#FFF';
        const n = (u.username || '').toUpperCase();
        ctx.font = fitText(ctx, n, FONT_STACK, 16, 'bold', pStep - 10);
        ctx.fillText(n, x, podiumNameY);
        ctx.restore();

        ctx.fillStyle = pal.m;
        ctx.font = `bold 13px ${FONT_STACK}`;
        ctx.fillText(`LVL ${u.level || 0}`, x, podiumLvlY);
    };

    if (topUsers?.length >= 3) {
        drawPod(topUsers[1], 2, rX + pStep * 0.55, pCY + 15, 30);
        drawPod(topUsers[2], 3, rX + pStep * 2.45, pCY + 15, 30);
        drawPod(topUsers[0], 1, rX + pStep * 1.5, pCY, 36);
    }

    // --- LIST ROWS (4-10) ---
    const listY = rY + 236;
    const rowStep = 31;
    const rowH = 24;

    for (let i = 3; i < 10; i++) {
        const u = topUsers?.[i], ry = listY + (i - 3) * rowStep, rCY = ry + rowH / 2;
        const displayedRank = 3 + (page - 1) * 7 + (i - 2);

        if (i % 2 === 0) {
            const rowGrad = ctx.createLinearGradient(rX + 16, 0, rX + rW - 16, 0);
            rowGrad.addColorStop(0, 'transparent');
            rowGrad.addColorStop(0.2, hexToRgba(ACCENT, 0.08));
            rowGrad.addColorStop(0.8, hexToRgba(ACCENT, 0.08));
            rowGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = rowGrad;
            ctx.fillRect(rX + 16, ry, rW - 32, rowH);
        }

        const rx = rX + 28;
        if (u?.isBooster) {
            ctx.save();
            ctx.shadowColor = ACCENT; ctx.shadowBlur = 12;
            
            ctx.strokeStyle = '#D4AF37'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(rx, rCY, 10, 0, Math.PI * 2); ctx.stroke();

            const grad = ctx.createRadialGradient(rx, rCY, 0, rx, rCY, 14);
            grad.addColorStop(0, '#FFFFFF'); 
            grad.addColorStop(0.3, ACCENT); 
            grad.addColorStop(1, mixColors('#000', ACCENT, 0.4)); 
            
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(rx, rCY - 14); ctx.lineTo(rx + 4, rCY - 4);
            ctx.lineTo(rx + 14, rCY); ctx.lineTo(rx + 4, rCY + 4);
            ctx.lineTo(rx, rCY + 14); ctx.lineTo(rx - 4, rCY + 4);
            ctx.lineTo(rx - 14, rCY); ctx.lineTo(rx - 4, rCY - 4);
            ctx.closePath(); ctx.fill();
            ctx.restore();
            
            ctx.save();
            ctx.fillStyle = '#FFF';
            ctx.font = `bold 12px ${FONT_STACK}`;
            ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 3;
            ctx.textAlign = 'center'; ctx.fillText(`${displayedRank}`, rx, rCY + 1);
            ctx.restore();
        } else if (u?.isPremium) {
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4;
            const grad = ctx.createLinearGradient(rx - 10, rCY - 10, rx + 10, rCY + 10);
            grad.addColorStop(0, '#FFF8DC'); grad.addColorStop(0.5, '#D4AF37'); grad.addColorStop(1, '#996515');
            ctx.fillStyle = grad;
            ctx.beginPath();
            for(let j=0; j<6; j++) ctx.lineTo(rx + 11 * Math.cos(j * Math.PI/3), rCY + 11 * Math.sin(j * Math.PI/3));
            ctx.fill();
            ctx.restore();
            
            ctx.fillStyle = '#110905';
            ctx.font = `bold 11px ${FONT_STACK}`;
            ctx.textAlign = 'center'; ctx.fillText(`${displayedRank}`, rx, rCY + 1);
        } else {
            ctx.fillStyle = mixColors('#fff', ACCENT, 0.4);
            ctx.font = `bold 12px ${FONT_STACK}`;
            ctx.textAlign = 'center'; ctx.fillText(`#${displayedRank}`, rx, rCY);
        }

        if (u) {
            drawMetallicBezel(ctx, rX + 65, rCY, 9, COLOR_SHADOW, COLOR_HIGHLIGHT, ACCENT);
            const mImg = getImg(u?.avatarUrl || u?.avatar);
            if (mImg) {
                ctx.save(); ctx.beginPath(); ctx.arc(rX + 65, rCY, 9, 0, Math.PI * 2); ctx.clip();
                ctx.drawImage(mImg, rX + 56, rCY - 9, 18, 18);
                ctx.restore();
            }

            const un = (u.username || '').toUpperCase();
            const lvl = `LVL ${u.level || 0}`;
            
            // Measure level first to know available space
            ctx.font = `bold 13px ${FONT_STACK}`;
            const lW = ctx.measureText(lvl).width;
            const availableSpace = (rW - 24 - lW - 12) - (85); // Space between avatar offset and level offset

            ctx.fillStyle = '#FFF';
            ctx.textAlign = 'left';
            ctx.font = fitText(ctx, un, FONT_STACK, 13, 'bold', availableSpace - 5);
            ctx.fillText(un, rX + 85, rCY);

            ctx.fillStyle = ACCENT;
            ctx.textAlign = 'right';
            ctx.font = `bold 13px ${FONT_STACK}`;
            ctx.fillText(lvl, rX + rW - 24, rCY);

            const nW = ctx.measureText(un).width;
            const dS = rX + 85 + nW + 12;
            const dE = rX + rW - 24 - lW - 12;

            if (dE > dS) {
                ctx.strokeStyle = hexToRgba(ACCENT, 0.2);
                ctx.lineWidth = 1.5;
                ctx.setLineDash([2, 5]);
                ctx.beginPath(); ctx.moveTo(dS, rCY + 1); ctx.lineTo(dE, rCY + 1); ctx.stroke();
                ctx.setLineDash([]);
            }
        } else {
            ctx.fillStyle = hexToRgba('#fff', 0.2);
            ctx.font = `italic 12px ${FONT_STACK}`;
            ctx.textAlign = 'left';
            ctx.fillText('Archival Slot Vacant', rX + 65, rCY);
        }
    }
    ctx.restore();
    return await canvas.encode('webp', { quality: 85 });
};

module.exports = { generateLeaderboard };