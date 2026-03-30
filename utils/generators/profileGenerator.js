const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');

// --- VERTICAL WIDGET ARCHITECTURE (V5: The Premium Polish) ---
const CARD_WIDTH = 400;
const CARD_HEIGHT_LINKED = 495;
const CARD_HEIGHT_UNLINKED = 355;

// Universal premium font stack
const FONT_STACK = "'-apple-system', 'Helvetica Neue', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const formatStat = (num) => {
    const n = parseFloat(num) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    return n.toLocaleString();
};

const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const generateProfileCard = async (discordUser, userData, favorites, backgroundUrl = null, primaryColor = '#3B82F6', displayName = null, onBackgroundFailure = null) => {
    const isCompact = !userData.anilist_synced;
    const CARD_HEIGHT = isCompact ? CARD_HEIGHT_UNLINKED : CARD_HEIGHT_LINKED;

    const SCALE = 3; // Ultra High-Definition Rendering
    const canvas = createCanvas(Math.floor(CARD_WIDTH * SCALE), Math.floor(CARD_HEIGHT * SCALE));
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    // Premium Rendering Settings
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const TEXT_MAIN = '#FFFFFF';
    const TEXT_SUB = '#A1A1AA';
    const THEME_COLOR = primaryColor || '#3B82F6';

    ctx.clearRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    try {
        // --- 1. AMBIENT BACKGROUND SYSTEM ---
        let bgImg;
        try { if (backgroundUrl) bgImg = await loadImage(backgroundUrl); }
        catch (e) { if (onBackgroundFailure) onBackgroundFailure(backgroundUrl); }
        if (!bgImg) { try { bgImg = await loadImage(path.join(__dirname, 'images', 'profile_background_default.png')); } catch (e) { } }

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 20;
        ctx.beginPath(); ctx.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, 40);
        ctx.fillStyle = '#09090B'; ctx.fill();
        ctx.shadowColor = 'transparent'; ctx.clip();

        if (bgImg) {
            ctx.filter = 'blur(60px) brightness(0.35) saturate(1.5)';
            ctx.drawImage(bgImg, -100, -100, CARD_WIDTH + 200, CARD_HEIGHT + 200);
            ctx.filter = 'none';
        }

        const vignette = ctx.createLinearGradient(0, 0, 0, CARD_HEIGHT);
        vignette.addColorStop(0, 'rgba(0, 0, 0, 0.1)'); vignette.addColorStop(1, 'rgba(0, 0, 0, 0.75)');
        ctx.fillStyle = vignette; ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

        const cardBorderGrad = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
        cardBorderGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
        cardBorderGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)');
        cardBorderGrad.addColorStop(1, hexToRgba(THEME_COLOR, 0.15));
        ctx.strokeStyle = cardBorderGrad; ctx.lineWidth = 1.5; ctx.strokeRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
        ctx.restore();

        // --- 2. CRISP TOP BANNER (High Immersion) ---
        const bannerX = 10, bannerY = 10, bannerW = 380, bannerH = 160, bannerR = 28;
        if (bgImg) {
            ctx.save(); ctx.beginPath(); ctx.roundRect(bannerX, bannerY, bannerW, bannerH, bannerR); ctx.clip();
            const ratio = Math.max(bannerW / bgImg.width, bannerH / bgImg.height);
            const bgW = bgImg.width * ratio, bgH = bgImg.height * ratio;
            ctx.drawImage(bgImg, bannerX + (bannerW - bgW) / 2, bannerY + (bannerH - bgH) / 2, bgW, bgH);

            const fade = ctx.createLinearGradient(0, bannerY + bannerH - 40, 0, bannerY + bannerH);
            fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,0.6)');
            ctx.fillStyle = fade; ctx.fillRect(bannerX, bannerY, bannerW, bannerH);
            ctx.restore();
        }

        // --- 3. NEON AVATAR CUTOUT (Submerged) ---
        const avX = 64, avY = 150, avR = 36; // Brought significantly more into the banner
        ctx.beginPath(); ctx.arc(avX, avY, avR + 2, 0, Math.PI * 2);
        ctx.shadowColor = THEME_COLOR; ctx.shadowBlur = 25; ctx.fillStyle = THEME_COLOR; ctx.fill();
        ctx.shadowColor = 'transparent';

        ctx.beginPath(); ctx.arc(avX, avY, avR + 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 15, 20, 0.9)'; ctx.fill();

        let avatarUrl = discordUser.displayAvatarURL({ extension: 'png', size: 1024 });
        if (userData.avatarConfig?.source === 'CUSTOM' && userData.avatarConfig.customUrl) avatarUrl = userData.avatarConfig.customUrl;
        try {
            const avatar = await loadImage(avatarUrl);
            ctx.save(); ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(avatar, avX - avR, avY - avR, avR * 2, avR * 2); ctx.restore();
        } catch (e) { }

        // --- 4. IDENTITY CLUSTER (Left) ---
        const nameY = 225;
        const nameText = (displayName || discordUser.username).length > 20 ? (displayName || discordUser.username).substring(0, 20) + '...' : (displayName || discordUser.username);

        ctx.fillStyle = TEXT_MAIN;
        ctx.font = `800 28px ${FONT_STACK}`; // Heavier, premium font weight
        const nameWidth = ctx.measureText(nameText).width;

        ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 15;
        ctx.fillText(nameText, 20, nameY); 
        ctx.shadowColor = 'transparent';

        // Refined Title Badge (Adaptive Alignment)
        const titleText = (userData.title || 'MUSE READER').toUpperCase();
        ctx.font = `600 11px ${FONT_STACK}`; ctx.letterSpacing = '1px';
        
        const tagW = ctx.measureText(titleText).width + 36, tagH = 26;
        const tagX = isCompact ? (20 + nameWidth + 14) : 20;
        const tagY = isCompact ? (nameY - 21) : (nameY + 12);

        ctx.beginPath(); ctx.roundRect(tagX, tagY, tagW, tagH, tagH / 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'; ctx.fill(); // Frosted light pill
        const tagBorderGrad = ctx.createLinearGradient(tagX, tagY, tagX, tagY + tagH);
        tagBorderGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
        tagBorderGrad.addColorStop(1, hexToRgba(THEME_COLOR, 0.15));
        ctx.strokeStyle = tagBorderGrad; ctx.lineWidth = 1; ctx.stroke();

        const rankColor = userData.rankColor || THEME_COLOR;
        ctx.beginPath(); ctx.arc(tagX + 14, tagY + tagH / 2, 4, 0, Math.PI * 2);
        ctx.fillStyle = rankColor; ctx.shadowColor = rankColor; ctx.shadowBlur = 8; ctx.fill();
        ctx.shadowBlur = 0;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'; ctx.textAlign = 'left';
        ctx.fillText(titleText, tagX + 24, tagY + 17);
        ctx.letterSpacing = '0px';

        // --- 5. DYNAMIC MEMBERSHIP BADGE (Right) ---
        const isBooster = userData.is_booster || false;
        const isPremium = (userData.is_premium || userData.premium || false) && !isBooster;
        const pillR = 21, pillX = 380 - pillR * 2, pillY = nameY - 36;

        ctx.save();
        ctx.beginPath(); ctx.arc(pillX + pillR, pillY + pillR, pillR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'; ctx.fill(); // Glass base
        
        const pillGrad = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillR * 2);
        if (isBooster) {
            pillGrad.addColorStop(0, '#C084FC'); pillGrad.addColorStop(1, '#7C3AED'); // Sacred Purple
            ctx.strokeStyle = pillGrad; ctx.lineWidth = 2.2; ctx.stroke();
            ctx.shadowColor = 'rgba(124, 58, 237, 0.8)'; ctx.shadowBlur = 16;
        } else if (isPremium) {
            pillGrad.addColorStop(0, '#F5D17E'); pillGrad.addColorStop(1, '#AA812A'); // Premium Gold
            ctx.strokeStyle = pillGrad; ctx.lineWidth = 1.8; ctx.stroke();
            ctx.shadowColor = 'rgba(170, 129, 42, 0.6)'; ctx.shadowBlur = 12;
        } else {
            pillGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)'); pillGrad.addColorStop(1, hexToRgba(THEME_COLOR, 0.1));
            ctx.strokeStyle = pillGrad; ctx.lineWidth = 1.2; ctx.stroke();
        }

        // Draw Dynamic Book Icon
        const bx = pillX + pillR - 10, by = pillY + pillR - 8.5, bw = 20, bh = 17;
        const iconColor = isBooster ? '#E9D5FF' : (isPremium ? '#F5D17E' : THEME_COLOR);
        
        ctx.strokeStyle = iconColor;
        ctx.lineWidth = (isBooster || isPremium) ? 2.2 : 1.8;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';

        // Base Book Geometry
        ctx.beginPath();
        ctx.moveTo(bx + bw / 2, by); ctx.lineTo(bx + bw / 2, by + bh); // Spine
        ctx.moveTo(bx + bw / 2, by); 
        ctx.quadraticCurveTo(bx + bw * 0.75, by - 2, bx + bw, by + 1.5); ctx.lineTo(bx + bw, by + bh - 3.5); ctx.quadraticCurveTo(bx + bw * 0.75, by + bh - 7, bx + bw / 2, by + bh);
        ctx.moveTo(bx + bw / 2, by);
        ctx.quadraticCurveTo(bx + bw * 0.25, by - 2, bx, by + 1.5); ctx.lineTo(bx, by + bh - 3.5); ctx.quadraticCurveTo(bx + bw * 0.25, by + bh - 7, bx + bw / 2, by + bh);
        ctx.stroke();

        if (isBooster || isPremium) {
            // Extra "Detailed" pages
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(bx + bw * 0.7, by + 4); ctx.lineTo(bx + bw * 0.9, by + 4);
            ctx.moveTo(bx + bw * 0.7, by + 7.5); ctx.lineTo(bx + bw * 0.9, by + 7.5);
            ctx.moveTo(bx + bw * 0.3, by + 4); ctx.lineTo(bx + bw * 0.1, by + 4);
            ctx.moveTo(bx + bw * 0.3, by + 7.5); ctx.lineTo(bx + bw * 0.1, by + 7.5);
            
            if (isBooster) {
                // Tier 3: Sacred Muse Ultra-Details
                ctx.moveTo(bx + bw * 0.7, by + 11); ctx.lineTo(bx + bw * 0.9, by + 11);
                ctx.moveTo(bx + bw * 0.3, by + 11); ctx.lineTo(bx + bw * 0.1, by + 11);
                
                // 1. Mystical Bookmark
                ctx.moveTo(bx + bw * 0.6, by + bh - 1);
                ctx.quadraticCurveTo(bx + bw * 0.65, by + bh + 4, bx + bw * 0.55, by + bh + 6);
                
                // 2. Cover "Spark" Symbol
                ctx.stroke();
                ctx.beginPath(); ctx.arc(bx + bw * 0.25, by + bh / 2, 0.8, 0, Math.PI * 2);
                ctx.arc(bx + bw * 0.75, by + bh / 2, 0.8, 0, Math.PI * 2);
                ctx.fillStyle = '#FFF'; ctx.fill();

                // 3. Crystalline Aura Ring (Inner)
                ctx.beginPath(); ctx.arc(pillX + pillR, pillY + pillR, pillR - 4, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'; ctx.lineWidth = 0.5; ctx.stroke();
                
                // Glowing Spine dot
                ctx.beginPath(); ctx.arc(bx + bw/2, by + 2, 1.2, 0, Math.PI * 2);
                ctx.fillStyle = '#FFF'; ctx.fill();
            } else {
                ctx.stroke();
            }
        }
        ctx.restore();

        // --- 6. V5 WIDGETS: REFINED APP NODES ---
        const statY = 285; // Shifted down for vertical header stack
        const statW = 110, statH = 88, statGap = 15;
        const stats = userData.anilist || {};

        const drawStatNode = (x, hexColor, value, label, phaseOffset, drawIconLogic) => {
            ctx.save();
            // Deep Glass Base
            ctx.beginPath(); ctx.roundRect(x, statY, statW, statH, 20);

            const cardGrad = ctx.createLinearGradient(x, statY, x, statY + statH);
            cardGrad.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
            cardGrad.addColorStop(1, 'rgba(0, 0, 0, 0.2)');
            ctx.fillStyle = cardGrad; ctx.fill();

            const nodeBorderGrad = ctx.createLinearGradient(x, statY, x, statY + statH);
            nodeBorderGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
            nodeBorderGrad.addColorStop(1, hexToRgba(hexColor, 0.25));
            ctx.strokeStyle = nodeBorderGrad; ctx.lineWidth = 1; ctx.stroke();
            ctx.beginPath(); ctx.roundRect(x, statY, statW, statH, 20); ctx.clip();

            // Liquid Sine Wave
            ctx.beginPath(); ctx.moveTo(x, statY + statH);
            for (let i = 0; i <= statW; i += 3) {
                let waveY = statY + statH - 16 + Math.sin((i * 0.05) + phaseOffset) * 8;
                ctx.lineTo(x + i, waveY);
            }
            ctx.lineTo(x + statW, statY + statH); ctx.closePath();

            const waveGrad = ctx.createLinearGradient(0, statY + statH - 35, 0, statY + statH);
            waveGrad.addColorStop(0, 'rgba(0,0,0,0)'); waveGrad.addColorStop(1, hexToRgba(hexColor, 0.45));
            ctx.fillStyle = waveGrad; ctx.fill();
            ctx.strokeStyle = hexColor; ctx.lineWidth = 1.5; ctx.shadowColor = hexColor; ctx.shadowBlur = 10; ctx.stroke();
            ctx.restore();

            // Premium Frosted Icon Container
            const ix = x + 14, iy = statY + 14, iSize = 28;
            ctx.beginPath(); ctx.roundRect(ix, iy, iSize, iSize, 10);
            const iconBgGrad = ctx.createLinearGradient(ix, iy, ix, iy + iSize);
            iconBgGrad.addColorStop(0, hexToRgba(hexColor, 0.25));
            iconBgGrad.addColorStop(1, hexToRgba(hexColor, 0.05));
            ctx.fillStyle = iconBgGrad; ctx.fill();
            const iconBorderGrad = ctx.createLinearGradient(ix, iy, ix, iy + iSize);
            iconBorderGrad.addColorStop(0, hexToRgba(hexColor, 0.4));
            iconBorderGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.strokeStyle = iconBorderGrad; ctx.lineWidth = 1; ctx.stroke();

            // Draw Vector Icon
            ctx.save();
            ctx.strokeStyle = hexColor; ctx.fillStyle = hexColor;
            ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            drawIconLogic(ix, iy);
            ctx.restore();

            // Labels & Data
            ctx.fillStyle = TEXT_SUB; ctx.font = `600 10px ${FONT_STACK}`; ctx.textAlign = 'right';
            ctx.fillText(label.toUpperCase(), x + statW - 14, statY + 32);

            ctx.fillStyle = '#FFFFFF'; ctx.font = `800 26px ${FONT_STACK}`; ctx.textAlign = 'left';
            ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 8; // Punchy numbers
            ctx.fillText(value, x + 14, statY + 74);
            ctx.shadowBlur = 0; // reset
        };

        const drawAnimeIcon = (ix, iy) => {
            ctx.beginPath(); ctx.roundRect(ix + 6, iy + 7, 16, 12, 3); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(ix + 12, iy + 10); ctx.lineTo(ix + 17, iy + 13); ctx.lineTo(ix + 12, iy + 16); ctx.fill();
        };

        const drawMangaIcon = (ix, iy) => {
            ctx.lineWidth = 1.5;
            // Stack of Three Manga Volumes (representing collection)
            for (let i = 0; i < 3; i++) {
                const oy = 7 + i * 4.5;
                ctx.save();
                if (i > 0) { ctx.fillStyle = '#050505'; ctx.beginPath(); ctx.roundRect(ix + 7, iy + oy, 14, 4.5, 1); ctx.fill(); }
                ctx.beginPath(); ctx.roundRect(ix + 7, iy + oy, 14, 4.5, 1); ctx.stroke();
                ctx.restore();
            }
        };

        const drawDaysIcon = (ix, iy) => {
            ctx.beginPath(); ctx.arc(ix + 14, iy + 14, 7, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(ix + 14, iy + 10); ctx.lineTo(ix + 14, iy + 14); ctx.lineTo(ix + 17, iy + 16); ctx.stroke();
        };

        if (userData.anilist_synced) {
            drawStatNode(20, THEME_COLOR, formatStat(stats.completed || 0), 'Anime', 0, drawAnimeIcon);
            drawStatNode(20 + statW + statGap, '#FBBF24', formatStat(stats.manga_completed || 0), 'Manga', 2, drawMangaIcon);
            drawStatNode(20 + (statW + statGap) * 2, '#10B981', formatStat(stats.days || 0), 'Days', 4, drawDaysIcon);
            
            // Maintenance Guard Overlay (Clinical UI)
            if (userData.anilist_maintenance) {
                const hudX = 20, hudY = statY, hudW = CARD_WIDTH - 40, hudH = statH;
                ctx.save();
                ctx.beginPath(); ctx.roundRect(hudX, hudY, hudW, hudH, 20); ctx.clip();
                
                // Frosted Dark Filter
                ctx.fillStyle = 'rgba(9, 9, 11, 0.75)'; ctx.fillRect(hudX, hudY, hudW, hudH);
                
                // Warning Notification
                ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF';
                ctx.font = `800 13px ${FONT_STACK}`; ctx.letterSpacing = '1px';
                ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 10;
                ctx.fillText('ANILIST API CURRENTLY OFFLINE', hudX + hudW / 2, hudY + hudH / 2 + 5);
                ctx.restore();
            }
        }

        // --- 7. PROGRESSION TERMINAL (Hyper-Premium HUD) ---
        const termY = isCompact ? 255 : 395;
        const termH = 80;

        ctx.save();
        ctx.beginPath(); ctx.roundRect(20, termY, CARD_WIDTH - 40, termH, 22);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)'; ctx.fill();
        const termBorderGrad = ctx.createLinearGradient(20, termY, 20, termY + termH);
        termBorderGrad.addColorStop(0, 'rgba(255,255,255,0.1)');
        termBorderGrad.addColorStop(1, 'rgba(255,255,255,0.02)');
        ctx.strokeStyle = termBorderGrad; ctx.lineWidth = 1; ctx.stroke();

        // Level Ring: Nested Automotive Design
        const ringX = 55, ringY = termY + termH / 2, ringR = 21;
        const currentXP = userData.current || 0, requiredXP = userData.required || 1;
        const levelPercent = Math.min(1, currentXP / requiredXP);
        
        ctx.beginPath(); ctx.arc(ringX, ringY, ringR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill(); // Deep core
        
        const ringGrad = ctx.createLinearGradient(ringX - ringR, ringY - ringR, ringX + ringR, ringY + ringR);
        ringGrad.addColorStop(0, THEME_COLOR); ringGrad.addColorStop(1, hexToRgba(THEME_COLOR, 0.1));
        ctx.strokeStyle = ringGrad; ctx.lineWidth = 3; ctx.stroke();
        
        // Dynamic Outer Progress Arc
        ctx.beginPath(); ctx.arc(ringX, ringY, ringR, -Math.PI / 2, (Math.PI * 2 * levelPercent) - Math.PI / 2);
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();

        ctx.fillStyle = '#FFFFFF'; ctx.font = `800 16px ${FONT_STACK}`; ctx.textAlign = 'center';
        ctx.fillText(userData.level || '0', ringX, ringY + 6);

        // Bar Metadata
        const barX = 95, barW = CARD_WIDTH - barX - 35, barY = termY + 46, barH = 10, barR = 5;
        
        ctx.textAlign = 'left';
        ctx.fillStyle = TEXT_SUB; ctx.font = `700 10px ${FONT_STACK}`; ctx.letterSpacing = '1.8px';
        ctx.fillText('EXPERIENCE', barX, termY + 28);
        ctx.letterSpacing = '0px';

        ctx.textAlign = 'right';
        ctx.font = `800 12px ${FONT_STACK}`; ctx.fillStyle = '#FFFFFF';
        const xpText = `${formatStat(userData.current)} / ${formatStat(userData.required)} XP`;
        ctx.fillText(xpText.toUpperCase(), barX + barW, termY + 28);

        // Heavy-Duty Progress Bar Tracks
        ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, barR);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();

        // The Progress Fill
        if (levelPercent > 0) {
            const fillWidth = Math.max(barR * 2, levelPercent * barW);
            ctx.save();
            ctx.beginPath(); ctx.roundRect(barX, barY, fillWidth, barH, barR); ctx.clip();
            
            const activeGrad = ctx.createLinearGradient(barX, barY, barX + fillWidth, barY);
            activeGrad.addColorStop(0, hexToRgba(THEME_COLOR, 0.6));
            activeGrad.addColorStop(0.85, THEME_COLOR);
            activeGrad.addColorStop(1, '#FFFFFF'); // Sharp Tip
            
            ctx.fillStyle = activeGrad;
            ctx.shadowColor = THEME_COLOR; ctx.shadowBlur = 15;
            ctx.fill();
            
            // Specular Reflection (Top highlight)
            ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(barX + barR, barY + 2); ctx.lineTo(barX + fillWidth - barR, barY + 2); ctx.stroke();
            ctx.restore();
        }

        ctx.restore();

    } catch (err) { console.error('Canvas Generation Error:', err); }

    return await canvas.encode('png');
};

const getDominantColor = async (imageUrl) => { return '#3B82F6'; };
module.exports = { generateProfileCard, getDominantColor };