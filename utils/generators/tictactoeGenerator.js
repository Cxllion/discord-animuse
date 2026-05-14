const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');

// Register Fonts
const fontsDir = path.join(__dirname, '..', '..', 'assets', 'fonts');
try {
    GlobalFonts.registerFromPath(path.join(fontsDir, 'Monalqo.otf'), 'monalqo');
} catch (e) {
    // Fallback if fonts are already registered globally or missing
}

class TicTacToeGenerator {
    constructor() {
        this.WIDTH = 700;
        this.HEIGHT = 650;
        
        // Premium Neon Theme aligned with Connect4 but distinct colors
        this.COLORS = {
            BG: '#120E16',            // Soft Midnight from Connect4
            SURFACE: 'rgba(255, 255, 255, 0.04)', // Frosted Glass
            SURFACE_STROKE: 'rgba(255, 255, 255, 0.08)',
            P1_NEON: '#EC4899', // Pink (X)
            P2_NEON: '#06B6D4', // Cyan (O)
            TEXT_PRIMARY: '#FFFFFF',
            TEXT_MUTED: 'rgba(255, 255, 255, 0.4)',
            GRID_LINE: 'rgba(255, 255, 255, 0.15)',
            ACCENT: '#C084FC'
        };
        this.FONT_STACK = "'monalqo', Arial, sans-serif";
        this.avatarCache = new Map();
        this.envCache = null;
    }

    getDisplayName(name) {
        return (name || 'PATRON').toUpperCase();
    }

