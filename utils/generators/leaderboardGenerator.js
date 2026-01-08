const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const { lightenColor } = require('../config/colorConfig');

const CARD_WIDTH = 930;
const CARD_HEIGHT = 550;

const drawRoundedRect = (ctx, x, y, width, height, radius) => {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.closePath();
};

const formatStat = (num) => {
    const n = parseFloat(num) || 0;
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return n.toString();
};

const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
};

const generateLeaderboard = async (challenger, challengerData, topUsers, backgroundUrl = null, primaryColor = '#FFACD1', challengerName = null, challengerAvatarUrl = null) => {
    const SCALE = 2;
    const canvas = createCanvas(CARD_WIDTH * SCALE, CARD_HEIGHT * SCALE);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    // Helper: Fit Text
    const fitText = (ctx, text, maxWidth, initialFontSize) => {
        let fontSize = initialFontSize;
        ctx.font = `900 ${fontSize}px sans-serif`;
        while (ctx.measureText(text).width > maxWidth && fontSize > 10) {
            fontSize -= 2;
            ctx.font = `900 ${fontSize}px sans-serif`;
        }
        return fontSize;
    };

    const THEME_COLOR = primaryColor;
    const TEXT_COLOR = lightenColor(THEME_COLOR, 60); // Bumped to 60% for better visibility
    const { r, g, b } = hexToRgb(THEME_COLOR);
    const PILL_COLOR = `rgba(${Math.floor(r * 0.15)}, ${Math.floor(g * 0.15)}, ${Math.floor(b * 0.15)}, 0.8)`;

    // ... (Background and Islands setup remains, skipping to relevant sections)

    // --- 1. BACKGROUND ---
    const isCustom = !!backgroundUrl;

    ctx.save();
    ctx.fillStyle = '#08080c';
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    try {
        let bgImg;
        if (backgroundUrl) {
            bgImg = await loadImage(backgroundUrl);
        } else {
            // Check Cache
            if (!global.defaultBgCache) {
                const finalBgPath = path.join(__dirname, 'images', 'profile_background_default.png');
                global.defaultBgCache = await loadImage(finalBgPath);
            }
            bgImg = global.defaultBgCache;
        }

        const ratio = Math.max(CARD_WIDTH / bgImg.width, CARD_HEIGHT / bgImg.height);
        const x = (CARD_WIDTH - bgImg.width * ratio) / 2;
        const y = (CARD_HEIGHT - bgImg.height * ratio) / 2;

        if (isCustom) {
            ctx.drawImage(bgImg, x, y, bgImg.width * ratio, bgImg.height * ratio);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
        } else {
            ctx.filter = 'blur(25px) brightness(0.25) saturate(1.2)';
            ctx.drawImage(bgImg, x, y, bgImg.width * ratio, bgImg.height * ratio);
            ctx.filter = 'none';
        }

    } catch (e) {
        ctx.fillStyle = '#101015';
        ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    }
    ctx.restore();

    // --- 2. ISLAND LAYOUT ---
    const islands = [
        { x: 25, y: 25, w: 250, h: 500 },  // Island 1: Challenger
        { x: 295, y: 25, w: 340, h: 500 }, // Island 2: Top 10 List
        { x: 655, y: 25, w: 250, h: 500 }  // Island 3: Podium
    ];

    const glassBase = `rgba(${Math.floor(r * 0.25)}, ${Math.floor(g * 0.25)}, ${Math.floor(b * 0.25)}, 0.85)`;

    islands.forEach(is => {
        ctx.save();
        if (isCustom) {
            ctx.fillStyle = glassBase;
            ctx.shadowColor = `rgba(${r},${g},${b},0.3)`;
            ctx.shadowBlur = 10;
        } else {
            ctx.fillStyle = 'rgba(12, 12, 18, 0.9)';
        }

        drawRoundedRect(ctx, is.x, is.y, is.w, is.h, 32); // Radius 32 for iOS look
        ctx.fill();

        if (isCustom) {
            ctx.strokeStyle = 'rgba(255,255,255,0.2)'; // Brighter stroke
            ctx.lineWidth = 1.5;
            ctx.stroke();
        } else {
            ctx.strokeStyle = THEME_COLOR;
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.15;
            ctx.stroke();
        }
        ctx.restore();
    });

    // Texture Overlay (Only Default)
    if (!isCustom) {
        ctx.save();
        ctx.strokeStyle = `rgba(255,255,255,0.03)`;
        ctx.lineWidth = 1;
        for (let i = 0; i < CARD_HEIGHT; i += 4) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(CARD_WIDTH, i);
            ctx.stroke();
        }
        ctx.restore();
    }

    // Helper: Draw Header with Pill
    const drawHeader = (text, x, y) => {
        // Shift reference Y to visual center (approx 5px up from baseline)
        const centerY = y - 5;

        if (isCustom) {
            ctx.font = '900 13px sans-serif';
            const hW = ctx.measureText(text).width + 60; // Wider padding
            ctx.save();
            ctx.fillStyle = PILL_COLOR;
            ctx.beginPath();
            // Center Rect around centerY
            // Height 34. Top = centerY - 17.
            ctx.roundRect(x - hW / 2, centerY - 17, hW, 34, 17);
            ctx.fill();
            ctx.restore();
        }

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '900 13px sans-serif';
        ctx.fillStyle = TEXT_COLOR;
        ctx.letterSpacing = '4px';
        // Draw text at centerY, with +1px optical adjustment
        ctx.fillText(text, x, centerY + 1);
        ctx.restore();
    };

    // --- ISLAND 1: YOUR ARCHIVE ---
    const i1 = islands[0];
    const cX = i1.x + i1.w / 2;

    drawHeader('YOUR ARCHIVE', cX, i1.y + 45);

    // Avatar
    const avY = i1.y + 80;
    const avR = 60;

    ctx.save();
    ctx.shadowColor = THEME_COLOR;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(cX, avY + avR, avR, 0, Math.PI * 2);
    ctx.clip();
    try {
        const url = challengerAvatarUrl || challenger.displayAvatarURL({ extension: 'png', size: 512 });
        const img = await loadImage(url);
        ctx.drawImage(img, cX - avR, avY, avR * 2, avR * 2);
    } catch (e) { }
    ctx.restore();

    ctx.strokeStyle = THEME_COLOR;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cX, avY + avR, avR + 2, 0, Math.PI * 2);
    ctx.stroke();

    // Rank Ribbon
    const ribW = 100;
    const ribH = 26;
    drawRoundedRect(ctx, cX - ribW / 2, avY + avR * 2 - 10, ribW, ribH, 13); // Rounded caps (26/2)
    ctx.fillStyle = PILL_COLOR; // Consistent with headers
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = TEXT_COLOR; // Consistent with headers
    ctx.font = '900 12px sans-serif';
    ctx.letterSpacing = '1px';
    ctx.fillText(`RANK #${challengerData.rank}`, cX, avY + avR * 2 + 3); // Centered (offset logic: -10 + 13 = +3)

    // Name (Priority Nickname + FitText)
    ctx.fillStyle = '#FFF';
    ctx.letterSpacing = '0px';
    const nameStr = (challengerName || challenger.username).toUpperCase();
    const nameSize = fitText(ctx, nameStr, i1.w - 40, 24);
    ctx.font = `900 ${nameSize}px sans-serif`;
    ctx.fillText(nameStr, cX, avY + avR * 2 + 55);

    // Stats
    const barW = 180;
    const barH = 6;
    const barX = cX - barW / 2;
    const barY = i1.y + i1.h - 40;

    ctx.textAlign = 'left';
    ctx.font = '900 20px sans-serif';
    ctx.fillText(`LVL ${challengerData.level}`, barX, barY - 15);

    ctx.textAlign = 'right';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`${formatStat(challengerData.xp)} XP`, barX + barW, barY - 15);

    drawRoundedRect(ctx, barX, barY, barW, barH, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fill();

    const progress = Math.min(1, Math.max(0, challengerData.percent));
    if (progress > 0) {
        const fillW = barW * progress;
        drawRoundedRect(ctx, barX, barY, fillW, barH, 3);
        ctx.fillStyle = THEME_COLOR;
        ctx.shadowColor = THEME_COLOR;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
    }


    // --- ISLAND 2: TOP ARCHIVISTS ---
    const i2 = islands[1];
    const leftX = i2.x + 30;
    const rightX = i2.x + i2.w - 30;

    drawHeader('TOP READERS', i2.x + i2.w / 2, i2.y + 45);

    // List (Divider Removed for clean look)

    // List
    const startY = i2.y + 90;
    const stepY = 40;

    for (let i = 0; i < 10; i++) {
        const user = topUsers[i];
        const y = startY + i * stepY;

        const rankColor = i === 0 ? '#FFD700' : (i === 1 ? '#C0C0C0' : (i === 2 ? '#CD7F32' : 'rgba(255,255,255,0.3)'));

        // Pill Logic for Rows
        // Pill Logic for Rows (Unified)
        if (i < 10) {
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; // Distinct row card
            if (!isCustom) ctx.fillStyle = 'rgba(255,255,255,0.03)';

            ctx.beginPath();
            ctx.roundRect(i2.x + 10, y - 22, i2.w - 20, 34, 12); // Modern Card Geometry
            ctx.fill();
            ctx.restore();
        }

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle'; // Center in pill

        // Rank
        ctx.font = '900 14px sans-serif';
        ctx.fillStyle = rankColor;
        ctx.letterSpacing = '1px';
        ctx.fillText(`#${i + 1}`, leftX, y - 4); // Optical center (y-5 + 1)

        // Name
        ctx.font = 'bold 14px sans-serif';
        ctx.fillStyle = user ? '#FFF' : 'rgba(255,255,255,0.2)';
        ctx.letterSpacing = '0px';
        const uName = user ? (user.username || user.user_id) : '---';
        const truncName = uName.length > 14 ? uName.substring(0, 13) + '..' : uName;
        ctx.fillText(truncName, leftX + 40, y - 4); // Optical center

        // XP/Level
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle'; // Center in pill
        ctx.font = '900 14px sans-serif';
        ctx.fillStyle = TEXT_COLOR;
        const val = user ? `LVL ${user.level}` : '-';

        // LVL Pill Removed for clean unified look
        if (isCustom && user) {
            // Optional: Subtle highlight could go here, but keeping it clean as requested
        }

        ctx.fillText(val, rightX - 8, y - 4); // Optical center
    }


    // --- ISLAND 3: ELITE ARCHIVISTS (PODIUM) ---
    const i3 = islands[2];
    const pX = i3.x + i3.w / 2;

    drawHeader('ELITE READERS', pX, i3.y + 45);

    // Podium Logic
    // Rank 1 Top Center, Rank 2 Left/Down, Rank 3 Right/Down
    const podiumY = i3.y + 200;

    // Helper to draw podium avatar
    const drawPodiumUser = async (user, x, y, size, rank) => {
        if (!user) return;

        ctx.save();
        if (rank === 1) {
            ctx.shadowColor = THEME_COLOR;
            ctx.shadowBlur = 30;
        } else {
            ctx.shadowColor = 'black';
            ctx.shadowBlur = 10;
        }

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.clip();

        try {
            // In a real app we'd fetch these URLs beforehand or pass resolved objects
            // For now, if we don't have avatar URLs in topUsers, we might show a placeholder
            // We'll rely on the caller resolving avatars.
            const url = user.avatarUrl || user.defaultAvatarUrl;
            if (url) {
                const img = await loadImage(url);
                ctx.drawImage(img, x - size, y - size, size * 2, size * 2);
            } else {
                ctx.fillStyle = '#222';
                ctx.fill();
            }
        } catch (e) {
            ctx.fillStyle = '#222';
            ctx.fill();
        }
        ctx.restore();

        // Border
        ctx.strokeStyle = rank === 1 ? THEME_COLOR : (rank === 2 ? '#C0C0C0' : '#CD7F32');
        ctx.lineWidth = rank === 1 ? 4 : 2;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.stroke();

        // Badge
        const bY = y + size - 10;
        drawRoundedRect(ctx, x - 20, bY, 40, 20, 10); // Fully rounded
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.letterSpacing = '0px';
        ctx.fillText(`#${rank}`, x, bY + 14);
    };

    // Draw 3, then 2, then 1 on top
    await drawPodiumUser(topUsers[2], pX + 50, podiumY + 40, 40, 3);
    await drawPodiumUser(topUsers[1], pX - 50, podiumY + 40, 40, 2);
    await drawPodiumUser(topUsers[0], pX, podiumY - 20, 50, 1);

    return await canvas.toBuffer('image/png');
};

module.exports = { generateLeaderboard };
