const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const { lightenColor } = require('../config/colorConfig');

const CARD_WIDTH = 930;
const CARD_HEIGHT = 350;

/**
 * Helper: Draws a rounded rectangle path
 */
const drawRoundedRect = (ctx, x, y, width, height, radius) => {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.closePath();
};

const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
};

const getContrastColor = (hex) => {
    const { r, g, b } = hexToRgb(hex);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return yiq >= 128 ? '#101015' : '#FFFFFF';
};

/**
 * Helper: Formats numbers for display (e.g., 1200 -> 1.2k)
 */
const formatStat = (num) => {
    const n = parseFloat(num) || 0;
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return n.toString();
};

const generateProfileCard = async (discordUser, userData, favorites, backgroundUrl = null, primaryColor = '#FFACD1', displayName = null) => {
    // Setup Canvas with 2x Scale for crispness
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
    const TEXT_COLOR = lightenColor(THEME_COLOR, 40);

    // --- PREMIUM LOGIC ---
    const isCustom = !!backgroundUrl;

    // --- 1. ATMOSPHERIC BACKGROUND ---
    ctx.save();
    ctx.fillStyle = '#08080c';
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    try {
        let bgImg;
        if (backgroundUrl) {
            bgImg = await loadImage(backgroundUrl);
        } else {
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
            // Unblurred for Custom
            ctx.drawImage(bgImg, x, y, bgImg.width * ratio, bgImg.height * ratio);

            // Subtle Darken Overlay for readability
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
        } else {
            // Blurred for Default
            ctx.filter = 'blur(25px) brightness(0.25) saturate(1.2)';
            ctx.drawImage(bgImg, x, y, bgImg.width * ratio, bgImg.height * ratio);
            ctx.filter = 'none';
        }
    } catch (e) {
        ctx.fillStyle = '#101015';
        ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    }
    ctx.restore();

    // --- 2. THREE ISLAND SYSTEM ---
    const islands = [
        { x: 25, y: 25, w: 275, h: 300 }, // Island 1: Identity Core
        { x: 320, y: 25, w: 290, h: 300 }, // Island 2: Archive Stats
        { x: 630, y: 25, w: 275, h: 300 }  // Island 3: Collection Stack
    ];

    const { r, g, b } = hexToRgb(THEME_COLOR);
    const glassBase = `rgba(${Math.floor(r * 0.25)}, ${Math.floor(g * 0.25)}, ${Math.floor(b * 0.25)}, 0.85)`;

    islands.forEach(is => {
        ctx.save();
        if (isCustom) {
            // Glass Look (Dynamic Tint)
            ctx.fillStyle = glassBase;
            ctx.shadowColor = `rgba(${r},${g},${b},0.3)`;
            ctx.shadowBlur = 10;
        } else {
            ctx.fillStyle = 'rgba(12, 12, 18, 0.9)'; // High contrast
        }

        drawRoundedRect(ctx, is.x, is.y, is.w, is.h, 24);
        ctx.fill();

        if (isCustom) {
            // Glass Border
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.lineWidth = 1;
            ctx.stroke();
        } else {
            ctx.strokeStyle = THEME_COLOR;
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.15;
            ctx.stroke();
        }
        ctx.restore();
    });

    // ... (Texture overlay skipped for clarity/performance in premium?)
    // Keep it subtle
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

    // --- 4. ISLAND 1: IDENTITY CORE ---
    const island1 = islands[0];
    const avR = 60;
    const centerX = island1.x + island1.w / 2;
    const avY = island1.y + 88;

    // Avatar Logic
    let avatarUrl = discordUser.displayAvatarURL({ extension: 'png', size: 1024 }); // Default

    // Determine proper avatar
    if (userData.avatarConfig) {
        const { source, customUrl, anilistAvatar } = userData.avatarConfig;

        if (source === 'CUSTOM' && customUrl) {
            avatarUrl = customUrl;
        } else if (source === 'ANILIST' && anilistAvatar) {
            avatarUrl = anilistAvatar;
        } else if (source === 'DISCORD_GUILD') {
            // We need a member object for this, assume passed in logic or fallback
            // We will handle this by checking if the caller passed a 'guildAvatarUrl'.
            if (userData.guildAvatarUrl) avatarUrl = userData.guildAvatarUrl;
        }
    }

    try {
        const avatar = await loadImage(avatarUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, avY, avR, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, centerX - avR, avY - avR, avR * 2, avR * 2);
        ctx.restore();

        // Ring
        ctx.strokeStyle = THEME_COLOR;
        ctx.lineWidth = 4;
        ctx.shadowColor = THEME_COLOR;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(centerX, avY, avR + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    } catch (e) { }

    // Rank Ribbon
    const rankY = avY + avR - 10;
    const ribW = 120;
    const ribH = 24;

    // Pill Logic
    ctx.fillStyle = THEME_COLOR;
    ctx.beginPath();
    ctx.roundRect(centerX - ribW / 2, rankY, ribW, ribH, 12);
    ctx.fill();

    ctx.fillStyle = getContrastColor(THEME_COLOR); // Dynamic Text
    ctx.textAlign = 'center';
    ctx.font = '900 13px sans-serif';
    ctx.fillText(`RANK #${userData.rank || '1'}`, centerX, rankY + 17);

    // USERNAME
    const nameText = (displayName || discordUser.username).toUpperCase();

    if (isCustom) {
        // Clear shadow for clean look
        ctx.shadowColor = 'transparent';
    } else {
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
    }

    ctx.fillStyle = '#FFFFFF';
    const nameFontSize = fitText(ctx, nameText, island1.w - 40, 32);
    ctx.font = `900 ${nameFontSize}px sans-serif`;
    ctx.fillText(nameText, centerX, avY + avR + 55);

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // TITLE
    const getTitleColor = (t) => {
        // Force White if Custom Background for Better Visibility
        if (isCustom) return '#FFFFFF';

        const title = (t || '').toUpperCase();
        if (title === 'GRAND LIBRARIAN') return '#FFD700';
        if (title === 'ARCHIVIST') return '#C0C0C0';
        if (title === 'MUSE') return '#FFACD1';
        if (title === 'MUSE READER') return '#FFFFFF';
        return TEXT_COLOR;
    };

    ctx.fillStyle = getTitleColor(userData.title);

    if (isCustom) {
        // Pill for Title
        ctx.font = 'bold 12px sans-serif';
        const tW = ctx.measureText((userData.title || 'MUSE READER').toUpperCase()).width + 20;
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; // Darker pill for contrast
        ctx.beginPath();
        ctx.roundRect(centerX - tW / 2, avY + avR + 64, tW, 20, 10);
        ctx.fill();

        ctx.fillStyle = '#FFFFFF'; // Always White
        ctx.fillText((userData.title || 'MUSE READER').toUpperCase(), centerX, avY + avR + 78);
    } else {
        ctx.font = 'bold 12px sans-serif';
        ctx.letterSpacing = '3px';
        ctx.fillText((userData.title || 'MUSE READER').toUpperCase(), centerX, avY + avR + 75);
    }

    // LEVEL HUB
    const barW = 210;
    const barH = 8;
    const barX = centerX - barW / 2;
    const barY = island1.y + 276;

    ctx.letterSpacing = '0px';
    ctx.textAlign = 'left';
    ctx.font = '900 24px sans-serif';
    ctx.fillStyle = '#FFF';
    ctx.fillText(`LVL ${userData.level || 0}`, barX, barY - 18);

    ctx.textAlign = 'right';
    ctx.font = '600 13px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`${formatStat(userData.current)} / ${formatStat(userData.required)} XP`, barX + barW, barY - 18);

    // Progress Bar
    drawRoundedRect(ctx, barX, barY, barW, barH, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fill();
    const progress = Math.min(1, (userData.current / (userData.required || 1)));
    if (progress > 0) {
        const fillW = barW * progress;
        drawRoundedRect(ctx, barX, barY, fillW, barH, 4);
        ctx.fillStyle = THEME_COLOR;
        ctx.shadowColor = THEME_COLOR;
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.shadowBlur = 0;

        if (!isCustom) {
            // Spark Effect
            ctx.save();
            ctx.shadowColor = '#FFF';
            ctx.shadowBlur = 20;
            ctx.fillStyle = '#FFF';
            drawRoundedRect(ctx, barX + fillW - 2, barY - 2, 2, barH + 4, 1);
            ctx.fill();
            ctx.restore();
        }
    }

    // --- 5. ISLAND 2: THE ARCHIVES ---
    const island2 = islands[1];
    const midX = island2.x + island2.w / 2;
    const leftX = island2.x + 35;

    // Center divider
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.moveTo(leftX, island2.y + 150);
    ctx.lineTo(island2.x + island2.w - 35, island2.y + 150);
    ctx.stroke();

    const drawStatRow = (label, value, y, color = '#FFF') => {
        // Label
        ctx.textAlign = 'left';
        ctx.font = '900 10px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.45)'; // Lighter for readability on custom
        ctx.letterSpacing = '1px';
        ctx.fillText(label.toUpperCase(), leftX, y);

        // Value
        ctx.textAlign = 'right';
        ctx.font = '900 15px sans-serif';
        ctx.fillStyle = color;
        ctx.letterSpacing = '0px';

        if (isCustom) {
            ctx.shadowColor = 'rgba(0,0,0,0.9)';
            ctx.shadowBlur = 5;
        }

        ctx.fillText(value, island2.x + island2.w - 35, y + 2);

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
    };

    // MUSE ARCHIVE
    ctx.textAlign = 'center';

    const pillColor = `rgba(${Math.floor(r * 0.15)}, ${Math.floor(g * 0.15)}, ${Math.floor(b * 0.15)}, 0.8)`;

    if (isCustom) {
        // Pill for Header (Expanded)
        const hText = 'MUSE ARCHIVE';
        ctx.font = '900 10px sans-serif';
        const hW = ctx.measureText(hText).width + 60; // Wider padding

        ctx.save();
        ctx.fillStyle = pillColor;
        ctx.beginPath();
        ctx.roundRect(midX - hW / 2, island2.y + 21, hW, 26, 13);
        ctx.fill();
        ctx.restore();
    }

    ctx.font = '900 10px sans-serif';
    ctx.fillStyle = TEXT_COLOR;
    ctx.globalAlpha = isCustom ? 1.0 : 0.8;
    ctx.letterSpacing = '4px';
    ctx.fillText('MUSE ARCHIVE', midX, island2.y + 38);
    ctx.globalAlpha = 1.0;

    drawStatRow('Joined Library', userData.joinedDate || 'Dec 2024', island2.y + 68);
    drawStatRow('Messages Archive', formatStat(userData.messages || 0), island2.y + 98);
    drawStatRow('Knowledge Status', userData.knowledgeRank || 'Novice', island2.y + 128, TEXT_COLOR);

    // ANIME ARCHIVE
    if (isCustom) {
        const hText = 'ANIME ARCHIVE';
        ctx.font = '900 10px sans-serif';
        const hW = ctx.measureText(hText).width + 60;

        ctx.save();
        ctx.fillStyle = pillColor;
        ctx.beginPath();
        ctx.roundRect(midX - hW / 2, island2.y + 155, hW, 26, 13);
        ctx.fill();
        ctx.restore();
    }

    ctx.textAlign = 'center';
    ctx.font = '900 10px sans-serif';
    ctx.fillStyle = TEXT_COLOR;
    ctx.globalAlpha = isCustom ? 1.0 : 0.8;
    ctx.letterSpacing = '4px';
    ctx.fillText('ANIME ARCHIVE', midX, island2.y + 172);
    ctx.globalAlpha = 1.0;

    const ani = userData.anilist || {};
    const stats = ani.stats || ani;
    const isLinked = userData.anilist_synced;

    if (isLinked) {
        drawStatRow('Titles Finished', stats.completed || 0, island2.y + 202);
        drawStatRow('Watch Records', `${stats.days || '0.0'} Days`, island2.y + 232);
        drawStatRow('Critical Mean', `${stats.meanScore || 0}%`, island2.y + 262, isCustom ? '#FFFFFF' : TEXT_COLOR);
    } else {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = 'italic 14px sans-serif';
        ctx.letterSpacing = '0px';
        ctx.fillText('Archives not synchronized', midX, island2.y + 225);
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText('Use /link to connect your AniList account', midX, island2.y + 245);
    }

    // --- 5. ISLAND 3: THE COLLECTION DECK ---
    const island3 = islands[2];
    const cardW = 165;
    const cardH = 245;
    const stackX = island3.x + island3.w / 2;
    const stackY = island3.y + island3.h / 2;
    const displayFavs = favorites.slice(0, 3);

    if (displayFavs.length === 0) {
        // --- NO FAVORITES STATE ---
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = '900 12px sans-serif';
        ctx.letterSpacing = '2px';
        ctx.fillText('NO FAVORITES FOUND', stackX, stackY - 15);

        ctx.font = '11px sans-serif';
        ctx.letterSpacing = '0px';
        ctx.fillText('Link AniList or use /favorite add', stackX, stackY + 10);
        ctx.fillText('to display your collection here.', stackX, stackY + 26);
    } else {
        const drawOrder = [2, 1, 0];
        for (const idx of drawOrder) {
            const fav = displayFavs[idx];
            if (!fav) continue;

            const offset = idx * 22;
            const rotation = idx * 9;

            ctx.save();
            ctx.translate(stackX + offset - 25, stackY);
            ctx.rotate((rotation * Math.PI) / 180);

            ctx.shadowColor = 'rgba(0,0,0,1)';
            ctx.shadowBlur = idx === 0 ? 40 : 12;
            if (idx === 0) {
                ctx.strokeStyle = THEME_COLOR;
                ctx.lineWidth = 1;
            }

            drawRoundedRect(ctx, -cardW / 2, -cardH / 2, cardW, cardH, 20);
            ctx.fillStyle = '#0f0f15';
            ctx.fill();
            if (idx === 0) ctx.stroke();

            try {
                const url = fav.coverImage?.extraLarge || fav.coverImage?.large;
                if (url) {
                    const img = await loadImage(url);
                    ctx.clip();
                    ctx.drawImage(img, -cardW / 2, -cardH / 2, cardW, cardH);
                }
            } catch (e) { }
            ctx.restore();
        }
    }

    return await canvas.toBuffer('image/png');
};

const getDominantColor = async (imageUrl) => {
    try {
        const img = await loadImage(imageUrl);
        const smallCanvas = createCanvas(50, 50);
        const ctx = smallCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 50, 50);

        const imageData = ctx.getImageData(0, 0, 50, 50).data;
        let r = 0, g = 0, b = 0, count = 0;

        for (let i = 0; i < imageData.length; i += 4) {
            r += imageData[i];
            g += imageData[i + 1];
            b += imageData[i + 2];
            count++;
        }

        r = Math.floor(r / count);
        g = Math.floor(g / count);
        b = Math.floor(b / count);

        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    } catch (e) {
        return '#FFACD1'; // Fallback
    }
};

module.exports = { generateProfileCard, getDominantColor };