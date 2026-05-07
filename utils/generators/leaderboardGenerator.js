const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const { lightenColor } = require('../config/colorConfig');
const { secureLoadImage } = require('../core/visualUtils');

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

    // --- 0. PRE-LOAD ALL IMAGES IN PARALLEL ---
    const imageMap = new Map();
    const urlsToLoad = [];
    
    const avatarUrl = Array.isArray(challengerAvatarUrl) ? challengerAvatarUrl[0] : challengerAvatarUrl;
    if (avatarUrl) urlsToLoad.push(avatarUrl);
    if (backgroundUrl) urlsToLoad.push(backgroundUrl);
    
    topUsers.forEach(u => {
        const uUrl = Array.isArray(u.avatarUrl || u.avatar) ? (u.avatarUrl || u.avatar)[0] : (u.avatarUrl || u.avatar);
        if (uUrl) urlsToLoad.push(uUrl);
    });

    const uniqueUrls = [...new Set(urlsToLoad.filter(u => u && typeof u === 'string'))];
    const loadedImages = await Promise.all(uniqueUrls.map(async url => {
        try {
            const img = await secureLoadImage(url);
            return { url, img };
        } catch (e) {
            return { url, img: null };
        }
    }));

    loadedImages.forEach(({ url, img }) => {
        if (img) imageMap.set(url, img);
    });

    const getImg = (url) => {
        if (Array.isArray(url)) {
            for (const u of url) {
                if (imageMap.has(u)) return imageMap.get(u);
            }
            return null;
        }
        return imageMap.get(url) || null;
    };

    // --- 1. TRANSPARENCY & THEME ---
    ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    const THEME_COLOR = primaryColor;
    const { r, g, b } = hexToRgb(THEME_COLOR);
    const TEXT_COLOR = '#FFFFFF';
    const SECONDARY_TEXT = 'rgba(255, 255, 255, 0.4)';

    // Background Image
    const bgImg = getImg(backgroundUrl);
    if (bgImg) {
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.drawImage(bgImg, 0, 0, CARD_WIDTH, CARD_HEIGHT);
        ctx.restore();
    }

    // Subtle Dust Motes
    for (let i = 0; i < 25; i++) {
        const sX = Math.random() * CARD_WIDTH;
        const sY = Math.random() * CARD_HEIGHT;
        const sR = Math.random() * 1.5;
        ctx.fillStyle = `rgba(255, 230, 200, ${Math.random() * 0.15})`;
        ctx.beginPath(); ctx.arc(sX, sY, sR, 0, Math.PI * 2); ctx.fill();
    }

    // --- 2. ISLAND LAYOUT ---
    const islands = [
        { x: 20, y: 20, w: 230, h: 440, title: 'USER ARCHIVE' },
        { x: 265, y: 20, w: 515, h: 440, title: 'GRAND ARCHIVE RANKINGS' }
    ];

    islands.forEach(is => {
        ctx.save();
        const islandGrad = ctx.createLinearGradient(is.x, is.y, is.x + is.w, is.y + is.h);
        islandGrad.addColorStop(0, `rgba(${Math.floor(r * 0.12)}, ${Math.floor(g * 0.12)}, ${Math.floor(b * 0.12)}, 0.97)`); 
        islandGrad.addColorStop(1, `rgba(${Math.floor(r * 0.04)}, ${Math.floor(g * 0.04)}, ${Math.floor(b * 0.04)}, 0.98)`);
        
        ctx.fillStyle = islandGrad;
        ctx.shadowColor = `rgba(0,0,0,0.9)`;
        ctx.shadowBlur = 45;
        
        drawRoundedRect(ctx, is.x, is.y, is.w, is.h, 32); 
        ctx.fill();

        ctx.save();
        ctx.clip();
        const sheen = ctx.createLinearGradient(is.x, is.y, is.x + is.w, is.y + is.h);
        sheen.addColorStop(0, `rgba(255, 255, 255, 0.05)`);
        sheen.addColorStop(0.2, 'transparent');
        sheen.addColorStop(1, 'transparent');
        ctx.fillStyle = sheen;
        ctx.fillRect(is.x, is.y, is.w, is.h);
        ctx.restore();

        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.2)`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    });

    // --- 3. ISLAND 1: CHALLENGER DATA ---
    const i1 = islands[0];
    const cX = i1.x + i1.w / 2;

    // A. Rank Badge (Top)
    const badgeY = i1.y + 45;
    ctx.save();
    ctx.shadowColor = THEME_COLOR;
    ctx.shadowBlur = 20;
    ctx.fillStyle = THEME_COLOR;
    drawRoundedRect(ctx, cX - 40, badgeY - 20, 80, 40, 20);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#000';
    ctx.font = '900 18px monalqo, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`#${challengerData.rank}`, cX, badgeY);
    ctx.restore();

    // B. Avatar
    const avSize = 55;
    const avY = badgeY + 75;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cX, avY, avSize, 0, Math.PI * 2);
    ctx.clip();
    const cImg = getImg(challengerAvatarUrl);
    if (cImg) {
        ctx.drawImage(cImg, cX - avSize, avY - avSize, avSize * 2, avSize * 2);
    } else {
        ctx.fillStyle = '#0a0a0f';
        ctx.fill();
    }
    ctx.restore();

    // Outer Ring for Avatar
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.3)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cX, avY, avSize + 5, 0, Math.PI * 2);
    ctx.stroke();

    // C. Name & Title
    const nameY = avY + avSize + 35;
    ctx.textAlign = 'center';
    const finalName = (challengerName || challenger.username).toUpperCase();
    const nameFSize = fitText(ctx, finalName, i1.w - 40, 26);
    ctx.fillStyle = TEXT_COLOR;
    ctx.font = `900 ${nameFSize}px monalqo, sans-serif`;
    ctx.fillText(finalName, cX, nameY);

    ctx.font = '900 11px monalqo, sans-serif';
    ctx.letterSpacing = '3px';
    ctx.fillStyle = THEME_COLOR;
    ctx.fillText((challengerData.title || 'ARCHIVIST').toUpperCase(), cX, nameY + 22);

    // D. Level Hero Section
    const heroY = nameY + 70;
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(255, 230, 180, 0.4)`;
    ctx.font = '900 10px monalqo, sans-serif';
    ctx.letterSpacing = '2px';
    ctx.fillText('CURRENT LEVEL', cX, heroY);

    const levelPillW = 110;
    const levelPillH = 50;
    ctx.save();
    ctx.shadowColor = THEME_COLOR;
    ctx.shadowBlur = 15;
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.15)`;
    ctx.strokeStyle = THEME_COLOR;
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, cX - levelPillW / 2, heroY + 12, levelPillW, levelPillH, 15);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = TEXT_COLOR;
    ctx.font = '900 28px monalqo, sans-serif';
    ctx.fillText(challengerData.level, cX, heroY + 48);
    ctx.restore();

    // E. Progress Section (Bottom)
    const barW = i1.w - 60;
    const barX = i1.x + 30;
    const barY = i1.y + i1.h - 40;
    const barH = 10;

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

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    drawRoundedRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fill();

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
        ctx.restore();
    }

    // --- 4. ISLAND 2: RANKINGS ---
    const i2 = islands[1];
    
    const drawPodium = async (user, rank, x, baseY, size) => {
        const color = rank === 1 ? '#FFD700' : (rank === 2 ? '#C0C0C0' : '#CD7F32');
        const avX = x;
        const avY = baseY - (rank === 1 ? 70 : 40); 

        // Avatar
        ctx.save();
        ctx.beginPath();
        ctx.arc(avX, avY, size, 0, Math.PI * 2);
        ctx.clip();
        const img = getImg(user?.avatarUrl || user?.avatar);
        if (img) {
            ctx.drawImage(img, avX - size, avY - size, size * 2, size * 2);
        } else {
            ctx.fillStyle = '#0f0f14';
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.02)';
            ctx.font = '900 26px monalqo, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', avX, avY);
        }
        ctx.restore();

        // Ring
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = rank === 1 ? 5 : 3;
        if (rank === 1) { ctx.shadowColor = color; ctx.shadowBlur = 25; }
        ctx.beginPath(); ctx.arc(avX, avY, size + 5, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();

        // Info
        const badgeY = avY + size + 10;
        ctx.fillStyle = color;
        drawRoundedRect(ctx, x - 20, badgeY - 12, 40, 24, 12); ctx.fill();
        ctx.fillStyle = '#000'; ctx.font = '900 13px monalqo, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`#${rank}`, x, badgeY);

        const nameY = badgeY + 30;
        ctx.fillStyle = user ? TEXT_COLOR : 'rgba(255,255,255,0.1)';
        ctx.font = '900 14px monalqo, sans-serif';
        ctx.fillText((user ? (user.username || 'Archivist') : 'VACANT').toUpperCase(), x, nameY);
        
        if (user) {
            ctx.fillStyle = color;
            ctx.font = '900 12px monalqo, sans-serif';
            ctx.fillText(`LEVEL ${user.level}`, x, nameY + 18);
        }
    };

    const pBaseline = i2.y + 160; 
    const pStep = i2.w / 4.2;

    await drawPodium(topUsers[1], 2, i2.x + pStep, pBaseline, 30);
    await drawPodium(topUsers[2], 3, i2.x + i2.w - pStep, pBaseline, 30);
    await drawPodium(topUsers[0], 1, i2.x + i2.w / 2, pBaseline, 40);

    // List Section
    const listStartY = i2.y + 225;
    const rowH = 28;

    for (let i = 3; i < 10; i++) {
        const user = topUsers[i];
        const y = listStartY + (i - 3) * (rowH + 6);
        const rowX = i2.x + 30;
        const rowW = i2.w - 60;

        ctx.fillStyle = i % 2 === 0 ? `rgba(${r}, ${g}, ${b}, 0.04)` : 'rgba(255,255,255,0.015)';
        drawRoundedRect(ctx, rowX - 10, y - 16, rowW + 20, rowH + 4, 10); ctx.fill();

        ctx.textBaseline = 'middle';
        
        // Rank
        ctx.textAlign = 'left';
        ctx.fillStyle = SECONDARY_TEXT; 
        ctx.font = '900 12px monalqo, sans-serif';
        ctx.fillText(`#${i + 1}`, rowX, y);

        // Avatar
        const listAvRadius = 11;
        ctx.save();
        ctx.beginPath(); ctx.arc(rowX + 42, y, listAvRadius, 0, Math.PI * 2); ctx.clip();
        const img = getImg(user?.avatarUrl);
        if (img) {
            ctx.drawImage(img, rowX + 42 - listAvRadius, y - listAvRadius, listAvRadius * 2, listAvRadius * 2);
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            ctx.fill();
        }
        ctx.restore();

        // Name
        ctx.fillStyle = user ? TEXT_COLOR : 'rgba(255,255,255,0.1)';
        ctx.font = '900 13px monalqo, sans-serif';
        ctx.fillText(user ? (user.username || 'Archivist').toUpperCase() : 'VACANT SLOT', rowX + 68, y);

        if (user) {
            ctx.textAlign = 'right'; ctx.fillStyle = THEME_COLOR;
            ctx.fillText(`LVL ${user.level}`, rowX + rowW, y);
        }
    }

    return await canvas.encode('webp', { quality: 85 });
};

module.exports = { generateLeaderboard };
