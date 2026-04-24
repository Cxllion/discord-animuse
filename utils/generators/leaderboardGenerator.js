const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const { lightenColor } = require('../config/colorConfig');

const CARD_WIDTH = 800;
const CARD_HEIGHT = 480;

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


    // --- 1. TRANSPARENCY & THEME ---
    ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    const THEME_COLOR = primaryColor;
    const { r, g, b } = hexToRgb(THEME_COLOR);
    const TEXT_COLOR = '#FFFFFF';
    const SECONDARY_TEXT = 'rgba(255, 255, 255, 0.4)';

    // Subtle Dust Motes (Restricted to visible layer best effort)
    for (let i = 0; i < 25; i++) {
        const sX = Math.random() * CARD_WIDTH;
        const sY = Math.random() * CARD_HEIGHT;
        const sR = Math.random() * 1.5;
        ctx.fillStyle = `rgba(255, 230, 200, ${Math.random() * 0.15})`;
        ctx.beginPath(); ctx.arc(sX, sY, sR, 0, Math.PI * 2); ctx.fill();
    }

    // --- 2. ISLAND LAYOUT (V5: Compact Archive) ---
    const islands = [
        { x: 20, y: 20, w: 230, h: 440, title: 'USER ARCHIVE' },
        { x: 265, y: 20, w: 515, h: 440, title: 'GRAND ARCHIVE RANKINGS' }
    ];

    const GOLD_LEAF = ctx.createLinearGradient(0, 0, 100, 100);
    GOLD_LEAF.addColorStop(0, '#D4AF37'); // Classic Gold
    GOLD_LEAF.addColorStop(0.3, '#F9F4AD'); // Light Shine
    GOLD_LEAF.addColorStop(0.6, '#D4AF37');
    GOLD_LEAF.addColorStop(1, '#996515'); // Dark Bronze

    islands.forEach(is => {
        ctx.save();
        
        // V3.6: Dynamic Island Gradient (The Luminous Tome)
        const islandGrad = ctx.createLinearGradient(is.x, is.y, is.x + is.w, is.y + is.h);
        islandGrad.addColorStop(0, `rgba(${Math.floor(r * 0.12)}, ${Math.floor(g * 0.12)}, ${Math.floor(b * 0.12)}, 0.97)`); 
        islandGrad.addColorStop(1, `rgba(${Math.floor(r * 0.04)}, ${Math.floor(g * 0.04)}, ${Math.floor(b * 0.04)}, 0.98)`);
        
        ctx.fillStyle = islandGrad;
        ctx.shadowColor = `rgba(0,0,0,0.9)`;
        ctx.shadowBlur = 45;
        
        drawRoundedRect(ctx, is.x, is.y, is.w, is.h, 32); 
        ctx.fill();

        // V3.6: Diagonal Glass Sheen
        ctx.save();
        ctx.clip();
        const sheen = ctx.createLinearGradient(is.x, is.y, is.x + is.w, is.y + is.h);
        sheen.addColorStop(0, `rgba(255, 255, 255, 0.05)`);
        sheen.addColorStop(0.2, 'transparent');
        sheen.addColorStop(0.8, 'transparent');
        sheen.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.05)`);
        ctx.fillStyle = sheen;
        ctx.fillRect(is.x, is.y, is.w, is.h);
        ctx.restore();

        // Parchment Texture
        ctx.save();
        ctx.clip();
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillStyle = `rgba(255, 230, 180, 0.02)`;
        for (let j = 0; j < 1000; j++) {
            const px = is.x + Math.random() * is.w;
            const py = is.y + Math.random() * is.h;
            ctx.fillRect(px, py, 1.5, 1.5);
        }
        ctx.restore();

        // V3.8: Inner Edge Glow (Subtle Inset Border)
        ctx.save();
        drawRoundedRect(ctx, is.x, is.y, is.w, is.h, 32);
        ctx.clip();
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.15)`;
        ctx.lineWidth = 1.5;
        drawRoundedRect(ctx, is.x + 1, is.y + 1, is.w - 2, is.h - 2, 31);
        ctx.stroke();
        ctx.restore();

        // V3.8: Inner Vignette (Depth)
        ctx.save();
        drawRoundedRect(ctx, is.x, is.y, is.w, is.h, 32);
        ctx.clip();
        const vigGrad = ctx.createRadialGradient(
            is.x + is.w / 2, is.y + is.h / 2, is.w * 0.2,
            is.x + is.w / 2, is.y + is.h / 2, is.w * 0.7
        );
        vigGrad.addColorStop(0, 'transparent');
        vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
        ctx.fillStyle = vigGrad;
        ctx.fillRect(is.x, is.y, is.w, is.h);
        ctx.restore();

        // V3.7: Luminous Header Binding (Theme-Colored)
        const headGrad = ctx.createLinearGradient(is.x + 40, is.y, is.x + is.w - 40, is.y);
        headGrad.addColorStop(0, 'transparent');
        headGrad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.5)`);
        headGrad.addColorStop(1, 'transparent');
        
        ctx.fillStyle = headGrad;
        ctx.shadowColor = THEME_COLOR;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.roundRect(is.x + 40, is.y + 8, is.w - 80, 2, 1);
        ctx.fill();
        ctx.shadowBlur = 0;

        // V3.8: Bottom Luminous Binding (Mirror)
        const footGrad = ctx.createLinearGradient(is.x + 40, is.y + is.h, is.x + is.w - 40, is.y + is.h);
        footGrad.addColorStop(0, 'transparent');
        footGrad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.3)`);
        footGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = footGrad;
        ctx.shadowColor = THEME_COLOR;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.roundRect(is.x + 40, is.y + is.h - 10, is.w - 80, 2, 1);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Subtle Header Spotlight
        const spotGrad = ctx.createRadialGradient(is.x + is.w / 2, is.y + 20, 0, is.x + is.w / 2, is.y + 20, 60);
        spotGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.1)`);
        spotGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = spotGrad;
        ctx.fillRect(is.x, is.y, is.w, 80);

        ctx.strokeStyle = `rgba(255, 255, 255, 0.05)`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();

        // V3.0: Elegant Alignment
        ctx.save();
        ctx.fillStyle = `rgba(255, 230, 180, 0.4)`; // Antique White
        ctx.font = '900 11px monalqo, sans-serif';
        ctx.letterSpacing = '3px';
        
        if (is.title === 'USER ARCHIVE') {
            ctx.textAlign = 'center';
            ctx.fillText(is.title, is.x + is.w / 2, is.y + 35);
        } else {
            ctx.textAlign = 'left';
            ctx.fillText(is.title, is.x + 40, is.y + 35);
        }
        ctx.restore();
    });

    // --- 3. ISLAND 1: USER STANDING ---
    const i1 = islands[0];
    const cX = i1.x + i1.w / 2;

    // Avatar
    const avRadius = 65;
    const avX = cX;
    const avY = i1.y + 110;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avX, avY, avRadius, 0, Math.PI * 2);
    ctx.clip();
    try {
        const avatarImg = await loadImage(challengerAvatarUrl || challenger.displayAvatarURL({ extension: 'png', size: 256 }));
        ctx.drawImage(avatarImg, avX - avRadius, avY - avRadius, avRadius * 2, avRadius * 2);
    } catch (e) {
        ctx.fillStyle = '#111116';
        ctx.fill();
    }
    ctx.restore();

    // Rank Badge
    const badgeY = i1.y + 175;
    ctx.save();
    ctx.fillStyle = THEME_COLOR;
    ctx.shadowColor = THEME_COLOR;
    ctx.shadowBlur = 15;
    drawRoundedRect(ctx, avX - 35, badgeY + 15, 70, 30, 15);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#000';
    ctx.font = '900 16px monalqo, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`#${challengerData.rank}`, avX, badgeY + 36);
    ctx.restore();

    // Name
    ctx.fillStyle = TEXT_COLOR;
    const nameStr = (challengerName || challenger.username).toUpperCase();
    const nameSize = fitText(ctx, nameStr, i1.w - 40, 22);
    ctx.font = `900 ${nameSize}px monalqo, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(nameStr, cX, i1.y + 280);

    // --- V5: REFINED VERTICAL RHYTHM ---
    const statsY = i1.y + 315;
    
    // Level Hero Capsule (Centered)
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255, 230, 180, 0.5)`;
    ctx.font = '900 11px monalqo, sans-serif';
    ctx.letterSpacing = '3px';
    ctx.fillText('CURRENT LEVEL', cX, statsY);

    const levelStr = String(challengerData.level);
    ctx.font = '900 32px monalqo, sans-serif';
    const lW = Math.max(80, ctx.measureText(levelStr).width + 40);
    
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
    ctx.strokeStyle = THEME_COLOR;
    ctx.lineWidth = 2;
    ctx.shadowColor = THEME_COLOR;
    ctx.shadowBlur = 10;
    drawRoundedRect(ctx, cX - lW / 2, statsY + 12, lW, 45, 12);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(levelStr, cX, statsY + 46);
    ctx.restore();

    // Progress Section
    const barW = i1.w - 60;
    const barX = i1.x + 30;
    const barY = i1.y + i1.h - 40;
    const barH = 10;

    // Labels (Top Left: EXP, Top Right: X/X)
    ctx.save();
    ctx.font = '900 10px monalqo, sans-serif';
    ctx.letterSpacing = '1px';
    
    ctx.textAlign = 'left';
    ctx.fillStyle = `rgba(255, 230, 180, 0.4)`;
    ctx.fillText('EXP', barX, barY - 12);

    ctx.textAlign = 'right';
    ctx.fillStyle = THEME_COLOR;
    const progressTxt = `${formatStat(challengerData.current || 0)} / ${formatStat(challengerData.required || 100)}`;
    ctx.fillText(progressTxt, barX + barW, barY - 12);
    ctx.restore();

    // Bar Base (Glass)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    drawRoundedRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const progress = Math.min(1, Math.max(0, challengerData.percent / 100));
    if (progress > 0) {
        ctx.save();
        const pGrad = ctx.createLinearGradient(barX, barY, barX + barW, barY);
        pGrad.addColorStop(0, THEME_COLOR);
        pGrad.addColorStop(1, lightenColor(THEME_COLOR, 20));
        
        ctx.fillStyle = pGrad;
        ctx.shadowColor = THEME_COLOR;
        ctx.shadowBlur = 10;
        drawRoundedRect(ctx, barX, barY, barW * progress, barH, barH / 2);
        ctx.fill();
        
        // Inner Shine
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        drawRoundedRect(ctx, barX, barY + 2, barW * progress, 2, 1);
        ctx.fill();
        ctx.restore();
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

    const pBaseline = i2.y + 160; 
    const pStep = i2.w / 4.2;

    // V3.8: Crown Glow behind #1
    ctx.save();
    const crownGlow = ctx.createRadialGradient(
        i2.x + i2.w / 2, pBaseline - 60, 0,
        i2.x + i2.w / 2, pBaseline - 60, 80
    );
    crownGlow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.1)`);
    crownGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = crownGlow;
    ctx.fillRect(i2.x + i2.w / 2 - 100, pBaseline - 140, 200, 200);
    ctx.restore();

    await drawPodium(topUsers[1], 2, i2.x + pStep, pBaseline, 30); // Left
    await drawPodium(topUsers[2], 3, i2.x + i2.w - pStep, pBaseline, 30); // Right
    await drawPodium(topUsers[0], 1, i2.x + i2.w / 2, pBaseline, 40); // Center (Top)

    // --- LIST SECTION (Ranks 4-10) ---
    const listStartY = i2.y + 225;
    const rowH = 28;

    for (let i = 3; i < 10; i++) {
        const user = topUsers[i];
        const y = listStartY + (i - 3) * (rowH + 2);
        const rowX = i2.x + 30;
        const rowW = i2.w - 60;

        // V3.8: Enhanced Row Backdrop
        ctx.fillStyle = i % 2 === 0 ? `rgba(${r}, ${g}, ${b}, 0.04)` : 'rgba(255,255,255,0.015)';
        drawRoundedRect(ctx, rowX - 10, y - 15, rowW + 20, rowH, 10);
        ctx.fill();

        // V3.8: Row Separator Line
        if (i < 9) {
            const sepGrad = ctx.createLinearGradient(rowX, y + 15, rowX + rowW, y + 15);
            sepGrad.addColorStop(0, 'transparent');
            sepGrad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, 0.08)`);
            sepGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = sepGrad;
            ctx.fillRect(rowX, y + 15, rowW, 1);
        }

        // Rank
        ctx.textAlign = 'left';
        ctx.fillStyle = SECONDARY_TEXT;
        ctx.font = '900 12px monalqo, sans-serif';
        ctx.fillText(`#${i + 1}`, rowX, y + 5);

        // Avatar
        ctx.save();
        ctx.beginPath();
        ctx.arc(rowX + 35, y, 8, 0, Math.PI * 2);
        ctx.clip();
        try {
            if (user && user.avatarUrl) {
                const img = await loadImage(user.avatarUrl);
                ctx.drawImage(img, rowX + 27, y - 8, 16, 16);
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
            }
        } catch (e) {}
        ctx.restore();

        // Name
        ctx.fillStyle = user ? TEXT_COLOR : 'rgba(255,255,255,0.1)';
        ctx.font = '900 13px monalqo, sans-serif';
        ctx.fillText(user ? (user.username || 'Archivist').toUpperCase() : 'VACANT SLOT', rowX + 55, y + 5);

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
