const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { generateColorTokens, parseMetadata } = require('../core/visualUtils');

/**
 * ACTIVITY NOTIFICATION GENERATOR - V3 (Search Sync Alignment)
 * Features: Exact Stat-Cloud, Exact Background Bloom, Correct Episode Labels.
 */
const generateActivityCard = async (userMeta, activityData) => {
    const SCALE = 1.5; // Reduced from 2.0 for faster loading while retaining high fidelity
    const baseW = 1200; 
    const baseH = 440; 
    const width = baseW * SCALE;
    const height = baseH * SCALE;

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    const media = activityData.media || {};
    const tokens = generateColorTokens(media.coverImage?.color || userMeta.themeColor || '#FFACD1');
    
    // --- 1. THE CANVAS BOUNDARY ---
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(0, 0, baseW, baseH, 45);
    ctx.clip(); 

    ctx.fillStyle = tokens.surface;
    ctx.fillRect(0, 0, baseW, baseH);

    // --- 2. THE BACKGROUND (PORTED SEARCH BLOOM) ---
    try {
        const bgUrl = media.bannerImage || media.coverImage?.extraLarge;
        if (bgUrl) {
            const bgImg = await loadImage(bgUrl);
            ctx.save();
            const scale = Math.max(baseW / bgImg.width, baseH / bgImg.height);
            const x = (baseW - bgImg.width * scale) / 2;
            const y = (baseH - bgImg.height * scale) / 2;
            
            // Clean layer
            ctx.drawImage(bgImg, x, y, bgImg.width * scale, bgImg.height * scale);

            // Atmospheric Bloom & Depth (Matched to Search)
            ctx.filter = 'blur(40px) saturate(1.8)';
            ctx.globalAlpha = 0.6;
            ctx.drawImage(bgImg, x, y, baseW, baseH);
            
            // The Dark Curtain (Vertical Vignette from Search)
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

    // Content Layer: Mesh Accents
    const g1 = ctx.createRadialGradient(baseW * 0.9, baseH * 0.1, 0, baseW * 0.9, baseH * 0.1, baseW * 0.6);
    g1.addColorStop(0, tokens.primary + '40');
    g1.addColorStop(1, 'transparent');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, baseW, baseH);

    // --- 3. THE POSTER (CENTERED VERTICALLY) ---
    const pH = 370; 
    const pW = pH * 0.7;
    const pX = 40;
    const pY = (baseH - pH) / 2; 
    try {
        const coverUrl = media.coverImage?.extraLarge || media.coverImage?.large;
        if (coverUrl) {
            const cImg = await loadImage(coverUrl);
            ctx.save();
            
            // Poster Shadow
            ctx.shadowColor = 'rgba(0,0,0,0.9)';
            ctx.shadowBlur = 60;
            ctx.shadowOffsetY = 15;
            
            ctx.beginPath();
            ctx.roundRect(pX, pY, pW, pH, 25);
            ctx.fillStyle = '#000';
            ctx.fill();
            ctx.clip(); 
            
            ctx.shadowColor = 'transparent';
            ctx.drawImage(cImg, pX, pY, pW, pH);

            // --- Poster-Locked Metadata Tags (Ported from Search) ---
            const rawTitle = media?.title?.english || media?.title?.romaji || media?.title?.native || 'Unknown Title';
            const { tags: metadataTags } = parseMetadata(rawTitle);

            if (metadataTags && metadataTags.length > 0) {
                const isSolo = metadataTags.length === 1;
                const th = isSolo ? 38 : 30; // Slightly scaled for activity layout
                const fontSize = isSolo ? 18 : 14;
                const radius = 8; // Modern rectangle with rounded corners
                const horizontalPadding = isSolo ? 40 : 30;
                
                let tagY = pY + 15;
                metadataTags.slice(0, 2).forEach(tag => { // Show up to 2 tags
                    ctx.font = `900 ${fontSize}px sans-serif`;
                    ctx.letterSpacing = '1px';
                    const tagText = tag.toUpperCase();
                    const tw = ctx.measureText(tagText).width + horizontalPadding;
                    const tagX = pX + pW - tw - 15;

                    ctx.save();
                    ctx.beginPath();
                    ctx.roundRect(tagX, tagY, tw, th, radius); 
                    ctx.fillStyle = 'rgba(0,0,0,0.5)'; // Darker for high contrast on poster
                    ctx.fill();
                    
                    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    ctx.fillStyle = '#FFF';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(tagText, tagX + tw/2, tagY + th/2 + 0.5); 
                    ctx.restore();

                    tagY += th + 10;
                });
            }

            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
        }
    } catch (e) { }

    // --- 4. THE CONTENT (HUB ALIGNMENT) ---
    const contentX = pX + pW + 65;
    const contentW = baseW - contentX - 60;

    // CONTENT SHIELD (Enhanced Contrast - Ported from Search)
    ctx.save();
    const maskG = ctx.createLinearGradient(contentX - 60, 0, baseW, 0);
    maskG.addColorStop(0, 'rgba(0,0,0,0)');
    maskG.addColorStop(0.3, 'rgba(0,0,0,0.5)');
    maskG.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = maskG;
    ctx.fillRect(contentX - 60, 0, baseW, baseH);
    ctx.restore();

    let curY = 55;

    // A. USER HEADLINE
    try {
        const avatarSize = 64;
        if (userMeta.avatarUrl) {
            const avatarImg = await loadImage(userMeta.avatarUrl);
            ctx.save();
            ctx.beginPath();
            ctx.arc(contentX + (avatarSize/2), curY + (avatarSize/2), avatarSize/2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(avatarImg, contentX, curY, avatarSize, avatarSize);
            ctx.restore();
            
            ctx.beginPath();
            ctx.arc(contentX + (avatarSize/2), curY + (avatarSize/2), avatarSize/2, 0, Math.PI * 2);
            ctx.strokeStyle = '#FFF'; 
            ctx.lineWidth = 2.5;
            ctx.stroke();
        }

        const txtX = contentX + avatarSize + 22;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        ctx.font = '900 24px sans-serif';
        ctx.fillStyle = '#FFF';
        ctx.letterSpacing = '1px';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 10;
        ctx.fillText((userMeta.username || 'USER').toUpperCase(), txtX, curY + 4);
        ctx.shadowBlur = 0;
        
        // --- ACTION VERB LOGIC FIX (Don't Overwrite Progress) ---
        let displayVerb = 'INTERACTED WITH';
        const rawStatus = (activityData.status || '').toLowerCase();
        const progress = activityData.progress || '?';

        const isManga = media.type === 'MANGA' || rawStatus.includes('chapter') || rawStatus.includes('volume');
        const verb = isManga ? 'READING' : 'WATCHING';
        const verbPast = isManga ? 'READ' : 'WATCHED';

        if (rawStatus.includes('watched')) displayVerb = `WATCHED EPISODE ${activityData.progress || '??'}`;
        else if (rawStatus.includes('read')) displayVerb = `READ ${rawStatus.includes('volume') ? 'VOLUME' : 'CHAPTER'} ${activityData.progress || '??'}`;
        else if (rawStatus.includes('completed')) displayVerb = `FINISHED ${verb}`;
        else if (rawStatus.includes('planning')) displayVerb = `PLANS TO ${isManga ? 'READ' : 'WATCH'}`;
        else if (rawStatus.includes('dropped')) displayVerb = `QUIT ${verb}`;
        
        ctx.font = '900 13px sans-serif';
        ctx.letterSpacing = '1.5px';
        const finalVerbText = displayVerb.toUpperCase();
        const tw = ctx.measureText(finalVerbText).width + 30;
        const th = 26;
        
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(txtX, curY + 36, tw, th, 6);
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; 
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        ctx.fillStyle = '#FFF';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(finalVerbText, txtX + tw/2, curY + 36 + th/2 + 1);
        ctx.restore();

        // --- PERSONAL HEART BADGE (Vector Heart + Precision Centering) ---
        if (activityData.score) {
            let scoreStr = activityData.score.toString();
            if (activityData.score > 10) scoreStr = `${activityData.score}`; 
            else if (activityData.score <= 5 && Number.isInteger(activityData.score)) scoreStr = `${activityData.score}/5`;
            else scoreStr = `${activityData.score}/10`;

            ctx.font = '900 13px sans-serif';
            ctx.letterSpacing = '0px';
            const textW = ctx.measureText(scoreStr).width;
            
            const heartSize = 12;
            const gap = 6;
            const totalContentW = heartSize + gap + textW;
            const bw = totalContentW + 18;
            const bh = 26;
            
            const bx = contentX - 12;
            const by = curY - 12;

            ctx.save();
            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, 8);
            ctx.fillStyle = 'rgba(0,0,0,0.85)'; 
            ctx.fill();
            ctx.strokeStyle = tokens.primary; 
            ctx.lineWidth = 1.8;
            ctx.stroke();

            // Center content group
            const startX = bx + (bw - totalContentW) / 2;
            const centerV = by + (bh / 2);

            // Draw Vector Heart (Sleeker shape)
            ctx.fillStyle = tokens.primary;
            const hx = startX + heartSize / 2;
            const hy = centerV - heartSize / 2 + 1;
            
            ctx.beginPath();
            ctx.moveTo(hx, hy + 3);
            ctx.bezierCurveTo(hx, hy, hx - 6, hy, hx - 6, hy + 3);
            ctx.bezierCurveTo(hx - 6, hy + 7, hx, hy + 10, hx, hy + 11);
            ctx.bezierCurveTo(hx, hy + 10, hx + 6, hy + 7, hx + 6, hy + 3);
            ctx.bezierCurveTo(hx + 6, hy, hx, hy, hx, hy + 3);
            ctx.fill();

            // Draw Score Text
            ctx.fillStyle = tokens.primary;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(scoreStr, startX + heartSize + gap, centerV + 0.5);
            ctx.restore();
        }
    } catch (e) { }

    curY += 95;

    // B. TITLE
    const rawTitle = media.title?.english || media.title?.romaji || 'Unknown Title';
    const { title: cleanTitle } = parseMetadata(rawTitle);

    let fSize = 85; 
    let lines = [];
    let lH = 0;
    while (fSize > 40) {
        ctx.font = `900 ${fSize}px sans-serif`;
        ctx.letterSpacing = '-3px';
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

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 25;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.slice(0, 2).forEach((l, i) => {
        ctx.fillText(l, contentX, curY + (i * lH)); 
    });
    ctx.restore();

    curY += (Math.min(lines.length, 2) * lH) + 25;

    // C. STAT CLOUD (Sourced from AniList globals as per user request)
    let podX = contentX;
    const sVal = (media.meanScore || media.averageScore);
    
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
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fill();
            if (fill > 0) {
                ctx.save();
                ctx.clip();
                ctx.fillStyle = '#FFF'; 
                ctx.fillRect(-size, -size, size * 2 * fill, size * 2);
                ctx.restore();
            }
            ctx.restore();
        };

        const starSize = 10;
        const starGap = 8; 
        const starBlockW = (5 * starSize * 2) + (4 * starGap);
        
        ctx.font = '900 18px sans-serif'; 
        ctx.letterSpacing = '0px'; // FIX: Reset before measuring!
        const scoreW = ctx.measureText(score10).width;
        const innerPillPadding = 25; 
        const innerPillW = scoreW + (innerPillPadding * 2);
        const innerPillH = 38; // Slightly larger for centering air
        const sh = 50;
        const innerPillMargin = (sh - innerPillH) / 2; 
        
        const leftPadding = 22;
        const midGap = 12; 
        const sw = leftPadding + starBlockW + midGap + innerPillW + innerPillMargin;
        
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(podX, curY, sw, sh, 25);
        ctx.fillStyle = 'rgba(255,255,255,0.15)'; 
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        let sx = podX + leftPadding + starSize;
        const sy = curY + (sh/2) + 1; 
        for (let i = 0; i < 5; i++) {
            const fill = Math.max(0, Math.min(1, stars - i));
            drawStar(sx, sy, starSize, fill);
            sx += (starSize * 2) + starGap;
        }

        const innerX = podX + sw - innerPillW - innerPillMargin;
        const innerY = curY + innerPillMargin;
        ctx.beginPath();
        ctx.roundRect(innerX, innerY, innerPillW, innerPillH, 19);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fill();

        ctx.fillStyle = '#FFF'; 
        ctx.textAlign = 'left'; // Using manual centering for pixel-perfect alignment
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = '0px'; 
        const textX = innerX + (innerPillW - scoreW) / 2;
        const textY = innerY + (innerPillH / 2);
        ctx.fillText(score10, textX, textY); 
        ctx.restore();
        
        podX += sw + 15;
    }

    // D. SECONDARY PODS
    const drawSmallPod = (text, icon) => {
        ctx.font = '800 14px sans-serif';
        ctx.letterSpacing = '1px';
        const tW = ctx.measureText(text).width + (icon ? 25 : 0);
        const pW = tW + 35;
        const pH = 50;
        
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(podX, curY, pW, pH, 25);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#FFF';
        ctx.textAlign = 'center'; 
        ctx.textBaseline = 'middle';
        if (icon) {
            ctx.fillStyle = tokens.primary;
            ctx.fillText(icon, podX + 22, curY + pH/2 + 1);
            ctx.fillStyle = '#FFF';
            ctx.fillText(text, podX + 22 + (tW/2) + 2, curY + pH/2 + 1);
        } else {
            ctx.fillText(text, podX + pW/2, curY + pH/2 + 1);
        }
        ctx.restore();
        podX += pW + 15;
    };

    const format = (media.format || 'TV').replace(/_/g, ' ');
    drawSmallPod(format.toUpperCase(), '');

    // Title Pod removed as per user request

    // --- 5. FINISH (Clean Footer) ---
    ctx.restore(); 
    ctx.textAlign = 'right';
    ctx.font = '900 11px sans-serif';
    ctx.letterSpacing = '6.5px';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText('ANIMUSE ACTIVITY', baseW - 50, baseH - 35); 

    return await canvas.encode('webp', { quality: 85 });
};

module.exports = { generateActivityCard };
