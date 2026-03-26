const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { generateColorTokens, parseMetadata } = require('../core/visualUtils');
const logger = require('../core/logger');

/**
 * ARCHIVIST AIRING GENERATOR - V3 (Premium Redesign)
 * Inspired by Search Generator Design.
 * Features: 2x HD Scale, Cinematic Backdrops, Glassmorphism UI, High-Contrast Typography.
 */
const generateAiringCard = async (media, episode = {}, userColor = '#FFACD1') => {
    const SCALE = 2; 
    const baseW = 800;
    const baseH = 250; 
    const width = baseW * SCALE;
    const height = baseH * SCALE;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    const tokens = generateColorTokens(media.coverImage?.color || userColor);
    // console.log('DEBUG TOKENS:', tokens);
    
    // --- 1. THE CANVAS (GLOBAL EDGE) ---
    ctx.save(); 
    ctx.beginPath();
    ctx.roundRect(0, 0, baseW, baseH, 40);
    ctx.clip(); 
    ctx.fillStyle = tokens.surface;
    ctx.fillRect(0, 0, baseW, baseH);

    // --- 2. THE BACKGROUND (CINEMATIC BACKDROP) ---
    const bgUrl = media.bannerImage || media.coverImage?.extraLarge;
    const coverUrl = media.coverImage?.large || media.coverImage?.extraLarge;

    try {
        if (bgUrl) {
            const bgImg = await loadImage(bgUrl);
            ctx.save();
            const scale = Math.max(baseW / bgImg.width, baseH / bgImg.height);
            const x = (baseW - bgImg.width * scale) / 2;
            const y = (baseH - bgImg.height * scale) / 2;
            ctx.drawImage(bgImg, x, y, bgImg.width * scale, bgImg.height * scale);
            
            // Atmospheric Bloom & Depth
            ctx.filter = 'blur(40px) saturate(1.8)';
            ctx.globalAlpha = 0.6;
            ctx.drawImage(bgImg, x, y, baseW, baseH);
            
            // The Dark Curtain (Vignette)
            const v = ctx.createLinearGradient(0, 0, 0, baseH);
            v.addColorStop(0, 'rgba(0,0,0,0.2)');
            v.addColorStop(0.6, 'rgba(0,0,0,0.7)');
            v.addColorStop(1, tokens.surface);
            ctx.fillStyle = v;
            ctx.globalAlpha = 1.0;
            ctx.fillRect(0, 0, baseW, baseH);
            ctx.restore();
        }
    } catch (e) {
        logger.warn('AiringGen BG Load Failed: ' + e.message, 'AiringGenerator');
    }

    // Content Layer: Mesh Accents (Refined & Vibrant)
    const g1 = ctx.createRadialGradient(baseW * 0.8, baseH * 0.1, 0, baseW * 0.8, baseH * 0.1, baseW * 0.7);
    g1.addColorStop(0, tokens.primary + '25');
    g1.addColorStop(1, 'transparent');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, baseW, baseH);

    const g2 = ctx.createRadialGradient(baseW * 0.2, baseH * 0.8, 0, baseW * 0.2, baseH * 0.8, baseW * 0.5);
    g2.addColorStop(0, tokens.glow + '15');
    g2.addColorStop(1, 'transparent');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, baseW, baseH);

    // Material Noise
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.04;
    for (let i = 0; i < 2000; i++) {
        ctx.fillStyle = '#FFF';
        ctx.fillRect(Math.random() * baseW, Math.random() * baseH, 1, 1);
    }
    ctx.restore();

    // --- 3. THE POSTER ---
    const margin = 20;
    const posterH = baseH - (margin * 2);
    const posterW = posterH * 0.70; 
    const posterX = margin;
    const posterY = margin;

    const { title: cleanTitle, tags: metadataTags } = parseMetadata(media.title.english || media.title.romaji);

    try {
        if (coverUrl) {
            const coverImg = await loadImage(coverUrl);
            ctx.save();
            
            // Poster Shadow (Deep Cinematic)
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 60;
            ctx.shadowOffsetY = 15;
            
            ctx.beginPath();
            ctx.roundRect(posterX, posterY, posterW, posterH, 32);
            ctx.fillStyle = '#000';
            ctx.fill();
            ctx.clip();
            
            ctx.shadowColor = 'transparent';
            ctx.drawImage(coverImg, posterX, posterY, posterW, posterH);

            // --- Poster-Locked Metadata Tags (Refined HUD Pillars) ---
            if (metadataTags && metadataTags.length > 0) {
                const th = 26;
                const fontSize = 11;
                const radius = 6;
                const horizontalPadding = 20;
                
                let tagY = posterY + 12;
                metadataTags.slice(0, 2).forEach(tag => {
                    ctx.font = `900 ${fontSize}px sans-serif`;
                    ctx.letterSpacing = '1px';
                    const tagText = tag.toUpperCase();
                    const tw = ctx.measureText(tagText).width + horizontalPadding;
                    const tagX = posterX + posterW - tw - 12;

                    ctx.save();
                    ctx.beginPath();
                    ctx.roundRect(tagX, tagY, tw, th, radius); 
                    ctx.fillStyle = 'rgba(0,0,0,0.6)';
                    ctx.fill();
                    
                    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    ctx.fillStyle = '#FFF';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(tagText, tagX + tw/2, tagY + th/2 + 0.5); 
                    ctx.restore();

                    tagY += th + 8;
                });
            }

            // High-end gloss edge
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.restore();
        }
    } catch (e) {
        logger.error('AiringGen Poster Load/Draw Error:', e, 'AiringGenerator');
    }

    // --- 4. THE CONTENT GRID ---
    const anchorX = posterX + posterW + 30;
    const contentW = baseW - anchorX - margin;

    // A. CONTENT SHIELD
    ctx.save();
    const maskG = ctx.createLinearGradient(anchorX - 30, 0, baseW, 0);
    maskG.addColorStop(0, 'rgba(0,0,0,0)');
    maskG.addColorStop(0.3, 'rgba(0,0,0,0.5)');
    maskG.addColorStop(1, 'rgba(0,0,0,0.8)');
    ctx.fillStyle = maskG;
    ctx.fillRect(anchorX - 30, 0, baseW, baseH);
    ctx.restore();

    // Content Shield moved below for layering


    // --- 5. THE EPISODE BLOCK (Top Row Alignment) ---
    const epNumStr = (episode.episode || '??').toString();
    const curY = margin;

    // "AIRING NOW" Pod (Vibrant Gradient Refinement)
    const statusText = "AIRING NOW";
    ctx.font = '900 12px sans-serif';
    ctx.letterSpacing = '3px';
    const stW = ctx.measureText(statusText).width + 30;
    const podH = 36;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(anchorX, curY, stW, podH, 18);
    const greenStart = '#00E676';
    const greenEnd = '#00C853';
    const statusGrad = ctx.createLinearGradient(anchorX, curY, anchorX + stW, curY);
    statusGrad.addColorStop(0, greenStart + '25');
    statusGrad.addColorStop(1, greenEnd + '35');
    ctx.fillStyle = statusGrad;
    ctx.fill();

    ctx.shadowColor = greenEnd + '50';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = greenEnd + '80';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = greenStart;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(statusText, anchorX + stW/2, curY + podH/2 + 1);
    ctx.restore();

    // --- 5. THE EPISODE BLOCK (Premium Nested HUD) ---
    const epNumW = ctx.measureText(epNumStr).width;
    const innerPillW = epNumW + 24;
    const innerPillH = 26;
    const iconSpace = 34;
    const epPodW = iconSpace + innerPillW + 4; 
    const epPodX = anchorX + stW + 12;

    ctx.save();
    // Outer Capsule
    ctx.beginPath();
    ctx.roundRect(epPodX, curY, epPodW, 36, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // TV Icon
    const iconX = epPodX + (iconSpace / 2);
    const iconY = curY + 18;
    const iconSize = 13;
    ctx.strokeStyle = tokens.primary;
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.roundRect(iconX - iconSize/2, iconY - iconSize/2 + 2, iconSize, iconSize * 0.75, 3);
    ctx.stroke();
    // Antennae
    ctx.beginPath();
    ctx.moveTo(iconX - 3.5, iconY - 6.5);
    ctx.lineTo(iconX, iconY - 3);
    ctx.lineTo(iconX + 3.5, iconY - 6.5);
    ctx.stroke();

    // Inner Pill (The "Pill within a Pill")
    const innerX = epPodX + iconSpace;
    const innerY = curY + (36 - innerPillH) / 2;
    ctx.beginPath();
    ctx.roundRect(innerX, innerY, innerPillW, innerPillH, 13);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; 
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Nested Number
    ctx.font = '900 18px sans-serif';
    ctx.fillStyle = '#FFF';
    ctx.shadowColor = 'rgba(255,255,255,0.3)';
    ctx.shadowBlur = 10;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(epNumStr, innerX + (innerPillW / 2), innerY + (innerPillH / 2) + 0.5);
    ctx.restore();

    // --- 4B. METADATA PILL (Refined & Sequenced) ---
    const formatValue = (media.format || 'TV').replace(/_/g, ' ');
    const studioValue = (media.studios?.nodes?.[0]?.name || 'STUDIO').toUpperCase().split(' ')[0];
    const metaText = `${formatValue}  •  ${studioValue}`;

    ctx.save();
    ctx.font = '900 12px sans-serif'; 
    ctx.letterSpacing = '4px';
    const metaW = ctx.measureText(metaText).width;
    const pillW = metaW + 40;
    const pillH = 36;
    const pillX = epPodX + epPodW + 12; // Consistent 12px gap
    const pillY = margin;

    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 18);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(metaText, pillX + (pillW/2), pillY + (pillH/2) + 1);
    ctx.restore();

    // --- 5. TITLE ---
    let fontSize = 52; 
    const maxLines = 2;
    let lines = [];
    const maxTitleW = contentW;

    while (fontSize > 20) {
        ctx.font = `900 ${fontSize}px sans-serif`;
        ctx.letterSpacing = '-3.5px';
        const words = cleanTitle.split(' ');
        lines = [];
        let cur = '';

        for (let w of words) {
            if (ctx.measureText(cur + w + ' ').width > maxTitleW) {
                lines.push(cur.trim());
                cur = w + ' ';
            } else {
                cur += w + ' ';
            }
        }
        lines.push(cur.trim());

        const totalTitleH = lines.length * (fontSize * 0.9);
        if (lines.length <= maxLines && totalTitleH < 100) break;
        fontSize -= 2;
    }

    const lineHeight = fontSize * 0.88;
    const titleBlockH = lines.length * lineHeight;
    const genreH = 32;
    const verticalGap = 20;
    const totalContentH = titleBlockH + verticalGap + genreH;
    
    // Center it between top row pods and the bottom watermark area
    const topRowBottom = margin + podH;
    const cardBottomBoundary = baseH - margin - 15; 
    const availableH = cardBottomBoundary - topRowBottom;
    
    const contentStartOffset = Math.max(0, (availableH - totalContentH) / 2);
    const titleY = topRowBottom + contentStartOffset;
    const footerY = titleY + titleBlockH + verticalGap;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    // Depth Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 5;
    ctx.fillStyle = '#FFF';

    lines.forEach((line, i) => {
        ctx.fillText(line, anchorX, titleY + (i * lineHeight));
    });
    ctx.restore();

    // Section 6 (Episode Block) was moved to top


    // --- 7. GENRES (Material Polish) ---
    let gx = anchorX;
    
    ctx.font = '900 11px sans-serif'; 
    ctx.letterSpacing = '1px';
    (media.genres || []).slice(0, 3).forEach(g => {
        const txt = g.toUpperCase();
        const gw = ctx.measureText(txt).width + 30;
        
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(gx, footerY, gw, 32, 10); 
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; 
        ctx.fill();
        
        // Material Highlight Edge
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.75)'; 
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, gx + gw/2, footerY + 16.5);
        ctx.restore();
        gx += gw + 10;
    });

    // WATERMARK
    ctx.restore(); 
    ctx.textAlign = 'right';
    ctx.font = '900 11px sans-serif';
    ctx.letterSpacing = '8.5px';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('ANIMUSE ALERTS', baseW - margin, baseH - margin); 

    return await canvas.encode('webp', { quality: 85 });
};

module.exports = { generateAiringCard };
