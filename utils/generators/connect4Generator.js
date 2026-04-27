const { createCanvas, loadImage } = require('@napi-rs/canvas');
const connect4Engine = require('../core/connect4Engine');
const logger = require('../core/logger');

/**
 * Connect4 Generator: "Sakura Aesthetic" Reskin
 * Implements a "Cute Anime" touch with pastel palettes, sparkles, and soft glows.
 */
class Connect4Generator {
    constructor() {
        this.CARD_WIDTH = 800;
        this.CARD_HEIGHT = 850;
        
        this.COLS = connect4Engine.COLS;
        this.ROWS = connect4Engine.ROWS;
        this.SLOT_SIZE = 75;
        this.SLOT_GAP = 15;
        this.BOARD_WIDTH = (this.COLS * this.SLOT_SIZE) + ((this.COLS + 1) * this.SLOT_GAP);
        this.BOARD_HEIGHT = (this.ROWS * this.SLOT_SIZE) + ((this.ROWS + 1) * this.SLOT_GAP);
        this.BOARD_X = (this.CARD_WIDTH - this.BOARD_WIDTH) / 2;
        this.BOARD_Y = 220;
        
        // Sakura Anime Palette
        this.COLORS = {
            BG: '#120E16',            // Soft Midnight
            BOARD_PANEL: 'rgba(255, 255, 255, 0.04)', // Frosted Glass
            EMPTY_SLOT: '#000000',    
            P1_BASE: '#FFB7C5',       // Sakura Pink
            P1_GLOW: 'rgba(255, 183, 197, 0.6)',
            P2_BASE: '#22D3EE',       // Neon Cyan
            P2_GLOW: 'rgba(34, 211, 238, 0.7)',
            TEXT: '#FFFFFF',
            ACCENT: '#C084FC',        // Lavender Accent
            BORDER: 'rgba(255, 255, 255, 0.1)'
        };

        this.avatarCache = new Map();
        this.envCache = null;
    }

    getDisplayName(name) {
        return (name || 'PATRON').toUpperCase();
    }

    async generateBoard(gameState, options = {}) {
        const SCALE = 2; // Reduced from 3 for better performance (still Retina clear)
        const canvas = createCanvas(this.CARD_WIDTH * SCALE, this.CARD_HEIGHT * SCALE);
        const ctx = canvas.getContext('2d');
        ctx.scale(SCALE, SCALE);

        const { p1Data, p2Data } = options;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium'; // 'high' is significantly slower

        // 1. Layered Background (Deep Base + Bokeh + Sparkles) - CACHED
        if (!this.envCache) {
            const envCanvas = createCanvas(this.CARD_WIDTH * SCALE, this.CARD_HEIGHT * SCALE);
            const envCtx = envCanvas.getContext('2d');
            envCtx.scale(SCALE, SCALE);
            this.drawBackground(envCtx);
            this.drawBokeh(envCtx);
            this.drawSparkles(envCtx);
            this.envCache = envCanvas;
        }
        ctx.drawImage(this.envCache, 0, 0, this.CARD_WIDTH, this.CARD_HEIGHT);

        // 2. Header
        await this.drawHeader(ctx, gameState, p1Data, p2Data);

        // 3. Board & Slots
        this.drawBoard(ctx, gameState);

        // --- Phase 4: Last Move Indicators ---
        if (gameState.last_move_coord) {
            const { r, c } = gameState.last_move_coord;
            this.drawLastMoveIndicator(ctx, r, c);
            if (gameState.status === 'PLAYING') {
                this.drawImpactSparkles(ctx, r, c);
            }
        }

        // 4. Footer
        this.drawFooter(ctx, gameState);

        const buffer = await canvas.encode('webp');
        return buffer;
    }

    drawBackground(ctx) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(0, 0, this.CARD_WIDTH, this.CARD_HEIGHT, 40);
        ctx.fillStyle = this.COLORS.BG;
        ctx.fill();
        ctx.clip();

        // Soft Lavender Glow from Top
        const grad = ctx.createRadialGradient(this.CARD_WIDTH/2, 0, 100, this.CARD_WIDTH/2, 0, 600);
        grad.addColorStop(0, 'rgba(192, 132, 252, 0.15)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.CARD_WIDTH, this.CARD_HEIGHT);

        // Inner Border (Soft Glow)
        ctx.strokeStyle = 'rgba(255, 183, 197, 0.1)';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, this.CARD_WIDTH, this.CARD_HEIGHT);
        
