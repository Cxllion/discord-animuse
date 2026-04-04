const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const { generateColorTokens } = require('../core/visualUtils');

// --- Configuration ---
// Card Dimensions (2.5x High-Fidelity Density)
const BASE_W = 1500;
const BASE_H = 850;

/**
 * Generates a retina-quality "Cyber Librarian" standalone access card.
 */
const generateWelcomeCard = async (member) => {
    // Generate theme tokens based on member color
    const tokens = generateColorTokens(member.displayHexColor || '#FFACD1');

    // Render at high resolution for maximum clarity
    const canvas = createCanvas(BASE_W, BASE_H);
    const ctx = canvas.getContext('2d');
    
    // Smooth rendering for vectors
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 1. CARD CONTAINER
    const cardX = 0;
    const cardY = 0;
    const CARD_W = BASE_W;
    const CARD_H = BASE_H;
    const cardRadius = 50;

    // A. Draw Archival Surface (Obsidian Backdrop)
    ctx.fillStyle = tokens.surface;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, CARD_W, CARD_H, cardRadius);
    ctx.fill();

    // B. Clip for Internal Content
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, CARD_W, CARD_H, cardRadius);
    ctx.clip();

    // C. Sublte Cyber Grid Overlay
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < CARD_W; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CARD_H); ctx.stroke();
    }
    for (let y = 0; y < CARD_H; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CARD_W, y); ctx.stroke();
    }

    // --- CARD DESIGN ---
    // 3. ARCHIVAL HUD HEADER
    const headerH = 220;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(cardX, cardY, CARD_W, headerH);

    // Dynamic Glow Tab (The Librarian's Aura)
    const g = ctx.createLinearGradient(0, 0, CARD_W, 0);
    g.addColorStop(0, tokens.primary + 'AA');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.fillRect(cardX, cardY + headerH - 12, CARD_W, 12);

    // Text: ANIMUSE ARCHIVES
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 85px monalqo, sans-serif';
    ctx.letterSpacing = '12px'; 
    ctx.fillText('ANIMUSE ARCHIVES', cardX + 300, cardY + 115);

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '900 28px monalqo, sans-serif';
    ctx.letterSpacing = '8px'; 
    ctx.fillText('RESTRICTED ACCESS // MEMBER PASS', cardX + 300, cardY + 168);

    // Archival Dot Metadata Delimiters (HUD Style)
    const drawDot = (dx, dy) => {
        ctx.beginPath(); ctx.arc(dx, dy, 4, 0, Math.PI * 2); 
        ctx.fillStyle = tokens.primary; ctx.fill();
    };
    drawDot(cardX + 310, cardY + 185);
    drawDot(cardX + 600, cardY + 185);
    drawDot(cardX + 850, cardY + 185);

    // Logo Emblem (Cyber-Book Variant)
    const logoCenterX = cardX + 150;
    const logoCenterY = cardY + 110;
    
    ctx.beginPath();
    ctx.arc(logoCenterX, logoCenterY, 75, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fill();
    ctx.strokeStyle = tokens.primary; ctx.lineWidth = 4; ctx.stroke();
    
    // Draw Vector Book
    ctx.save();
    ctx.translate(logoCenterX, logoCenterY);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Book Cover / Spreads
    ctx.beginPath();
    // Left Page
    ctx.moveTo(-45, -30);
    ctx.bezierCurveTo(-45, -45, -5, -45, -5, -30);
    ctx.lineTo(-5, 25);
    ctx.bezierCurveTo(-5, 10, -45, 10, -45, 25);
    ctx.closePath();
    ctx.stroke();

    // Right Page
    ctx.beginPath();
    ctx.moveTo(45, -30);
    ctx.bezierCurveTo(45, -45, 5, -45, 5, -30);
    ctx.lineTo(5, 25);
    ctx.bezierCurveTo(5, 10, 45, 10, 45, 25);
    ctx.closePath();
    ctx.stroke();

    // Technical Data Lines (The 'Reading' aspect)
    ctx.lineWidth = 4;
    ctx.strokeStyle = tokens.primary;
    ctx.globalAlpha = 0.6;
    // Lines on left page
    ctx.beginPath(); ctx.moveTo(-35, -15); ctx.lineTo(-15, -15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-35, -2); ctx.lineTo(-15, -2); ctx.stroke();
    // Lines on right page
    ctx.beginPath(); ctx.moveTo(35, -15); ctx.lineTo(15, -15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(35, -2); ctx.lineTo(15, -2); ctx.stroke();
    
    ctx.restore();
    ctx.textAlign = 'left';

    // 4. PHOTO AREA (Scientific Framing)
    const photoSize = 400;
    const photoX = cardX + 120;
    const photoY = cardY + headerH + 85;

    // Avatar Glow & Frame
    ctx.shadowColor = tokens.primary + '44'; ctx.shadowBlur = 40;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 15;
    ctx.strokeRect(photoX - 10, photoY - 10, photoSize + 20, photoSize + 20);
    ctx.shadowBlur = 0;

    // Corner Accents (Cyber Style)
    ctx.strokeStyle = tokens.primary; ctx.lineWidth = 5;
    const cl = 40; // Corner Length
    // TL
    ctx.beginPath(); ctx.moveTo(photoX - 25, photoY + cl); ctx.lineTo(photoX - 25, photoY - 25); ctx.lineTo(photoX + cl, photoY - 25); ctx.stroke();
    // BR
    ctx.beginPath(); ctx.moveTo(photoX + photoSize + 25 - cl, photoY + photoSize + 25); ctx.lineTo(photoX + photoSize + 25, photoY + photoSize + 25); ctx.lineTo(photoX + photoSize + 25, photoY + photoSize + 25 - cl); ctx.stroke();

    // Avatar Loading
    const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 1024 });
    let avatarImg;
    try { avatarImg = await loadImage(avatarURL); } catch { avatarImg = null; }

    if (avatarImg) {
        ctx.drawImage(avatarImg, photoX, photoY, photoSize, photoSize);
    } else {
        ctx.fillStyle = '#222'; ctx.fillRect(photoX, photoY, photoSize, photoSize);
    }

    // Role Tag: ARCHIVIST
    const tagW = 320;
    const tagH = 75;
    const tagX = photoX + (photoSize - tagW) / 2;
    const tagY = photoY + photoSize + 60;

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.roundRect(tagX, tagY, tagW, tagH, 15); ctx.fill();
    ctx.strokeStyle = tokens.primary + '44'; ctx.lineWidth = 2; ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 32px monalqo, sans-serif';
    ctx.letterSpacing = '4px'; ctx.textAlign = 'center';
    ctx.fillText('READER', tagX + tagW / 2, tagY + 48);
    ctx.textAlign = 'left'; ctx.letterSpacing = '0px'; 

    // 5. DATA AREA (Right Side)
    const contentX = cardX + 660;
    let contentY = cardY + headerH + 140;

    // Metadata Labels
    const drawLabel = (text, lx, ly) => {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = '700 24px monalqo, sans-serif';
        ctx.letterSpacing = '3px';
        ctx.fillText(text, lx, ly);
    };

    drawLabel('DISPLAY_NAME', contentX, contentY);
    contentY += 92;
    ctx.fillStyle = '#FFFFFF';
    const nameStr = member.displayName.toUpperCase();
    let nameSize = 110;
    ctx.font = `900 ${nameSize}px monalqo, sans-serif`;
    while (ctx.measureText(nameStr).width > 750 && nameSize > 60) {
        nameSize -= 5;
        ctx.font = `900 ${nameSize}px monalqo, sans-serif`;
    }
    ctx.fillText(nameStr, contentX, contentY);

    contentY += 125;
    const col2X = contentX + 410;
    drawLabel('MEMBER_ID', contentX, contentY);
    drawLabel('ENTRY_DATE', col2X, contentY);

    contentY += 60;
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 50px monalqo, monospace';
    ctx.fillText(member.guild.memberCount.toString().padStart(8, '0'), contentX, contentY);

    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '.');
    ctx.fillText(dateStr, col2X, contentY);

    // 6. ARCHIVAL SIGNATURE
    contentY += 140;
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(contentX, contentY); ctx.lineTo(contentX + 580, contentY); ctx.stroke();

    ctx.fillStyle = tokens.primary;
    ctx.font = 'italic 78px arial, cursive';
    ctx.globalAlpha = 0.8;
    ctx.fillText(member.user.username, contentX + 30, contentY - 20);
    ctx.globalAlpha = 1.0;

    // 7. HOLOGRAPHIC SEAL (Digital Approval)
    ctx.save();
    const sealX = cardX + CARD_W - 240;
    const sealY = cardY + CARD_H - 190;
    ctx.translate(sealX, sealY);
    ctx.rotate(-0.1);

    // Glowing Ring
    ctx.shadowColor = tokens.glow; ctx.shadowBlur = 35;
    ctx.strokeStyle = tokens.glow; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(0, 0, 100, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;

    // Inner Text
    ctx.fillStyle = tokens.glow;
    ctx.font = '900 32px monalqo, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('VERIFIED', 0, -10);
    ctx.font = '700 18px monalqo, sans-serif';
    ctx.fillText('ARCHIVES', 0, 25);
    ctx.restore();

    // 8. FINAL CINEMATIC OVERLAY
    const glass = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
    glass.addColorStop(0, 'rgba(255,255,255,0.02)');
    glass.addColorStop(0.5, 'transparent');
    glass.addColorStop(1, 'rgba(255,255,255,0.02)');
    ctx.fillStyle = glass;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    ctx.restore();
    return await canvas.encode('webp', { quality: 95 });
};

module.exports = { generateWelcomeCard };