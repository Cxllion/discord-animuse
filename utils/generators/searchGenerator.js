const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { generateColorTokens, parseMetadata } = require('../core/visualUtils');

/**
 * ARCHIVIST SEARCH GENERATOR - V2 (Premium Redesign)
 * Features: 2x HD Scale, 3-Line Elastic Titles, Dynamic Multi-Tags, Paragraph Balancing.
 */
const generateSearchCard = async (media, userColor = '#FFACD1') => {
    const SCALE = 2;
    const baseW = 1280; 
    const baseH = 720; // 16:9 Cinematic
    const width = baseW * SCALE;
    const height = baseH * SCALE;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    const tokens = generateColorTokens(media?.coverImage?.color || userColor);
    
    // --- 1. THE CANVAS (GLOBAL EDGE) ---
    ctx.save(); // Protect global state
    ctx.beginPath();
    ctx.roundRect(0, 0, baseW, baseH, 40);
    ctx.clip(); // All contents clipped to 40px radius
    ctx.fillStyle = tokens.surface;
    ctx.fillRect(0, 0, baseW, baseH);

    // --- 2. THE BACKGROUND (FULL-BLEED CINEMATIC) ---
    try {
        const bgUrl = media.bannerImage || media.coverImage?.extraLarge;
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
    } catch (e) { }

    // Layering: Mesh Accents
    const g1 = ctx.createRadialGradient(baseW * 0.8, baseH * 0.2, 0, baseW * 0.8, baseH * 0.2, baseW * 0.6);
    g1.addColorStop(0, tokens.primary + '30');
    g1.addColorStop(1, 'transparent');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, baseW, baseH);

    // Material Noise
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.04;
    for (let i = 0; i < 3000; i++) {
        ctx.fillStyle = '#FFF';
        ctx.fillRect(Math.random() * baseW, Math.random() * baseH, 1, 1);
    }
    ctx.restore();

    // --- 3. THE HERO POSTER (CENTERED VERTICALLY) ---
    const pH = 560; // Elevated Presence
    const pW = pH * 0.7;
    const pX = 80;
    const pY = 60; // Elevated for vertical balance

    const rawTitle = media?.title?.english || media?.title?.romaji || media?.title?.native || 'Unknown Title';
    const { title: cleanTitle, tags: metadataTags } = parseMetadata(rawTitle);

    try {
        const coverUrl = media?.coverImage?.extraLarge || media?.coverImage?.large;
        if (coverUrl) {
            const cImg = await loadImage(coverUrl);
        ctx.save();
        
        // Poster Shadow
        ctx.shadowColor = 'rgba(0,0,0,1)';
        ctx.shadowBlur = 120;
        ctx.shadowOffsetY = 40;
        
        ctx.beginPath();
        ctx.roundRect(pX, pY, pW, pH, 30);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.clip();
        
        ctx.shadowColor = 'transparent';
        ctx.drawImage(cImg, pX, pY, pW, pH);

        // --- Poster-Locked Metadata Tags (V10.5 Glass Pillars) ---
        if (metadataTags && metadataTags.length > 0) {
            const isSolo = metadataTags.length === 1;
            const th = isSolo ? 40 : 32;
            const fontSize = isSolo ? 20 : 15;
            const radius = th / 2;
            const horizontalPadding = isSolo ? 48 : 34;
            
            let tagY = pY + 15;
            metadataTags.slice(0, 3).forEach(tag => {
                ctx.font = `900 ${fontSize}px sans-serif`;
                ctx.letterSpacing = '1px';
                const tagText = tag.toUpperCase();
                const tw = ctx.measureText(tagText).width + horizontalPadding;
                const tagX = pX + pW - tw - 15;

                ctx.save();
                // Tag Backdrop (More transparent glass)
                ctx.beginPath();
                ctx.roundRect(tagX, tagY, tw, th, radius); 
                ctx.fillStyle = 'rgba(0,0,0,0.32)';
                ctx.fill();
                
                // Diffused Gloss
                ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Tag Text (With visibility shadow)
                ctx.fillStyle = '#FFF';
                ctx.shadowColor = 'rgba(0,0,0,0.4)';
                ctx.shadowBlur = 8;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(tagText, tagX + tw/2, tagY + th/2); 
                ctx.restore();

                tagY += th + 12; // Adjusted rhythm for larger pills
            });
        }

        // Highlight stroke
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
        }
    } catch (e) { }

    // --- 4. THE GRID (SMART POSITIONING ENGINE) ---
    const gridMargin = 85;
    const contentX = pX + pW + gridMargin; 
    const contentW = baseW - contentX - gridMargin;

    // A. CONTENT SHIELD (Enhanced Contrast)
    ctx.save();
    const maskG = ctx.createLinearGradient(contentX - 60, 0, baseW, 0);
    maskG.addColorStop(0, 'rgba(0,0,0,0)');
    maskG.addColorStop(0.3, 'rgba(0,0,0,0.5)');
    maskG.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = maskG;
    ctx.fillRect(contentX - 60, 0, baseW, baseH);
    ctx.restore();

    // B. Metadata HUD (V8.6 Media-Aware Architecture)
    const isManga = media?.type === 'MANGA';
    const format = (media?.format || (isManga ? 'MANGA' : 'TV')).replace(/_/g, ' ');
    const year = media?.seasonYear || media?.startDate?.year || 'TBA';
    
    let baseMeta = '';
    let extraCount = 0;
    let studioNodes = [];

    if (isManga) {
        baseMeta = `${format}  •  ${year}`;
    } else {
        studioNodes = media.studios?.nodes || [];
        const rawStudio = studioNodes[0]?.name || 'TBA';
        const studio = rawStudio.replace(/studio/gi, '').trim().split(' ')[0] || 'TBA';
        extraCount = studioNodes.length - 1;
        baseMeta = `${format}  •  ${year}  •  ${studio.toUpperCase()}`;
    }

    ctx.save();
    ctx.font = '900 18px sans-serif'; 
    ctx.letterSpacing = '10px';
    const baseMetaW = ctx.measureText(baseMeta).width;
    
    // Calculate Extra Pill if needed (Anime only)
    let extraPillW = 0;
    const extraPillH = 18; // Matched to studio name font size (18px)
    if (!isManga && extraCount > 0) {
        ctx.font = '900 11px sans-serif'; // Tighter font for the smaller pill
        ctx.letterSpacing = '1px';
        extraPillW = ctx.measureText(`+${extraCount}`).width + 14; 
    }

    const totalTargetW = baseMetaW + (extraCount > 0 ? extraPillW + 12 : 0);
    const pillW = totalTargetW + 160;
    const pillH = 60; 
    
    // The Bleeding Path
    ctx.beginPath();
    ctx.moveTo(baseW, 0); 
    ctx.lineTo(baseW - pillW, 0); 
    ctx.lineTo(baseW - pillW, pillH - 30); 
    ctx.arcTo(baseW - pillW, pillH, baseW - pillW + 30, pillH, 30); 
    ctx.lineTo(baseW, pillH); 
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();

    // Draw Main Metadata (Centering within tab with optical offset)
    ctx.font = '900 18px sans-serif'; 
    ctx.letterSpacing = '10px';
    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const startX = baseW - (pillW/2) - (totalTargetW/2) + 20; 
    ctx.fillText(baseMeta, startX, pillH/2 + 2);

    // Draw Extra Cluster Pill (V8.8 Matched Scale)
    if (extraCount > 0) {
        const pillX = startX + baseMetaW + 2; 
        const pillY = pillH/2 - (extraPillH/2) + 2; // Precise sync with 18px text
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, extraPillW, extraPillH, 9);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        ctx.font = '900 11px sans-serif';
        ctx.letterSpacing = '1px';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFF';
        ctx.fillText(`+${extraCount}`, pillX + extraPillW/2, pillY + extraPillH/2 + 1);
    }
    ctx.restore();

    // C. DYNAMIC HUB ORCHESTRATION (PERIMETER LOCK)
    let fSize = 100;
    let lines = [];
    let lH = 0;
    while (fSize > 40) {
        ctx.font = `900 ${fSize}px sans-serif`;
        ctx.letterSpacing = '-5px';
        lines = []; let cur = '';
        for (let w of cleanTitle.split(' ')) {
            if (ctx.measureText(cur + w + ' ').width > contentW) { lines.push(cur.trim()); cur = w + ' '; }
            else cur += w + ' ';
        }
        lines.push(cur.trim());
        lH = fSize * 0.95;
        if (lines.length <= 2) break;
        fSize -= 5;
    }

    // Grid Metrics
    const titleH = lines.length * lH;
    const podH = 60;
    const gap = 30;
    
    // Calculate Synopsis space within the 560px Poster Perimeter
    const synH = Math.min(260, pH - titleH - podH - (gap * 2) - 20); 
    const totalContentH = titleH + gap + podH + gap + synH;
    
    // Perfect Centering within Poster Height (pY=60 to 620)
    const startY = pY + (pH - totalContentH) / 2;

    // Draw Title
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#FFF';
    lines.forEach((l, i) => {
        ctx.fillText(l, contentX, startY + (i * lH)); 
    });
    let curY = startY + titleH + gap;
    let podX = contentX;

    // C. STAT CLOUD (V9.6 UNIVERSAL ARCHITECTURE)
    const sVal = media.meanScore || media.averageScore;
    if (sVal) {
        const score10 = (sVal / 10).toFixed(1);
        const stars = sVal / 20; 
        
        const drawStar = (x, y, size, fill) => {
            ctx.save();
            ctx.translate(x, y);
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                ctx.lineTo(Math.cos((18 + i * 72) / 180 * Math.PI) * size, 
                           -Math.sin((18 + i * 72) / 180 * Math.PI) * size);
                ctx.lineTo(Math.cos((54 + i * 72) / 180 * Math.PI) * (size * 0.5), 
                           -Math.sin((54 + i * 72) / 180 * Math.PI) * (size * 0.5));
            }
            ctx.closePath();
            
            // Empty part (Subtle indent)
            ctx.fillStyle = 'rgba(0,0,0,0.1)';
            ctx.fill();
            
            // Filled part
            if (fill > 0) {
                ctx.save();
                ctx.clip();
                ctx.fillStyle = tokens.surface; 
                ctx.fillRect(-size, -size, size * 2 * fill, size * 2);
                ctx.restore();
            }
            ctx.restore();
        };

        const starSize = 12;
        const starGap = 10; 
        const starBlockW = (5 * starSize * 2) + (4 * starGap);
        
        ctx.font = '900 22px sans-serif'; 
        const scoreW = ctx.measureText(score10).width;
        const innerPillPadding = 40; // Substantial horizontal presence
        const innerPillW = scoreW + (innerPillPadding * 2);
        const innerPillH = 40; 
        const innerPillMargin = 10; 
        
        const leftPadding = 28;
        const midGap = 15; // Move closer to stars to occupy the space
        const sw = leftPadding + starBlockW + midGap + innerPillW + innerPillMargin;
        
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(podX, curY, sw, 60, 30);
        const g = ctx.createLinearGradient(podX, curY, podX + sw, curY);
        g.addColorStop(0, tokens.primary);
        g.addColorStop(1, tokens.glow);
        ctx.fillStyle = g;
        ctx.fill();

        // Stars (Optical Centering +1.5px)
        let sx = podX + leftPadding + starSize;
        const sy = curY + 30 + 1.5; 
        for (let i = 0; i < 5; i++) {
            const fill = Math.max(0, Math.min(1, stars - i));
            drawStar(sx, sy, starSize, fill);
            sx += (starSize * 2) + starGap;
        }

        // Expanded Inner Pill for Numerals
        const innerX = podX + sw - innerPillW - innerPillMargin;
        const innerY = curY + innerPillMargin;
        ctx.beginPath();
        ctx.roundRect(innerX, innerY, innerPillW, innerPillH, 20);
        ctx.fillStyle = 'rgba(0,0,0,0.14)';
        ctx.fill();

        // Centered Numerals
        ctx.fillStyle = tokens.surface;
        ctx.textAlign = 'center'; 
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = '0px'; 
        ctx.fillText(score10, innerX + innerPillW/2, innerY + innerPillH/2 + 1); 
        ctx.restore();
        
        podX += sw + 20; // Advance grid
    }

    // --- Status Pod (Independent) ---
    const statusRaw = media?.status || 'TBA';
    const statusClean = statusRaw.replace(/_/g, ' ').toUpperCase();
    
    // Dynamic Status Color Map
    const statusMap = {
        'FINISHED': { base: '#2ECC71', bg: 'rgba(46, 204, 113, 0.14)' },
        'RELEASING': { base: '#3498DB', bg: 'rgba(52, 152, 219, 0.14)' },
        'NOT_YET_RELEASED': { base: '#F1C40F', bg: 'rgba(241, 196, 15, 0.14)' },
        'CANCELLED': { base: '#E74C3C', bg: 'rgba(231, 76, 60, 0.14)' },
        'HIATUS': { base: '#9B59B6', bg: 'rgba(155, 89, 182, 0.14)' }
    };
    const theme = statusMap[statusRaw] || { base: '#FFF', bg: 'rgba(255, 255, 255, 0.06)' };

    ctx.font = '900 15px sans-serif'; 
    ctx.letterSpacing = '4px';
    const stW = ctx.measureText(statusClean).width + 60;
    
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(podX, curY, stW, 60, 30);
    ctx.fillStyle = theme.bg;
    ctx.fill();
    
    // Subtle inner glow/border for the color
    ctx.strokeStyle = theme.base + '33'; 
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = theme.base; // Tinted text for premium feel
    ctx.globalAlpha = 0.8; 
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(statusClean, podX + stW/2, curY + 30);
    ctx.restore();

    curY += 90; 

    // D. SYNOPSIS ZONE (V9.6: High Precision Tyopgraphy)
    ctx.letterSpacing = '0px'; // CRITICAL: Reset tracking to avoid Title/HUD bleeding
    let descRaw = (media?.description || 'No database summary.').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    
    // Phase 1: word-limit/sentence truncation
    const targetLimit = 50;
    const words = descRaw.split(' ');
    let desc = '';
    
    if (words.length <= targetLimit) {
        desc = descRaw;
    } else {
        const sentenceEndRegex = /[.!?](\s|$)/g;
        const approximateCharLimit = words.slice(0, targetLimit).join(' ').length;
        const tolerance = 80; 
        let matches = [...descRaw.matchAll(sentenceEndRegex)];
        let bestBreak = -1;

        for (const m of matches) {
            const index = m.index + 1;
            if (index >= approximateCharLimit - tolerance && index <= approximateCharLimit + tolerance) bestBreak = index;
            if (index > approximateCharLimit + tolerance) break;
        }

        if (bestBreak !== -1) desc = descRaw.substring(0, bestBreak).trim();
        else desc = words.slice(0, targetLimit).join(' ') + '...';
    }
    
    // Phase 2: Container-aware scaling & line calculation
    let sSize = 25;
    let sLines = [], sLead = 0;
    const calculateLines = (text, size) => {
        ctx.font = `${size}px sans-serif`;
        let lines = [], cur = '';
        for (let w of text.split(' ')) {
            if (ctx.measureText(cur + w + ' ').width > contentW) { lines.push(cur.trim()); cur = w + ' '; }
            else cur += w + ' ';
        }
        lines.push(cur.trim());
        return lines;
    };

    while (sSize > 18) {
        sLines = calculateLines(desc, sSize);
        sLead = sSize * 1.5;
        if (sLines.length * sLead <= synH) break;
        sSize -= 1;
    }

    // Phase 3: Final Overflow Rollback
    // If it still overflows at min size, truncate by line and rollback to sentence
    if (sLines.length * sLead > synH) {
        const maxLines = Math.floor(synH / sLead);
        const cutoffText = sLines.slice(0, maxLines).join(' ');
        const sentenceEndRegex = /[.!?](\s|$)/g;
        let lastSentenceEnd = -1;
        let m;
        while ((m = sentenceEndRegex.exec(cutoffText)) !== null) lastSentenceEnd = m.index + 1;

        if (lastSentenceEnd !== -1) {
            desc = cutoffText.substring(0, lastSentenceEnd).trim();
        } else {
            // No sentence ends, truncate at word and add ellipsis
            const cutWords = cutoffText.split(' ');
            desc = cutWords.slice(0, cutWords.length - 2).join(' ') + '...';
        }
        sLines = calculateLines(desc, sSize); // One final re-calc
    }

    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    sLines.forEach((l, i) => {
        ctx.fillText(l, contentX, curY + (i * sLead));
    });

    // E. SIGNATURE footer (TAGS + WATERMARK)
    const footerY = baseH - 65; // Slightly higher for more presence
    let gx = pX; 
    ctx.font = '900 15px sans-serif'; // Upscaled
    ctx.letterSpacing = '1.5px';
    (media.genres || []).slice(0, 4).forEach(g => {
        const txt = g.toUpperCase();
        const gw = ctx.measureText(txt).width + 36; // More breathing room
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(gx, footerY, gw, 38, 6); // Taller + softer corners
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; // Slightly more solid presence
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; // Increased text contrast
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(txt, gx + gw/2, footerY + 19);
        ctx.restore();
        gx += gw + 12; // Wider horizontal gap
    });

    // --- 5. FINISH: CLEAN EDGE-TO-EDGE ---
    ctx.restore(); // Flush all clipping
    
    // WATERMARK Alignment
    ctx.textAlign = 'right';
    ctx.font = '800 11px sans-serif';
    ctx.letterSpacing = '6px';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText('ANIMUSE ARCHIVES', baseW - 50, footerY + 20); 

    return await canvas.encode('png');
};

module.exports = { generateSearchCard };