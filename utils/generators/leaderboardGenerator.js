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
        ctx.font = `900 ${fontSize}px monalqo, sans-serif`;
        const spacing = fontSize > 70 ? 0.4 : 0.8;
        ctx.letterSpacing = `${spacing}px`;

        while (ctx.measureText(text).width > maxWidth && fontSize > 10) {
            fontSize -= 1;
            ctx.font = `900 ${fontSize}px monalqo, sans-serif`;
            ctx.letterSpacing = `${fontSize > 70 ? 0.4 : 0.8}px`;
        }
        return fontSize;
    };


    // --- 1. TRANSPARENCY & BASE ---
    ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    const THEME_COLOR = primaryColor;
    const { r, g, b } = hexToRgb(THEME_COLOR);
    const GLASS_BG = `rgba(${Math.floor(r * 0.1)}, ${Math.floor(g * 0.1)}, ${Math.floor(b * 0.1)}, 0.85)`;
    const TEXT_COLOR = '#FFFFFF';
    const SECONDARY_TEXT = 'rgba(255, 255, 255, 0.6)';

    // --- 2. ISLAND LAYOUT (V2: 2 Islands) ---
    const islands = [
        { x: 30, y: 30, w: 260, h: 490, title: 'USER ARCHIVE' }, // Left: User Stats
        { x: 310, y: 30, w: 590, h: 490, title: 'GRAND ARCHIVE RANKINGS' } // Right: Podium + List
    ];

    islands.forEach(is => {
        ctx.save();
        ctx.fillStyle = GLASS_BG;
        ctx.shadowColor = `rgba(${r},${g},${b},0.4)`;
        ctx.shadowBlur = 25;
        
        drawRoundedRect(ctx, is.x, is.y, is.w, is.h, 32); 
        ctx.fill();

        // Accent Gradient Bar (Top)
        const grad = ctx.createLinearGradient(is.x, is.y, is.x + is.w, is.y);
        grad.addColorStop(0, THEME_COLOR);
        grad.addColorStop(1, `rgba(${r},${g},${b}, 0.3)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(is.x + 20, is.y + 10, is.w - 40, 4, 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(${r},${g},${b},0.3)`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // V2.8.1: Balanced Alignment
        ctx.save();
        ctx.fillStyle = SECONDARY_TEXT;
        ctx.font = '900 11px monalqo, sans-serif';
        ctx.letterSpacing = '3px';
        
        if (is.title === 'USER ARCHIVE') {
            ctx.textAlign = 'center';
            ctx.fillText(is.title, is.x + is.w / 2, is.y + 35);
        } else {
            ctx.textAlign = 'left';
            ctx.fillText(is.title, is.x + 35, is.y + 35);
        }
        ctx.restore();
    });

    // --- 3. ISLAND 1: USER STANDING ---
    const i1 = islands[0];
    const cX = i1.x + i1.w / 2;

    // Avatar
    const avY = i1.y + 70;
    const avR = 65;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cX, avY + avR, avR, 0, Math.PI * 2);
    ctx.clip();
    try {
        const url = challengerAvatarUrl || challenger.displayAvatarURL({ extension: 'png', size: 512 });
        const img = await loadImage(url);
        ctx.drawImage(img, cX - avR, avY, avR * 2, avR * 2);
    } catch (e) {
        ctx.fillStyle = '#18181B'; ctx.fill();
    }
    ctx.restore();

    // Avatar Glow Ring
    ctx.strokeStyle = THEME_COLOR;
    ctx.lineWidth = 4;
    ctx.shadowColor = THEME_COLOR;
    ctx.shadowBlur = 15;
    ctx.beginPath(); ctx.arc(cX, avY + avR, avR + 5, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;

    // Rank Badge
    ctx.save();
    const rankTxt = `#${challengerData.rank}`;
    ctx.font = '900 22px monalqo, sans-serif';
    const rW = ctx.measureText(rankTxt).width + 30;
    ctx.fillStyle = THEME_COLOR;
    drawRoundedRect(ctx, cX - rW / 2, avY + avR * 2 - 15, rW, 40, 20);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rankTxt, cX, avY + avR * 2 + 6);
    ctx.restore();

    // Name
    ctx.fillStyle = TEXT_COLOR;
    const nameStr = (challengerName || challenger.username).toUpperCase();
    const nameSize = fitText(ctx, nameStr, i1.w - 40, 22);
    ctx.font = `900 ${nameSize}px monalqo, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(nameStr, cX, i1.y + 320);

    // Stat Breakdown (Centered for Balance)
    const statsY = i1.y + 360;
    const drawStat = (label, value, y) => {
        ctx.textAlign = 'center';
        ctx.fillStyle = SECONDARY_TEXT;
        ctx.font = '900 11px monalqo, sans-serif';
        ctx.letterSpacing = '2px';
        ctx.fillText(label, cX, y);
        
        ctx.fillStyle = THEME_COLOR;
        ctx.font = '900 18px monalqo, sans-serif';
        ctx.letterSpacing = '0px';
        ctx.fillText(value, cX, y + 20);
    };

    drawStat('LEVEL', challengerData.level, statsY);
    drawStat('TOTAL XP', formatStat(challengerData.xp), statsY + 45);

    // Progress Bar
    const barW = i1.w - 80;
    const barX = i1.x + 40;
    const barY = statsY + 85;
    drawRoundedRect(ctx, barX, barY, barW, 6, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fill();

    const progress = Math.min(1, Math.max(0, challengerData.percent));
    if (progress > 0) {
        drawRoundedRect(ctx, barX, barY, barW * progress, 6, 3);
        ctx.fillStyle = THEME_COLOR;
        ctx.shadowColor = THEME_COLOR;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    // --- 4. ISLAND 2: RANKINGS ---
    const i2 = islands[1];
    
    // --- PODIUM SECTION (V2.7: Maximum Space Utilization) ---
    const drawPodium = async (user, rank, x, baseY, size) => {
        const color = rank === 1 ? '#FFD700' : (rank === 2 ? '#C0C0C0' : '#CD7F32');
        const avX = x;
        const avY = baseY - (rank === 1 ? 70 : 40); 

        // Avatar
        ctx.save();
        ctx.beginPath();
        ctx.arc(avX, avY, size, 0, Math.PI * 2);
        ctx.clip();
        try {
            if (user && (user.avatarUrl || user.avatar)) {
                const img = await loadImage(user.avatarUrl || user.avatar);
                ctx.drawImage(img, avX - size, avY - size, size * 2, size * 2);
            } else {
                ctx.fillStyle = '#0f0f14';
                ctx.fillRect(avX - size, avY - size, size * 2, size * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.02)';
                ctx.font = '900 26px monalqo, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('?', avX, avY);
            }
        } catch (e) { ctx.fillStyle = '#18181B'; ctx.fill(); }
        ctx.restore();

        // Ring & Shine
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = rank === 1 ? 5 : 3;
        if (rank === 1) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 25;
        } else {
            ctx.strokeStyle = `rgba(${hexToRgb(color).r}, ${hexToRgb(color).g}, ${hexToRgb(color).b}, 0.5)`;
        }
        ctx.beginPath(); ctx.arc(avX, avY, size + 5, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();

        // Stacked Info (Badge -> Name -> Level)
        const badgeY = avY + size + 10;
        ctx.fillStyle = color;
        drawRoundedRect(ctx, x - 20, badgeY - 12, 40, 24, 12);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = '900 13px monalqo, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`#${rank}`, x, badgeY);

        const nameY = badgeY + 30;
        ctx.fillStyle = user ? TEXT_COLOR : 'rgba(255,255,255,0.1)';
        ctx.font = '900 14px monalqo, sans-serif';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText((user ? (user.username || 'Archivist') : 'VACANT').toUpperCase(), x, nameY);
        
        if (user) {
            ctx.fillStyle = color;
            ctx.font = '900 12px monalqo, sans-serif';
            ctx.fillText(`LEVEL ${user.level}`, x, nameY + 18);
        }
    };

    const pBaseline = i2.y + 175; 
    const pStep = i2.w / 4;
    await drawPodium(topUsers[1], 2, i2.x + pStep, pBaseline, 44); // Left
    await drawPodium(topUsers[2], 3, i2.x + i2.w - pStep, pBaseline, 44); // Right
    await drawPodium(topUsers[0], 1, i2.x + i2.w / 2, pBaseline, 56); // Center (Top)

    // --- LIST SECTION (Ranks 4-10) ---
    const listStartY = i2.y + 265;
    const rowH = 32;

    for (let i = 3; i < 10; i++) {
        const user = topUsers[i];
        const y = listStartY + (i - 3) * (rowH + 2);
        const rowX = i2.x + 40;
        const rowW = i2.w - 80;

        // Row Backdrop
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent';
        drawRoundedRect(ctx, rowX - 10, y - 15, rowW + 20, rowH, 10);
        ctx.fill();

        // Rank
        ctx.textAlign = 'left';
        ctx.fillStyle = SECONDARY_TEXT;
        ctx.font = '900 12px monalqo, sans-serif';
        ctx.fillText(`#${i + 1}`, rowX, y + 5);

        // Avatar
        ctx.save();
        ctx.beginPath();
        ctx.arc(rowX + 40, y, 10, 0, Math.PI * 2);
        ctx.clip();
        try {
            if (user && user.avatarUrl) {
                const img = await loadImage(user.avatarUrl);
                ctx.drawImage(img, rowX + 30, y - 10, 20, 20);
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
            }
        } catch (e) {}
        ctx.restore();

        // Name
        ctx.fillStyle = user ? TEXT_COLOR : 'rgba(255,255,255,0.1)';
        ctx.font = '900 13px monalqo, sans-serif';
        ctx.fillText(user ? (user.username || 'Archivist').toUpperCase() : 'VACANT SLOT', rowX + 65, y + 5);

        // Level
        if (user) {
            ctx.textAlign = 'right';
            ctx.fillStyle = THEME_COLOR;
            ctx.font = '900 13px monalqo, sans-serif';
            ctx.fillText(`LVL ${user.level}`, rowX + rowW, y + 5);
        }
    }

    return await canvas.encode('webp', { quality: 85 });
};

module.exports = { generateLeaderboard };
