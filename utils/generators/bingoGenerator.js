const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const { lightenColor } = require('../config/colorConfig');
const logger = require('../core/logger');

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 1750; // Increased for better header spacing

/**
 * Helper: Draws a rounded rectangle path
 */
const drawRoundedRect = (ctx, x, y, width, height, radius) => {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.closePath();
};

/**
 * Helper: Fit Text
 */
const fitText = (ctx, text, maxWidth, initialFontSize) => {
    let fontSize = initialFontSize;
    ctx.font = `900 ${fontSize}px monalqo, sans-serif`;
    ctx.letterSpacing = '0.5px'; // Minimal separation for titles
    while (ctx.measureText(text).width > maxWidth && fontSize > 10) {
        fontSize -= 2;
        ctx.font = `900 ${fontSize}px monalqo, sans-serif`;
    }
    return fontSize;
};

/**
 * Helper: Wrap Text
 * Returns array of lines and final font size used
 */
const wrapText = (ctx, text, maxWidth, initialFontSize, maxLines = 3) => {
    let fontSize = initialFontSize;
    ctx.font = `bold ${fontSize}px monalqo, sans-serif`;

    // Quick check if it fits single line
    if (ctx.measureText(text).width <= maxWidth) return { lines: [text], fontSize };

    // Simply word wrap
    const words = text.split(' ');
    let lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + " " + word).width;
        if (width < maxWidth) {
            currentLine += " " + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);

    // If too many lines, try slightly smaller font, recursively (limit depth)
    // Actually, just truncate if exceeded for performance
    if (lines.length > maxLines) {
        // Simple strategy: take first (maxLines-1), then truncate last
        // Or just let it be small?
        // Let's try reducing font size if it overflows
        if (fontSize > 12) {
            return wrapText(ctx, text, maxWidth, fontSize - 2, maxLines);
        }
        // Force truncation on last line
        const keep = lines.slice(0, maxLines);
        keep[maxLines - 1] += '..';
        return { lines: keep, fontSize };
    }

    return { lines, fontSize };
};

/**
 * Generates a modern glassmorphism Bingo Card.
 * @param {object} card - The Bingo Card Object (title, size, entries)
 * @param {object} clientUser - Discord User Object (for footer/avatar)
 * @param {string} themeColor - Hex color code
 */
