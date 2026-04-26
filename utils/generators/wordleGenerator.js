const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const logger = require('../core/logger');

/**
 * Wordle Generator: Handles the visual rendering of the Wordle board.
 */
class WordleGenerator {
    constructor() {
        this.CARD_WIDTH = 600;
        this.CARD_HEIGHT = 950; // Increased for better spacing
        this.TILE_SIZE = 85; // Slightly larger for clarity
        this.TILE_GAP = 14;
        this.GRID_X = (this.CARD_WIDTH - (5 * this.TILE_SIZE + 4 * this.TILE_GAP)) / 2;
        this.GRID_Y = 135; // Moved up to make room
        
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

    /**
     * Sanitizes and selects the best display name (Nickname vs Username).
     * Fallback to username if nickname contains non-standard symbols.
     */
    getDisplayName(user) {
        if (!user) return 'PATRON';
        
        const rawName = user.displayName || user.username || 'PATRON';
        
        // Standard ASCII + common punctuation regex
        const standardRegex = /^[a-zA-Z0-9\s._\-|[\]()!@#%^&*+=~]+$/;
        
        let finalName = rawName;
        // If nickname has complex symbols/emojis, fallback to clean username
        if (user.displayName && !standardRegex.test(rawName)) {
            finalName = user.username || 'PATRON';
        }

        // Truncate long names to prevent overlap with the 'DAILY ARCHIVE DECODING' title
        if (finalName.length > 15) {
            finalName = finalName.substring(0, 13) + '..';
        }

        return finalName.toUpperCase();
    }

    async generateBoard(gameState, options = {}) {
        const SCALE = 2;
        const { anonymize = false, user = null } = options;
        const canvas = createCanvas(this.CARD_WIDTH * SCALE, this.CARD_HEIGHT * SCALE);
        const ctx = canvas.getContext('2d');
        ctx.scale(SCALE, SCALE);

        // 0. Initial Clear for Transparency
        ctx.clearRect(0, 0, this.CARD_WIDTH, this.CARD_HEIGHT);

        // Premium Rendering Settings
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // 1. Background System (includes clipping)
        this.drawBackground(ctx);
        
        // 2. Scanlines (Signature Animuse texture)
        this.drawScanlines(ctx);

        // 3. Header (User Info & Title)
        await this.drawHeader(ctx, user, anonymize);

        // 4. Grid Rendering
        const guesses = gameState?.guesses || [];
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

                this.drawTile(ctx, x, y, char, state, anonymize);
            }
        }

        // 4. Content Logic (Keyboard for Private, Social Feed for Public)
        if (!anonymize) {
            this.drawKeyboard(ctx, guesses);
        } else {
            const otherGames = options.otherGames || [];
            await this.drawSocialFeed(ctx, otherGames);
        }

        // 5. Header/Stats (Optional Footer)
        this.drawFooter(ctx, gameState, anonymize);

        return await canvas.encode('png');
    }

    drawBackground(ctx) {
        ctx.save();
        
        // Create the Squircle Path
        ctx.beginPath();
        ctx.roundRect(0, 0, this.CARD_WIDTH, this.CARD_HEIGHT, 40);
        
        // Fill Base
        ctx.fillStyle = this.COLORS.BG;
        ctx.fill();

        // Clip everything else to this squircle
        ctx.clip();

        // Subtle gradient glow from bottom-right (Animuse Theme)
        const grad = ctx.createRadialGradient(
            this.CARD_WIDTH - 50, this.CARD_HEIGHT - 50, 50,
            this.CARD_WIDTH, this.CARD_HEIGHT, 300
        );
        grad.addColorStop(0, 'rgba(59, 130, 246, 0.1)'); // Blue HUD tint
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, this.CARD_WIDTH, this.CARD_HEIGHT);

        // Inner Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(0, 0, this.CARD_WIDTH, this.CARD_HEIGHT);
        
