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

// --- CONSTANTS ---
const CARD_WIDTH = 800;
const CARD_HEIGHT = 510;
const FONT_PRIMARY = "'digitalgalaxy', sans-serif";
const FONT_SECONDARY = "'exomoon', sans-serif";

const CONFIG = require('../config');
const NEON_CYAN = CONFIG.COLORS?.INFO || '#00F0FF';
const NEON_MAGENTA = CONFIG.COLORS?.PRIMARY || '#FF2D78';
const METALLIC_GOLD = ['#D4AF37', '#FFF8DC', '#DAA520'];
const METALLIC_SILVER = ['#A8B8C8', '#FFFFFF', '#B8C8D8'];
const METALLIC_BRONZE = ['#CD7F32', '#FFDAB9', '#B87333'];

const BG_DARK = '#020208';
const VIGNETTE_TINT = '#02021A';
const TEXT_WHITE = '#EAEAFF';
const TEXT_DIM = 'rgba(200, 210, 255, 0.6)';

// --- ARCADE DRAWING HELPERS ---
const drawDigitalPattern = (ctx, x, y, w, h, themeColor) => {
    ctx.save();
    ctx.strokeStyle = hexToRgba(themeColor, 0.06); ctx.lineWidth = 1;
    const spacing = 35;
    for (let gx = x + spacing / 2; gx < x + w; gx += spacing) {
        for (let gy = y + spacing / 2; gy < y + h; gy += spacing) {
            ctx.beginPath(); ctx.moveTo(gx - 2, gy); ctx.lineTo(gx + 2, gy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(gx, gy - 2); ctx.lineTo(gx, gy + 2); ctx.stroke();
        }
    }
    ctx.restore();
};

const drawHexagon = (ctx, x, y, size) => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (i * 60 - 90) * Math.PI / 180;
        ctx.lineTo(x + size * Math.cos(angle), y + size * Math.sin(angle));
    }
    ctx.closePath();
};

