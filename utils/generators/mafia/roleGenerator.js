const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const logger = require('../../core/logger');
const CONFIG = require('../../config');
const { FactionColors, RoleIcons, drawFactionArchivist, drawFactionRevision, drawFactionUnbound } = require('../../mafia/MafiaIcons');

// Universal premium font stack
const FONT_STACK = "'-apple-system', 'Helvetica Neue', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const fitText = (ctx, text, fontFamilies, baseSize, baseWeight, maxWidth) => {
    let size = baseSize;
    ctx.font = `${baseWeight} ${size}px ${fontFamilies}`;
    while (ctx.measureText(text).width > maxWidth && size > 1) {
        size -= 0.5;
        ctx.font = `${baseWeight} ${size}px ${fontFamilies}`;
    }
    return ctx.font;
};

const drawGrid = (ctx, w, h) => {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)'; // Subtle dots
    const size = 30;
    for (let x = 0; x < w; x += size) {
        for (let y = 0; y < h; y += size) {
            ctx.beginPath();
            ctx.arc(x, y, 0.6, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
};

const drawScanlines = (ctx, w, h) => {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)'; // Much lighter
    ctx.lineWidth = 0.5;
    for (let y = 0; y < h; y += 4) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.restore();
};

const addNoise = (ctx, w, h) => {
    ctx.save();
    ctx.globalAlpha = 0.015;
    for (let i = 0; i < 1500; i++) { // From 5000 to 1500
        const x = Math.random() * w;
        const y = Math.random() * h;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
};

/**
 * Generates a cinematic role dossier card with Level 3 professional polish.
 * @param {Object} role The role object from MafiaRoles
 * @param {String} playerName The player's display name
 * @param {String} guildName The guild name for metadata
 */
const generateRoleCard = async (role, playerName = 'SUBJECT_ID_0', guildName = 'The Final Library') => {
    const CARD_WIDTH = 450;
    const CARD_HEIGHT = 650;
    const SCALE = 2; // High-res for premium feel

    const canvas = createCanvas(CARD_WIDTH * SCALE, CARD_HEIGHT * SCALE);
    const ctx = canvas.getContext('2d');
    ctx.scale(SCALE, SCALE);

    const THEME_COLOR = FactionColors[role.faction] || '#A1A1AA';
    const TEXT_MAIN = '#FFFFFF';
    const TEXT_SUB = '#A1A1AA';
    
    // Generate a unique Archival Serial for weight
    const serial = `REF_${role.faction.substring(0, 3).toUpperCase()}_${Math.floor(Math.random() * 900) + 100}-X`;

    // --- 1. BASE BACKGROUND ---
    ctx.fillStyle = '#09090B';
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // Deep Ambient Glow
    const gradient = ctx.createRadialGradient(CARD_WIDTH / 2, 250, 0, CARD_WIDTH / 2, 250, 400);
    gradient.addColorStop(0, hexToRgba(THEME_COLOR, 0.18));
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    // Canvas Tech Decor
    drawGrid(ctx, CARD_WIDTH, CARD_HEIGHT);
    drawScanlines(ctx, CARD_WIDTH, CARD_HEIGHT);
    addNoise(ctx, CARD_WIDTH, CARD_HEIGHT);

    // Ambient HUD Markers (Dynamic Security Clearance)
    let clearance = 'L-04';
    let syncStatus = '[STABLE]';

    if (role.faction === 'Revisions') {
        clearance = `ERR_[[0x${Math.floor(Math.random() * 0xFF).toString(16).toUpperCase()}]]`;
        syncStatus = '[[NULL]]';
    } else if (role.faction === 'Unbound') {
        clearance = 'XX';
        syncStatus = '[PARADOX]';
    } else {
        // Archivists Hierarchy
        const roles = {
            'The Head Curator': 'L-01',
            'The Ghostwriter': 'L-02',
            'The Conservator': 'L-03',
            'The Indexer': 'L-03',
            'The Scribe': 'L-03'
        };
        clearance = roles[role.name] || 'L-04';
    }

    ctx.fillStyle = hexToRgba(THEME_COLOR, 0.35);
    ctx.font = `700 8.5px 'monalqo', ${FONT_STACK}`;
    ctx.textAlign = 'left';
    ctx.fillText(`CLEARANCE: ${clearance} // SYNC: ${syncStatus}`, 20, 15);
    
    ctx.textAlign = 'right';
    ctx.fillText(`SYS_CLK: [0x${Math.floor(Math.random() * 0xFFF).toString(16).toUpperCase().padStart(3, '0')}]`, CARD_WIDTH - 20, CARD_HEIGHT - 12);

    // --- 2. HEADER: ARCHIVAL HUDS ---
    const headerH = 60;
    const headerGradient = ctx.createLinearGradient(0, 0, 0, headerH);
    headerGradient.addColorStop(0, hexToRgba(THEME_COLOR, 0.15));
    headerGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = headerGradient;
    ctx.fillRect(0, 0, CARD_WIDTH, headerH);
    
    ctx.strokeStyle = hexToRgba(THEME_COLOR, 0.4);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, headerH); ctx.lineTo(CARD_WIDTH, headerH); ctx.stroke();

    // Faction Symbol (Mini)
    const miniIconSize = 28;
    // Header Layout: Baseline-locked
    const headerY = 38;
    const miniX = 25, miniY = headerY - (miniIconSize / 2) - 4; // Optically centered
    if (role.faction === 'Archivists') drawFactionArchivist(ctx, miniX, miniY, miniIconSize);
    else if (role.faction === 'Revisions') drawFactionRevision(ctx, miniX, miniY, miniIconSize);
    else drawFactionUnbound(ctx, miniX, miniY, miniIconSize);

    // Protocol Label (Left)
    ctx.fillStyle = TEXT_MAIN;
    ctx.font = `700 11px 'exomoon', ${FONT_STACK}`; 
    ctx.letterSpacing = '1px';
    ctx.textAlign = 'left';
    ctx.fillText(`PROTOCOL: ${role.faction.toUpperCase()}`, 65, headerY);

    // Metadata Label (Right)
    ctx.fillStyle = TEXT_SUB;
    ctx.font = `700 8.5px 'exomoon', ${FONT_STACK}`;
    ctx.letterSpacing = '0.5px';
    ctx.textAlign = 'right';
    ctx.fillText(`NODE: ANIMUSE`, CARD_WIDTH - 20, headerY);
    ctx.letterSpacing = '0px';

    // --- 3. IDENTITY POD: HOLOGRAPHIC CORE ---
    const podY = 110; 
    const podRadius = 150;
    const centerX = CARD_WIDTH / 2;
    const centerY = podY + 140;

    // Advanced Holographic Halo
    ctx.save();
    ctx.beginPath(); ctx.arc(centerX, centerY, podRadius, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(THEME_COLOR, 0.15);
    ctx.lineWidth = 1; ctx.stroke();
    
    // Orbital Ticks
    for (let i = 0; i < 8; i++) {
        const angle = (i * 45) * Math.PI / 180;
        ctx.beginPath();
        const startX = centerX + Math.cos(angle) * (podRadius - 5);
        const startY = centerY + Math.sin(angle) * (podRadius - 5);
        const endX = centerX + Math.cos(angle) * (podRadius + 5);
        const endY = centerY + Math.sin(angle) * (podRadius + 5);
        ctx.moveTo(startX, startY); ctx.lineTo(endX, endY);
        ctx.strokeStyle = hexToRgba(THEME_COLOR, 0.4);
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }
    ctx.restore();

    // Procedural Role Icon (Glow Pass Applied)
    const iconSize = 220; // 20% Increase for presence
    const iconX = centerX - iconSize / 2;
    const iconY = centerY - iconSize / 2;
    
    ctx.save();
    ctx.shadowBlur = 15 * SCALE;
    ctx.shadowColor = THEME_COLOR;
    if (RoleIcons[role.name]) {
        RoleIcons[role.name](ctx, iconX, iconY, iconSize);
    } else {
        if (role.faction === 'Archivists') drawFactionArchivist(ctx, iconX, iconY, iconSize);
        else if (role.faction === 'Revisions') drawFactionRevision(ctx, iconX, iconY, iconSize);
        else drawFactionUnbound(ctx, iconX, iconY, iconSize);
    }
    ctx.restore();

    // Role Title (Premium Glow + Chromatic Pass)
    ctx.textAlign = 'center';
    
    // Chromatic Shadow (RGB Split feel)
    ctx.shadowColor = 'rgba(239, 68, 68, 0.4)'; // Red shift
    ctx.shadowBlur = 8 * SCALE;
    ctx.font = fitText(ctx, role.name.toUpperCase(), `'digitalgalaxy', ${FONT_STACK}`, 48, '900', 400);
    ctx.fillText(role.name.toUpperCase(), CARD_WIDTH / 2 + 1, centerY + podRadius + 45);

    // Main Neon Bloom
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowColor = THEME_COLOR; ctx.shadowBlur = 12 * SCALE;
    ctx.fillText(role.name.toUpperCase(), CARD_WIDTH / 2, centerY + podRadius + 45);
    ctx.shadowBlur = 0;

    // --- 4. DOSSIER PANEL: ELITE GLASSMORPHISM ---
    const panelX = 25, panelY = centerY + podRadius + 75, panelW = 400, panelH = 165, panelR = 12; // Increased H
    
    ctx.save();
    // Glass Core
    ctx.beginPath(); ctx.roundRect(panelX, panelY, panelW, panelH, panelR);
    const glassGradient = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY + panelH);
    glassGradient.addColorStop(0, 'rgba(255, 255, 255, 0.05)');
    glassGradient.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
    ctx.fillStyle = glassGradient; ctx.fill();
    
    // Technical Outer Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'; ctx.lineWidth = 1; ctx.stroke();
    
    // Status Bar detail (Pro-Nitpick)
    for (let i = 0; i < 4; i++) {
        ctx.fillStyle = (i === 3) ? hexToRgba('#FFFFFF', 0.2) : hexToRgba(THEME_COLOR, 0.6);
        ctx.fillRect(panelX + 5, panelY + 15 + (i * 10), 3, 6);
    }
    
    // Panel Corner Bracket
    ctx.strokeStyle = THEME_COLOR; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(panelX + 20, panelY); ctx.lineTo(panelX, panelY); ctx.lineTo(panelX, panelY + 20); ctx.stroke();
    
    // Header
    ctx.fillStyle = THEME_COLOR;
    ctx.font = `700 9.5px 'monalqo', ${FONT_STACK}`;
    ctx.letterSpacing = '1.2px';
    ctx.textAlign = 'left';
    ctx.fillText('LOG_DATA // CORE_ARCHIVE', panelX + 25, panelY + 26);
    ctx.letterSpacing = '0px';

    // Body Text with Footer Safeguard
    const isLong = role.description.length > 100;
    const fontSize = isLong ? 11.5 : 13;
    const lineHeight = isLong ? 21 : 24;
    
    ctx.fillStyle = '#FAFAFA';
    ctx.font = `500 ${fontSize}px 'exomoon', ${FONT_STACK}`;
    ctx.textAlign = 'left';
    
    const wrapText = (text, maxWidth) => {
        const words = text.split(' ');
        const lines = [];
        let currentLine = words[0];
        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const width = ctx.measureText(currentLine + " " + word).width;
            if (width < maxWidth) currentLine += " " + word;
            else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        lines.push(currentLine);
        return lines;
    };

    const descLines = wrapText(role.description, panelW - 50);
    descLines.slice(0, 4).forEach((line, i) => { // Reserve space for footer
        ctx.fillText(line, panelX + 25, panelY + 54 + (i * lineHeight));
    });

    // Subject Footer Metadata
    ctx.fillStyle = TEXT_SUB;
    ctx.font = `700 9px 'exomoon', ${FONT_STACK}`;
    ctx.letterSpacing = '0.8px';
    ctx.textAlign = 'right';
    ctx.fillText(`ID: ${playerName.toUpperCase()}`, panelX + panelW - 15, panelY + panelH - 25); // Lowered slightly
    ctx.restore();

    // Final Post-Process Vignette
    const vignette = ctx.createRadialGradient(CARD_WIDTH / 2, CARD_HEIGHT / 2, 200, CARD_WIDTH / 2, CARD_HEIGHT / 2, 500);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

    return await canvas.encode('png');
};

module.exports = { generateRoleCard };