    drawSparkles(ctx) {
        ctx.save();
        ctx.fillStyle = '#FFFFFF';
        for (let i = 0; i < 40; i++) {
            const x = Math.random() * this.WIDTH;
            const y = Math.random() * this.HEIGHT;
            const size = 0.5 + Math.random() * 1.5;
            const opacity = 0.1 + Math.random() * 0.4;
            
            ctx.globalAlpha = opacity;
            ctx.beginPath();
            if (i % 5 === 0) {
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

    /**
     * Generate the Tic Tac Toe board image.
     */
    async generateBoard(gameState, player1Meta, player2Meta) {
        const scale = 2;
        const canvas = createCanvas(this.WIDTH * scale, this.HEIGHT * scale);
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // 1. Background (Rounded + Bokeh + Sparkles)
        if (!this.envCache) {
            const envCanvas = createCanvas(this.WIDTH * scale, this.HEIGHT * scale);
            const envCtx = envCanvas.getContext('2d');
            envCtx.scale(scale, scale);

            envCtx.save();
            envCtx.beginPath();
            envCtx.roundRect(0, 0, this.WIDTH, this.HEIGHT, 40);
            envCtx.fillStyle = '#0B0D13'; // Slightly deeper, cooler slate
            envCtx.fill();
            envCtx.clip();

            // Soft Indigo/Violet Glow from Top (Distinct from C4's Lavender)
            const grad = envCtx.createRadialGradient(this.WIDTH/2, 0, 100, this.WIDTH/2, 0, 600);
            grad.addColorStop(0, 'rgba(129, 140, 248, 0.12)'); // Indigo-400
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            envCtx.fillStyle = grad;
            envCtx.fillRect(0, 0, this.WIDTH, this.HEIGHT);

            // Ambient Side Glows
            const drawAmbientGlow = (x, y, color) => {
                const pGrad = envCtx.createRadialGradient(x, y, 0, x, y, 350);
                pGrad.addColorStop(0, color);
                pGrad.addColorStop(1, 'transparent');
                envCtx.fillStyle = pGrad;
                envCtx.fillRect(0, 0, this.WIDTH, this.HEIGHT);
            };
            drawAmbientGlow(0, this.HEIGHT / 2, 'rgba(236, 72, 153, 0.05)'); // Pink Left
            drawAmbientGlow(this.WIDTH, this.HEIGHT / 2, 'rgba(6, 182, 212, 0.05)'); // Cyan Right

            // Bokeh - More sparse than C4
            envCtx.globalCompositeOperation = 'screen';
            for (let i = 0; i < 12; i++) {
                const x = Math.random() * this.WIDTH;
                const y = Math.random() * this.HEIGHT;
                const r = 30 + Math.random() * 80;
                const opacity = 0.01 + Math.random() * 0.02;
                
                envCtx.beginPath();
                envCtx.arc(x, y, r, 0, Math.PI * 2);
                envCtx.fillStyle = i % 2 === 0 ? this.COLORS.P1_NEON : this.COLORS.P2_NEON;
                envCtx.globalAlpha = opacity;
                envCtx.fill();
            }
            envCtx.globalCompositeOperation = 'source-over';

            this.drawSparkles(envCtx);

            // Inner Border (Cyan Tint)
            envCtx.strokeStyle = 'rgba(6, 182, 212, 0.08)';
            envCtx.lineWidth = 2;
            envCtx.strokeRect(0, 0, this.WIDTH, this.HEIGHT);
            
            envCtx.restore();
            this.envCache = envCanvas;
        }
        ctx.drawImage(this.envCache, 0, 0, this.WIDTH, this.HEIGHT);

        // Must clip the main context as well for the rounded corners of drawn elements
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(0, 0, this.WIDTH, this.HEIGHT, 40);
        ctx.clip();

        // 2. Header
        ctx.fillStyle = this.COLORS.TEXT_PRIMARY;
        ctx.font = `900 28px ${this.FONT_STACK}`;
        ctx.textAlign = 'center';
        ctx.letterSpacing = '4px';
        ctx.fillText('TIC TAC TOE', this.WIDTH / 2, 50);

        ctx.fillStyle = this.COLORS.TEXT_MUTED;
        ctx.font = `600 12px ${this.FONT_STACK}`;
        ctx.letterSpacing = '2px';
        ctx.fillText('ARCADE PROTOCOL // TTT-GRID', this.WIDTH / 2, 70);

        const vsX = this.WIDTH / 2;
        const vsY = 120;

        // Status Text (replaces VS text if game over)
        if (gameState.status !== 'PLAYING') {
            const isWinnerP1 = gameState.winner === gameState.player1;
            ctx.fillStyle = gameState.status === 'DRAW' ? '#FFFFFF' : (isWinnerP1 ? this.COLORS.P1_NEON : this.COLORS.P2_NEON);
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 15;
            ctx.font = `900 24px ${this.FONT_STACK}`;
            ctx.textAlign = 'center';
            
            let statusText = '';
            const winnerName = this.getDisplayName(isWinnerP1 ? player1Meta?.displayName : player2Meta?.displayName);

            if (gameState.status === 'DRAW') {
                statusText = 'MUTUAL ANNIHILATION';
            } else if (gameState.status === 'FORFEITED') {
                statusText = `${winnerName} SECURED VICTORY (FORFEIT)`;
            } else {
                statusText = `${winnerName} DOMINATED`;
            }

            const statusY = 180;

            ctx.fillText(statusText, vsX, statusY - 2);
            ctx.shadowBlur = 0;
        } else {
            // Draw VS only when playing
            ctx.save();
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `italic 900 24px ${this.FONT_STACK}`;
            ctx.textAlign = 'center';
            ctx.shadowColor = this.COLORS.ACCENT;
            ctx.shadowBlur = 15;
            ctx.fillText('VS', vsX, vsY + 8);
            ctx.restore();
        }

        // 3. Player Profiles (Header Style)
        const drawProfile = async (meta, x, y, isP1) => {
            const avatarSize = 70;
            const isTurn = gameState.status === 'PLAYING' && ((isP1 && gameState.current_turn === gameState.player1) || (!isP1 && gameState.current_turn === gameState.player2));
            const themeColor = isP1 ? this.COLORS.P1_NEON : this.COLORS.P2_NEON;
            const align = isP1 ? 'left' : 'right';

            ctx.save();
            // Soft Bloom Ring
            if (isTurn) {
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
                if (meta && meta.avatarUrl) {
                    let avatar;
                    if (this.avatarCache.has(meta.avatarUrl)) {
                        avatar = this.avatarCache.get(meta.avatarUrl);
                    } else {
                        avatar = await loadImage(meta.avatarUrl);
                        if (this.avatarCache.size > 20) this.avatarCache.clear();
                        this.avatarCache.set(meta.avatarUrl, avatar);
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
            const nameStr = this.getDisplayName(meta?.username || meta?.displayName);
            let fontSize = 18;
            ctx.font = `800 ${fontSize}px ${this.FONT_STACK}`;
            const maxWidth = 150;
            while (ctx.measureText(nameStr).width > maxWidth && fontSize > 10) {
                fontSize--;
                ctx.font = `800 ${fontSize}px ${this.FONT_STACK}`;
            }

            ctx.fillStyle = isTurn ? themeColor : 'rgba(255, 255, 255, 0.4)';
            ctx.textAlign = align;
            const textX = align === 'left' ? x + (avatarSize / 2) + 20 : x - (avatarSize / 2) - 20;
            ctx.fillText(nameStr, textX, y + 5);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = `600 11px ${this.FONT_STACK}`;
            const pieceName = isP1 ? '(X)' : '(O)';
            ctx.fillText(`PLAYER ${align === 'left' ? '1' : '2'} ${pieceName}`, textX, y + 25);
            ctx.restore();
        };

        await drawProfile(player1Meta, 120, 120, true);
        await drawProfile(player2Meta, this.WIDTH - 120, 120, false);


        // 4. The Glass Board
        const boardSize = 320;
        const boardX = (this.WIDTH - boardSize) / 2;
        const boardY = 220; // Lowered to make room for header

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(boardX - 20, boardY - 20, boardSize + 40, boardSize + 40, 24);
        ctx.fillStyle = this.COLORS.SURFACE;
        ctx.fill();
        ctx.strokeStyle = this.COLORS.SURFACE_STROKE;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // Grid Lines
        ctx.strokeStyle = this.COLORS.GRID_LINE;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        
        const cellSize = boardSize / 3;

        ctx.beginPath();
        // Vertical lines
        ctx.moveTo(boardX + cellSize, boardY);
        ctx.lineTo(boardX + cellSize, boardY + boardSize);
        ctx.moveTo(boardX + cellSize * 2, boardY);
        ctx.lineTo(boardX + cellSize * 2, boardY + boardSize);
        // Horizontal lines
        ctx.moveTo(boardX, boardY + cellSize);
        ctx.lineTo(boardX + boardSize, boardY + cellSize);
        ctx.moveTo(boardX, boardY + cellSize * 2);
        ctx.lineTo(boardX + boardSize, boardY + cellSize * 2);
        ctx.stroke();

        // Helpers to draw X and O
        const drawX = (cx, cy) => {
            const size = cellSize * 0.35;
            ctx.save();
            ctx.strokeStyle = this.COLORS.P1_NEON;
            ctx.lineWidth = 10;
            ctx.lineCap = 'round';
            ctx.shadowColor = this.COLORS.P1_NEON;
            ctx.shadowBlur = 15;

            ctx.beginPath();
            ctx.moveTo(cx - size, cy - size);
            ctx.lineTo(cx + size, cy + size);
            ctx.moveTo(cx + size, cy - size);
            ctx.lineTo(cx - size, cy + size);
            ctx.stroke();
            ctx.restore();
        };

        const drawO = (cx, cy) => {
            const radius = cellSize * 0.35;
            ctx.save();
            ctx.strokeStyle = this.COLORS.P2_NEON;
            ctx.lineWidth = 10;
            ctx.shadowColor = this.COLORS.P2_NEON;
            ctx.shadowBlur = 15;

            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        };

        // Draw Pieces
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const val = gameState.board[r][c];
                const cx = boardX + c * cellSize + cellSize / 2;
                const cy = boardY + r * cellSize + cellSize / 2;

                if (val === 1) drawX(cx, cy);
                else if (val === 2) drawO(cx, cy);
            }
        }

        // Winning Line
        if (gameState.status === 'WON' && gameState.winningTiles && gameState.winningTiles.length > 0) {
            ctx.save();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 12;
            ctx.lineCap = 'round';
            ctx.shadowColor = '#FFFFFF';
            ctx.shadowBlur = 20;

            const startTile = gameState.winningTiles[0];
            const endTile = gameState.winningTiles[2];

            const startX = boardX + startTile.c * cellSize + cellSize / 2;
            const startY = boardY + startTile.r * cellSize + cellSize / 2;
            const endX = boardX + endTile.c * cellSize + cellSize / 2;
            const endY = boardY + endTile.r * cellSize + cellSize / 2;

            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
            ctx.restore();
        }

        // Footer Text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.font = `700 11px ${this.FONT_STACK}`;
        ctx.letterSpacing = '2px';
        ctx.textAlign = 'center';

        const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();
        const shortId = (gameState.id || 'LOCAL').split('-')[0].toUpperCase();
        
        ctx.fillText(`ANIMUSE TIC TAC TOE | ${dateStr}`, this.WIDTH / 2, this.HEIGHT - 40);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.font = `600 10px ${this.FONT_STACK}`;
        ctx.fillText(`LINK ID: ${shortId}`, this.WIDTH / 2, this.HEIGHT - 20);

        ctx.restore(); // Restore main clip

        return canvas.toBuffer('image/webp', { quality: 95 });
    }
}

module.exports = new TicTacToeGenerator();