        ctx.restore();
    }

    drawBokeh(ctx) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < 15; i++) {
            const x = Math.random() * this.CARD_WIDTH;
            const y = Math.random() * this.CARD_HEIGHT;
            const r = 20 + Math.random() * 60;
            const opacity = 0.01 + Math.random() * 0.03;
            
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = i % 2 === 0 ? this.COLORS.P1_BASE : this.COLORS.P2_BASE;
            ctx.globalAlpha = opacity;
            ctx.fill();
        }
        ctx.restore();
    }

    drawSparkles(ctx) {
        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        for (let i = 0; i < 40; i++) {
            const x = Math.random() * this.CARD_WIDTH;
            const y = Math.random() * this.CARD_HEIGHT;
            const size = 0.5 + Math.random() * 1.5;
            const opacity = 0.1 + Math.random() * 0.4;
            
            ctx.globalAlpha = opacity;
            ctx.beginPath();
            if (i % 5 === 0) {
                // Draw small 4-point star
                const r = size * 2.5;
                ctx.moveTo(x, y - r);
                ctx.lineTo(x + size, y - size);
                ctx.lineTo(x + r, y);
                ctx.lineTo(x + size, y + size);
                ctx.lineTo(x, y + r);
                ctx.lineTo(x - size, y + size);
                ctx.lineTo(x - r, y);
                ctx.lineTo(x - size, y - size);
            } else {
                ctx.arc(x, y, size, 0, Math.PI * 2);
            }
            ctx.fill();
        }
        ctx.restore();
    }

    async drawHeader(ctx, gameState, p1, p2) {
        ctx.save();

        // Main Title
        ctx.fillStyle = this.COLORS.TEXT;
        ctx.font = `900 28px 'monalqo', sans-serif`;
        ctx.textAlign = 'center';
        ctx.letterSpacing = '4px';
        ctx.fillText('CONNECT MUSE', this.CARD_WIDTH / 2, 50);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = `600 12px 'monalqo', sans-serif`;
        ctx.letterSpacing = '2px';
        ctx.fillText('ARCADE PROTOCOL // C4-GRID', this.CARD_WIDTH / 2, 70);

        // Player Profiles
        const p1Name = this.getDisplayName(p1?.displayName);
        const p1IsActive = gameState.currentTurn === gameState.player1 && gameState.status === 'PLAYING';
        await this.drawPlayerProfile(ctx, p1, p1Name, 120, 120, this.COLORS.P1_BASE, p1IsActive, 'left');

        const p2Name = this.getDisplayName(p2?.displayName);
        const p2IsActive = gameState.currentTurn === gameState.player2 && gameState.status === 'PLAYING';
        await this.drawPlayerProfile(ctx, p2, p2Name, this.CARD_WIDTH - 120, 120, this.COLORS.P2_BASE, p2IsActive, 'right');

        // --- Stylized VS Divider ---
        const vsX = this.CARD_WIDTH / 2;
        const vsY = 120;
        
        ctx.save();
        // VS Text
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `italic 900 24px 'monalqo', sans-serif`;
        ctx.textAlign = 'center';
        ctx.shadowColor = this.COLORS.ACCENT;
        ctx.shadowBlur = 15;
        ctx.fillText('VS', vsX, vsY + 8);
        ctx.restore();

        // Status
        if (gameState.status !== 'PLAYING') {
            ctx.fillStyle = gameState.status === 'DRAW' ? '#FFFFFF' : (gameState.winner === gameState.player1 ? this.COLORS.P1_BASE : this.COLORS.P2_BASE);
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 15;
            ctx.font = `900 24px 'monalqo', sans-serif`;
            ctx.textAlign = 'center';
            
            const statusText = gameState.status === 'DRAW' ? 'MUTUAL ANNIHILATION' : `${this.getDisplayName(gameState.winner === gameState.player1 ? p1?.displayName : p2?.displayName)} DOMINATED`;
            ctx.fillText(statusText, this.CARD_WIDTH / 2, 185);
            ctx.shadowBlur = 0;
        }

        ctx.restore();
    }

    drawHeart(ctx, x, y, size, color, stroke = false) {
        ctx.save();
        ctx.translate(x, y);
        ctx.beginPath();
        const d = size;
        ctx.moveTo(0, d / 4);
        ctx.bezierCurveTo(0, 0, -d / 2, 0, -d / 2, d / 4);
        ctx.bezierCurveTo(-d / 2, d / 2, 0, d * 3/4, 0, d);
        ctx.bezierCurveTo(0, d * 3/4, d / 2, d / 2, d / 2, d / 4);
        ctx.bezierCurveTo(d / 2, 0, 0, 0, 0, d / 4);
        
        ctx.fillStyle = color;
        ctx.fill();
        if (stroke) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        ctx.restore();
    }

    async drawPlayerProfile(ctx, user, name, x, y, themeColor, isActive, align) {
        ctx.save();
        const avatarSize = 70;

        // Soft Bloom Ring
        if (isActive) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, (avatarSize / 2) + 8, 0, Math.PI * 2);
            ctx.strokeStyle = themeColor;
            ctx.lineWidth = 4;
            ctx.shadowColor = themeColor;
            ctx.shadowBlur = 20;
            ctx.stroke();
            ctx.restore();
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, avatarSize / 2, 0, Math.PI * 2);
        ctx.clip();
        
        try {
            if (user && user.avatarURL) {
                let avatar;
                if (this.avatarCache.has(user.avatarURL)) {
                    avatar = this.avatarCache.get(user.avatarURL);
                } else {
                    const avatarPromise = loadImage(user.avatarURL);
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Avatar fetch timeout')), 1500));
                    avatar = await Promise.race([avatarPromise, timeoutPromise]);
                    
                    // Simple LRU-ish: Clear cache if too big
                    if (this.avatarCache.size > 20) this.avatarCache.clear();
                    this.avatarCache.set(user.avatarURL, avatar);
                }
                ctx.drawImage(avatar, x - avatarSize / 2, y - avatarSize / 2, avatarSize, avatarSize);
            } else {
                ctx.fillStyle = themeColor;
                ctx.fill();
            }
        } catch (e) {
            ctx.fillStyle = themeColor;
            ctx.fill();
        }
        ctx.restore();

        // Name and Subtext
        ctx.save();
        
        // Dynamic Name Sizing
        let fontSize = 18;
        ctx.font = `800 ${fontSize}px 'monalqo', sans-serif`;
        const maxWidth = 150;
        
        while (ctx.measureText(name).width > maxWidth && fontSize > 10) {
            fontSize--;
            ctx.font = `800 ${fontSize}px 'monalqo', sans-serif`;
        }

        ctx.fillStyle = isActive ? themeColor : 'rgba(255, 255, 255, 0.4)';
        ctx.textAlign = align;
        const textX = align === 'left' ? x + (avatarSize / 2) + 20 : x - (avatarSize / 2) - 20;
        ctx.fillText(name, textX, y + 5);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = `600 11px 'monalqo', sans-serif`;
        ctx.fillText(`PLAYER ${align === 'left' ? '1' : '2'}`, textX, y + 25);
        ctx.restore();
    }

    drawBoard(ctx, gameState) {
        ctx.save();
        const board = gameState.board;
        const winningTiles = gameState.winningTiles || [];

        // Glass Board
        ctx.beginPath();
        ctx.roundRect(this.BOARD_X, this.BOARD_Y, this.BOARD_WIDTH, this.BOARD_HEIGHT, 24);
        ctx.fillStyle = this.COLORS.BOARD_PANEL;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Decorative Stars at Corners
        const inset = 15;
        this.drawSparkle(ctx, this.BOARD_X + inset, this.BOARD_Y + inset, 4);
        this.drawSparkle(ctx, this.BOARD_X + this.BOARD_WIDTH - inset, this.BOARD_Y + inset, 4);
        this.drawSparkle(ctx, this.BOARD_X + inset, this.BOARD_Y + this.BOARD_HEIGHT - inset, 4);
        this.drawSparkle(ctx, this.BOARD_X + this.BOARD_WIDTH - inset, this.BOARD_Y + this.BOARD_HEIGHT - inset, 4);

        for (let row = 0; row < this.ROWS; row++) {
            for (let col = 0; col < this.COLS; col++) {
                const cx = this.BOARD_X + this.SLOT_GAP + (col * (this.SLOT_SIZE + this.SLOT_GAP)) + (this.SLOT_SIZE / 2);
                const cy = this.BOARD_Y + this.SLOT_GAP + (row * (this.SLOT_SIZE + this.SLOT_GAP)) + (this.SLOT_SIZE / 2);
                const radius = this.SLOT_SIZE / 2;
                
                const value = board[row][col];
                const isWinningTile = winningTiles.some(t => t.r === row && t.c === col);

                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.fillStyle = this.COLORS.EMPTY_SLOT;
                ctx.fill();

                if (value > 0) {
                    // Only draw shadows if it's a winning tile to boost performance
                    this.drawToken(ctx, cx, cy, radius, value, isWinningTile, gameState.status !== 'PLAYING');
                } else {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.01)';
                    ctx.stroke();
                }
            }
        }

        // Draw Stalemate Overlay
        if (gameState.status === 'DRAW') {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(this.BOARD_X, this.BOARD_Y, this.BOARD_WIDTH, this.BOARD_HEIGHT, 24);
            ctx.clip();
            
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.fillRect(this.BOARD_X, this.BOARD_Y, this.BOARD_WIDTH, this.BOARD_HEIGHT);
            
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `italic 900 42px 'monalqo', sans-serif`;
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
            ctx.shadowBlur = 20;
            ctx.fillText('STALEMATE', this.BOARD_X + this.BOARD_WIDTH / 2, this.BOARD_Y + this.BOARD_HEIGHT / 2 + 15);
            ctx.restore();
        }

        ctx.restore();
    }

    drawSparkle(ctx, x, y, r) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r/4, y - r/4);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x + r/4, y + r/4);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r/4, y + r/4);
        ctx.lineTo(x - r, y);
        ctx.lineTo(x - r/4, y - r/4);
        ctx.fill();
        ctx.restore();
    }

    drawToken(ctx, cx, cy, radius, player, isWinningTile, isGameOver) {
        ctx.save();
        const baseColor = player === 1 ? this.COLORS.P1_BASE : this.COLORS.P2_BASE;
        const isDimmed = isGameOver && !isWinningTile;
        
        ctx.globalAlpha = isDimmed ? 0.3 : 1.0;

        if (isWinningTile) {
            ctx.shadowColor = baseColor;
            ctx.shadowBlur = 25;
        }

        // Glossy Gem Effect
        const grad = ctx.createRadialGradient(cx - radius/2.5, cy - radius/2.5, radius/8, cx, cy, radius);
        grad.addColorStop(0, '#FFFFFF');
        grad.addColorStop(0.3, baseColor);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.5)'); // Slightly less dark edge

        ctx.beginPath();
        ctx.arc(cx, cy, radius - 4, 0, Math.PI * 2);

        if (isWinningTile) {
            ctx.shadowColor = baseColor;
            ctx.shadowBlur = 30;
        }

        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore(); // Restore to clear shadow before highlight

        // Highlight Sparkle on the token
        if (!isDimmed) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.beginPath();
            ctx.arc(cx + radius/4, cy - radius/4, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        if (isWinningTile) {
            // Draw a heart outline for winners
            this.drawHeart(ctx, cx, cy - radius/2, radius/1.5, 'rgba(255, 255, 255, 0.3)', true);
        }

        ctx.restore();
    }

    drawFooter(ctx, gameState) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.font = `700 11px 'monalqo', sans-serif`;
        ctx.letterSpacing = '2px';
        ctx.textAlign = 'center';
        const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();
        ctx.fillText(`ANIMUSE CONNECT 4 | ${dateStr}`, this.CARD_WIDTH / 2, this.CARD_HEIGHT - 30);
        

        ctx.restore();
    }

    drawImpactSparkles(ctx, row, col) {
        const x = this.BOARD_X + this.SLOT_GAP + (col * (this.SLOT_SIZE + this.SLOT_GAP)) + (this.SLOT_SIZE / 2);
        const y = this.BOARD_Y + this.SLOT_GAP + (row * (this.SLOT_SIZE + this.SLOT_GAP)) + (this.SLOT_SIZE / 2);

        ctx.save();
        ctx.translate(x, y);

        // 4 pointed star
        const points = 4;
        const innerRadius = 5;
        const outerRadius = 15;
        const color = 'rgba(255, 255, 255, 0.8)';

        ctx.beginPath();
        for (let i = 0; i < points * 2; i++) {
            const radius = i % 2 === 0 ? outerRadius : innerRadius;
            const angle = (Math.PI * i) / points;
            ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        }
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'white';
        ctx.fill();

        // Cross flares
        ctx.beginPath();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.moveTo(-25, 0); ctx.lineTo(25, 0);
        ctx.moveTo(0, -25); ctx.lineTo(0, 25);
        ctx.stroke();

        ctx.restore();
    }

    drawLastMoveIndicator(ctx, row, col) {
        const x = this.BOARD_X + this.SLOT_GAP + (col * (this.SLOT_SIZE + this.SLOT_GAP)) + (this.SLOT_SIZE / 2);
        const y = this.BOARD_Y + this.SLOT_GAP + (row * (this.SLOT_SIZE + this.SLOT_GAP)) + (this.SLOT_SIZE / 2);

        ctx.save();
        
        // 1. Dotted Circle around the piece
        ctx.beginPath();
        ctx.arc(x, y, (this.SLOT_SIZE / 2) + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    }
}

module.exports = new Connect4Generator();
