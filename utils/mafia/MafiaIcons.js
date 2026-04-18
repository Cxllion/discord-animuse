const { Path2D } = require('@napi-rs/canvas');
const LucidePaths = require('./LucidePaths');

/**
 * Mafia Master Emblems - Cyber-Sigilism Heraldry Edition
 * 
 * Compositions that blend professional vector silhouettes with 
 * cinematic archival HUD flourishes.
 */

const FactionColors = {
    Archivists: '#F59E0B', 
    Revisions: '#818CF8',  
    Unbound: '#10B981',    
    Infected: '#EF4444'    
};

const UI = {
    LINE_SILHOUETTE: 4.5,
    LINE_HUD: 1.2,
    GLOW_BLUR: 15,
    FILL_ALPHA: 0.15 // Increased Substance Weight
};

// Helper: Apply Glow
const applyGlow = (ctx, color, blur = UI.GLOW_BLUR) => {
    ctx.shadowBlur = blur;
    ctx.shadowColor = color;
};

const clearGlow = (ctx) => {
    ctx.shadowBlur = 0;
};

/**
 * Master Vector Engine: Renders a Lucide path as a Cyber-Sigil
 */
const drawVectorCore = (ctx, pathName, size, color) => {
    const pathStr = LucidePaths[pathName];
    if (!pathStr) return;

    const path = new Path2D(pathStr);
    const scale = size / 24;

    ctx.save();
    ctx.scale(scale, scale);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    // 1. Substance Fill (Increased density)
    ctx.globalAlpha = UI.FILL_ALPHA;
    ctx.fill(path);
    
    // 2. Neon Silhouette
    ctx.globalAlpha = 1.0;
    applyGlow(ctx, color);
    ctx.lineWidth = UI.LINE_SILHOUETTE / scale; 
    ctx.stroke(path);
    clearGlow(ctx);
    
    ctx.restore();
};

const drawFactionArchivist = (ctx, x, y, size) => {
    ctx.save();
    ctx.translate(x, y);
    drawVectorCore(ctx, 'book-open', size, FactionColors.Archivists);
    ctx.restore();
};

const drawFactionRevision = (ctx, x, y, size) => {
    ctx.save();
    ctx.translate(x, y);
    drawVectorCore(ctx, 'user-x', size, FactionColors.Revisions);
    ctx.restore();
};

const drawFactionUnbound = (ctx, x, y, size) => {
    ctx.save();
    ctx.translate(x, y);
    drawVectorCore(ctx, 'infinity', size, FactionColors.Unbound);
    ctx.restore();
};

