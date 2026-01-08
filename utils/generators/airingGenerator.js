const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { normalizeColor, parseMetadata } = require('../core/visualUtils');

/**
 * ARCHIVIST AIRING GENERATOR - V2 (Redesigned)
 * Aligning with Search Generator V24 aesthetics.
 * Features: 2x Scale, Elastic Titles, Blurred Backdrop, High-Impact Episode Count.
 */
const generateAiringCard = async (media, episode = {}, userColor = '#FFACD1') => {
    const SCALE = 2; // Reverting to safe 2.0 scale to prevent crashes
    const baseW = 800;
    const baseH = 250; // Compacted from 310 as requested
    const width = baseW * SCALE;
    const height = baseH * SCALE;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    // Color Palette
    const primary = normalizeColor(media.coverImage?.color || userColor);
    const surfaceColor = '#0A0A0E';
    const onSurface = '#FFFFFF';
    const onSurfaceMuted = 'rgba(255, 255, 255, 0.45)';
    const accent = primary;

    // --- 1. IMAGE LOADING (SEQUENTIAL FOR STABILITY) ---
    const bgUrl = media.bannerImage || media.coverImage?.extraLarge;
    const coverUrl = media.coverImage?.large || media.coverImage?.extraLarge; // Large is faster

    let bgImg = null;
    let coverImg = null;

    // Load BG
    if (bgUrl) {
        try {
            bgImg = await loadImage(bgUrl);
        } catch (e) {
            console.error('[AiringGen] BG Load Failed:', e.message);
        }
    }

    // Load Cover
    if (coverUrl) {
        try {
            coverImg = await loadImage(coverUrl);
        } catch (e) {
            console.error('[AiringGen] Cover Load Failed:', e.message);
        }
    }

    // --- 2. THE CANVAS ---
    ctx.fillStyle = surfaceColor;
    ctx.fillRect(0, 0, baseW, baseH);

    // DRAW BACKGROUND
    if (bgImg) {
        try {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(0, 0, baseW, baseH, 40);
            ctx.clip();
            const imgScale = Math.max(baseW / bgImg.width, baseH / bgImg.height);
            const x = (baseW / 2) - (bgImg.width / 2) * imgScale;
            const y = (baseH / 2) - (bgImg.height / 2) * imgScale;
            // Darker blur for high contrast
            ctx.filter = 'blur(60px) brightness(0.25) saturate(1.4)';
            ctx.drawImage(bgImg, x, y, bgImg.width * imgScale, bgImg.height * imgScale);
            ctx.restore();
        } catch (e) { console.error('[AiringGen] BG Draw Error:', e); }
    }

    // --- 3. THE POSTER ---
    const margin = 20;
    const posterH = baseH - (margin * 2);
    const posterW = posterH * 0.72; // Slightly wider
    const posterX = margin;
    const posterY = margin;

    // DRAW POSTER
    if (coverImg) {
        try {
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.85)';
            ctx.shadowBlur = 40;
            ctx.beginPath();
            ctx.roundRect(posterX, posterY, posterW, posterH, 18);
            ctx.clip();
            ctx.drawImage(coverImg, posterX, posterY, posterW, posterH);
            ctx.restore();
        } catch (e) { console.error('[AiringGen] Poster Draw Error:', e); }
    }

    // --- 4. THE CONTENT GRID ---
    const anchorX = posterX + posterW + 30;
    const contentW = baseW - anchorX - margin;

    // A. HEADER & STATUS PILL
    const headerY = posterY + 5;

    // Header Text
    const format = (media.format || 'TV').replace(/_/g, ' ');
    const year = media.seasonYear || media.startDate?.year || 'NEW';
    const studio = media.studios?.nodes?.[0]?.name;
    let headerText = `${format}  •  ${year}`;
    if (studio) headerText += `  •  ${studio}`;

    ctx.font = 'bold 12px sans-serif';
    ctx.letterSpacing = '1.5px';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.textBaseline = 'middle';
    ctx.fillText(headerText.toUpperCase(), anchorX, headerY + 11); // Center vertically with pill

    // "AIRING NOW" Pill (Top Right)
    const statusText = "AIRING NOW";
    ctx.font = '900 11px sans-serif';
    const pillW = ctx.measureText(statusText).width + 20;
    const pillH = 24;
    const pillX = baseW - margin - pillW;
    const pillY = posterY; // Aligned with top

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 8);
    ctx.fillStyle = accent;
    ctx.fill();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 12; // Glow
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(statusText, pillX + (pillW / 2), pillY + (pillH / 2) + 1);
    ctx.restore();

    // Anchored to bottom margin, aligned with Poster Bottom
    const epNumBaseline = baseH - margin;
    // Positioned to sit naturally above the smaller number (baseline - 60)
    const epLabelY = epNumBaseline - 60;

    // C. DYNAMIC TITLE & SMART EXTRACTION
    const { title: fullTitle, tags: extraTags } = parseMetadata(media.title.english || media.title.romaji);

    // Draw Season Pills if extracted (Next to Header Text)
    if (extraTags.length > 0) {
        ctx.font = 'bold 12px sans-serif';
        ctx.letterSpacing = '1.5px';
        let currentX = anchorX + ctx.measureText(headerText.toUpperCase()).width + 16;
        const tagY = headerY + 11;

        ctx.font = 'bold 10px sans-serif';
        ctx.letterSpacing = '0px';

        extraTags.forEach(tag => {
            const tagW = ctx.measureText(tag).width + 12;

            ctx.save();
            ctx.beginPath();
            ctx.roundRect(currentX, headerY + 2, tagW, 18, 4);
            ctx.fillStyle = accent; // Solid Fill
            ctx.fill();

            ctx.fillStyle = '#FFFFFF'; // White text
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(tag.toUpperCase(), currentX + (tagW / 2), tagY);
            ctx.restore();

            currentX += tagW + 8; // Gap between pills
        });
    }

    // Fit Title Logic
    let fontSize = 76;
    const maxLines = 3;
    let lines = [];

    while (fontSize > 20) {
        ctx.font = `900 ${fontSize}px sans-serif`;
        ctx.letterSpacing = '-1.2px';
        const words = fullTitle.split(' ');
        lines = [];
        let cur = '';

        for (let w of words) {
            let t = cur + w + ' ';
            if (ctx.measureText(t).width > contentW) {
                lines.push(cur.trim());
                cur = w + ' ';
            } else {
                cur = t;
            }
        }
        lines.push(cur.trim());

        if (lines.length <= maxLines) break;
        fontSize -= 4;
    }

    const lineHeight = fontSize * 1.05;
    const titleY = epLabelY - (lines.length * lineHeight) - 10;

    ctx.fillStyle = onSurface;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    lines.forEach((line, i) => {
        ctx.fillText(line, anchorX, titleY + (i * lineHeight));
    });

    // --- 5. THE EPISODE BLOCK ---
    const epNumStr = (episode.episode || '??').toString();

    // Reset baseline so we draw UP from the bottom anchor (Poster Bottom)
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    // A. "EPISODE" Label (Solid Pill)
    ctx.font = '900 13px sans-serif';
    ctx.letterSpacing = '2px';
    const epLabelText = 'EPISODE';
    const elW = ctx.measureText(epLabelText).width + 24;
    const elH = 22;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(anchorX, epLabelY - 18, elW, elH, 6);
    ctx.fillStyle = accent; // Solid Filled Pill
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(epLabelText, anchorX + (elW / 2), epLabelY - 18 + (elH / 2));
    ctx.restore();

    // B. Episode Number
    ctx.font = '900 54px sans-serif'; // Dialed back slightly
    ctx.letterSpacing = '-2px';
    ctx.fillStyle = onSurface;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(epNumStr, anchorX - 2, epNumBaseline);

    // --- 6. GENRES ---
    const genres = media.genres || [];
    let gpX = baseW - margin;
    const gpY = baseH - margin - 26;

    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'right';

    for (let i = 0; i < Math.min(genres.length, 3); i++) {
        const genreText = genres[i].toUpperCase();
        const gW = ctx.measureText(genreText).width + 34;

        ctx.save();
        ctx.beginPath();
        const pX = gpX - gW;
        ctx.roundRect(pX, gpY, gW, 26, 8);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#EEEEEE';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(genreText, pX + (gW / 2), gpY + 14);
        ctx.restore();

        gpX -= (gW + 8);
    }

    return await canvas.encode('png');
};

module.exports = { generateAiringCard };
