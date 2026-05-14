const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const logger = require('../core/logger');

/**
 * Toast Generator: The "Success Slip" Architect.
 * Generates compact, premium visual receipts for minigame achievements.
 */
class ToastGenerator {
    constructor() {
        this.WIDTH = 600; 
        this.HEIGHT = 150;
        this.COLORS = {
            BACKGROUND: '#0A0A0A',
            PANEL: 'rgba(255, 255, 255, 0.03)',
            ACCENT: '#FFD700',
            TEXT_PRIMARY: '#FFFFFF',
            TEXT_SECONDARY: 'rgba(255, 255, 255, 0.7)',
            TEXT_MUTED: 'rgba(255, 255, 255, 0.4)',
            SUCCESS: '#4ADE80'
        };
        // Robust font stack with system fallbacks
        this.FONT_STACK = "'monalqo', Arial, sans-serif";
    }

    async generateSuccessSlip(options = {}) {
        const {
            user = { username: 'Patron', avatarURL: null },
            pointsEarned = 0,
            streakBonus = 0,
            totalPoints = 0,
            streak = 0,
            gameName = 'Minigame',
            attempts = 0
        } = options;

        const scale = 1.5;
        const canvas = createCanvas(this.WIDTH * scale, this.HEIGHT * scale);
        const ctx = canvas.getContext('2d');
        ctx.scale(scale, scale);

        // Normalize Game Name (User Request: Connect Muse -> Connect4)
        const normalizedGameName = gameName.toUpperCase() === 'CONNECT MUSE' ? 'CONNECT4' : gameName.toUpperCase();

        // 1. Base Glassmorphism Card
        ctx.fillStyle = this.COLORS.BACKGROUND;
        ctx.beginPath();
        ctx.roundRect(0, 0, this.WIDTH, this.HEIGHT, 14);
        ctx.fill();

        // Dynamic Theme Color (Default to Gold)
        const themeColor = options.color || '#FFD700';

        // Glowing Edge
        const gradient = ctx.createLinearGradient(0, 0, this.WIDTH, this.HEIGHT);
        gradient.addColorStop(0, `${themeColor}48`); // 28% opacity
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
        gradient.addColorStop(1, `${themeColor}48`);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Subtle Outer Glow
        ctx.shadowColor = `${themeColor}20`;
        ctx.shadowBlur = 15;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 2. Avatar with Shield Border
        const avX = 30;
        const avY = 30;
        const avSize = 90;

        if (user.avatarURL) {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(avX - 5, avY - 5, avSize + 10, avSize + 10, 12);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.beginPath();
            ctx.roundRect(avX, avY, avSize, avSize, 10);
            ctx.clip();
            try {
                const av = await loadImage(user.avatarURL);
                ctx.drawImage(av, avX, avY, avSize, avSize);
            } catch (e) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.fill();
            }
            ctx.restore();
        }

        // 3. Earnings Section
        const contentX = avX + avSize + 30;
        
        ctx.textAlign = 'left';
        ctx.fillStyle = this.COLORS.ACCENT;
        // Font weight 400 to match monalqo's registered metadata
        ctx.font = `400 48px ${this.FONT_STACK}`;
        ctx.fillText(`+${pointsEarned}`, contentX, 70);

        ctx.fillStyle = this.COLORS.TEXT_SECONDARY;
        ctx.font = `400 12px ${this.FONT_STACK}`;
        ctx.letterSpacing = '1.8px';
        ctx.fillText('ARCADE CREDITS EARNED', contentX, 90);

        // 4. Statistics Row (Dynamic Pills)
        const statsY = 114; 
        const pillStartX = contentX - 8; 
        
        let currentPillX = pillStartX;

        // A. Streak Pill (Only show if > 0)
        if (streak > 0) {
            const streakText = `${streak} DAYS STREAK`.toUpperCase();
            ctx.font = `400 10px ${this.FONT_STACK}`;
            ctx.letterSpacing = '1px';
            const streakTextWidth = ctx.measureText(streakText).width;
            const streakPillW = streakTextWidth + 20;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.beginPath();
            ctx.roundRect(currentPillX, statsY - 14, streakPillW, 22, 5);
            ctx.fill();
            
            ctx.fillStyle = this.COLORS.TEXT_PRIMARY;
            ctx.fillText(streakText, currentPillX + 10, statsY + 1);
            currentPillX += streakPillW + 8;
        } else {
            // Optional: Show "ACTIVE PATRON" if no streak
            const statusText = "ACTIVE PATRON";
            ctx.font = `400 10px ${this.FONT_STACK}`;
            ctx.letterSpacing = '1px';
            const statusWidth = ctx.measureText(statusText).width;
            const statusPillW = statusWidth + 20;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.beginPath();
            ctx.roundRect(currentPillX, statsY - 14, statusPillW, 22, 5);
            ctx.fill();
            
            ctx.fillStyle = this.COLORS.TEXT_MUTED;
            ctx.fillText(statusText, currentPillX + 10, statsY + 1);
            currentPillX += statusPillW + 8;
        }

        // B. Bonus Pill (Dynamic)
        if (streakBonus > 0) {
            const bonusText = `+${streakBonus} BONUS`.toUpperCase();
            ctx.font = `400 10px ${this.FONT_STACK}`;
            const bonusTextWidth = ctx.measureText(bonusText).width;
            const bonusPillW = bonusTextWidth + 20;

            ctx.fillStyle = 'rgba(74, 222, 128, 0.12)';
            ctx.beginPath();
            ctx.roundRect(currentPillX, statsY - 14, bonusPillW, 22, 5);
            ctx.fill();
            
            ctx.fillStyle = this.COLORS.SUCCESS;
            ctx.fillText(bonusText, currentPillX + 10, statsY + 1);
            currentPillX += bonusPillW + 8;
        }

        // C. Precision Pill (Wordle Specialized)
        if (normalizedGameName === 'WORDLE' && attempts > 0 && attempts <= 2) {
            const precisionText = attempts === 1 ? 'FLAWLESS' : 'PRECISION';
            ctx.font = `400 10px ${this.FONT_STACK}`;
            const precisionTextWidth = ctx.measureText(precisionText).width;
            const precisionPillW = precisionTextWidth + 20;

            ctx.fillStyle = attempts === 1 ? 'rgba(255, 215, 0, 0.12)' : 'rgba(139, 92, 246, 0.12)'; 
            ctx.beginPath();
            ctx.roundRect(currentPillX, statsY - 14, precisionPillW, 22, 5);
            ctx.fill();
            
            ctx.fillStyle = attempts === 1 ? '#FFD700' : '#8B5CF6'; 
            ctx.fillText(precisionText, currentPillX + 10, statsY + 1);
        }

        // D. Total Balance
        ctx.textAlign = 'right';
        ctx.fillStyle = this.COLORS.TEXT_MUTED;
        ctx.font = `400 11px ${this.FONT_STACK}`;
        ctx.letterSpacing = '0.5px';
        ctx.fillText(`BALANCE: ${totalPoints.toLocaleString()} PTS`, this.WIDTH - 30, statsY + 1);

        // 5. Game ID (Ghost Text)
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'; 
        ctx.font = `400 34px ${this.FONT_STACK}`;
        ctx.letterSpacing = '4px'; 
        ctx.fillText(normalizedGameName, this.WIDTH - 15, 45);

        return canvas.toBuffer('image/webp', { quality: 95 });
    }
}

module.exports = new ToastGenerator();
