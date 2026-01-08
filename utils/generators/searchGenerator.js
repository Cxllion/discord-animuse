const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { normalizeColor, parseMetadata } = require('../core/visualUtils');

/**
 * ARCHIVIST SEARCH GENERATOR - V2 (Premium Redesign)
 * Features: 2x HD Scale, 3-Line Elastic Titles, Dynamic Multi-Tags, Paragraph Balancing.
 */
const generateSearchCard = async (media, userColor = '#FFACD1') => {
    const SCALE = 2;
    const baseW = 930;
    const baseH = 500;
    const width = baseW * SCALE;
    const height = baseH * SCALE;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    const primary = normalizeColor(media.coverImage?.color || userColor);
    const surfaceColor = '#0A0A0E';
    const onSurface = '#FFFFFF';
    const onSurfaceMuted = 'rgba(255, 255, 255, 0.45)';

    // --- 1. THE CANVAS ---
    ctx.fillStyle = surfaceColor;
    ctx.fillRect(0, 0, baseW, baseH);

    // DRAW BACKGROUND
    try {
        const bgUrl = media.bannerImage || media.coverImage?.extraLarge;
        if (bgUrl) {
            const bgImg = await loadImage(bgUrl);
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(0, 0, baseW, baseH, 40);
            ctx.clip();
            const imgScale = Math.max(baseW / bgImg.width, baseH / bgImg.height);
            const x = (baseW / 2) - (bgImg.width / 2) * imgScale;
            const y = (baseH / 2) - (bgImg.height / 2) * imgScale;
            ctx.filter = 'blur(60px) brightness(0.25) saturate(1.4)';
            ctx.drawImage(bgImg, x, y, bgImg.width * imgScale, bgImg.height * imgScale);
            ctx.restore();
        }
    } catch (e) { }

    // --- 2. THE POSTER ---
    const margin = 35;
    const posterH = baseH - (margin * 2);
    const posterW = posterH * 0.70;
    const posterX = margin;
    const posterY = margin;

    try {
        const coverImg = await loadImage(media.coverImage?.extraLarge || media.coverImage?.large);
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 55;
        ctx.beginPath();
        ctx.roundRect(posterX, posterY, posterW, posterH, 28);
        ctx.clip();
        ctx.drawImage(coverImg, posterX, posterY, posterW, posterH);
        ctx.restore();
    } catch (e) { }

    // --- 3. FORMAT ICON ---
    const iconX = baseW - margin - 30;
    const iconY = margin + 5;
    const isManga = ['MANGA', 'ONE_SHOT', 'NOVEL'].includes(media.format);

    ctx.save();
    ctx.strokeStyle = onSurfaceMuted;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (isManga) {
        ctx.beginPath();
        ctx.roundRect(iconX, iconY, 24, 30, 3);
        ctx.moveTo(iconX + 6, iconY + 8); ctx.lineTo(iconX + 18, iconY + 8);
        ctx.moveTo(iconX + 6, iconY + 15); ctx.lineTo(iconX + 18, iconY + 15);
        ctx.stroke();
    } else {
        ctx.beginPath();
        ctx.roundRect(iconX - 2, iconY + 6, 28, 20, 4);
        ctx.moveTo(iconX + 4, iconY); ctx.lineTo(iconX + 12, iconY + 6);
        ctx.moveTo(iconX + 22, iconY); ctx.lineTo(iconX + 14, iconY + 6);
        ctx.stroke();
    }
    ctx.restore();

    // --- 4. THE CONTENT GRID ---
    const anchorX = posterX + posterW + 45;
    const contentW = baseW - anchorX - margin - 50; // Increased padding to 50 for safety

    // A. SMART EXTRACTION
    const { title: fullTitle, tags: extraTags } = parseMetadata(media.title.english || media.title.romaji);

    // B. HEADER
    const headerY = posterY + 5;
    const formatLabel = (media.format || 'TV').replace(/_/g, ' ');
    const yearLabel = media.startDate?.year || 'TBA';

    let headerText = `${formatLabel}  •  ${yearLabel}`;
    if (!isManga) {
        const studio = media.studios?.nodes?.[0]?.name;
        if (studio) headerText += `  •  ${studio}`;
    }

    ctx.font = '900 13px sans-serif';
    ctx.letterSpacing = '5px';
    ctx.fillStyle = onSurfaceMuted;
    ctx.textBaseline = 'top';
    ctx.fillText(headerText.toUpperCase(), anchorX, headerY);

    // C. TRIPLE-TIER ELASTIC TITLE
    const titleStartY = posterY + 38;
    const titleW = contentW - 50;

    let fontSize = 48;
    let titleLines = [];
    let leading = 0;

    while (fontSize > 16) {
        ctx.font = `900 ${fontSize}px sans-serif`;
        ctx.letterSpacing = '-1.2px';
        const words = fullTitle.split(' ');
        titleLines = [];
        let cur = '';
        for (let w of words) {
            let t = cur + w + ' ';
            if (ctx.measureText(t).width > titleW) {
                titleLines.push(cur.trim()); cur = w + ' ';
            } else { cur = t; }
        }
        titleLines.push(cur.trim());
        leading = fontSize * 1.1;
        if (titleLines.length <= 3) break;
        fontSize -= 2;
    }

    ctx.fillStyle = onSurface;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    titleLines.forEach((line, i) => {
        ctx.fillText(line, anchorX, titleStartY + (i * leading));
    });

    const titleBottom = titleStartY + (titleLines.length * leading);

    // --- D. THE DYNAMIC METADATA ROW (Below Name) ---
    let metaOffset = 0;
    if (extraTags.length > 0) {
        metaOffset = 35;
        const metaY = titleBottom + 12;
        let pX = anchorX;

        ctx.font = 'bold 11px sans-serif';
        ctx.letterSpacing = '0px';

        extraTags.forEach(tag => {
            const tagText = tag.toUpperCase();
            const tagW = ctx.measureText(tagText).width + 16;
            const tagH = 22;

            ctx.save();
            ctx.beginPath();
            ctx.roundRect(pX, metaY, tagW, tagH, 6);
            ctx.fillStyle = primary;
            ctx.fill();

            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(tagText, pX + (tagW / 2), metaY + (tagH / 2) + 1);
            ctx.restore();

            pX += tagW + 10;
        });
    }

    // --- E. THE PRECISION DATA ROW (Score & Status) ---
    const dataRowY = titleBottom + 18 + metaOffset;
    const scoreVal = media.meanScore || 0;
    const statusVal = (media.status || 'TBA').replace(/_/g, ' ').toUpperCase();
    const chipH = 46;
    const centerY = dataRowY + (chipH / 2);

    let statusX = anchorX;

    // 1. STAR RATING PILL (Only if score > 0)
    if (scoreVal > 0) {
        const starCount = Math.round((scoreVal / 20) * 2) / 2;
        const fullStars = Math.floor(starCount);
        const hasHalf = starCount % 1 !== 0;
        const totalSlots = Math.ceil(starCount);

        const starSize = 13;
        const starGap = 6;
        const starAreaW = (totalSlots * (starSize * 2)) + ((totalSlots - 1) * starGap);
        const chipW = Math.max(70, starAreaW + 36);

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(anchorX, dataRowY, chipW, chipH, 23);
        ctx.fillStyle = primary;
        ctx.fill();

        const drawStar = (x, y, size, fillPercent) => {
            ctx.save();
            ctx.translate(x, y);
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const rot = (Math.PI / 180) * (18 + i * 72);
                ctx.lineTo(Math.cos(rot) * size, -Math.sin(rot) * size);
                const innerRot = (Math.PI / 180) * (54 + i * 72);
                ctx.lineTo(Math.cos(innerRot) * (size * 0.45), -Math.sin(innerRot) * (size * 0.45));
            }
            ctx.closePath();

            if (fillPercent >= 1) {
                ctx.fillStyle = '#FFFFFF';
                ctx.fill();
            } else if (fillPercent > 0) {
                ctx.save();
                ctx.clip();
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(-size, -size, size, size * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                ctx.fillRect(0, -size, size, size * 2);
                ctx.restore();
            }
            ctx.restore();
        };

        let currentStarX = anchorX + 18 + starSize;
        for (let i = 0; i < fullStars; i++) {
            drawStar(currentStarX, centerY, starSize, 1);
            currentStarX += (starSize * 2) + starGap;
        }
        if (hasHalf) {
            drawStar(currentStarX, centerY, starSize, 0.5);
        }
        ctx.restore();

        // Push status text to the right of the pill
        statusX = anchorX + chipW + 16;
    }

    // 2. Status Text
    ctx.font = '900 24px sans-serif';
    ctx.fillStyle = onSurface;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(statusVal, statusX, centerY + 1);

    // --- F. SYNOPSIS ---
    const synopsisY = dataRowY + 70;
    const maxSHeight = baseH - synopsisY - margin - 35;

    ctx.font = '16px sans-serif';
    ctx.fillStyle = onSurfaceMuted;
    ctx.textBaseline = 'top';

    // Sanitize Description: 
    // 1. Replace <br> with spaces to prevent word merges
    // 2. Strip HTML tags
    // 3. Flatten whitespace/newlines to single spaces
    let rawDesc = (media.description || 'No record found.')
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    let sLines = [];
    let words = rawDesc.split(' ');
    let curLine = '';

    for (let w of words) {
        let t = curLine + w + ' ';
        if (ctx.measureText(t).width > contentW) {
            sLines.push(curLine.trim());
            curLine = w + ' ';
        } else curLine = t;
    }
    sLines.push(curLine.trim());

    const sLeading = 24;
    const fitCount = Math.floor(maxSHeight / sLeading);
    sLines.slice(0, fitCount).forEach((line, i) => {
        if (i === fitCount - 1 && sLines.length > fitCount) line += '...';
        ctx.fillText(line, anchorX, synopsisY + (i * sLeading));
    });

    // --- G. GENRES ---
    const genres = media.genres || [];
    let gpX = anchorX;
    const gpY = baseH - margin - 26;

    ctx.font = '900 11px sans-serif';
    ctx.textAlign = 'left';

    for (let i = 0; i < Math.min(genres.length, 4); i++) {
        const text = genres[i].toUpperCase();
        const gW = ctx.measureText(text).width + 30;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(gpX, gpY, gW, 26, 8);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fill();
        ctx.fillStyle = onSurfaceMuted;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, gpX + (gW / 2), gpY + 14);
        ctx.restore();

        gpX += gW + 10;
    }

    return await canvas.encode('png');
};

module.exports = { generateSearchCard };