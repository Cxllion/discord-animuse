const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

// --- Configuration ---
// Card Dimensions
const BASE_W = 600;
const BASE_H = 340;
const SCALE_FACTOR = 0.75; // Scales down to ~450px width for better chat fit

const WIDTH = BASE_W * SCALE_FACTOR;
const HEIGHT = BASE_H * SCALE_FACTOR;

// Pro ID Palette
const COLOR_CARD_BG = '#F4F4F4'; // Slightly off-white plastic
const COLOR_HEADER_BG = '#1a1a1a'; // Deep Black/Grey
const COLOR_HEADER_TEXT = '#FFFFFF';
const COLOR_INK_MAIN = '#050505';
const COLOR_INK_SUB = '#555555';
const COLOR_ACCENT = '#ff3366'; // Contemporary Red/Pink

/**
 * Generates a high-quality standalone "Library Access ID".
 */
const generateWelcomeCard = async (member) => {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    // Scale all subsequent drawing operations
    ctx.scale(SCALE_FACTOR, SCALE_FACTOR);

    // 1. CLEAR CANVAS (Transparent)
    // No background image logic needed.

    // 2. CARD CONTAINER
    // Draw using BASE dimensions since we are scaled
    const cardX = 0;
    const cardY = 0;
    const CARD_W = BASE_W;
    const CARD_H = BASE_H;
    const cardRadius = 24;

    // B. Draw Card Base
    ctx.fillStyle = COLOR_CARD_BG;
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, CARD_W, CARD_H, cardRadius);
    ctx.fill();

    // C. Clip for Internal Content
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, CARD_W, CARD_H, cardRadius);
    ctx.clip();

    // --- CARD DESIGN ---

    // 3. HEADER
    const headerH = 85;
    ctx.fillStyle = COLOR_HEADER_BG;
    ctx.fillRect(cardX, cardY, CARD_W, headerH);

    // Accent Stripe
    ctx.fillStyle = COLOR_ACCENT;
    ctx.fillRect(cardX, cardY + headerH - 8, CARD_W, 8);

    // Text: ANIMUSE LIBRARY
    ctx.fillStyle = COLOR_HEADER_TEXT;
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText('ANIMUSE LIBRARY', cardX + 110, cardY + 45);

    ctx.fillStyle = '#BBB';
    ctx.font = '12px sans-serif';
    ctx.letterSpacing = 2;
    ctx.fillText('OFFICIAL MEMBER ACCESS PASS', cardX + 110, cardY + 66);

    // Logo Circle
    ctx.beginPath();
    ctx.arc(cardX + 60, cardY + 42, 28, 0, Math.PI * 2);
    ctx.fillStyle = '#FFF';
    ctx.fill();
    ctx.fillStyle = COLOR_ACCENT;
    ctx.font = '900 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('A', cardX + 60, cardY + 51);
    ctx.textAlign = 'left';

    // 4. PHOTO AREA
    const photoSize = 160;
    const photoX = cardX + 45;
    const photoY = cardY + headerH + 30;

    // Avatar Border (White Frame)
    ctx.fillStyle = '#FFF';
    ctx.shadowColor = 'rgba(0,0,0,0.1)';
    ctx.shadowBlur = 8;
    ctx.fillRect(photoX - 8, photoY - 8, photoSize + 16, photoSize + 16);
    ctx.shadowColor = 'transparent';

    // Avatar
    const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 512 });
    let avatarImg;
    try { avatarImg = await loadImage(avatarURL); } catch { avatarImg = null; }

    if (avatarImg) {
        ctx.drawImage(avatarImg, photoX, photoY, photoSize, photoSize);
    } else {
        ctx.fillStyle = '#DDD';
        ctx.fillRect(photoX, photoY, photoSize, photoSize);
    }

    // Tag: MEMBER / READER
    const tagW = 120;
    const tagH = 28;
    const tagX = photoX + (photoSize - tagW) / 2;
    const tagY = photoY + photoSize + 22;

    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.roundRect(tagX, tagY, tagW, tagH, 14);
    ctx.fill();

    ctx.fillStyle = '#FFF';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('READER', tagX + tagW / 2, tagY + 19);
    ctx.textAlign = 'left';

    // 5. INFO AREA (Right Side)
    const contentX = cardX + 250;
    let contentY = cardY + headerH + 50;

    // NAME Label
    ctx.fillStyle = COLOR_INK_SUB;
    ctx.font = '11px sans-serif';
    ctx.fillText('NAME', contentX, contentY);

    contentY += 35;
    ctx.fillStyle = COLOR_INK_MAIN;
    // Auto-scale Display Name
    const nameStr = member.displayName.toUpperCase();
    let nameSize = 42;
    ctx.font = `900 ${nameSize}px sans-serif`;
    while (ctx.measureText(nameStr).width > 310 && nameSize > 24) {
        nameSize -= 2;
        ctx.font = `900 ${nameSize}px sans-serif`;
    }
    ctx.fillText(nameStr, contentX, contentY);

    // Grid: ID & Date
    contentY += 45;
    const col2X = contentX + 160;

    ctx.fillStyle = COLOR_INK_SUB;
    ctx.font = '10px sans-serif';
    ctx.fillText('ID NUMBER', contentX, contentY);
    ctx.fillText('JOINED', col2X, contentY);

    contentY += 22;
    ctx.fillStyle = COLOR_INK_MAIN;
    ctx.font = '18px monospace';
    // ID formatting
    ctx.fillText(member.guild.memberCount.toString().padStart(8, '0'), contentX, contentY);

    ctx.font = 'bold 18px sans-serif';
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
    ctx.fillText(dateStr, col2X, contentY);

    // 6. SIGNATURE
    contentY += 50;

    // Signature Line
    ctx.strokeStyle = '#CCC';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(contentX, contentY);
    ctx.lineTo(contentX + 220, contentY);
    ctx.stroke();

    // Signature Text
    ctx.fillStyle = '#000';
    // Cursive Font
    ctx.font = 'italic 30px "Segoe Script", "Brush Script MT", cursive';
    ctx.fillText(member.user.username, contentX + 10, contentY - 8);

    // 7. STAMP (AUTHENTIC RECTANGULAR 'APPROVED')
    ctx.save();
    // Position: Bottom Right overlap
    const stampX = cardX + CARD_W - 90;
    const stampY = cardY + CARD_H - 70;

    ctx.translate(stampX, stampY);
    ctx.rotate(-0.15); // Slight imperfection

    // Ink Logic
    const inkColor = '#BA1200'; // Deep Red-Orange Ink
    ctx.fillStyle = inkColor;
    ctx.strokeStyle = inkColor;
    ctx.globalAlpha = 0.85; // Ink isn't solid plastic

    // Shape: Rectangular Rubber Stamp
    const sW = 160;
    const sH = 50;
    const sR = 5;

    // Thick Border
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(-sW / 2, -sH / 2, sW, sH, sR);
    ctx.stroke();

    // Thin Inner Border
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-sW / 2 + 6, -sH / 2 + 6, sW - 12, sH - 12, sR - 2);
    ctx.stroke();

    // Text: APPROVED
    ctx.font = '900 28px "Courier New", monospace'; // Stencil/Typewriter feel
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('APPROVED', 0, 2);

    // Grunge / Dry Ink Effect
    // paint over with card background color to visually "erase" bits of ink
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = COLOR_CARD_BG;

    for (let i = 0; i < 600; i++) {
        // Random grit in the stamp box
        const x = (Math.random() - 0.5) * sW;
        const y = (Math.random() - 0.5) * sH;
        // Small specks
        const size = Math.random() * 1.5;
        ctx.fillRect(x, y, size, size);
    }

    ctx.restore();

    // 8. PLASTIC TEXTURE OVERLAY (Subtle)
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    // Glare top left
    ctx.beginPath();
    ctx.moveTo(cardX, cardY + CARD_H);
    ctx.lineTo(cardX + CARD_W, cardY);
    ctx.lineTo(cardX + CARD_W, cardY + CARD_H);
    ctx.fill();

    ctx.restore(); // Use Clip

    return await canvas.toBuffer('image/png');
};

module.exports = { generateWelcomeCard };