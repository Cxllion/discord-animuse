const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const { generateColorTokens } = require('../core/visualUtils');

const CARD_WIDTH = 900;
const CARD_HEIGHT = 500;

// GRID ARCHITECTURE
const MARGIN = 20;
const PANEL_A_CTR = 170;  // Identity
const PANEL_B_CTR = 440;  // Progression
const PANEL_C_X = 570;    // Records x-start
const PANEL_C_W = 310;    // Records width

const formatStat = (num) => {
    const n = parseFloat(num) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return n.toLocaleString();
};

const drawOrnament = (ctx, x, y, size, color) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.35, -size * 0.35);
    ctx.lineTo(size, 0);
    ctx.lineTo(size * 0.35, size * 0.35);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.35, size * 0.35);
    ctx.lineTo(-size, 0);
    ctx.lineTo(-size * 0.35, -size * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
};

const drawIcon = (ctx, type, x, y, size, color) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.2; // Thicker for designer clarity
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (type) {
        case 'anime':
            ctx.strokeRect(-size/2, -size/2 + 2, size, size * 0.75);
            ctx.beginPath();
            ctx.moveTo(-size/4, size/2); ctx.lineTo(size/4, size/2);
            ctx.moveTo(0, size * 0.3); ctx.lineTo(0, size/2);
            ctx.stroke();
            break;
        case 'manga':
            ctx.beginPath();
            ctx.moveTo(0, size/2 - 2);
            ctx.bezierCurveTo(-size/2, size/2, -size/2, -size/3, -size/2, -size/2 + 2);
            ctx.lineTo(0, -size/4);
            ctx.lineTo(size/2, -size/2 + 2);
            ctx.bezierCurveTo(size/2, -size/3, size/2, size/2, 0, size/2 - 2);
            ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, -size/4); ctx.lineTo(0, size/2 - 2); ctx.stroke();
            break;
        case 'episodes':
            ctx.strokeRect(-size/2, -size/2, size, size);
            ctx.fillRect(-size/2 + 2, -size/2 + 2, 4, 4);
            ctx.fillRect(size/2 - 6, -size/2 + 2, 4, 4);
            ctx.fillRect(-size/2 + 2, size/2 - 6, 4, 4);
            ctx.fillRect(size/2 - 6, size/2 - 6, 4, 4);
            break;
        case 'volumes':
            ctx.strokeRect(-size/2, -size/2 + 1, size, size/3);
            ctx.strokeRect(-size/2, -size/6 + 1, size, size/3);
            ctx.strokeRect(-size/2, size/6 + 1, size, size/3);
            break;
        case 'days':
            ctx.strokeRect(-size/2, -size/2 + 2, size, size * 0.8);
            ctx.beginPath(); ctx.moveTo(-size/2, -size/6); ctx.lineTo(size/2, -size/6); ctx.stroke();
            ctx.fillRect(-size/4, -size/2 - 2, 3, 5);
            ctx.fillRect(size/4, -size/2 - 2, 3, 5);
            break;
        case 'chapters':
            ctx.beginPath();
            ctx.moveTo(-size/2, -size/2); ctx.lineTo(size/6, -size/2);
            ctx.lineTo(size/2, -size/6); ctx.lineTo(size/2, size/2);
            ctx.lineTo(-size/2, size/2); ctx.closePath();
            ctx.stroke();
            break;
        case 'library':
            ctx.strokeRect(-size/2, -size/2, size, size/5);
            ctx.strokeRect(-size/2, size/3, size, size/5);
            ctx.fillRect(-size/3, -size/3, 3, 2*size/3);
            ctx.fillRect(size/6, -size/3, 3, 2*size/3);
            break;
    }
    ctx.restore();
};