        ctx.restore();
    }

    drawTile(ctx, x, y, char, state, anonymize = false) {
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

        // Draw Character (Skip if anonymized)
        if (char && !anonymize) {
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
        
        // Clip to the same squircle to avoid spilling onto transparent corners
        ctx.beginPath();
        ctx.roundRect(0, 0, this.CARD_WIDTH, this.CARD_HEIGHT, 40);
        ctx.clip();

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

    async drawHeader(ctx, user, anonymize = false) {
        ctx.save();

        // Title
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `900 24px 'monalqo', sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText('DAILY ARCHIVE DECODING', 35, 60);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = `600 12px 'monalqo', sans-serif`;
        ctx.letterSpacing = '1px';
        ctx.fillText(anonymize ? 'PUBLIC FEED | ANONYMIZED DATA' : 'PERSONAL CONSOLE | SECURE LINK', 35, 80);

        if (user) {
            // User Avatar (Right side)
            const avatarSize = 60;
            const avatarX = this.CARD_WIDTH - 35 - avatarSize;
            const avatarY = 35;

            // Clip Avatar to Squircle
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(avatarX, avatarY, avatarSize, avatarSize, 15);
            ctx.clip();
            
            try {
                const avatar = await loadImage(user.avatarURL);
                ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
            } catch (err) {
                // Fallback if avatar fails
                ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
            }
            ctx.restore();

            // Display Name (Next to avatar)
            const displayName = this.getDisplayName(user);
            ctx.textAlign = 'right';
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `800 16px 'monalqo', sans-serif`;
            ctx.fillText(displayName, avatarX - 15, 60);
            
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.font = `600 10px 'monalqo', sans-serif`;
            ctx.fillText('IDENTIFIED PATRON', avatarX - 15, 78);
        }

        ctx.restore();
    }

    drawFooter(ctx, gameState, anonymize = false) {
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.font = `700 10px 'monalqo', sans-serif`;
        ctx.letterSpacing = '2px';
        ctx.textAlign = 'center';
        
        const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase();
        const text = `ANIMUSE WORDLE | ${dateStr}`;
        ctx.fillText(text, this.CARD_WIDTH / 2, this.CARD_HEIGHT - 25);
        ctx.restore();
    }

    drawKeyboard(ctx, guesses) {
        ctx.save();
        
        // 1. Calculate best state for each letter
        const states = {};
        for (const guess of guesses) {
            for (let i = 0; i < 5; i++) {
                const char = guess.word[i];
                const state = guess.result[i];
                if (!states[char] || state > states[char]) {
                    states[char] = state;
                }
            }
        }

        const keys = [
            ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
            ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
            ['Z', 'X', 'C', 'V', 'B', 'N', 'M']
        ];

        const keyW = 40; // Slightly narrower
        const keyH = 50; 
        const gap = 8;
        const startY = 740; // Sufficient clearance from grid

        keys.forEach((row, rowIndex) => {
            const rowW = row.length * (keyW + gap) - gap;
            const startX = (this.CARD_WIDTH - rowW) / 2;

            row.forEach((key, colIndex) => {
                const x = startX + colIndex * (keyW + gap);
                const y = startY + rowIndex * (keyH + gap);
                const state = states[key];

                ctx.beginPath();
                ctx.roundRect(x, y, keyW, keyH, 8);
                
                let color = 'rgba(255, 255, 255, 0.05)';
                if (state === 0) color = this.COLORS.ABSENT;
                if (state === 1) color = this.COLORS.PRESENT;
                if (state === 2) color = this.COLORS.CORRECT;
                
                ctx.fillStyle = color;
                ctx.fill();

                ctx.fillStyle = state !== undefined ? '#FFFFFF' : 'rgba(255, 255, 255, 0.4)';
                ctx.font = `800 16px 'monalqo', sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(key, x + keyW / 2, y + keyH / 2 + 1);
            });
        });

        ctx.restore();
    }

    async drawSocialFeed(ctx, otherGames) {
        ctx.save();
        
        const startY = 780; // Moved down for breathing room
        const feedW = this.CARD_WIDTH - 60;
        const startX = 30;

        // Draw Feed Label (Centered and Prominent)
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.font = `900 12px 'monalqo', sans-serif`;
        ctx.letterSpacing = '3px';
        
        // Subtle Glow
        ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
        ctx.shadowBlur = 4;
        ctx.fillText('OTHER DECODERS', this.CARD_WIDTH / 2, startY - 25);
        ctx.shadowBlur = 0;

        // Symmetric Divider Lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1.2;
        
        // Left Line
        ctx.beginPath();
        ctx.moveTo(startX + 10, startY - 30);
        ctx.lineTo(this.CARD_WIDTH / 2 - 85, startY - 30);
        ctx.stroke();

        // Right Line
        ctx.beginPath();
        ctx.moveTo(this.CARD_WIDTH / 2 + 85, startY - 30);
        ctx.lineTo(this.CARD_WIDTH - startX - 10, startY - 30);
        ctx.stroke();

        if (otherGames.length === 0) {
            // Placeholder
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.font = `italic 500 14px 'monalqo', sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText('Waiting for more patrons to initialize terminals...', this.CARD_WIDTH / 2, startY + 50);
        } else {
            // Draw up to 5 mini sessions
            const maxSlots = 5;
            const slotW = feedW / maxSlots;
            const miniTile = 12;
            const miniGap = 3;
            const avSize = 40;

            for (let i = 0; i < Math.min(otherGames.length, maxSlots); i++) {
                const game = otherGames[i];
                const x = startX + i * slotW + (slotW / 2) - (avSize / 2); 
                const y = startY - 15; // Shifted higher

                // 1. Medal/Ring Check (Based on Status & Solve Order)
                let ringColor = null;
                if (game.status === 'WON') {
                    if (game.solvedOrder === 1) ringColor = '#FFD700'; // Gold
                    else if (game.solvedOrder === 2) ringColor = '#C0C0C0'; // Silver
                    else if (game.solvedOrder === 3) ringColor = '#CD7F32'; // Bronze
                    else ringColor = '#22C55E'; // Green (4+ place)
                } else if (game.status === 'LOST') {
                    ringColor = '#EF4444'; // Red (Failed)
                }
                // PLAYING / Ongoing gets no ring (ringColor remains null)

                // 2. Mini Avatar with Medal Ring
                if (game.user?.avatarURL) {
                    ctx.save();
                    if (ringColor) {
                        ctx.beginPath();
                        ctx.arc(x + avSize / 2, y + avSize / 2, (avSize / 2) + 3, 0, Math.PI * 2);
                        ctx.strokeStyle = ringColor;
                        ctx.lineWidth = 3;
                        ctx.stroke();
                    }

                    ctx.beginPath();
                    ctx.arc(x + avSize / 2, y + avSize / 2, avSize / 2, 0, Math.PI * 2);
                    ctx.clip();
                    try {
                        const av = await loadImage(game.user.avatarURL);
                        ctx.drawImage(av, x, y, avSize, avSize);
                    } catch (e) {
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                        ctx.fill();
                    }
                    ctx.restore();
                }

                // 3. Name (REMOVED as per user request)

                // 4. Mini Grid
                const gridW = (5 * miniTile) + (4 * miniGap);
                const gridX = x + (avSize / 2) - (gridW / 2);
                const gridY = y + avSize + 8; // Tighter alignment without name

                // Ensure we have an array of guesses
                const guesses = Array.isArray(game.guesses) ? game.guesses : [];

                for (let r = 0; r < 6; r++) {
                    for (let c = 0; c < 5; c++) {
                        const guess = guesses[r];
                        let color = 'rgba(255, 255, 255, 0.05)';
                        if (guess && Array.isArray(guess.result)) {
                            const state = guess.result[c];
                            if (state === 0) color = this.COLORS.ABSENT;
                            if (state === 1) color = this.COLORS.PRESENT;
                            if (state === 2) color = this.COLORS.CORRECT;
                        }
                        ctx.fillStyle = color;
                        ctx.beginPath();
                        ctx.roundRect(gridX + c * (miniTile + miniGap), gridY + r * (miniTile + miniGap), miniTile, miniTile, 2.5);
                        ctx.fill();
                    }
                }
            }
        }

        ctx.restore();
    }
}

module.exports = new WordleGenerator();