const drawPerspectiveGrid = (ctx, x, y, w, h, color) => {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.globalAlpha = 0.08; ctx.strokeStyle = color; ctx.lineWidth = 1;
    const gridSpace = 40;
    for (let gx = x; gx < x + w; gx += gridSpace) {
        for (let gy = y; gy < y + h; gy += gridSpace) {
            ctx.beginPath(); ctx.moveTo(gx - 2, gy); ctx.lineTo(gx + 2, gy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(gx, gy - 2); ctx.lineTo(gx, gy + 2); ctx.stroke();
        }
    }
    ctx.restore();
};

const drawDataTether = (ctx, x, y, w, h, color, status = {}) => {
    const { isPremium, isBooster } = status;
    ctx.save();
    
    // Tech Ribbon Base
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h);
    if (isBooster) {
        ctx.lineTo(x + w / 2, y + h + 15); // Arrow Point
    } else if (isPremium) {
        ctx.lineTo(x + w, y + h + 10);
        ctx.lineTo(x, y + h + 10);
    } else {
        ctx.lineTo(x + w / 2, y + h - 10); // Cutout
    }
    ctx.lineTo(x, y + h);
    ctx.closePath();

    ctx.fillStyle = mixColors('#050510', color, 0.2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Circuit lines
    ctx.strokeStyle = hexToRgba(color, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 5, y); ctx.lineTo(x + 5, y + h - 5);
    ctx.moveTo(x + w - 5, y); ctx.lineTo(x + w - 5, y + h - 5);
    ctx.stroke();

    // Connection Node
    ctx.fillStyle = color;
    ctx.beginPath(); drawHexagon(ctx, x + w / 2, y + 6, 4); ctx.fill();

    ctx.restore();
};

const drawCyberBezel = (ctx, x, y, r, glowColor, palette = METALLIC_SILVER) => {
    ctx.save();
    ctx.shadowColor = glowColor; ctx.shadowBlur = 15;
    const metalGrad = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    metalGrad.addColorStop(0, palette[0]); metalGrad.addColorStop(0.5, palette[1]); metalGrad.addColorStop(1, palette[2]);
    ctx.strokeStyle = metalGrad; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke();
    
    // Inner dark rim
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(x, y, r + 1, 0, Math.PI * 2);
    ctx.fillStyle = '#050510'; ctx.fill();
    ctx.restore();
};

const drawRankBadge = (ctx, x, y, rank, palette, glowColor) => {
    ctx.save();
    ctx.shadowColor = glowColor; ctx.shadowBlur = 8;
    ctx.fillStyle = BG_DARK; drawHexagon(ctx, x, y, 12); ctx.fill();
    ctx.strokeStyle = palette[0]; ctx.lineWidth = 1.5; ctx.stroke();
    
    ctx.fillStyle = palette[1];
    ctx.font = `900 11px ${FONT_SECONDARY}`; // Use secondary for numbers
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${rank}`, x, y + 1);
    ctx.restore();
};

// --- MAIN GENERATOR ---
const generateMinigameLeaderboard = async (challenger, challengerData, topUsers, backgroundUrl = null, primaryColor = '#00F0FF', challengerName = null, challengerAvatarUrl = null, page = 1) => {
    const SCALE = 2.0;
    const canvas = createCanvas(Math.floor(CARD_WIDTH * SCALE), Math.floor(CARD_HEIGHT * SCALE));
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const ACCENT = primaryColor || NEON_CYAN;
    
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

    // (Background removed to match EXP leaderboard structure)



    // --- GRIDDING CONSTANTS ---
    const islandY = 20;
    const islandH = 465;

    // ============================
    // 3. CHALLENGER DOSSIER (LEFT)
    // ============================
    const lX = 24, lY = islandY, lW = 260, lH = islandH, cX = lX + lW / 2;
    const bannerH_left = 110;
    const cAvR = 44, cAvY = lY + bannerH_left;

    ctx.save();
    ctx.shadowColor = hexToRgba(ACCENT, 0.4);
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.roundRect(lX, lY, lW, lH, 12);
    ctx.fillStyle = '#050510';
    ctx.fill();
    ctx.clip();
    
    drawDigitalPattern(ctx, lX, lY, lW, lH, ACCENT);
    
    ctx.shadowColor = 'transparent';

    ctx.clip();
    const lVig = ctx.createRadialGradient(cX, lY + lH / 2, lH * 0.2, cX, lY + lH / 2, lW * 0.9);
    lVig.addColorStop(0, hexToRgba(ACCENT, 0.1));
    lVig.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lVig;
    ctx.fill();
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
        bGrad.addColorStop(0, 'rgba(0,0,0,0.6)');
        bGrad.addColorStop(1, 'rgba(0,0,0,0.1)');
        ctx.fillStyle = bGrad;
        ctx.fill();
    } else {
        const bGrad = ctx.createLinearGradient(0, lY, 0, lY + bannerH_left);
        bGrad.addColorStop(0, mixColors('#000', ACCENT, 0.6));
        bGrad.addColorStop(1, mixColors('#000', ACCENT, 0.8));
        ctx.fillStyle = bGrad;
        ctx.fill();
    }
    
    // Grid overlay on banner
    drawPerspectiveGrid(ctx, lX, lY, lW, bannerH_left, '#FFF');
    ctx.restore();

    // B. The Neon Seam
    ctx.save();
    ctx.shadowColor = ACCENT;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(lX, cAvY);
    ctx.lineTo(lX + lW, cAvY);
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // C. Glowing Cyber Borders
    ctx.save();
    ctx.beginPath(); ctx.rect(lX, cAvY, lW, lH - bannerH_left); ctx.clip();

    ctx.strokeStyle = hexToRgba(ACCENT, 0.5);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(lX + 8, lY + 8, lW - 16, lH - 16, 8); ctx.stroke();

    ctx.strokeStyle = hexToRgba(NEON_MAGENTA, 0.3);
    ctx.beginPath(); ctx.roundRect(lX + 12, lY + 12, lW - 24, lH - 24, 6); ctx.stroke();
    
    // Tech Nodes
    ctx.fillStyle = ACCENT;
    [{ x: lX + 8, y: cAvY + 10 }, { x: lX + lW - 8, y: cAvY + 10 }, { x: lX + 8, y: lY + lH - 8 }, { x: lX + lW - 8, y: lY + lH - 8 }].forEach(p => {
        ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    });
    ctx.restore();

    // D. The Data Tether (Hanging under the PFP)
    const bmW = 40, bmH = 80, bmX = cX - bmW / 2;
    const bmY = cAvY;

    const bmStatus = { isPremium: challengerData?.isPremium, isBooster: challengerData?.isBooster };
    drawDataTether(ctx, bmX - 4, bmY, bmW + 8, bmH + 8, hexToRgba(ACCENT, 0.5), bmStatus);
    drawDataTether(ctx, bmX, bmY, bmW, bmH, ACCENT, bmStatus);

    ctx.fillStyle = TEXT_WHITE;
    ctx.font = `900 13px ${FONT_SECONDARY}`; // Reduced size for better framing
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = ACCENT; ctx.shadowBlur = 5;
    ctx.fillText(`#${challengerData?.rank || '--'}`, cX, bmY + 62);
    ctx.shadowBlur = 0;

    // E. The Straddling Avatar
    drawCyberBezel(ctx, cX, cAvY, cAvR, ACCENT);
    const cImgData = getImg(cAvUrl);
    if (cImgData) {
        ctx.save();
        ctx.beginPath(); ctx.arc(cX, cAvY, cAvR, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(cImgData, cX - cAvR, cAvY - cAvR, cAvR * 2, cAvR * 2);
        ctx.restore();
    }

    // F. Flourished Typography -> Cyber Typography
    const cName = (challengerName || challenger?.username || challengerData?.username || 'Unknown').toUpperCase();
    ctx.fillStyle = TEXT_WHITE;
    const cNameY = lY + 235;
    // Use secondary font if it has numbers, or just use secondary for all names for consistency
    ctx.font = fitText(ctx, cName, FONT_SECONDARY, 24, '900', lW - 60);
    ctx.shadowColor = ACCENT; ctx.shadowBlur = 10;
    ctx.fillText(cName, cX, cNameY);
    ctx.shadowBlur = 0;

    const nW_name = ctx.measureText(cName).width;
    ctx.fillStyle = hexToRgba(ACCENT, 0.8);
    const drawChevron = (x, y, flip) => {
        ctx.beginPath(); 
        if (flip) { ctx.moveTo(x, y - 4); ctx.lineTo(x - 4, y); ctx.lineTo(x, y + 4); }
        else { ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); }
        ctx.lineWidth = 2; ctx.strokeStyle = ACCENT; ctx.stroke();
    };
    drawChevron(cX - nW_name / 2 - 16, cNameY, true);
    drawChevron(cX + nW_name / 2 + 16, cNameY, false);

    ctx.fillStyle = TEXT_DIM;
    const cTitleY = lY + 265;
    ctx.font = fitText(ctx, challengerData?.title || 'ARCADE CHALLENGER', FONT_SECONDARY, 14, 'bold', 240);
    ctx.letterSpacing = '2px';
    ctx.fillText((challengerData?.title || 'ARCADE CHALLENGER').toUpperCase(), cX, cTitleY);
    ctx.letterSpacing = '0px';

    const cDivY = lY + 315;
    const lDiv = ctx.createLinearGradient(lX + 30, 0, lX + lW - 30, 0);
    lDiv.addColorStop(0, 'transparent'); lDiv.addColorStop(0.5, ACCENT); lDiv.addColorStop(1, 'transparent');
    ctx.strokeStyle = lDiv; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(lX + 30, cDivY); ctx.lineTo(lX + lW - 30, cDivY); ctx.stroke();

    // Cyber Nodes
    ctx.fillStyle = ACCENT; ctx.fillRect(cX - 3, cDivY - 1.5, 6, 3);
    ctx.fillStyle = NEON_MAGENTA; ctx.fillRect(cX - 18, cDivY - 1, 4, 2);
    ctx.fillRect(cX + 14, cDivY - 1, 4, 2);

    // G. COMPACT HUD MODULES (Simplified & Concise)
    const statsY = lY + 372;
    const modH = 70;
    const modW = (lW - 60) / 2;
    const gutter = 12;

    const drawHudMod = (x, y, w, h, label, value, color) => {
        ctx.save();
        // 1. Module Base
        ctx.fillStyle = 'rgba(5, 5, 20, 0.9)';
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill();
        ctx.strokeStyle = hexToRgba(color, 0.3); ctx.lineWidth = 1; ctx.stroke();
        
        // 2. Decorative Accents
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 4, 10); // Corner accent
        
        // 3. Compact Label
        ctx.font = `900 10px ${FONT_SECONDARY}`;
        ctx.fillStyle = hexToRgba(color, 0.8);
        ctx.textAlign = 'left'; ctx.letterSpacing = '1px';
        ctx.fillText(label.toUpperCase(), x + 10, y + 18);

        // 4. Large Readout
        ctx.font = `900 26px ${FONT_SECONDARY}`;
        ctx.fillStyle = TEXT_WHITE;
        ctx.shadowColor = color; ctx.shadowBlur = 10;
        ctx.textAlign = 'center';
        ctx.fillText(value, x + w / 2, y + 52);
        ctx.restore();
    };

    drawHudMod(lX + 24, statsY, modW, modH, 'Rank', `#${challengerData?.rank || '--'}`, ACCENT);
    drawHudMod(lX + lW - 24 - modW, statsY, modW, modH, 'Points', formatStat(challengerData?.current || 0), NEON_MAGENTA);

    // ============================
    // 4. GRAND ARCHIVE LEDGER (Right Panel)
    // ============================
    const rX = lX + lW + 24;
    const rW = CARD_WIDTH - rX - 24;
    const rH = islandH;
    const rY = islandY;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 20;
    ctx.beginPath(); ctx.roundRect(rX, rY, rW, rH, 12);
    ctx.fillStyle = '#03030A';
    ctx.fill();
    ctx.clip();
    ctx.shadowColor = 'transparent';
    
    drawDigitalPattern(ctx, rX, rY, rW, rH, ACCENT);

    const rVig = ctx.createRadialGradient(rX + rW / 2, rY + rH / 2, rH * 0.2, rX + rW / 2, rY + rH / 2, rW * 0.8);
    rVig.addColorStop(0, 'transparent');
    rVig.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
    ctx.fillStyle = rVig;
    ctx.fill();

    ctx.strokeStyle = hexToRgba(ACCENT, 0.5); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(rX + 6, rY + 6, rW - 12, rH - 12, 8); ctx.stroke();
    ctx.strokeStyle = hexToRgba(NEON_MAGENTA, 0.2);
    ctx.beginPath(); ctx.roundRect(rX + 10, rY + 10, rW - 20, rH - 20, 6); ctx.stroke();

    // Header
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    
    ctx.save();
    ctx.font = `900 16px ${FONT_SECONDARY}`; ctx.letterSpacing = '5px'; // Use secondary for header numbers
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = NEON_MAGENTA; ctx.fillText(`ARCADE PROTOCOL // PAGE ${page}`, rX + rW / 2 - 1, rY + 27);
    ctx.fillStyle = NEON_CYAN; ctx.fillText(`ARCADE PROTOCOL // PAGE ${page}`, rX + rW / 2 + 1, rY + 25);
    
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#FFFFFF'; ctx.shadowColor = '#FFFFFF'; ctx.shadowBlur = 8;
    ctx.fillText(`ARCADE PROTOCOL // PAGE ${page}`, rX + rW / 2, rY + 26);
    ctx.restore();
    
    ctx.shadowBlur = 0; ctx.letterSpacing = '0px';

    const rDiv = ctx.createLinearGradient(rX + 50, 0, rX + rW - 50, 0);
    rDiv.addColorStop(0, 'transparent'); rDiv.addColorStop(0.5, ACCENT); rDiv.addColorStop(1, 'transparent');
    ctx.strokeStyle = rDiv; ctx.beginPath(); ctx.moveTo(rX + 50, rY + 44); ctx.lineTo(rX + rW - 50, rY + 44); ctx.stroke();

    // --- PODIUM (Top 3) ---
    const pCY = rY + 110;
    const pStep = rW / 3;
    const podiumNameY = rY + 185;
    const podiumScoreY = rY + 205;

    const drawPod = (u, rank, x, y, sz) => {
        if (!u) return;
        const cfg = rank === 1 ? { palette: METALLIC_GOLD, glowColor: '#FFD700' } :
                    rank === 2 ? { palette: METALLIC_SILVER, glowColor: NEON_CYAN } :
                                 { palette: METALLIC_BRONZE, glowColor: NEON_MAGENTA };

        // 1. Neon Fiber-Optic Tether
        ctx.save();
        const tetherGrad = ctx.createLinearGradient(x, y - sz, x, rY + 44);
        tetherGrad.addColorStop(0, cfg.glowColor); tetherGrad.addColorStop(1, 'transparent');
        ctx.strokeStyle = tetherGrad; ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.moveTo(x, y - sz - 5); ctx.lineTo(x, rY + 44); ctx.stroke();
        ctx.restore();

        drawCyberBezel(ctx, x, y, sz, cfg.glowColor, cfg.palette);
        const img = getImg(u?.avatarUrl || u?.avatar);
        if (img) {
            ctx.save();
            ctx.beginPath(); ctx.arc(x, y, sz, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(img, x - sz, y - sz, sz * 2, sz * 2);
            ctx.restore();
        }

        drawRankBadge(ctx, x, y + sz + 8, rank, cfg.palette, cfg.glowColor);

        // Spacing adjusted relative to avatar position
        const pNameY = y + sz + 38;
        const pScoreY = pNameY + 18;

        ctx.save();
        ctx.shadowColor = cfg.glowColor; ctx.shadowBlur = 5;
        ctx.fillStyle = '#FFF';
        const n = (u.username || '').toUpperCase();
        ctx.font = fitText(ctx, n, FONT_SECONDARY, 14, '900', pStep - 10);
        ctx.fillText(n, x, pNameY);
        ctx.restore();

        ctx.fillStyle = cfg.palette[1];
        ctx.font = `900 13px ${FONT_SECONDARY}`;
        ctx.fillText(`${formatStat(u.total_points || 0)} PTS`, x, pScoreY);
    };

    if (topUsers?.length >= 3) {
        drawPod(topUsers[1], 2, rX + pStep * 0.55, pCY + 18, 30);
        drawPod(topUsers[2], 3, rX + pStep * 2.45, pCY + 18, 30);
        drawPod(topUsers[0], 1, rX + pStep * 1.5, pCY - 10, 36);
    }

    // --- LIST ROWS (4-10) ---
    const listY = rY + 236;
    const rowStep = 31;
    const rowH = 24;

    for (let i = 3; i < 10; i++) {
        const u = topUsers?.[i], ry = listY + (i - 3) * rowStep, rCY = ry + rowH / 2;
        const displayedRank = 3 + (page - 1) * 7 + (i - 2);

        const isCyan = i % 2 === 0; 
        const mainColor = isCyan ? NEON_CYAN : NEON_MAGENTA;

        if (i % 2 === 0) {
            const rowGrad = ctx.createLinearGradient(rX + 16, 0, rX + rW - 16, 0);
            rowGrad.addColorStop(0, 'transparent');
            rowGrad.addColorStop(0.2, hexToRgba(mainColor, 0.08));
            rowGrad.addColorStop(0.8, hexToRgba(mainColor, 0.08));
            rowGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = rowGrad;
            ctx.fillRect(rX + 16, ry, rW - 32, rowH);
        }

        const rx = rX + 28;
        if (u?.isBooster) {
            ctx.save();
            ctx.shadowColor = mainColor; ctx.shadowBlur = 10;
            ctx.fillStyle = mainColor; ctx.font = `900 12px ${FONT_SECONDARY}`;
            ctx.textAlign = 'left'; ctx.fillText('◆', rx - 16, rCY);
            ctx.textAlign = 'center'; ctx.fillText(`${displayedRank}`.padStart(2, '0'), rx, rCY);
            ctx.textAlign = 'left'; ctx.fillText('◆', rx + 11, rCY);
            ctx.restore();
        } else if (u?.isPremium) {
            ctx.save();
            ctx.shadowColor = '#D4AF37'; ctx.shadowBlur = 8;
            ctx.fillStyle = '#D4AF37'; ctx.font = `900 11px ${FONT_SECONDARY}`;
            ctx.textAlign = 'left'; ctx.fillText('>', rx - 14, rCY);
            ctx.textAlign = 'center'; ctx.fillText(`${displayedRank}`.padStart(2, '0'), rx, rCY);
            ctx.textAlign = 'left'; ctx.fillText('<', rx + 12, rCY);
            ctx.restore();
        } else {
            ctx.fillStyle = TEXT_DIM;
            ctx.font = `900 11px ${FONT_SECONDARY}`;
            ctx.textAlign = 'left'; ctx.fillText('[', rx - 15, rCY);
            ctx.textAlign = 'center'; ctx.fillText(`${displayedRank}`.padStart(2, '0'), rx, rCY);
            ctx.textAlign = 'left'; ctx.fillText(']', rx + 13, rCY);
        }

        if (u) {
            ctx.save();
            ctx.beginPath(); ctx.arc(rX + 65, rCY, 9, 0, Math.PI * 2); ctx.clip();
            const mImg = getImg(u?.avatarUrl || u?.avatar);
            if (mImg) ctx.drawImage(mImg, rX + 56, rCY - 9, 18, 18);
            else { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); }
            ctx.restore();
            ctx.strokeStyle = mainColor; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(rX + 65, rCY, 9, 0, Math.PI * 2); ctx.stroke();

            const un = (u.username || '').toUpperCase();
            const pts = `${formatStat(u.total_points || 0)} PTS`;
            
            ctx.font = `900 13px ${FONT_SECONDARY}`;
            const pW = ctx.measureText(pts).width;
            const availableSpace = (rW - 24 - pW - 12) - (85);

            ctx.fillStyle = TEXT_WHITE;
            ctx.textAlign = 'left';
            ctx.font = fitText(ctx, un, FONT_SECONDARY, 13, '900', availableSpace - 5);
            ctx.fillText(un, rX + 85, rCY);

            ctx.save();
            ctx.fillStyle = mainColor;
            ctx.textAlign = 'right';
            ctx.font = `900 13px ${FONT_SECONDARY}`;
            ctx.shadowColor = mainColor; ctx.shadowBlur = 5;
            ctx.fillText(pts, rX + rW - 24, rCY);
            ctx.restore();

            // Trace line
            const fillRatio = Math.min(1, (u.total_points || 0) / (topUsers[0]?.total_points || 1));
            const nW = ctx.measureText(un).width;
            const dS = rX + 85 + nW + 12;
            const dE = rX + rW - 24 - pW - 12;

            if (dE > dS) {
                const indicatorX = dS + (dE - dS) * fillRatio;
                
                ctx.save();
                ctx.strokeStyle = hexToRgba(mainColor, 0.2);
                ctx.lineWidth = 1;
                ctx.setLineDash([2, 4]);
                ctx.beginPath(); ctx.moveTo(dS, rCY + 1); ctx.lineTo(dE, rCY + 1); ctx.stroke();
                ctx.setLineDash([]);
                
                // Glow Dot
                ctx.fillStyle = mainColor; ctx.shadowColor = mainColor; ctx.shadowBlur = 6;
                ctx.fillRect(indicatorX - 2, rCY - 1, 4, 4);
                ctx.restore();
            }
        } else {
            ctx.fillStyle = hexToRgba('#fff', 0.2);
            ctx.font = `italic 12px ${FONT_SECONDARY}`;
            ctx.textAlign = 'left';
            ctx.fillText('AWAITING CHALLENGER...', rX + 65, rCY);
        }
    }
    ctx.restore();
    return await canvas.encode('webp', { quality: 85 });
};

module.exports = { generateMinigameLeaderboard };