const generateProfileCard = async (discordUser, userData, favorites, backgroundUrl = null, primaryColor = '#FFACD1', displayName = null) => {
    const SCALE = 2;
    const canvas = createCanvas(CARD_WIDTH * SCALE, CARD_HEIGHT * SCALE);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    const tokens = generateColorTokens(primaryColor);
    const THEME_COLOR = tokens.primary;

    // --- 1. THE FOUNDATION ---
    ctx.save();
    ctx.fillStyle = '#08080c';
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    try {
        let bgImg;
        if (backgroundUrl) bgImg = await loadImage(backgroundUrl);
        else {
            if (!global.defaultBgCache) {
                global.defaultBgCache = await loadImage(path.join(__dirname, 'images', 'profile_background_default.png'));
            }
            bgImg = global.defaultBgCache;
        }

        const ratio = Math.max(CARD_WIDTH / bgImg.width, CARD_HEIGHT / bgImg.height);
        const bgW = bgImg.width * ratio;
        const bgH = bgImg.height * ratio;
        const bgX = (CARD_WIDTH - bgW) / 2;
        const bgY = (CARD_HEIGHT - bgH) / 2;

        ctx.save();
        ctx.filter = 'blur(12px) brightness(0.25)';
        ctx.drawImage(bgImg, bgX, bgY, bgW, bgH);
        ctx.restore();

        // Card Clip & Inner Glass
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(MARGIN, MARGIN, CARD_WIDTH - MARGIN*2, CARD_HEIGHT - MARGIN*2, 32);
        ctx.clip();
        ctx.filter = 'blur(80px) brightness(0.85) saturate(1.4)';
        ctx.drawImage(bgImg, bgX, bgY, bgW, bgH);
        ctx.filter = 'none';
        ctx.fillStyle = 'rgba(10, 10, 15, 0.45)';
        ctx.fillRect(MARGIN, MARGIN, CARD_WIDTH - MARGIN*2, CARD_HEIGHT - MARGIN*2);
        ctx.restore();

        // Main Border
        ctx.save();
        ctx.strokeStyle = `rgba(255, 255, 255, 0.15)`;
        ctx.beginPath();
        ctx.roundRect(MARGIN, MARGIN, CARD_WIDTH - MARGIN*2, CARD_HEIGHT - MARGIN*2, 32);
        ctx.stroke();
        ctx.strokeStyle = THEME_COLOR;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.4;
        ctx.shadowColor = tokens.glow;
        ctx.shadowBlur = 15;
        ctx.stroke();
        ctx.restore();

        // Corners
        const cornOff = 12;
        drawOrnament(ctx, MARGIN+cornOff, MARGIN+cornOff, 8, THEME_COLOR);
        drawOrnament(ctx, CARD_WIDTH-MARGIN-cornOff, MARGIN+cornOff, 8, THEME_COLOR);
        drawOrnament(ctx, MARGIN+cornOff, CARD_HEIGHT-MARGIN-cornOff, 8, THEME_COLOR);
        drawOrnament(ctx, CARD_WIDTH-MARGIN-cornOff, CARD_HEIGHT-MARGIN-cornOff, 8, THEME_COLOR);

        // --- 2. PANEL A: IDENTITY ---
        const avX = PANEL_A_CTR;
        const avY = 210;
        const avR = 98;

        // Halo
        ctx.save();
        ctx.strokeStyle = THEME_COLOR;
        ctx.lineWidth = 3;
        ctx.shadowColor = tokens.glow;
        ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.arc(avX, avY, avR + 10, 0, Math.PI*2); ctx.stroke();
        ctx.restore();

        let avatarUrl = discordUser.displayAvatarURL({ extension: 'png', size: 1024 });
        if (userData.avatarConfig?.source === 'CUSTOM' && userData.avatarConfig.customUrl) avatarUrl = userData.avatarConfig.customUrl;
        
        try {
            const avatar = await loadImage(avatarUrl);
            ctx.save();
            ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI*2); ctx.clip();
            ctx.drawImage(avatar, avX-avR, avY-avR, avR*2, avR*2);
            ctx.restore();
        } catch (e) {}

        const name = (displayName || discordUser.username).toUpperCase();
        ctx.textAlign = 'center';
        ctx.font = '900 42px sans-serif'; // Reduced from fitText for stability
        ctx.fillStyle = '#FFF';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 10;
        ctx.fillText(name, avX, avY + avR + 70);

        const badgeW = 200, badgeH = 32;
        ctx.fillStyle = tokens.primaryContainer;
        ctx.beginPath(); ctx.roundRect(avX-badgeW/2, avY+avR+92, badgeW, badgeH, 16); ctx.fill();
        ctx.strokeStyle = THEME_COLOR; ctx.stroke();
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillText((userData.title || 'MUSE READER').toUpperCase(), avX, avY+avR+113);

        // --- 3. PANEL B: PROGRESSION (CONSOLIDATED) ---
        const progCtr = PANEL_B_CTR;
        const progY = 160;

        ctx.fillStyle = tokens.glow;
        ctx.font = '900 18px sans-serif';
        ctx.fillText('LEVEL', progCtr, progY);

        ctx.fillStyle = '#FFF';
        ctx.font = '900 125px sans-serif';
        ctx.fillText(userData.level || '0', progCtr, progY + 95);

        ctx.font = '900 14px sans-serif';
        ctx.letterSpacing = '4px';
        ctx.fillText('MEMBER LEVEL', progCtr, progY + 125);
        ctx.letterSpacing = '0px';

        const vialW = 210, vialH = 24, vialX = progCtr - vialW/2, vialY = progY + 175;
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath(); ctx.roundRect(vialX, vialY, vialW, vialH, 12); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.stroke();

        const progress = Math.min(1, (userData.current / (userData.required || 1)));
        if (progress > 0) {
            ctx.save();
            ctx.beginPath(); ctx.roundRect(vialX, vialY, vialW * progress, vialH, 12); ctx.clip();
            const g = ctx.createLinearGradient(vialX, vialY, vialX+vialW, vialY);
            g.addColorStop(0, tokens.primary); g.addColorStop(1, tokens.glow);
            ctx.fillStyle = g; ctx.fillRect(vialX, vialY, vialW*progress, vialH);
            ctx.restore();
        }
        drawOrnament(ctx, vialX + vialW*progress, vialY + vialH/2, 6, '#FFF');

        ctx.font = '900 18px sans-serif';
        ctx.fillStyle = '#FFF';
        ctx.fillText(`${formatStat(userData.current)} / ${formatStat(userData.required)} XP`, progCtr, vialY + 52);
        ctx.font = '900 13px sans-serif';
        ctx.globalAlpha = 0.6;
        ctx.fillText(`${Math.floor(progress * 100)}% TO NEXT LEVEL`, progCtr, vialY + 76);
        ctx.globalAlpha = 1.0;

        // --- 4. PANEL C: RECORDS ---
        const recX = PANEL_C_X, recW = PANEL_C_W - MARGIN, recY = MARGIN + 25, recH = 410;
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; // Light Glass
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 30;
        ctx.beginPath(); ctx.roundRect(recX, recY, recW, recH, 32); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.stroke();
        ctx.restore();

        ctx.font = '900 16px sans-serif'; ctx.letterSpacing = '5px'; ctx.fillStyle = '#FFF';
        ctx.fillText('LIBRARY RECORDS', recX + recW/2, recY + 45); ctx.letterSpacing = '0px';

        const stats = userData.anilist || {}, gridX = recX + 35, gridY = recY + 115, rowS = 95, colS = 145;
        const drawStat = (label, val, x, y, type) => {
            ctx.textAlign = 'left'; ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = tokens.glow;
            ctx.fillText(label.toUpperCase(), x, y);
            ctx.font = '900 32px sans-serif'; ctx.fillStyle = '#FFF';
            const sVal = formatStat(val); ctx.fillText(sVal, x, y + 40);
            drawIcon(ctx, type, x + ctx.measureText(sVal).width + 12, y + 30, 20, tokens.glow);
        };

        if (userData.anilist_synced) {
            drawStat('Anime', stats.completed || 0, gridX, gridY, 'anime');
            drawStat('Manga', stats.manga_completed || 0, gridX+colS, gridY, 'manga');
            drawStat('Episodes', stats.episodes || 0, gridX, gridY+rowS, 'episodes');
            drawStat('Volumes', stats.volumes || 0, gridX+colS, gridY+rowS, 'volumes');
            drawStat('Days', stats.days || '0.0', gridX, gridY+rowS*2, 'days');
            drawStat('Chapters', stats.chapters || 0, gridX+colS, gridY+rowS*2, 'chapters');
        } else {
            ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fillText('Connect AniList', recX + recW/2, recY + recH/2);
        }

        // Top Branding (Subtle)
        ctx.textAlign = 'right'; ctx.font = '900 16px sans-serif'; ctx.letterSpacing = '4px'; ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('ANIMUSE ARCHIVES', CARD_WIDTH - 65, CARD_HEIGHT - 45);
        drawIcon(ctx, 'library', CARD_WIDTH - 35, CARD_HEIGHT - 52, 18, 'rgba(255,255,255,0.5)');

    } catch (err) { console.error(err); }

    return await canvas.encode('webp', { quality: 85 });
};

const getDominantColor = async (imageUrl) => {
    try {
        const img = await loadImage(imageUrl);
        const sc = createCanvas(50, 50), sctx = sc.getContext('2d');
        sctx.drawImage(img, 0, 0, 50, 50);
        const d = sctx.getImageData(0, 0, 50, 50).data;
        let r=0,g=0,b=0;
        for(let i=0;i<d.length;i+=4){ r+=d[i];g+=d[i+1];b+=d[i+2]; }
        return `#${((1<<24)+(Math.floor(r/2500)<<16)+(Math.floor(g/2500)<<8)+Math.floor(b/2500)).toString(16).slice(1)}`;
    } catch(e) { return '#FFACD1'; }
};

module.exports = { generateProfileCard, getDominantColor };