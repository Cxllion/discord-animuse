const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { generateColorTokens, parseMetadata } = require('../core/visualUtils');
const CONFIG = require('../config');

/**
 * ACTIVITY NOTIFICATION GENERATOR - V4 (Compact Edition)
 * Canvas: 900x300 base (2x SCALE = 1800x600 output for HD quality)
 * All elements are grouped into self-contained blocks for layout precision.
 */
const generateActivityCard = async (userMeta, activityData) => {
    const SCALE = 2.5;
    const baseW = 900;
    const baseH = 300;
    const width = baseW * SCALE;
    const height = baseH * SCALE;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);
    
    // Maximize interpolation quality
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const media = activityData.media || {};
    const tokens = generateColorTokens(media.coverImage?.color || userMeta.themeColor || CONFIG.COLORS.PRIMARY);

    // Vector Helper: Draws a crisp, scaled star
    const drawStar = (ctx, x, y, size, fill) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            ctx.lineTo(Math.cos((18 + i * 72) / 180 * Math.PI) * size, -Math.sin((18 + i * 72) / 180 * Math.PI) * size);
            ctx.lineTo(Math.cos((54 + i * 72) / 180 * Math.PI) * (size * 0.5), -Math.sin((54 + i * 72) / 180 * Math.PI) * (size * 0.5));
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fill();
        if (fill > 0) {
            ctx.save();
            ctx.clip();
            const g = ctx.createLinearGradient(0, -size, 0, size);
            g.addColorStop(0, '#FFF');
            g.addColorStop(1, tokens.primary);
            ctx.fillStyle = g;
            ctx.fillRect(-size, -size, size * 2 * fill, size * 2);
            ctx.restore();
        }
        ctx.restore();
    };

    // ─── 1. CANVAS BOUNDARY ──────────────────────────────────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, baseW, baseH, 32);
    ctx.clip();
    
    // Fill background
    ctx.fillStyle = tokens.surface;
    ctx.fillRect(0, 0, baseW, baseH);

    // ─── 2. BACKGROUND ───────────────────────────────────────────────────────
    try {
        const bgUrl = media.bannerImage || media.coverImage?.extraLarge;
        if (bgUrl) {
            const bgImg = await loadImage(bgUrl);
            ctx.save();
            const scale = Math.max(baseW / bgImg.width, baseH / bgImg.height);
            const bx = (baseW - bgImg.width * scale) / 2;
            const by = (baseH - bgImg.height * scale) / 2;
            ctx.drawImage(bgImg, bx, by, bgImg.width * scale, bgImg.height * scale);
            ctx.filter = 'blur(30px) saturate(1.6)';
            ctx.globalAlpha = 0.55;
            ctx.drawImage(bgImg, 0, 0, baseW, baseH);
            ctx.filter = 'none';
            ctx.globalAlpha = 1.0;
            const veil = ctx.createLinearGradient(0, 0, 0, baseH);
            veil.addColorStop(0, 'rgba(0,0,0,0.25)');
            veil.addColorStop(0.5, 'rgba(0,0,0,0.65)');
            veil.addColorStop(1, tokens.surface);
            ctx.fillStyle = veil;
            ctx.fillRect(0, 0, baseW, baseH);
            ctx.restore();
        }
    } catch (e) {}

    // Subtle accent bloom
    const g1 = ctx.createRadialGradient(baseW * 0.88, baseH * 0.1, 0, baseW * 0.88, baseH * 0.1, baseW * 0.5);
    g1.addColorStop(0, tokens.primary + '35');
    g1.addColorStop(1, 'transparent');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, baseW, baseH);

    // --- 💎 Improvement: Binge Mode Accent Glow ---
    if (activityData.bingeMode) {
        ctx.save();
        ctx.strokeStyle = tokens.primary + '30';
        ctx.lineWidth = 6;
        ctx.setLineDash([15, 8]); // Tech dash style
        ctx.roundRect(4, 4, baseW - 8, baseH - 8, 28);
        ctx.stroke();
        ctx.restore();
        
        ctx.save();
        ctx.fillStyle = tokens.primary + '20';
        ctx.font = '900 120px monalqo, sans-serif';
        ctx.letterSpacing = '20px';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.08; // Ghost text background
        ctx.fillText('BINGE', baseW / 2, baseH / 2);
        ctx.restore();
    }

    // ─── 3. POSTER ───────────────────────────────────────────────────────────
    const pH = 240;
    const pW = Math.round(pH * 0.7);
    const pX = 28;
    const pY = (baseH - pH) / 2;

    try {
        const coverUrl = media.coverImage?.extraLarge || media.coverImage?.large;
        if (coverUrl) {
            const cImg = await loadImage(coverUrl);
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.85)';
            ctx.shadowBlur = 40;
            ctx.shadowOffsetY = 10;
            ctx.beginPath();
            ctx.roundRect(pX, pY, pW, pH, 16);
            ctx.fillStyle = '#000';
            ctx.fill();
            ctx.clip();
            ctx.shadowColor = 'transparent';
            ctx.drawImage(cImg, pX, pY, pW, pH);

            // Format tag on poster
            const rawTitle = media?.title?.english || media?.title?.romaji || '';
            const { tags } = parseMetadata(rawTitle);
            if (tags && tags.length > 0) {
                let tagY = pY + 10;
                tags.slice(0, 2).forEach(tag => {
                    ctx.font = '800 11px monalqo, sans-serif';
                    ctx.letterSpacing = '1px';
                    const text = tag.toUpperCase();
                    const tw = ctx.measureText(text).width + 20;
                    const th = 22;
                    const tx = pX + pW - tw - 10;
                    ctx.save();
                    ctx.beginPath();
                    ctx.roundRect(tx, tagY, tw, th, 6);
                    ctx.fillStyle = 'rgba(0,0,0,0.55)';
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.fillStyle = '#FFF';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(text, tx + tw / 2, tagY + th / 2 + 0.5);
                    ctx.restore();
                    tagY += th + 8;
                });
            }

            ctx.strokeStyle = 'rgba(255,255,255,0.18)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        }
    } catch (e) {}

    // ─── 4. CONTENT AREA ─────────────────────────────────────────────────────
    const cX = pX + pW + 44;
    const cW = baseW - cX - 40;

    // Content shield gradient
    ctx.save();
    const shield = ctx.createLinearGradient(cX - 44, 0, baseW, 0);
    shield.addColorStop(0, 'rgba(0,0,0,0)');
    shield.addColorStop(0.25, 'rgba(0,0,0,0.45)');
    shield.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.restore();



    // ── Pre-compute Title for vertical centering ──────────────────────────────
    // ── Pre-compute Title for vertical centering ──────────────────────────────
    const rawTitle = media.title?.english || media.title?.romaji || 'Unknown Title';
    const { title: cleanTitle } = parseMetadata(rawTitle);

    // ─── 5. EPIC LAYOUT V5: PIXEL-PERFECT CENTER ───────────────────────────
    const padding = 18; 
    const avatarSize = 46; // Base avatar diameter
    const identityVisualH = 50; 
    const statsVisualH = 38;    

    const topPinY = pY + padding; 
    const bottomPinY = pY + pH - padding - statsVisualH;
    const availableMiddleH = bottomPinY - (topPinY + identityVisualH);

    // Dynamic Title Fitting Loop (V6 Elite Precision)
    let fSize = 135; 
    let lines = [];
    let lH = 0;
    let finalSpacingVal = 0;
    
    while (fSize > 18) {
        ctx.font = `900 ${fSize}px monalqo, sans-serif`;
        const spacing = fSize > 70 ? 0.4 : (fSize > 40 ? 0.8 : 1.2);
        finalSpacingVal = spacing;
        ctx.letterSpacing = `${spacing}px`;

        lines = [];
        let cur = '';
        const words = cleanTitle.split(' ');
        for (const w of words) {
            // Check if adding this word exceeds width
            if (ctx.measureText(cur + w + ' ').width > cW) {
                if (cur) {
                    lines.push(cur.trim());
                    cur = w + ' ';
                } else {
                    // Single word is too wide! Don't push yet, let the font size decrease handle it
                    cur = w + ' '; 
                }
            } else {
                cur += w + ' ';
            }
        }
        if (cur) lines.push(cur.trim());
        
        lH = fSize * 0.94; 
        const titleH = lines.length * lH;

        // Break if: 
        // 1. Fits in 3 lines or less (User requested up to 3)
        // 2. Fits within the available vertical height with a 32px safety buffer
        // 3. NO individual line is wider than the container
        if (lines.length <= 3 && titleH <= availableMiddleH - 32 && !isAnyLineTooWide) break;
        fSize -= 1;
    }

    const titleBlockH = lines.length * lH;
    // The visual center of the gap between the status pill and the rating pod
    const middleCenterY = (topPinY + identityVisualH) + (availableMiddleH / 2);
    const titleStartY = middleCenterY - (titleBlockH / 2);

    // Global assignments
    let curY = topPinY;

    // ─── BLOCK A: User Identity (Avatar + Name + Status Pill) ────────────────
    try {
        if (userMeta.avatarUrl) {
            const aImg = await loadImage(userMeta.avatarUrl);
            ctx.save();
            ctx.beginPath();
            ctx.arc(cX + avatarSize / 2, curY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(aImg, cX, curY, avatarSize, avatarSize);
            ctx.restore();
            ctx.beginPath();
            ctx.arc(cX + avatarSize / 2, curY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
            ctx.strokeStyle = '#FFF';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    } catch (e) {}

    // Score Heart Badge (overlapping avatar, top-left corner)
    const s = activityData.score;
    const userFormat = activityData.scoreFormat;

    if (s && s > 0) {
        let scoreStr = '';
        const isStar = userFormat === 'POINT_5';
        
        switch(userFormat) {
            case 'POINT_100': scoreStr = `${s}`; break;
            case 'POINT_10_DECIMAL': scoreStr = `${s}`; break;
            case 'POINT_10': scoreStr = `${s}`; break;
            case 'POINT_5': scoreStr = `${s}`; break; // Just the number, we'll draw a star icon
            case 'POINT_3':
                if (s === 1) scoreStr = '☹';
                else if (s === 2) scoreStr = '😐';
                else scoreStr = '😊';
                break;
            default: scoreStr = `${s}`;
        }

        ctx.save();
        ctx.font = '800 11px monalqo, sans-serif';
        ctx.letterSpacing = '0px';
        const iconSize = 10;
        const gap = 4;
        const textW = ctx.measureText(scoreStr).width;
        const bw = iconSize + gap + textW + 14;
        const bh = 22;
        const bx = cX - 8;
        const by = curY - 8;

        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 6);
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fill();
        ctx.strokeStyle = tokens.primary;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const contentW = iconSize + gap + textW;
        const startX = bx + (bw - contentW) / 2;
        const cV = by + bh / 2;

        if (isStar) {
            // Layout: [Rating] [Gap] [Star]
            ctx.fillStyle = '#FFF'; // Uniform text color
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(scoreStr, startX, cV + 0.5);

            // Draw a small Star
            const starX = startX + textW + gap + iconSize/2;
            const starY = cV;
            drawStar(ctx, starX, starY, iconSize/2, 1);
        } else {
            // Layout: [Heart] [Gap] [Rating]
            const hx = startX + iconSize/2;
            const hy = cV - (iconSize-2)/2;
            ctx.fillStyle = tokens.primary;
            ctx.beginPath();
            ctx.moveTo(hx, hy + 2.5);
            ctx.bezierCurveTo(hx, hy, hx - 5, hy, hx - 5, hy + 2.5);
            ctx.bezierCurveTo(hx - 5, hy + 6, hx, hy + 9, hx, hy + 9);
            ctx.bezierCurveTo(hx, hy + 9, hx + 5, hy + 6, hx + 5, hy + 2.5);
            ctx.bezierCurveTo(hx + 5, hy, hx, hy, hx, hy + 2.5);
            ctx.fill();

            ctx.fillStyle = '#FFF'; // Uniform text color
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(scoreStr, startX + iconSize + gap, cV + 0.5);
        }
        ctx.restore();
    }

    // Username + Status Pill (inline with avatar)
    const txtX = cX + avatarSize + 14;
    ctx.save();
    ctx.font = '900 20px monalqo, sans-serif';
    ctx.letterSpacing = '0.5px';
    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.fillText((userMeta.username || 'USER').toUpperCase(), txtX, curY + 1);
    ctx.shadowBlur = 0;
    ctx.restore();

    // Action Verb Pill
    const rawStatus = (activityData.status || '').toLowerCase();
    const isManga = media.type === 'MANGA' || rawStatus.includes('chapter') || rawStatus.includes('volume');
    const verb = isManga ? 'READING' : 'WATCHING';

    const progStr = String(activityData.progress || '');
    const isRange = progStr.match(/[-–—/]/);
    let bingeMode = false;

    if (isRange) {
        const rangeNums = progStr.split(/[-–—/]/).map(n => parseInt(n.trim())).filter(n => !isNaN(n));
        if (rangeNums.length >= 2) {
            const count = Math.max(...rangeNums) - Math.min(...rangeNums) + 1;
            if (count > 5) bingeMode = true;
        }
    }

    let displayVerb = 'INTERACTED WITH';
    if (rawStatus.includes('watched movie')) displayVerb = `WATCHED MOVIE`;
    else if (rawStatus.includes('paused')) {
        const verb = isManga ? 'READING' : 'WATCHING';
        displayVerb = `PAUSED ${verb}`;
    }
    else if (rawStatus.includes('rewatched') || (rawStatus.includes('watching') && activityData.status.toLowerCase().includes('rewatch'))) {
        displayVerb = `REWATCHED EPISODE ${progStr || '??'}`;
    }
    else if (rawStatus.includes('reread') || (rawStatus.includes('reading') && activityData.status.toLowerCase().includes('reread'))) {
        displayVerb = `REREAD CHAPTER ${progStr || '??'}`;
    }
    else if (rawStatus.includes('watched')) {
        const verb = bingeMode ? 'BINGED' : 'WATCHED';
        const progLabel = isRange ? 'EPISODES' : 'EPISODE';
        displayVerb = progStr ? `${verb} ${progLabel} ${progStr}` : `${verb} ${progLabel}`;
    }
    else if (rawStatus.includes('read')) {
        const verb = bingeMode ? 'BINGE READ' : 'READ';
        const progLabel = isRange ? (rawStatus.includes('volume') ? 'VOLUMES' : 'CHAPTERS') : (rawStatus.includes('volume') ? 'VOLUME' : 'CHAPTER');
        displayVerb = progStr ? `${verb} ${progLabel} ${progStr}` : `${verb} ${progLabel}`;
    }
    else if (rawStatus.includes('completed')) displayVerb = `FINISHED ${isManga ? 'READING' : 'WATCHING'}`;
    else if (rawStatus.includes('planning') || rawStatus.includes('plans to')) displayVerb = `PLANS TO ${isManga ? 'READ' : 'WATCH'}`;
    else if (rawStatus.includes('dropped')) displayVerb = `QUIT ${isManga ? 'READING' : 'WATCHING'}`;

    // --- 💎 Improvement: Status-Aware Color Coding ---
    const lStatus = (activityData.status || '').toLowerCase();
    let statusColors = { fill: 'rgba(255,255,255,0.13)', stroke: 'rgba(255,255,255,0.22)' };
    
    if (lStatus.includes('completed') || (activityData.verb || '').includes('FINISHED')) {
        statusColors = { fill: 'rgba(46, 204, 113, 0.16)', stroke: 'rgba(46, 204, 113, 0.5)' }; // Green
    } else if (lStatus.includes('dropped')) {
        statusColors = { fill: 'rgba(231, 76, 60, 0.16)', stroke: 'rgba(231, 76, 60, 0.5)' }; // Red
    } else if (lStatus.includes('paused')) {
        statusColors = { fill: 'rgba(241, 196, 15, 0.16)', stroke: 'rgba(241, 196, 15, 0.5)' }; // Yellow
    } else if (lStatus.includes('watch') || lStatus.includes('read')) {
        statusColors = { fill: 'rgba(52, 152, 219, 0.16)', stroke: 'rgba(52, 152, 219, 0.5)' }; // Blue
    }

    const finalVerb = (activityData.displayVerb || displayVerb || 'WATCHED').toUpperCase();

    ctx.save();
    ctx.font = '800 11px monalqo, sans-serif';
    ctx.letterSpacing = '1px';
    const vw = ctx.measureText(finalVerb).width + 22;
    const vh = 20;
    const vx = txtX;
    const vy = curY + 27;
    ctx.beginPath();
    ctx.roundRect(vx, vy, vw, vh, 5);
    ctx.fillStyle = statusColors.fill;
    ctx.fill();
    ctx.strokeStyle = statusColors.stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(finalVerb, vx + vw / 2, vy + vh / 2 + 0.5);
    ctx.restore();

    // ─── BLOCK B: TITLE ───────────────────────────────────────────────────────
    // Centered in the fluid middle zone
    curY = titleStartY;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = `900 ${fSize}px monalqo, sans-serif`;
    ctx.letterSpacing = `${finalSpacingVal}px`;
    lines.forEach((l, i) => ctx.fillText(l, cX, curY + i * lH));
    ctx.restore();

    // ─── BLOCK C: STAT CLOUD ─────────────────────────────────────────────────
    curY = bottomPinY;
    let podX = cX;

    // Rating Pod (Stars + Score)

    const sVal = media.meanScore || media.averageScore;
    const starSize = 8;
    const starGap = 6;
    const starBlockW = 5 * starSize * 2 + 4 * starGap;
    const podH = 38;

    if (sVal) {
        const score10 = (sVal / 10).toFixed(1);
        const stars = sVal / 20;

        ctx.font = '800 14px monalqo, sans-serif';
        ctx.letterSpacing = '0px';
        const scoreW = ctx.measureText(score10).width;
        const innerPad = 18;
        const innerW = scoreW + innerPad * 2;
        const innerH = 28;
        const innerMargin = (podH - innerH) / 2;
        const leftPad = 16;
        const midGap = 10;
        const podW = leftPad + starBlockW + midGap + innerW + innerMargin;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(podX, curY, podW, podH, 19);
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        let sx = podX + leftPad + starSize;
        const sy = curY + podH / 2 + 1;
        for (let i = 0; i < 5; i++) {
            drawStar(ctx, sx, sy, starSize, Math.max(0, Math.min(1, stars - i)));
            sx += starSize * 2 + starGap;
        }

        const iPx = podX + podW - innerW - innerMargin;
        const iPy = curY + innerMargin;
        ctx.beginPath();
        ctx.roundRect(iPx, iPy, innerW, innerH, 14);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fill();

        ctx.fillStyle = '#FFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 14px monalqo, sans-serif';
        ctx.letterSpacing = '0px';
        ctx.fillText(score10, iPx + innerW / 2, iPy + innerH / 2 + 0.5);
        ctx.restore();

        podX += podW + 10;
    } else {
        // Fallback for No Rating / Unreleased
        const status = (media.status || '').toUpperCase();
        const fallbackText = status === 'NOT_YET_RELEASED' ? 'UNRELEASED' : 'NO RATING';

        ctx.font = '800 14px monalqo, sans-serif';
        const scoreW = ctx.measureText(fallbackText).width;
        const innerPad = 18;
        const innerW = scoreW + innerPad * 2;
        const innerH = 28;
        const innerMargin = (podH - innerH) / 2;
        const leftPad = 16;
        const midGap = 10;
        const podW = leftPad + starBlockW + midGap + innerW + innerMargin;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(podX, curY, podW, podH, 19);
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Draw empty stars
        let sx = podX + leftPad + starSize;
        const sy = curY + podH / 2 + 1;
        for (let i = 0; i < 5; i++) {
            drawStar(ctx, sx, sy, starSize, 0);
            sx += starSize * 2 + starGap;
        }

        const iPx = podX + podW - innerW - innerMargin;
        const iPy = curY + innerMargin;
        ctx.beginPath();
        ctx.roundRect(iPx, iPy, innerW, innerH, 14);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fill();

        ctx.fillStyle = '#FFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '800 12px monalqo, sans-serif'; // Slightly smaller for longer text
        ctx.letterSpacing = '0px';
        ctx.fillText(fallbackText, iPx + innerW / 2, iPy + innerH / 2 + 0.5);
        ctx.restore();

        podX += podW + 10;
    }

    // Format Pod
    const drawPod = (text) => {
        ctx.save();
        ctx.font = '700 12px monalqo, sans-serif';
        ctx.letterSpacing = '0.8px';
        const tw = ctx.measureText(text).width + 24;
        const ph = 38;
        ctx.beginPath();
        ctx.roundRect(podX, curY, tw, ph, 19);
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.fillStyle = '#FFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, podX + tw / 2, curY + ph / 2 + 0.5);
        ctx.restore();
        podX += tw + 10;
    };


    // ─── BLOCK D: MEDIA TYPE ICON + YEAR PILL (Top-Right Cluster) ─────────────
    const iconGlassW = 50;
    const iconGlassH = 50;
    const iconGlassX = baseW - iconGlassW - 22;
    const iconGlassY = 22;
    const iconGlassCX = iconGlassX + iconGlassW / 2;
    const iconGlassCY = iconGlassY + iconGlassH / 2;

    const format = (media.format || 'TV').toUpperCase();
    const isMangaType = media.type === 'MANGA';
    const isMovie = format === 'MOVIE';

    // ── Year Pill (to the LEFT of the media icon circle) ──────────────────────
    // Shared vertical specs — align pill center to the icon circle center
    const yearValue = media.seasonYear || media.startDate?.year || null;
    const yearStr = yearValue ? String(yearValue) : 'N/A';

    const pillH = 38;           // total pill height
    const pillR = pillH / 2;    // border-radius for full pill shape
    const calIconW = 16;        // calendar icon bounding box
    const calIconH = 15;
    const innerPadH = 4;        // REDUCED: closer to top/bottom
    const innerPadW = 12;

    ctx.font = '900 13px monalqo, sans-serif'; // SLIGHTLY BIGGER
    ctx.letterSpacing = '0px';
    const yearTxtW = ctx.measureText(yearStr).width;
    const innerPillW2 = yearTxtW + innerPadW * 2;
    const innerPillH2 = pillH - innerPadH * 2;

    const leftPad = 12;
    const calToYearGap = 8;
    // Tighter right edge (+ 4 instead of + 10)
    const yearPillW = leftPad + calIconW + calToYearGap + innerPillW2 + 4;

    // Position: right-aligned just left of the icon circle
    const yearPillX = iconGlassX - yearPillW - 10;
    const yearPillY = iconGlassY + (iconGlassH - pillH) / 2; // vertically centered with icon
    const yearPillCY = yearPillY + pillH / 2;

    // Outer glass pill
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(yearPillX, yearPillY, yearPillW, pillH, pillR);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // ── Vector Calendar Icon ──────────────────────────────────────────────────
    const calX = yearPillX + leftPad;
    const calY = yearPillCY - calIconH / 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Calendar body rectangle
    ctx.beginPath();
    ctx.roundRect(calX, calY + 3, calIconW, calIconH - 3, 2);
    ctx.stroke();

    // Ring tabs at top
    [calX + 4, calX + calIconW - 4].forEach(rx => {
        ctx.beginPath();
        ctx.moveTo(rx, calY);
        ctx.lineTo(rx, calY + 6);
        ctx.stroke();
    });

    // Header bar line below tabs
    ctx.beginPath();
    ctx.moveTo(calX, calY + 6.5);
    ctx.lineTo(calX + calIconW, calY + 6.5);
    ctx.lineWidth = 1;
    ctx.stroke();

    // Grid dots (3×2)
    ctx.lineWidth = 0;
    [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]].forEach(([col, row]) => {
        const dotX = calX + 3 + col * 5;
        const dotY = calY + 10 + row * 4;
        ctx.beginPath();
        ctx.arc(dotX, dotY, 1, 0, Math.PI * 2);
        ctx.fill();
    });

    // ── Year nested pill ─────────────────────────────────────────────────────
    const iPx2 = yearPillX + leftPad + calIconW + calToYearGap;
    const iPy2 = yearPillY + innerPadH;

    ctx.beginPath();
    ctx.roundRect(iPx2, iPy2, innerPillW2, innerPillH2, innerPillH2 / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fill();

    ctx.fillStyle = '#FFF';
    ctx.font = '900 13px monalqo, sans-serif';
    ctx.letterSpacing = '0px';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(yearStr, iPx2 + innerPillW2 / 2, iPy2 + innerPillH2 / 2 + 0.5);
    ctx.restore();

    // Glass backing circle (media type icon)
    ctx.save();
    ctx.beginPath();
    ctx.arc(iconGlassCX, iconGlassCY, iconGlassW / 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (isMangaType) {
        // ── BOOK ICON ──
        const bx = iconGlassCX - 11;
        const by = iconGlassCY - 13;
        const bw = 22;
        const bh = 26;
        ctx.lineWidth = 1.8;
        // Cover
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, 2);
        ctx.stroke();
        // Spine line
        ctx.beginPath();
        ctx.moveTo(bx + 5, by);
        ctx.lineTo(bx + 5, by + bh);
        ctx.stroke();
        // Page lines
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(bx + 9, by + 7);
        ctx.lineTo(bx + bw - 4, by + 7);
        ctx.moveTo(bx + 9, by + 12);
        ctx.lineTo(bx + bw - 4, by + 12);
        ctx.moveTo(bx + 9, by + 17);
        ctx.lineTo(bx + bw - 6, by + 17);
        ctx.stroke();
    } else if (isMovie) {
        // ── MOVIE / CLAPPERBOARD ICON ──
        const mx = iconGlassCX - 12;
        const my = iconGlassCY - 10;
        const mw = 24;
        const mh = 20;
        ctx.lineWidth = 1.8;
        // Body
        ctx.beginPath();
        ctx.roundRect(mx, my + 6, mw, mh - 6, 2);
        ctx.stroke();
        // Top bar (clapper)
        ctx.beginPath();
        ctx.roundRect(mx, my, mw, 8, 2);
        ctx.stroke();
        // Clapper diagonal stripes
        ctx.lineWidth = 1.5;
        const stripes = 3;
        const sw = mw / (stripes * 2);
        for (let i = 0; i < stripes; i++) {
            const sx = mx + i * sw * 2 + 2;
            ctx.beginPath();
            ctx.moveTo(sx, my);
            ctx.lineTo(sx + sw - 2, my + 8);
            ctx.stroke();
        }
        // Film holes
        ctx.lineWidth = 1;
        [my + 11, my + 16].forEach(hy => {
            [mx + 3, mx + mw - 7].forEach(hx => {
                ctx.beginPath();
                ctx.roundRect(hx, hy, 4, 3, 1);
                ctx.stroke();
            });
        });
    } else {
        // ── TV ICON (default: ANIME / TV / OVA etc) ──
        const tvx = iconGlassCX - 13;
        const tvy = iconGlassCY - 10;
        const tvw = 26;
        const tvh = 18;
        ctx.lineWidth = 1.8;
        // Screen
        ctx.beginPath();
        ctx.roundRect(tvx, tvy, tvw, tvh, 3);
        ctx.stroke();
        // Stand leg
        ctx.beginPath();
        ctx.moveTo(iconGlassCX, tvy + tvh);
        ctx.lineTo(iconGlassCX, tvy + tvh + 5);
        ctx.stroke();
        // Stand base
        ctx.beginPath();
        ctx.moveTo(iconGlassCX - 6, tvy + tvh + 5);
        ctx.lineTo(iconGlassCX + 6, tvy + tvh + 5);
        ctx.stroke();
        // Antenna ears
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(iconGlassCX - 5, tvy);
        ctx.lineTo(iconGlassCX - 10, tvy - 6);
        ctx.moveTo(iconGlassCX + 5, tvy);
        ctx.lineTo(iconGlassCX + 10, tvy - 6);
        ctx.stroke();
    }
    ctx.restore();

    // ─── 5. FOOTER ────────────────────────────────────────────────────────────
    ctx.restore();
    ctx.textAlign = 'right';
    ctx.font = '700 9px monalqo, sans-serif';
    ctx.letterSpacing = '6.5px'; // Elite spaced-out aesthetic
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText('ANIMUSE ACTIVITY', baseW - 36, baseH - 22);

    // --- 💎 Improvement: Subtle Scanline Tech Layer ---
    // (Clipped to main card body to fix the 'white corners' artifact)
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, baseW, baseH, 32);
    ctx.clip();
    ctx.globalAlpha = 0.04; 
    ctx.fillStyle = '#FFF';
    for (let i = 0; i < baseH; i += 3) {
        ctx.fillRect(0, i, baseW, 1.2);
    }
    ctx.restore();

    // --- 🛡️ Glyph Guard: Card Border for anti-alias cleanup ---
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, baseW, baseH, 32);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // Inner Glow Cuff
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    return await canvas.encode('webp', { quality: 95 });
};

module.exports = { generateActivityCard };
