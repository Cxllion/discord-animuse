const { createCanvas } = require('@napi-rs/canvas');
const logger = require('../core/logger');

/**
 * Wordle Generator: Handles the visual rendering of the Wordle board.
 */
class WordleGenerator {
    constructor() {
        this.CARD_WIDTH = 450;
        this.CARD_HEIGHT = 550;
        this.TILE_SIZE = 70;
        this.TILE_GAP = 12;
        this.GRID_X = 25;
        this.GRID_Y = 25;
        
        // Animuse Color Palette
        this.COLORS = {
            BG: '#09090B',
            TEXT: '#FFFFFF',
            BORDER: 'rgba(255, 255, 255, 0.1)',
            ABSENT: '#18181B', // Darker Gray
            PRESENT: '#EAB308', // Vibrant Yellow
            CORRECT: '#22C55E', // Vibrant Green
            EMPTY: 'transparent'
        };
    }

    async generateBoard(gameState) {
        const SCALE = 3;
        const canvas = createCanvas(this.CARD_WIDTH * SCALE, this.CARD_HEIGHT * SCALE);
        const ctx = canvas.getContext('2d');
        ctx.scale(SCALE, SCALE);

        // Premium Rendering Settings
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // 1. Background System
        this.drawBackground(ctx);
        
        // 2. Scanlines (Signature Animuse texture)
        this.drawScanlines(ctx);

        // 3. Grid Rendering
        const { guesses } = gameState;
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 5; col++) {
                const guessData = guesses[row];
                const x = this.GRID_X + col * (this.TILE_SIZE + this.TILE_GAP);
                const y = this.GRID_Y + row * (this.TILE_SIZE + this.TILE_GAP);
                
                let char = '';
                let state = -1; // -1 = Empty grid

                if (guessData) {
                    char = guessData.word[col];
                    state = guessData.result[col];
                }

                this.drawTile(ctx, x, y, char, state);
            }
        }

        // 4. Header/Stats (Optional Footer)
        this.drawFooter(ctx, gameState);

        return await canvas.encode('png');
    }

    drawBackground(ctx) {
        ctx.fillStyle = this.COLORS.BG;
        ctx.beginPath();
        ctx.roundRect(0, 0, this.CARD_WIDTH, this.CARD_HEIGHT, 40);
        ctx.fill();

        // Subtle gradient glow from bottom-right (Animuse Theme)
        const grad = ctx.createRadialGradient(
            this.CARD_WIDTH - 50, this.CARD_HEIGHT - 50, 50,
            this.CARD_WIDTH, this.CARD_HEIGHT, 300
        );
        grad.addColorStop(0, 'rgba(59, 130, 246, 0.1)'); // Blue HUD tint
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.CARD_WIDTH, this.CARD_HEIGHT);

        // Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(0, 0, this.CARD_WIDTH, this.CARD_HEIGHT);
    }

    drawTile(ctx, x, y, char, state) {
        ctx.save();

        let fillColor = this.COLORS.EMPTY;
        let borderColor = 'rgba(255, 255, 255, 0.15)';
        let shadowColor = 'transparent';
        let blur = 0;

        // Determine Tile Appearance
        if (state === 0) { // Absent
            fillColor = this.COLORS.ABSENT;
            borderColor = 'rgba(255, 255, 255, 0.05)';
        } else if (state === 1) { // Present
            fillColor = this.COLORS.PRESENT;
            borderColor = this.COLORS.PRESENT;
            shadowColor = 'rgba(234, 179, 8, 0.4)';
            blur = 15;
        } else if (state === 2) { // Correct
            fillColor = this.COLORS.CORRECT;
            borderColor = this.COLORS.CORRECT;
            shadowColor = 'rgba(34, 197, 94, 0.4)';
            blur = 15;
        }

        // Draw Tile Base
        ctx.beginPath();
        ctx.roundRect(x, y, this.TILE_SIZE, this.TILE_SIZE, 12);
        
        if (shadowColor !== 'transparent') {
            ctx.shadowColor = shadowColor;
            ctx.shadowBlur = blur;
        }
        
        ctx.fillStyle = fillColor;
        ctx.fill();
        ctx.shadowColor = 'transparent';

        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw Character
        if (char) {
            ctx.fillStyle = '#FFFFFF';
            // Use premium Neo font for letters
            ctx.font = `900 32px 'monalqo', 'exomoon', sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // Subtle letter glow if correct/present
            if (state > 0) {
                ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
                ctx.shadowBlur = 4;
            }
            
            ctx.fillText(char.toUpperCase(), x + this.TILE_SIZE / 2, y + this.TILE_SIZE / 2 + 2);
        }

        ctx.restore();
    }

    drawScanlines(ctx) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 0.5;
        for (let y = 0; y < this.CARD_HEIGHT; y += 4) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.CARD_WIDTH, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    drawFooter(ctx, gameState) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.font = `700 10px 'monalqo', sans-serif`;
        ctx.letterSpacing = '1px';
        ctx.textAlign = 'center';
        
        const text = gameState.status === 'PLAYING' 
            ? `SESSION: ${gameState.guesses.length}/6 • ARCHIVE-LINKED WORDLE`
            : gameState.status === 'WON' 
                ? `VICTORY ACHIEVED • ${gameState.guesses.length} TRIES` 
                : `ARCHIVE LOST • THE WORD WAS: ${gameState.targetWord}`;
        
        ctx.fillText(text.toUpperCase(), this.CARD_WIDTH / 2, this.CARD_HEIGHT - 35);
        ctx.restore();
    }
}

module.exports = new WordleGenerator();
