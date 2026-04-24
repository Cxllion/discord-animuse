const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const { lightenColor } = require('../config/colorConfig');

const CARD_WIDTH = 500;
const CARD_HEIGHT = 600;

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
 * Minigame Leaderboard Generator V21: "Linked Archive".
 * Bridging the spatial gap with digital dot-leaders and refined horizontal tracks.
 */
const generateMinigameLeaderboard = async (challenger, topPlayers, primaryColor = '#3B82F6') => {
    const SCALE = 2;
    const canvas = createCanvas(CARD_WIDTH * SCALE, CARD_HEIGHT * SCALE);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    // --- 1. THE ARCHIVE VOID ---
    ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    const THEME_COLOR = primaryColor;
    const { r, g, b } = hexToRgb(THEME_COLOR);
    const TEXT_COLOR = '#FFFFFF';
    const SECONDARY_TEXT = 'rgba(255, 255, 255, 0.35)';

    const bgGrad = ctx.createRadialGradient(CARD_WIDTH/2, CARD_HEIGHT/2, 50, CARD_WIDTH/2, CARD_HEIGHT/2, 400);
    bgGrad.addColorStop(0, `rgba(${Math.floor(r * 0.1)}, ${Math.floor(g * 0.1)}, ${Math.floor(b * 0.15)}, 1)`);
    bgGrad.addColorStop(1, '#050508');
    
    ctx.fillStyle = bgGrad;
    drawRoundedRect(ctx, 15, 15, 470, 570, 24);
    ctx.fill();

    // Neural Mesh
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.12)`;
    for (let x = 30; x < 470; x += 20) {
        for (let y = 30; y < 570; y += 20) {
            ctx.beginPath(); ctx.arc(x, y, 0.5, 0, Math.PI * 2); ctx.fill();
        }
    }

    // Header
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = THEME_COLOR;
    ctx.font = '900 11px monalqo, sans-serif';
    ctx.letterSpacing = '6px';
    ctx.fillText('LIBRARY_ARCADIAN // HIGH_SCORES', 45, 55);
    ctx.fillStyle = SECONDARY_TEXT;
    ctx.font = '900 8px monalqo, sans-serif';
    ctx.letterSpacing = '1px';
    ctx.fillText(`SESSION_LOADED: ${new Date().getFullYear()}.${(new Date().getMonth() + 1).toString().padStart(2, '0')}`, 45, 68);
    ctx.restore();

    // --- 3. THE ARCHIVIST THRONES ---
    const drawThrone = async (player, rank, x, baseY, size) => {
        if (!player) return;
        const color = rank === 1 ? '#FFD700' : (rank === 2 ? '#E5E7EB' : '#D97706');
        const avY = baseY - (rank === 1 ? 65 : 40);

        const drawHex = (hx, hy, hr) => {
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (i * 60 - 90) * Math.PI / 180;
                ctx.lineTo(hx + hr * Math.cos(angle), hy + hr * Math.sin(angle));
            }
            ctx.closePath();
        };

        ctx.save();
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
        ctx.lineWidth = 1;
        drawHex(x, avY, size + 10); ctx.stroke();
        ctx.shadowColor = color; ctx.shadowBlur = rank === 1 ? 25 : 12;
        ctx.strokeStyle = color; ctx.lineWidth = rank === 1 ? 3 : 2;
        drawHex(x, avY, size + 4); ctx.stroke();
        ctx.restore();

        ctx.save();
        drawHex(x, avY, size); ctx.clip();
        try {
            const avatarImg = await loadImage(player.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png');
            ctx.drawImage(avatarImg, x - size, avY - size, size * 2, size * 2);
        } catch (e) { ctx.fillStyle = '#0a0a0f'; ctx.fill(); }
        ctx.restore();

        const insigniaY = avY + size + 6;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, insigniaY, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000';
        ctx.font = '900 12px monalqo, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${rank}`, x, insigniaY);

        const nameY = insigniaY + 26;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = TEXT_COLOR;
        ctx.font = '900 12px monalqo, sans-serif';
        ctx.fillText((player.username || 'ANONYMOUS').toUpperCase(), x, nameY);
        ctx.fillStyle = color;
        ctx.font = '900 11px monalqo, sans-serif';
        ctx.fillText(`${formatPoints(player.total_points)} PTS`, x, nameY + 14);
    };

    const podiumBase = 185;
    await drawThrone(topPlayers[1], 2, 115, podiumBase, 34);
    await drawThrone(topPlayers[2], 3, 385, podiumBase, 34);
    await drawThrone(topPlayers[0], 1, 250, podiumBase, 50);

    // --- 4. THE LINKED ARCHIVE (Ranking List) ---
    const listY = 285;
    const rowH = 24;

    for (let i = 3; i < 10; i++) {
        const player = topPlayers[i];
        const y = listY + (i - 3) * (rowH + 12);
        const rX = 40, rW = 420;

        ctx.fillStyle = i % 2 === 0 ? `rgba(${r}, ${g}, ${b}, 0.12)` : 'rgba(255,255,255,0.03)';
        drawRoundedRect(ctx, rX, y - 12, rW, rowH, 4); ctx.fill();
        
        // PFP
        if (player) {
            const miniSize = 10; const miniX = rX + 45;
            ctx.save();
            ctx.beginPath(); ctx.arc(miniX, y, miniSize, 0, Math.PI * 2); ctx.clip();
            try {
                const mImg = await loadImage(player.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png');
                ctx.drawImage(mImg, miniX - miniSize, y - miniSize, miniSize * 2, miniSize * 2);
            } catch (e) { ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill(); }
            ctx.restore();
            ctx.strokeStyle = THEME_COLOR; ctx.lineWidth = 1; ctx.stroke();
        }

        // Rank & Name
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = SECONDARY_TEXT;
        ctx.font = '900 10px monalqo, sans-serif';
        ctx.fillText(`#${i + 1}`, rX + 10, y);

        const username = player ? (player.username || 'USER').toUpperCase() : 'NO_RECORDS';
        ctx.fillStyle = player ? TEXT_COLOR : 'rgba(255,255,255,0.1)';
        ctx.font = '900 11px monalqo, sans-serif';
        ctx.fillText(username, rX + 65, y);

        // V21: Digital Dot-Leaders (Bridging the gap)
        if (player) {
            const nameWidth = ctx.measureText(username).width;
            const startX = rX + 65 + nameWidth + 15;
            const endX = rX + rW - 55;
            
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.15)`;
            for (let dotX = startX; dotX < endX; dotX += 8) {
                ctx.beginPath(); ctx.arc(dotX, y, 1, 0, Math.PI * 2); ctx.fill();
            }

            // Score
            ctx.textAlign = 'right';
            ctx.fillStyle = THEME_COLOR;
            ctx.font = '900 14px monalqo, sans-serif';
            ctx.fillText(`${formatPoints(player.total_points)}`, rX + rW - 12, y);
        }
    }

    // --- 5. THE TERMINAL HUD ---
    const footerY = 540;
    const fX = 40, fW = 420, fH = 34;

    ctx.save();
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
    ctx.strokeStyle = THEME_COLOR;
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 15;
    drawRoundedRect(ctx, fX, footerY, fW, fH, 4); ctx.fill(); ctx.stroke();

    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(fX, footerY + 10); ctx.lineTo(fX, footerY); ctx.lineTo(fX + 10, footerY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fX + fW, footerY + fH - 10); ctx.lineTo(fX + fW, footerY + fH); ctx.lineTo(fX + fW - 10, footerY + fH); ctx.stroke();

    const cY = footerY + fH/2;
    const cSize = 11; const cX = fX + 22;
    ctx.save();
    ctx.beginPath(); ctx.arc(cX, cY, cSize, 0, Math.PI * 2); ctx.clip();
    try {
        const cImg = await loadImage(challenger.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png');
        ctx.drawImage(cImg, cX - cSize, cY - cSize, cSize * 2, cSize * 2);
    } catch (e) { ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = THEME_COLOR; ctx.lineWidth = 1; ctx.stroke();

    ctx.textAlign = 'left'; ctx.fillStyle = TEXT_COLOR;
    ctx.font = '900 12px monalqo, sans-serif';
    ctx.fillText((challenger.username || 'ANONYMOUS').toUpperCase(), fX + 42, cY);

    ctx.textAlign = 'right'; ctx.fillStyle = THEME_COLOR;
    ctx.font = '900 14px monalqo, sans-serif';
    ctx.fillText(`${formatPoints(challenger.stats.total_points)} PTS`, fX + fW - 12, cY);
    ctx.restore();

    return await canvas.encode('webp', { quality: 85 });
};

module.exports = { generateMinigameLeaderboard };
