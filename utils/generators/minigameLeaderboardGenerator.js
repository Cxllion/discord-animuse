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

const formatPoints = (num) => {
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
    } : { r: 59, g: 130, b: 246 };
};

/**
 * Minigame Leaderboard Generator V2: Arcade aesthetics with champion spotlight.
 */
const generateMinigameLeaderboard = async (challenger, challengerStats, topPlayers, primaryColor = '#3B82F6') => {
    const SCALE = 2;
    const canvas = createCanvas(CARD_WIDTH * SCALE, CARD_HEIGHT * SCALE);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    // --- 1. TRANSPARENCY & THEME ---
    ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    const THEME_COLOR = primaryColor;
    const { r, g, b } = hexToRgb(THEME_COLOR);
    const GLASS_BG = `rgba(${Math.floor(r * 0.05)}, ${Math.floor(g * 0.05)}, ${Math.floor(b * 0.05)}, 0.9)`;
    const TEXT_COLOR = '#FFFFFF';
    const SECONDARY_TEXT = 'rgba(255, 255, 255, 0.5)';

    // --- 2. THE FLOATING ARCADE ISLAND ---
    const iX = 30, iY = 30, iW = 870, iH = 490;

    ctx.save();
    // Glass Base
    ctx.fillStyle = GLASS_BG;
    ctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.5)`;
    ctx.shadowBlur = 30;
    drawRoundedRect(ctx, iX, iY, iW, iH, 40);
    ctx.fill();

    // Dot Grid Pattern (Arcade Feel)
    ctx.save();
    ctx.clip();
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.1)`;
    for (let x = iX; x < iX + iW; x += 15) {
        for (let y = iY; y < iY + iH; y += 15) {
            ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
        }
    }
    ctx.restore();

    // Double-Line Glow Border
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.4)`;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.1)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(iX + 8, iY + 8, iW - 16, iH - 16, 34);
    ctx.stroke();
    ctx.restore();

    // --- Header Title (Left Aligned V2.8 Style) ---
    ctx.save();
    ctx.fillStyle = SECONDARY_TEXT;
    ctx.font = '900 11px monalqo, sans-serif';
    ctx.textAlign = 'left';
    ctx.letterSpacing = '3px';
    ctx.fillText('MINIGAME CHAMPIONS', iX + 40, iY + 40);
    ctx.restore();

    // --- 3. CHAMPION SPOTLIGHT (Top 3) ---
    const drawSpotlight = async (player, rank, x, baseY, size) => {
        if (!player) return;
        const color = rank === 1 ? '#FFD700' : (rank === 2 ? '#C0C0C0' : '#CD7F32');
        const avY = baseY - (rank === 1 ? 95 : 60);

        // Avatar
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, avY, size, 0, Math.PI * 2);
        ctx.clip();
        try {
            const avatarImg = await loadImage(player.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png');
            ctx.drawImage(avatarImg, x - size, avY - size, size * 2, size * 2);
        } catch (e) { ctx.fillStyle = '#111116'; ctx.fill(); }
        ctx.restore();

        // Ring
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = rank === 1 ? 5 : 3;
        if (rank === 1) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 25;
        } else {
            ctx.strokeStyle = `rgba(${hexToRgb(color).r}, ${hexToRgb(color).g}, ${hexToRgb(color).b}, 0.5)`;
        }
        ctx.beginPath(); ctx.arc(x, avY, size + 5, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();

        // Stacked Info (Badge -> Name -> Points)
        const badgeY = avY + size + 8;
        ctx.fillStyle = color;
        drawRoundedRect(ctx, x - 22, badgeY - 12, 44, 24, 12);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = '900 13px monalqo, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`#${rank}`, x, badgeY);

        const nameY = badgeY + 32;
        ctx.fillStyle = TEXT_COLOR;
        ctx.font = '900 15px monalqo, sans-serif';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText((player.username || 'PLAYER').toUpperCase(), x, nameY);
        
        ctx.fillStyle = color;
        ctx.font = '900 13px monalqo, sans-serif';
        ctx.fillText(`${formatPoints(player.total_points)} PTS`, x, nameY + 18);
    };

    const spotlightBase = iY + 185;
    await drawSpotlight(topPlayers[1], 2, iX + 220, spotlightBase, 45);
    await drawSpotlight(topPlayers[2], 3, iX + iW - 220, spotlightBase, 45);
    await drawSpotlight(topPlayers[0], 1, iX + iW / 2, spotlightBase, 60);

    // --- 4. THE RANKINGS LIST (#4-10) ---
    const listY = iY + 265;
    const maxPoints = topPlayers[0]?.total_points || 1;
    const rowH = 24;

    for (let i = 3; i < 10; i++) {
        const player = topPlayers[i];
        const y = listY + (i - 3) * (rowH + 4);
        const rowX = iX + 120;
        const rowW = iW - 240;

        // Rank
        ctx.fillStyle = SECONDARY_TEXT;
        ctx.font = '900 12px monalqo, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`#${i + 1}`, rowX, y + 5);

        // Name
        ctx.fillStyle = player ? TEXT_COLOR : 'rgba(255,255,255,0.1)';
        ctx.font = '900 12px monalqo, sans-serif';
        ctx.fillText(player ? (player.username || 'ARCHIVIST').toUpperCase() : 'EMPTY SLOT', rowX + 50, y + 5);

        // Point Bar
        const barX = rowX + 200;
        const barMaxW = rowW - 280;
        const barH = 4;
        
        drawRoundedRect(ctx, barX, y - 2, barMaxW, barH, 2);
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fill();

        if (player) {
            const barW = Math.max(4, (player.total_points / maxPoints) * barMaxW);
            drawRoundedRect(ctx, barX, y - 2, barW, barH, 2);
            ctx.fillStyle = THEME_COLOR;
            ctx.fill();
            
            // Point Count
            ctx.textAlign = 'right';
            ctx.fillStyle = THEME_COLOR;
            ctx.font = '900 12px monalqo, sans-serif';
            ctx.fillText(`${formatPoints(player.total_points)}`, rowX + rowW, y + 5);
        }
    }

    // --- 5. FOOTER (YOUR STATS) ---
    const footerY = iY + iH - 50;
    ctx.save();
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.15)`;
    drawRoundedRect(ctx, iX + 60, footerY, iW - 120, 36, 18);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = '900 11px monalqo, sans-serif';
    ctx.letterSpacing = '1px';
    ctx.fillText(`YOUR ARCHIVE STANDING: #${challengerStats.rank}`, iX + 90, footerY + 22);

    ctx.textAlign = 'right';
    ctx.fillStyle = THEME_COLOR;
    ctx.font = '900 12px monalqo, sans-serif';
    ctx.fillText(`${formatPoints(challengerStats.total_points)} TOTAL POINTS ★`, iX + iW - 90, footerY + 22);
    ctx.restore();

    return await canvas.encode('webp', { quality: 85 });
};

module.exports = { generateMinigameLeaderboard };