const RoleIcons = {
    // --- ARCHIVISTS: THE ANCHORS ---

    'Archivist': (ctx, x, y, size) => {
        ctx.save();
        ctx.translate(x + size/2, y + size/2);
        
        // HUD Resonance: The Archive Anchor Lines
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = UI.LINE_HUD;
        for(let i=0; i<4; i++) {
            const angle = (i * 90) * Math.PI / 180;
            ctx.beginPath(); ctx.moveTo(Math.cos(angle)*size*0.3, Math.sin(angle)*size*0.3);
            ctx.lineTo(Math.cos(angle)*size*0.5, Math.sin(angle)*size*0.5); ctx.stroke();
        }

        // Core: The Anchor Book
        ctx.translate(-size*0.4, -size*0.4);
        drawVectorCore(ctx, 'book-open', size*0.8, '#FFFFFF');
        ctx.restore();
    },

    'The Conservator': (ctx, x, y, size) => {
        ctx.save();
        ctx.translate(x + size/2, y + size/2);
        
        // HUD Resonance: Lotus Petal Shield
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
        for(let i=0; i<6; i++) {
            const angle = (i * 60) * Math.PI / 180;
            ctx.beginPath(); ctx.arc(Math.cos(angle)*size*0.4, Math.sin(angle)*size*0.4, size*0.1, 0, Math.PI*2); ctx.stroke();
        }

        // Core: Shield Plus
        ctx.translate(-size*0.35, -size*0.35);
        drawVectorCore(ctx, 'shield-plus', size*0.7, '#FFFFFF');
        ctx.restore();
    },

    'The Indexer': (ctx, x, y, size) => {
        ctx.save();
        ctx.translate(x + size/2, y + size / 2);
        
        // HUD Resonance: Triple-Ringed Gyroscope
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = UI.LINE_HUD;
        ctx.beginPath(); ctx.arc(0, 0, size * 0.45, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, 0, size * 0.45, size * 0.15, Math.PI / 4, 0, Math.PI * 2); ctx.stroke();
        
        // Core: Scan Eye
        ctx.translate(-size*0.3, -size*0.3);
        drawVectorCore(ctx, 'scan', size*0.6, '#FFFFFF');
        ctx.restore();
    },

    'The Head Curator': (ctx, x, y, size) => {
        ctx.save();
        ctx.translate(x + size/2, y + size / 2);
        
        // HUD Resonance: Sovereignty Pillars
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = UI.LINE_HUD;
        ctx.strokeRect(-size*0.35, size*0.2, size*0.7, 4);
        
        // Core: Crown
        ctx.translate(-size * 0.35, -size * 0.4);
        drawVectorCore(ctx, 'crown', size * 0.7, '#FFFFFF');
        ctx.restore();
    },

    'The Ghostwriter': (ctx, x, y, size) => {
        ctx.save();
        ctx.translate(x + size/2, y + size/2);
        
        // HUD Resonance: Digital Ravens (Spirits)
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        for(let i=0; i<5; i++) {
            const r = size * 0.35;
            const a = (i * 72) * Math.PI / 180;
            ctx.fillRect(Math.cos(a)*r, Math.sin(a)*r, 6, 6);
        }

        // Core: Pen Line (Angled)
        ctx.rotate(-Math.PI / 8);
        ctx.translate(-size*0.4, -size*0.4);
        drawVectorCore(ctx, 'pen-line', size*0.8, '#FFFFFF');
        ctx.restore();
    },

    'The Scribe': (ctx, x, y, size) => {
        ctx.save();
        ctx.translate(x + size/2, y + size/2);
        
        // HUD Resonance: ECG Pulse (The Blood Link)
        ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-size*0.4, 0); ctx.lineTo(-size*0.1, 0);
        ctx.lineTo(-size*0.05, -size*0.15); ctx.lineTo(0, size*0.2); 
        ctx.lineTo(size*0.05, -size*0.2); ctx.lineTo(size*0.1, 0); ctx.lineTo(size*0.4, 0);
        ctx.stroke();

        // Core: File Text
        ctx.translate(-size*0.25, -size*0.35);
        drawVectorCore(ctx, 'file-text', size*0.5, '#FFFFFF');
        ctx.restore();
    },

    // --- REVISIONS: THE VOID COMMANDS ---

    'Revision': (ctx, x, y, size) => {
        ctx.save();
        ctx.translate(x + size/2, y + size/2);
        
        // Core: Broken User
        ctx.translate(-size*0.35, -size*0.35);
        drawVectorCore(ctx, 'user-x', size*0.7, '#FFFFFF');
        ctx.restore();
    },

    'The Shredder': (ctx, x, y, size) => {
        ctx.save();
        ctx.translate(x + size/2, y + size/2);
        
        // HUD Resonance: Mechanical Frequency (Concentric)
        ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, size*0.4, 0, Math.PI*2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, size*0.45, 0, Math.PI*2); ctx.stroke();
        
        // Data Shreds: Falling Vertical Lines
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1.5;
        const spacing = size * 0.15;
        for(let i=-2; i<=2; i++) {
            const xOffset = i * spacing;
            const length = size * 0.2 + (Math.random() * size * 0.15);
            ctx.beginPath();
            ctx.moveTo(xOffset, size * 0.1);
            ctx.lineTo(xOffset, size * 0.1 + length);
            ctx.stroke();
        }

        // Core: Industrial Shredder
        ctx.translate(-size*0.4, -size * 0.35);
        drawVectorCore(ctx, 'shredder', size*0.8, '#FFFFFF');
        ctx.restore();
    },

    'The Censor': (ctx, x, y, size) => {
        ctx.save();
        ctx.translate(x + size/2, y + size/2);
        
        // HUD Resonance: Barbed Wire Lock
        ctx.strokeStyle = 'rgba(165,180,252,0.4)'; ctx.lineWidth = UI.LINE_HUD;
        ctx.beginPath(); ctx.arc(0, 0, size*0.42, 0, Math.PI*2); ctx.stroke();
        
        // Core: Lock Keyhole
        ctx.translate(-size*0.3, -size*0.4);
        drawVectorCore(ctx, 'lock-keyhole', size*0.6, '#FFFFFF');
        ctx.restore();
    },

    'The Plagiarist': (ctx, x, y, size) => {
        ctx.save();
        ctx.translate(x + size/2, y + size/2);
        
        // Core: Dual Masks (Mirror Fraud)
        ctx.translate(-size*0.4, -size*0.3);
        drawVectorCore(ctx, 'masks', size*0.8, '#FFFFFF');
        ctx.restore();
    },

    'The Corruptor': (ctx, x, y, size) => {
        ctx.save();
        ctx.translate(x + size/2, y + size/2);
        
        // HUD Resonance: Fractal Roots
        ctx.strokeStyle = 'rgba(239,68,68,0.5)'; ctx.lineWidth = 0.8;
        for(let i=0; i<8; i++) {
            const a = (i * 45) * Math.PI / 180;
            ctx.beginPath(); ctx.moveTo(0,0);
            ctx.lineTo(Math.cos(a)*size*0.48, Math.sin(a)*size*0.48);
            ctx.stroke();
        }

        // Core: Biohazard
        ctx.translate(-size*0.35, -size*0.35);
        drawVectorCore(ctx, 'biohazard', size*0.7, '#FFFFFF');
        ctx.restore();
    },

    // --- UNBOUND: THE PARADOX ENGINES ---

    'The Anomaly': (ctx, x, y, size) => {
        ctx.save();
        ctx.translate(x + size/2, y + size/2);
        
        // HUD Resonance: Reality Glitch (Shards)
        ctx.fillStyle = 'rgba(16,185,129,0.2)';
        ctx.beginPath(); ctx.moveTo(-size*0.4, -size*0.4); ctx.lineTo(size*0.4, 0); ctx.lineTo(0, size*0.4); ctx.fill();

        // Core: Infinity (Paradox Engine)
        ctx.translate(-size*0.45, -size*0.4);
        drawVectorCore(ctx, 'infinity', size*0.9, '#FFFFFF');
        ctx.restore();
    },

    'The Critic': (ctx, x, y, size) => {
        ctx.save();
        ctx.translate(x + size/2, y + size/2);
        
        // HUD Resonance: Day Phase Shockwave
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, size*0.48, -Math.PI/4, Math.PI/4); ctx.stroke();
        
        // Core: Gavel
        ctx.translate(-size*0.4, -size*0.4);
        drawVectorCore(ctx, 'gavel', size*0.8, '#FFFFFF');
        ctx.restore();
    },

    'The Bookburner': (ctx, x, y, size) => {
        ctx.save();
        ctx.translate(x + size/2, y + size/2);
        
        // HUD Resonance: Digital Rising Heat
        ctx.strokeStyle = 'rgba(245,158,11,0.6)'; ctx.lineWidth = UI.LINE_HUD;
        for(let i=-2; i<=2; i++) {
            ctx.beginPath(); ctx.moveTo(i*20, size*0.25); ctx.lineTo(i*20, size*0.45); ctx.stroke();
        }

        // Core: Flame (The Phoenix)
        ctx.translate(-size*0.4, -size*0.48);
        drawVectorCore(ctx, 'flame', size*0.8, '#FFFFFF');
        ctx.restore();
    }
};

module.exports = {
    FactionColors,
    drawFactionArchivist,
    drawFactionRevision,
    drawFactionUnbound,
    RoleIcons
};