const generateBingoCard = async (card, clientUser, themeColor = '#FFACD1', avatarUrl = null) => {
    const SCALE = 1.5; // Reduced from 2 for performance/reliability
    const canvas = createCanvas(CARD_WIDTH * SCALE, CARD_HEIGHT * SCALE);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    // Grid Config
    const gridSize = card.size; // 2, 3, 4, 5
    const boxes = gridSize * gridSize;

    // Layout Metrics (Maximized)
    // Layout Metrics (Maximized)
    const padding = 15;
    const headerHeight = 180; // Increased to 180 to prevent overlap with grid
    const footerHeight = 0;  // Footer removed completely
    const gridAreaHeight = CARD_HEIGHT - headerHeight - padding; // Maximize vertical space
    const gridAreaWidth = CARD_WIDTH - (padding * 2);
    const gap = 8;

    const boxWidth = (gridAreaWidth - (gap * (gridSize - 1))) / gridSize;
    const boxHeight = boxWidth * 1.5; // 2:3 Aspect Ratio

    // Recalculate startY to center strictly
    const totalGridHeight = (boxHeight * gridSize) + (gap * (gridSize - 1));

    // Safety check if height exceeds container, scale down if necessary
    let finalBoxWidth = boxWidth;
    let finalBoxHeight = boxHeight;

    if (totalGridHeight > gridAreaHeight) {
        // Constrain by height instead
        const availableH = gridAreaHeight;
        finalBoxHeight = (availableH - (gap * (gridSize - 1))) / gridSize;
        finalBoxWidth = finalBoxHeight / 1.5;
    }

    const totalGridWidth = (finalBoxWidth * gridSize) + (gap * (gridSize - 1));
    const startX = (CARD_WIDTH - totalGridWidth) / 2;
    const startY = headerHeight + ((gridAreaHeight - (finalBoxHeight * gridSize + (gap * (gridSize - 1)))) / 2);


    // --- 1. BACKGROUND ---
    ctx.fillStyle = '#101015'; // Deep dark base
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // Custom Background (Premium Feature)
    if (card.background_url) {
        try {
            const bgImg = await loadImage(card.background_url);
            // Cover logic for background
            const bgRatio = bgImg.width / bgImg.height;
            const canvasRatio = CARD_WIDTH / CARD_HEIGHT;
            let drawW, drawH, drawX, drawY;

            if (bgRatio > canvasRatio) {
                drawH = CARD_HEIGHT;
                drawW = CARD_HEIGHT * bgRatio;
                drawX = (CARD_WIDTH - drawW) / 2;
                drawY = 0;
            } else {
                drawW = CARD_WIDTH;
                drawH = CARD_WIDTH / bgRatio;
                drawX = 0;
                drawY = (CARD_HEIGHT - drawH) / 2;
            }
            ctx.drawImage(bgImg, drawX, drawY, drawW, drawH);

            // Darken/Blur Overlay
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; // Heavy dim for readability
            ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
        } catch (e) {
            logger.warn('Failed to load bingo background: ' + card.background_url, 'BingoGenerator');
        }
    }

    // Ambient Gradients (Material/Glassy feel)
    const gradient = ctx.createLinearGradient(0, 0, CARD_WIDTH, CARD_HEIGHT);
    gradient.addColorStop(0, '#101015');
    gradient.addColorStop(1, '#1a1a24');
    if (!card.background_url) {
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    }

    // Accent Orbs (Blurred)
    ctx.save();
    ctx.filter = 'blur(80px)';
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = themeColor;
    ctx.beginPath();
    ctx.arc(0, 0, 400, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(CARD_WIDTH, CARD_HEIGHT, 500, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- 2. HEADER STRATEGY ---
    // [Left: Branding] [Center: Title] [Right: Avatar]

    // A. BRANDING PILL (CENTERED)
    ctx.textAlign = 'center'; // Center alignment for pill
    ctx.shadowBlur = 0;

    // Pill Config
    const pillText = 'ANIMUSE BINGO';
    const pillFontSize = 18;
    ctx.font = `800 ${pillFontSize}px monalqo, sans-serif`;
    const pillMetrics = ctx.measureText(pillText);
    const pillPaddingX = 20;
    const pillPaddingY = 10;
    const pillWidth = pillMetrics.width + (pillPaddingX * 2);
    const pillHeight = pillFontSize + (pillPaddingY * 2);

    // Center the pill horizontally
    const pillX = (CARD_WIDTH - pillWidth) / 2;
    const pillY = 15; // Moved up to 15 (Top position)

    // Draw Pill Background
    ctx.save();
    drawRoundedRect(ctx, pillX, pillY, pillWidth, pillHeight, pillHeight / 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = themeColor;
    ctx.stroke();

    // Pill Text (Centered relative to pill)
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pillText, pillX + (pillWidth / 2), pillY + (pillHeight / 2)); // Removed +2 for perfect center
    // Stats Removed per request ("take away the 25/25 thing")

    // B. CENTER TITLE (Below Pill)
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 10;

    // Title Position Strategy:
    // We need strict vertical separation to avoid overlap.
    // TitleY (Baseline) should be: PillBottom + Gap + TitleAscent

    // 1. Calculate Font Size
    const titleText = (card.title || 'Bingo Card').toUpperCase();
    const maxTitleWidth = CARD_WIDTH - 80; // Full width minus margins
    const titleSize = fitText(ctx, titleText, maxTitleWidth, 60); // Max 60px height

    // 2. Calculate Position
    const titleGap = 10; // Tighter gap to pill
    const pillBottom = pillY + pillHeight;
    const titleY = pillBottom + titleGap + titleSize;

    // Safety Clamp: Ensure TitleY doesn't push past headerHeight
    // If titleY > headerHeight - 40, we might overlap grid.

    // Render Title
    ctx.font = `900 ${titleSize}px monalqo, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(titleText, CARD_WIDTH / 2, titleY);

    // Subtitle (Grid Size)
    ctx.font = '700 16px monalqo, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.letterSpacing = '3px';
    // Position Subtitle relative to Title
    ctx.fillText(`${gridSize}x${gridSize} CHALLENGE`, CARD_WIDTH / 2, titleY + 22);
    ctx.letterSpacing = '0px';


    // C. AVATAR REMOVED (per user request for cleaner layout)

    // --- 3. THE GRID ---
    const entries = card.entries || [];

    // Pre-load images in parallel
    const imageCache = new Map();
    const uniqueUrls = [...new Set(entries.filter(e => e && e.coverImage).map(e => e.coverImage))];

    // Load all images concurrently
    const loadedImages = await Promise.all(
        uniqueUrls.map(async url => {
            try {
                const img = await loadImage(url);
                return { url, img };
            } catch (e) {
                logger.warn('BingoGen Failed to load image: ' + url, 'BingoGenerator');
                return null;
            }
        })
    );

    loadedImages.forEach(item => {
        if (item) imageCache.set(item.url, item.img);
    });

    for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
            const idx = row * gridSize + col;
            const x = startX + col * (finalBoxWidth + gap);
            const y = startY + row * (finalBoxHeight + gap);

            // Draw Slot Background (Glassy)
            ctx.save();
            drawRoundedRect(ctx, x, y, finalBoxWidth, finalBoxHeight, 16);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.clip(); // Clip images to this box

            const entry = entries[idx];
            if (entry && entry.coverImage) {
                const img = imageCache.get(entry.coverImage);
                if (img) {
                    try {
                        // Cover Fit
                        // Perfect Fit (2:3) or Cover logic for Rectangle
                        const imgRatio = img.width / img.height;
                        const boxRatio = finalBoxWidth / finalBoxHeight;

                        let renderW, renderH, renderX, renderY;

                        if (imgRatio > boxRatio) {
                            // Image is wider than box (crop sides)
                            renderH = finalBoxHeight;
                            renderW = finalBoxHeight * imgRatio;
                            renderX = x - (renderW - finalBoxWidth) / 2;
                            renderY = y;
                        } else {
                            // Image is taller than box (crop top/bottom)
                            renderW = finalBoxWidth;
                            renderH = finalBoxWidth / imgRatio;
                            renderX = x;
                            renderY = y - (renderH - finalBoxHeight) / 2;
                        }

                        ctx.drawImage(img, renderX, renderY, renderW, renderH);

                        // Gradient Overlay
                        const grad = ctx.createLinearGradient(x, y + finalBoxHeight * 0.4, x, y + finalBoxHeight);
                        grad.addColorStop(0, 'transparent');
                        grad.addColorStop(0.5, 'rgba(0,0,0,0.6)');
                        grad.addColorStop(1, 'rgba(0,0,0,0.95)');
                        ctx.fillStyle = grad;
                        ctx.fillRect(x, y, finalBoxWidth, finalBoxHeight);

                    } catch (e) {
                        // Draw Fallback if drawImage somehow fails
                        ctx.fillStyle = '#222';
                        ctx.fillRect(x, y, finalBoxWidth, finalBoxHeight);
                    }
                } else {
                    // Image was not found in cache (failed to load)
                    ctx.fillStyle = '#222';
                    ctx.fillRect(x, y, finalBoxWidth, finalBoxHeight);
                }
            } else {
                // Empty Slot Design (Refined)
                ctx.fillStyle = 'rgba(255,255,255,0.02)';
                ctx.fillRect(x, y, finalBoxWidth, finalBoxHeight);

                // Plus Icon Design
                const centerX = x + finalBoxWidth / 2;
                const centerY = y + finalBoxHeight / 2;
                const size = Math.floor(finalBoxWidth / 4);
                
                ctx.lineWidth = 4;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.beginPath();
                // Horizontal
                ctx.moveTo(centerX - size/2, centerY);
                ctx.lineTo(centerX + size/2, centerY);
                // Vertical
                ctx.moveTo(centerX, centerY - size/2);
                ctx.lineTo(centerX, centerY + size/2);
                ctx.stroke();
            }
            ctx.restore();

            // Overlay Text (Title) - Outside Clip, Inside Grid logic
            if (entry) {
                ctx.save();
                // Ensure text doesn't flow out
                ctx.beginPath();
                ctx.rect(x, y, finalBoxWidth, finalBoxHeight);
                ctx.clip();

                const textPadding = 10;
                ctx.fillStyle = '#FFFFFF';
                // Calculate font size relative to box size
                const fontSize = Math.max(10, Math.floor(finalBoxWidth / 8));
                ctx.font = `bold ${fontSize}px monalqo, sans-serif`;
                ctx.textAlign = 'center';
                ctx.shadowColor = 'black';
                ctx.shadowBlur = 4;

                // Smart Wrap Logic
                const entryTitle = entry.title || 'Ref #' + idx;
                const maxW = finalBoxWidth - (textPadding * 2);

                // Adaptive font size based on grid size (smaller grid = larger boxes = larger text)
                const baseFontSize = Math.max(14, Math.floor(finalBoxWidth / 10));

                const { lines, fontSize: usedFont } = wrapText(ctx, entryTitle, maxW, baseFontSize, 3);

                ctx.font = `bold ${usedFont}px monalqo, sans-serif`;

                // Draw bottom-up
                const lineHeight = usedFont * 1.2;
                const bottomY = y + finalBoxHeight - textPadding;

                lines.reverse().forEach((line, i) => {
                    ctx.fillText(line, x + finalBoxWidth / 2, bottomY - (i * lineHeight));
                });

                ctx.restore();

                // Theme Border for Filled Items
                ctx.save();
                drawRoundedRect(ctx, x, y, finalBoxWidth, finalBoxHeight, 16);
                ctx.lineWidth = 2;
                ctx.strokeStyle = themeColor;
                ctx.stroke();
                ctx.restore();

                // --- STAMP SYSTEM ---
                if (entry.status && entry.status !== 'PLANNING') {
                    ctx.save();
                    const stampSize = finalBoxWidth * 0.45;
                    const sX = x + finalBoxWidth - stampSize - 5;
                    const sY = y + 5;
                    
                    // Stamp Container
                    ctx.globalAlpha = 0.9;
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = 'rgba(0,0,0,0.5)';
                    
                    // Stamp Rendering Data
                    let stampColor = '#FFFFFF';
                    let hasStamp = true;
                    
                    if (entry.status === 'COMPLETED') {
                        stampColor = '#4ADE80'; // Green
                    } else if (entry.status === 'PAUSED') {
                        stampColor = '#FACC15'; // Yellow
                    } else if (entry.status === 'DROPPED') {
                        stampColor = '#F87171'; // Red
                    } else if (entry.status === 'CURRENT' || entry.status === 'WATCHING') {
                        stampColor = themeColor;
                    } else {
                        hasStamp = false;
                    }

                    if (hasStamp) {
                        const midX = sX + stampSize/2;
                        const midY = sY + stampSize/2;
                        const radius = stampSize/2;

                        // Draw Circle Backing (Glassy)
                        ctx.fillStyle = 'rgba(0,0,0,0.6)';
                        ctx.beginPath();
                        ctx.arc(midX, midY, radius, 0, Math.PI * 2);
                        ctx.fill();
                        
                        ctx.strokeStyle = stampColor;
                        ctx.lineWidth = 1.5;
                        ctx.stroke();

                        // --- DRAW VECTOR ICONS (Achievement Badge Style) ---
                        ctx.strokeStyle = '#FFFFFF';
                        ctx.lineWidth = 4; // Bold achievement feel
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        const iconSize = radius * 0.55;

                        // Add subtle shadow to the icon itself
                        ctx.shadowBlur = 4;
                        ctx.shadowColor = 'rgba(0,0,0,0.8)';

                        if (entry.status === 'COMPLETED') {
                            // GLOWING SUCCESS
                            ctx.strokeStyle = '#FFFFFF'; // White center for high contrast
                            ctx.shadowBlur = 10;
                            ctx.shadowColor = '#4ADE80'; // Emerald Glow
                            
                            ctx.beginPath();
                            ctx.moveTo(midX - iconSize/1.1, midY);
                            ctx.lineTo(midX - iconSize/4, midY + iconSize/1.2);
                            ctx.lineTo(midX + iconSize/1.1, midY - iconSize/1.2);
                            ctx.stroke();

                            // Sparkles ✨
                            ctx.shadowBlur = 0;
                            ctx.fillStyle = '#FFFFFF';
                            const s = iconSize * 0.15;
                            const drawSparkle = (sx, sy) => {
                                ctx.fillRect(sx - s/2, sy - s/2, s, s);
                            };
                            drawSparkle(midX + iconSize, midY + iconSize/2);
                            drawSparkle(midX - iconSize, midY - iconSize/1.5);
                            drawSparkle(midX + iconSize/2, midY - iconSize);
                        } else if (entry.status === 'PAUSED') {
                            ctx.strokeStyle = '#FACC15'; // Amber
                            ctx.shadowColor = 'rgba(250, 204, 21, 0.4)';
                            ctx.beginPath();
                            ctx.moveTo(midX - iconSize/2.5, midY - iconSize/1.2);
                            ctx.lineTo(midX - iconSize/2.5, midY + iconSize/1.2);
                            ctx.moveTo(midX + iconSize/2.5, midY - iconSize/1.2);
                            ctx.lineTo(midX + iconSize/2.5, midY + iconSize/1.2);
                            ctx.stroke();
                        } else if (entry.status === 'DROPPED') {
                            ctx.strokeStyle = '#F87171'; // Red
                            ctx.lineWidth = 4.5;
                            ctx.beginPath();
                            ctx.moveTo(midX - iconSize/1.2, midY - iconSize/1.2);
                            ctx.lineTo(midX + iconSize/1.2, midY + iconSize/1.2);
                            ctx.moveTo(midX + iconSize/1.2, midY - iconSize/1.2);
                            ctx.lineTo(midX - iconSize/1.2, midY + iconSize/1.2);
                            ctx.stroke();
                        } else if (entry.status === 'CURRENT' || entry.status === 'WATCHING') {
                            ctx.strokeStyle = '#FFFFFF';
                            ctx.shadowColor = 'rgba(255,255,255,0.4)';
                            ctx.beginPath();
                            const visualOffset = iconSize * 0.15;
                            ctx.moveTo(midX - iconSize/2.5 + visualOffset, midY - iconSize/1.1);
                            ctx.lineTo(midX + iconSize/1.2 + visualOffset, midY);
                            ctx.lineTo(midX - iconSize/2.5 + visualOffset, midY + iconSize/1.1);
                            ctx.closePath();
                            ctx.stroke();
                            
                            // Pulse dot (like recording)
                            ctx.fillStyle = '#F87171';
                            ctx.beginPath();
                            ctx.arc(midX - iconSize/1.2, midY - iconSize/1.2, radius * 0.1, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                    ctx.restore();
                }
            }
        }
    }

    // --- 4. FOOTER REMOVED ---
    // The grid area now extends fully to the bottom padding.
    // No text is rendered here.

    return await canvas.encode('webp', { quality: 85 });
};

module.exports = { generateBingoCard };
