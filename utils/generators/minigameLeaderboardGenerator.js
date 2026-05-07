const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { secureLoadImage } = require('../core/visualUtils');

const CARD_WIDTH = 620;
const CARD_HEIGHT = 780;

const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 255, b: 255 };
};

const formatPointsVal = (num) => {
    const n = parseFloat(num) || 0;
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '');
    return n.toString();
};

const formatPointsSuffix = (num) => {
    const n = parseFloat(num) || 0;
    if (n >= 1000) return 'K';
    return '';
};

const drawHexagon = (ctx, x, y, size) => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (i * 60 - 90) * Math.PI / 180;
        ctx.lineTo(x + size * Math.cos(angle), y + size * Math.sin(angle));
    }
    ctx.closePath();
};

/**
 * Arcade Protocol Leaderboard: "CHAMPIONSHIP MATRIX EDITION"
 * Redesigns the podium space with technical geometry.
 * Features: Perspective coordinate field, championship linking beams, 
 * energy pedestals, and hardware mounting tethers.
 */
const generateMinigameLeaderboard = async (challenger, topPlayers, primaryColor = '#00F0FF') => {
    const SCALE = 2;
    const canvas = createCanvas(CARD_WIDTH * SCALE, CARD_HEIGHT * SCALE);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const NEON_CYAN = '#00F0FF';
    const NEON_MAGENTA = '#FF2D78';
    const METALLIC_GOLD = ['#D4AF37', '#FFF8DC', '#DAA520'];
    const METALLIC_SILVER = ['#A8B8C8', '#FFFFFF', '#B8C8D8'];
    const METALLIC_BRONZE = ['#CD7F32', '#FFDAB9', '#B87333'];
    
    const BG_DARK = '#020208';
    const VIGNETTE_TINT = '#02021A';
    const TEXT_WHITE = '#EAEAFF';
    const TEXT_DIM = 'rgba(200, 210, 255, 0.6)';

    const maxPoints = topPlayers[0]?.total_points || 1;

    // ============================
    // 0. PRE-LOAD ALL IMAGES
    // ============================
    const imageMap = new Map();
    const urlsToLoad = [];
    
    if (challenger.avatarUrl) urlsToLoad.push(challenger.avatarUrl);
    topPlayers.forEach(p => {
        if (p && p.avatarUrl) urlsToLoad.push(p.avatarUrl);
    });

    const uniqueUrls = [...new Set(urlsToLoad.filter(u => u))];
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

    const getImg = (url) => imageMap.get(url) || null;

    // ============================
    // 1. BACKGROUND: CRT CABINET
    // ============================
    ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    ctx.save();
    ctx.beginPath(); ctx.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 32);
    ctx.fillStyle = BG_DARK; ctx.fill();
    ctx.clip();

    const screenX = 16, screenY = 16;
    const screenW = CARD_WIDTH - 32, screenH = CARD_HEIGHT - 32;

    ctx.beginPath(); ctx.roundRect(screenX, screenY, screenW, screenH, 16);
    const crtGrad = ctx.createRadialGradient(CARD_WIDTH/2, CARD_HEIGHT/2, 20, CARD_WIDTH/2, CARD_HEIGHT/2, CARD_WIDTH*0.7);
    crtGrad.addColorStop(0, '#0A0A1F'); crtGrad.addColorStop(0.6, '#050510'); crtGrad.addColorStop(1, '#010105');
    ctx.fillStyle = crtGrad; ctx.fill();

    // CRT Scanlines
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 0.5;
    for (let y = screenY; y < screenY + screenH; y += 3) {
        ctx.beginPath(); ctx.moveTo(screenX, y); ctx.lineTo(screenX + screenW, y); ctx.stroke();
    }
    ctx.restore();

    const vigGrad = ctx.createRadialGradient(CARD_WIDTH/2, CARD_HEIGHT/2, CARD_WIDTH*0.3, CARD_WIDTH/2, CARD_HEIGHT/2, CARD_WIDTH*0.7);
    vigGrad.addColorStop(0, 'transparent'); vigGrad.addColorStop(1, VIGNETTE_TINT);
    ctx.fillStyle = vigGrad; ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // Tweak #1: Perspective Field (Cross Grid)
    ctx.save();
    ctx.globalAlpha = 0.06; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1;
    const gridSpace = 60;
    for (let gx = 36; gx < CARD_WIDTH - 36; gx += gridSpace) {
        for (let gy = 80; gy < 300; gy += gridSpace) {
            ctx.beginPath(); ctx.moveTo(gx - 2, gy); ctx.lineTo(gx + 2, gy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(gx, gy - 2); ctx.lineTo(gx, gy + 2); ctx.stroke();
        }
    }
    ctx.restore();

    // Corner HUD Metadata
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 8px monalqo, sans-serif'; ctx.fillStyle = 'rgba(0, 240, 255, 0.2)';
    ctx.save(); ctx.translate(10, CARD_HEIGHT/2); ctx.rotate(-Math.PI/2); ctx.fillText('ANIMUSE ARCADE', 0, 0); ctx.restore();
    ctx.save(); ctx.translate(CARD_WIDTH - 10, CARD_HEIGHT/2); ctx.rotate(Math.PI/2); ctx.fillText('SYS_CLOCK: [STABLE]', 0, 0); ctx.restore();
    ctx.restore();

    // ============================
    // 2. HEADER: ARCADE MARQUEE
    // ============================
    const headerY = 40; 
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `900 13px monalqo, sans-serif`;
    ctx.letterSpacing = '8px';

    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = NEON_MAGENTA; ctx.fillText('ARCADE PROTOCOL', CARD_WIDTH / 2 - 2.5, headerY + 2.5);
    ctx.fillStyle = NEON_CYAN; ctx.fillText('ARCADE PROTOCOL', CARD_WIDTH / 2 + 2.5, headerY - 2.5);
    ctx.restore();

    ctx.shadowColor = '#FFFFFF'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#FFFFFF'; ctx.fillText('ARCADE PROTOCOL', CARD_WIDTH / 2, headerY);
    ctx.shadowBlur = 0;

    ctx.font = `900 9px monalqo, sans-serif`;
    ctx.letterSpacing = '5px';
    ctx.fillStyle = TEXT_DIM;
    const sessionDate = `${new Date().getFullYear()}.${(new Date().getMonth() + 1).toString().padStart(2, '0')}`;
    ctx.fillText(`HIGH SCORE RANKINGS // SESSION ${sessionDate}`, CARD_WIDTH / 2, headerY + 26);

    const slotY = headerY + 40; 
    const barLineY = slotY + 13; 
    
    ctx.lineWidth = 2;
    const barLen = 120; const barCenterX = CARD_WIDTH / 2;
    const leftBar = ctx.createLinearGradient(barCenterX - barLen - 30, barLineY, barCenterX - 30, barLineY);
    leftBar.addColorStop(0, 'transparent'); leftBar.addColorStop(1, NEON_CYAN);
    ctx.strokeStyle = leftBar; ctx.beginPath(); ctx.moveTo(barCenterX - barLen - 30, barLineY); ctx.lineTo(barCenterX - 30, barLineY); ctx.stroke();

    const rightBar = ctx.createLinearGradient(barCenterX + 30, barLineY, barCenterX + barLen + 30, barLineY);
    rightBar.addColorStop(0, NEON_MAGENTA); rightBar.addColorStop(1, 'transparent');
    ctx.strokeStyle = rightBar; ctx.beginPath(); ctx.moveTo(barCenterX + 30, barLineY); ctx.lineTo(barCenterX + barLen + 30, barLineY); ctx.stroke();

    const slotX = barCenterX - 5;
    ctx.fillStyle = NEON_CYAN; ctx.fillRect(slotX, slotY - 3, 2, 6);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(slotX + 4, slotY - 3, 2, 6);
    ctx.fillStyle = NEON_MAGENTA; ctx.fillRect(slotX + 8, slotY - 3, 2, 6);
    ctx.restore();

    // ============================
    // 3. PODIUM: TOP 3 CHAMPIONS
    // ============================
    const podiumBaseY = 222; 
    
    // Tweak #3: Championship Linking Beam
    ctx.save();
    const beamY = podiumBaseY - 20;
    const beamGrad = ctx.createLinearGradient(0, beamY, CARD_WIDTH, beamY);
    beamGrad.addColorStop(0, 'transparent'); beamGrad.addColorStop(0.2, NEON_CYAN);
    beamGrad.addColorStop(0.8, NEON_MAGENTA); beamGrad.addColorStop(1, 'transparent');
    ctx.globalAlpha = 0.15; ctx.strokeStyle = beamGrad; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, beamY); ctx.lineTo(CARD_WIDTH, beamY); ctx.stroke();
    ctx.restore();

    const podiumConfigs = [
        { rank: 2, x: 100,  size: 38, glowColor: NEON_CYAN, palette: METALLIC_SILVER, offsetY: 20, label: '2ND' },
        { rank: 1, x: CARD_WIDTH / 2, size: 52, glowColor: '#FFD700', palette: METALLIC_GOLD, offsetY: -10, label: '1ST' },
        { rank: 3, x: CARD_WIDTH - 100, size: 38, glowColor: NEON_MAGENTA, palette: METALLIC_BRONZE, offsetY: 20, label: '3RD' },
    ];

    for (const cfg of podiumConfigs) {
        const player = topPlayers[cfg.rank - 1];
        if (!player) continue;

        const avatarY = podiumBaseY - cfg.size + cfg.offsetY;

        // Tweak #2: Data Tethers (Mounting Rings to Marquee)
        ctx.save();
        ctx.globalAlpha = 0.2; ctx.strokeStyle = cfg.glowColor; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cfg.x, avatarY - cfg.size - 5); ctx.lineTo(cfg.x, barLineY); ctx.stroke();
        ctx.restore();

        if (cfg.rank === 1) {
            ctx.save();
            ctx.globalAlpha = 0.15;
            const auraGrad = ctx.createRadialGradient(cfg.x, avatarY, cfg.size, cfg.x, avatarY, cfg.size * 2.5);
            auraGrad.addColorStop(0, 'rgba(255, 215, 0, 0.4)');
            auraGrad.addColorStop(1, 'transparent');
            ctx.fillStyle = auraGrad;
            ctx.beginPath(); ctx.arc(cfg.x, avatarY, cfg.size * 2.5, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }

        ctx.save();
        ctx.shadowColor = cfg.glowColor; ctx.shadowBlur = cfg.rank === 1 ? 30 : 15;
        const metalGrad = ctx.createLinearGradient(cfg.x - cfg.size, avatarY - cfg.size, cfg.x + cfg.size, avatarY + cfg.size);
        metalGrad.addColorStop(0, cfg.palette[0]); metalGrad.addColorStop(0.5, cfg.palette[1]); metalGrad.addColorStop(1, cfg.palette[2]);
        ctx.strokeStyle = metalGrad; ctx.lineWidth = cfg.rank === 1 ? 4 : 3;
        ctx.beginPath(); ctx.arc(cfg.x, avatarY, cfg.size + 5, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.beginPath(); ctx.arc(cfg.x, avatarY, cfg.size, 0, Math.PI * 2); ctx.clip();
        const avatarImg = getImg(player.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png');
        if (avatarImg) ctx.drawImage(avatarImg, cfg.x - cfg.size, avatarY - cfg.size, cfg.size * 2, cfg.size * 2);
        else { ctx.fillStyle = '#0a0a1a'; ctx.fill(); }
        ctx.strokeStyle = BG_DARK; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(cfg.x, avatarY, cfg.size, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();

        const badgeY = avatarY + cfg.size + 8;
        ctx.save();
        ctx.fillStyle = BG_DARK; drawHexagon(ctx, cfg.x, badgeY, 14); ctx.fill();
        ctx.strokeStyle = metalGrad; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = cfg.palette[1];
        ctx.font = '900 9px monalqo, sans-serif'; 
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(cfg.rank, cfg.x, badgeY + 1);
        ctx.restore();

        const nameY = badgeY + 29; 
        ctx.textAlign = 'center'; ctx.fillStyle = TEXT_WHITE;
        ctx.font = '900 13px monalqo, sans-serif';
        const name = (player.username || 'PLAYER').toUpperCase();
        const truncName = name.length > 14 ? name.substring(0, 12) + '..' : name;
        ctx.fillText(truncName, cfg.x, nameY);

        // Tweak #4: Vapor-Glow Pedestals
        ctx.save();
        const scoreY = nameY + 22;
        const pedestalGrad = ctx.createLinearGradient(cfg.x - 40, scoreY, cfg.x + 40, scoreY);
        pedestalGrad.addColorStop(0, 'transparent'); pedestalGrad.addColorStop(0.5, cfg.glowColor); pedestalGrad.addColorStop(1, 'transparent');
        ctx.globalAlpha = 0.15; ctx.fillStyle = pedestalGrad;
        ctx.fillRect(cfg.x - 40, scoreY + 5, 80, 2);
        ctx.restore();

        ctx.save();
        const val = formatPointsVal(player.total_points);
        const suf = formatPointsSuffix(player.total_points);
        ctx.shadowColor = cfg.glowColor; ctx.shadowBlur = 10; ctx.fillStyle = cfg.glowColor;
        ctx.font = '900 17px monalqo, sans-serif';
        const valW = ctx.measureText(val).width;
        ctx.font = '900 12px monalqo, sans-serif';
        const sufW = ctx.measureText(suf).width;
        const startX = cfg.x - ((valW + 3 + sufW) / 2);
        ctx.textAlign = 'left';
        ctx.font = '900 17px monalqo, sans-serif'; ctx.fillText(val, startX, scoreY); 
        ctx.font = '900 12px monalqo, sans-serif'; ctx.fillText(suf, startX + valW + 3, scoreY);
        ctx.restore();
    }

    // ============================
    // 4. RANKING LIST: TERMINAL
    // ============================
    const listStartY = 318; 
    const rowHeight = 46; const rowMargin = 7;
    const listX = 36; const listW = CARD_WIDTH - 72;

    for (let i = 3; i < 10; i++) {
        const player = topPlayers[i];
        const y = listStartY + (i - 3) * (rowHeight + rowMargin);
        const isCyan = i % 2 === 0; const mainColor = isCyan ? NEON_CYAN : NEON_MAGENTA;

        ctx.save();
        const rowGrad = ctx.createLinearGradient(listX, y, listX, y + rowHeight);
        rowGrad.addColorStop(0, 'rgba(10, 10, 30, 0.4)');
        rowGrad.addColorStop(0.5, isCyan ? 'rgba(0, 240, 255, 0.05)' : 'rgba(255, 45, 120, 0.04)');
        rowGrad.addColorStop(1, 'rgba(10, 10, 30, 0.4)');
        ctx.fillStyle = rowGrad;
        ctx.beginPath(); ctx.roundRect(listX, y, listW, rowHeight, 8); ctx.fill();
        ctx.strokeStyle = isCyan ? 'rgba(0, 240, 255, 0.15)' : 'rgba(255, 45, 120, 0.12)';
        ctx.lineWidth = 0.5; ctx.stroke();
        ctx.restore();

        if (!player) {
            ctx.save();
            ctx.fillStyle = 'rgba(200, 210, 255, 0.08)';
            ctx.font = '900 11px monalqo, sans-serif'; ctx.textBaseline = 'middle';
            const rStr = (i + 1).toString().padStart(2, '0');
            ctx.textAlign = 'left'; ctx.fillText('[', listX + 12, y + rowHeight / 2);
            ctx.textAlign = 'center'; ctx.fillText(rStr, listX + 27, y + rowHeight / 2);
            ctx.textAlign = 'left'; ctx.fillText(']', listX + 40, y + rowHeight / 2);
            ctx.fillText('AWAITING CHALLENGER...', listX + 66, y + rowHeight / 2);
            ctx.restore();
            continue;
        }

        const fillRatio = Math.min(1, player.total_points / maxPoints);
        const nameStartX = listX + 97; 
        const traceEndX = listX + listW - 120; 
        const indicatorX = nameStartX + 30 + (traceEndX - (nameStartX + 30)) * fillRatio;
        const indicatorY = y + rowHeight / 2;

        if (fillRatio > 0) {
            ctx.save();
            ctx.translate(indicatorX, indicatorY);
            ctx.rotate(Math.PI / 4);
            ctx.shadowColor = mainColor; ctx.shadowBlur = 10;
            ctx.fillStyle = mainColor; ctx.fillRect(-3, -3, 6, 6);
            ctx.fillStyle = '#FFFFFF'; ctx.fillRect(-1.5, -1.5, 3, 3);
            
            ctx.rotate(-Math.PI / 4);
            ctx.strokeStyle = mainColor; ctx.lineWidth = 1;
            const b = 6;
            ctx.beginPath(); ctx.moveTo(-b, -b+2); ctx.lineTo(-b, -b); ctx.lineTo(-b+2, -b); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(b, -b+2); ctx.lineTo(b, -b); ctx.lineTo(b-2, -b); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-b, b-2); ctx.lineTo(-b, b); ctx.lineTo(-b+2, b); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(b, b-2); ctx.lineTo(b, b); ctx.lineTo(b-2, b); ctx.stroke();
            ctx.restore();
            
            ctx.save();
            const trailGrad = ctx.createLinearGradient(indicatorX - 30, indicatorY, indicatorX, indicatorY);
            trailGrad.addColorStop(0, 'transparent'); trailGrad.addColorStop(1, mainColor);
            ctx.globalAlpha = 0.2; ctx.fillStyle = trailGrad;
            ctx.fillRect(indicatorX - 30, indicatorY - 0.5, 30, 1.5);
            ctx.restore();
        }

        ctx.save();
        ctx.fillStyle = TEXT_DIM; ctx.font = '900 11px monalqo, sans-serif';
        ctx.textBaseline = 'middle';
        const rankStr = (i + 1).toString().padStart(2, '0');
        ctx.textAlign = 'left'; ctx.fillText('[', listX + 12, y + rowHeight / 2);
        ctx.textAlign = 'center'; ctx.fillText(rankStr, listX + 27, y + rowHeight / 2);
        ctx.textAlign = 'left'; ctx.fillText(']', listX + 40, y + rowHeight / 2);
        ctx.restore();

        const miniX = listX + 66; const miniY = y + rowHeight / 2;
        ctx.save();
        ctx.beginPath(); ctx.arc(miniX, miniY, 14, 0, Math.PI * 2); ctx.clip();
        const mImg = getImg(player.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png');
        if (mImg) ctx.drawImage(mImg, miniX - 14, miniY - 14, 28, 28);
        else { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); }
        ctx.restore();
        ctx.strokeStyle = mainColor; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(miniX, miniY, 15, 0, Math.PI * 2); ctx.stroke();

        const uName = (player.username || 'PLAYER').toUpperCase();
        ctx.fillStyle = TEXT_WHITE; ctx.font = '900 12px monalqo, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(uName, nameStartX, y + rowHeight / 2 - 0.5);

        ctx.save();
        ctx.textAlign = 'right'; ctx.fillStyle = mainColor;
        if (!isCyan) { ctx.shadowColor = '#000000'; ctx.shadowOffsetY = 1; ctx.shadowBlur = 2; }
        else { ctx.shadowColor = mainColor; ctx.shadowBlur = 6; }
        const val = formatPointsVal(player.total_points);
        const suf = formatPointsSuffix(player.total_points);
        ctx.textBaseline = 'alphabetic'; 
        ctx.font = '900 11px monalqo, sans-serif'; const sufW = ctx.measureText(suf).width;
        ctx.fillText(suf, listX + listW - 20, y + rowHeight / 2 + 5); 
        ctx.font = '900 16px monalqo, sans-serif'; ctx.fillText(val, listX + listW - 20 - sufW - 3, y + rowHeight / 2 + 5);
        ctx.restore();
    }

    // ============================
    // 5. YOUR STANDING: TERMINAL
    // ============================
    const footerY = CARD_HEIGHT - 78;
    const fX = 36, fW = listW, fH = 50;

    ctx.save();
    ctx.beginPath(); ctx.roundRect(fX, footerY, fW, fH, 10);
    ctx.fillStyle = 'rgba(0, 240, 255, 0.04)'; ctx.fill();
    ctx.shadowColor = NEON_CYAN; ctx.shadowBlur = 12;
    ctx.strokeStyle = NEON_CYAN; ctx.lineWidth = 2; ctx.stroke();
    ctx.shadowBlur = 0;

    const bLen = 10;
    ctx.beginPath(); ctx.moveTo(fX, footerY + bLen); ctx.lineTo(fX, footerY); ctx.lineTo(fX + bLen, footerY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fX + fW - bLen, footerY); ctx.lineTo(fX + fW, footerY); ctx.lineTo(fX + fW, footerY + bLen); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fX, footerY + fH - bLen); ctx.lineTo(fX, footerY + fH); ctx.lineTo(fX + bLen, footerY + fH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fX + fW - bLen, footerY + fH); ctx.lineTo(fX + fW, footerY + fH); ctx.lineTo(fX + fW, footerY + fH - bLen); ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = NEON_CYAN; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(fX + 16, footerY + fH/2 - 10, 44, 20, 2); ctx.stroke();
    
    ctx.fillStyle = NEON_CYAN; ctx.font = '900 10px monalqo, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('YOU', fX + 38, footerY + fH / 2 + 1);
    
    ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(fX + 57, footerY + fH / 2 + 1, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    const cAvX = fX + 16 + 44 + 12 + 15; const cAvY = footerY + fH / 2;
    ctx.save();
    ctx.beginPath(); ctx.arc(cAvX, cAvY, 14, 0, Math.PI * 2); ctx.clip();
    const cImg = getImg(challenger.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png');
    if (cImg) ctx.drawImage(cImg, cAvX - 14, cAvY - 14, 28, 28);
    else { ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill(); }
    ctx.restore();
    ctx.strokeStyle = NEON_CYAN; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cAvX, cAvY, 15, 0, Math.PI * 2); ctx.stroke();

    const cNameStartX = cAvX + 15 + 12;
    ctx.fillStyle = TEXT_WHITE; ctx.font = '900 13px monalqo, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const cName = (challenger.username || 'PLAYER').toUpperCase();
    const truncC = cName.length > 16 ? cName.substring(0, 14) + '..' : cName;
    ctx.fillText(truncC, cNameStartX, cAvY - 6.5); 

    const rankStr = challenger.stats?.rank ? `RANK #${challenger.stats.rank}` : 'UNRANKED';
    ctx.fillStyle = TEXT_DIM; ctx.font = '900 9px monalqo, sans-serif'; ctx.letterSpacing = '1px';
    ctx.fillText(rankStr, cNameStartX, cAvY + 4.5); 

    ctx.save();
    ctx.textAlign = 'right'; ctx.shadowColor = NEON_CYAN; ctx.shadowBlur = 10; ctx.fillStyle = NEON_CYAN;
    const cVal = formatPointsVal(challenger.stats?.total_points || 0);
    const cSuf = formatPointsSuffix(challenger.stats?.total_points || 0);
    ctx.textBaseline = 'alphabetic'; ctx.font = '900 12px monalqo, sans-serif'; const cSufW = ctx.measureText(cSuf).width;
    ctx.fillText(cSuf, fX + fW - 20, cAvY + 6);
    ctx.font = '900 18px monalqo, sans-serif'; ctx.fillText(cVal, fX + fW - 20 - cSufW - 3, cAvY + 6);
    ctx.restore();

    ctx.restore();

    return await canvas.encode('webp', { quality: 90 });
};

module.exports = { generateMinigameLeaderboard };
