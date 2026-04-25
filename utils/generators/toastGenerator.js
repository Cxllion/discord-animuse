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
        this.HEIGHT = 200;
        this.COLORS = {
            BACKGROUND: '#0A0A0A',
            PANEL: 'rgba(255, 255, 255, 0.03)',
            ACCENT: '#FFD700',
            TEXT_PRIMARY: '#FFFFFF',
            TEXT_SECONDARY: 'rgba(255, 255, 255, 0.7)',
            TEXT_MUTED: 'rgba(255, 255, 255, 0.4)',
            SUCCESS: '#4ADE80'
        };
    }

    async generateSuccessSlip(options = {}) {
        const {
            user = { username: 'Patron', avatarURL: null },
            pointsEarned = 0,
            streakBonus = 0,
            totalPoints = 0,
            streak = 0,
            gameName = 'Minigame',
            extraLine = null
        } = options;

        const canvas = createCanvas(this.WIDTH, this.HEIGHT);
        const ctx = canvas.getContext('2d');

        // 1. Base Glassmorphism Card
        ctx.fillStyle = this.COLORS.BACKGROUND;
        ctx.beginPath();
        ctx.roundRect(0, 0, this.WIDTH, this.HEIGHT, 14);
        ctx.fill();

        // Glowing Edge
        const gradient = ctx.createLinearGradient(0, 0, this.WIDTH, this.HEIGHT);
        gradient.addColorStop(0, 'rgba(255, 215, 0, 0.28)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
        gradient.addColorStop(1, 'rgba(255, 215, 0, 0.28)');
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.stroke();

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
        ctx.font = `900 48px 'monalqo', sans-serif`;
        ctx.fillText(`+${pointsEarned}`, contentX, 70);

        ctx.fillStyle = this.COLORS.TEXT_SECONDARY;
        ctx.font = `800 12px 'monalqo', sans-serif`;
        ctx.letterSpacing = '1.8px';
        ctx.fillText('ARCADE CREDITS EARNED', contentX, 90);

        // 4. Statistics Row (Dynamic Pills)
        const statsY = 125;
        
        // A. Streak Pill
        const streakText = `${streak} DAYS STREAK`.toUpperCase();
        ctx.font = `900 10px 'monalqo', sans-serif`;
        ctx.letterSpacing = '1px';
        const streakTextWidth = ctx.measureText(streakText).width;
        const streakPillW = streakTextWidth + 20;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.beginPath();
        ctx.roundRect(contentX, statsY - 14, streakPillW, 22, 5);
        ctx.fill();
        
        ctx.fillStyle = this.COLORS.TEXT_PRIMARY;
        ctx.fillText(streakText, contentX + 10, statsY + 1);

        // B. Bonus Pill (Dynamic)
        let bonusPillW = 0;
        if (streakBonus > 0) {
            const bonusText = `+${streakBonus} BONUS`.toUpperCase();
            ctx.font = `800 10px 'monalqo', sans-serif`;
            const bonusTextWidth = ctx.measureText(bonusText).width;
            bonusPillW = bonusTextWidth + 20;

            ctx.fillStyle = 'rgba(74, 222, 128, 0.12)';
            ctx.beginPath();
            ctx.roundRect(contentX + streakPillW + 12, statsY - 14, bonusPillW, 22, 5);
            ctx.fill();
            
            ctx.fillStyle = this.COLORS.SUCCESS;
            ctx.fillText(bonusText, contentX + streakPillW + 22, statsY + 1);
        }

        // C. Total Balance
        ctx.textAlign = 'right';
        ctx.fillStyle = this.COLORS.TEXT_MUTED;
        ctx.font = `700 11px 'monalqo', sans-serif`;
        ctx.letterSpacing = '0.5px';
        ctx.fillText(`BALANCE: ${totalPoints.toLocaleString()} PTS`, this.WIDTH - 30, statsY + 1);

        // 5. Game ID
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.font = `900 36px 'monalqo', sans-serif`;
        ctx.fillText(gameName.toUpperCase(), this.WIDTH - 30, 55);

        // 6. Lower Insight Panel
        if (extraLine) {
            const panelH = 52;
            const panelY = this.HEIGHT - panelH - 15;
            ctx.fillStyle = this.COLORS.PANEL;
            ctx.beginPath();
            ctx.roundRect(20, panelY, this.WIDTH - 40, panelH, 8);
            ctx.fill();

            ctx.textAlign = 'left';
            ctx.fillStyle = this.COLORS.ACCENT;
            ctx.font = `900 10px 'monalqo', sans-serif`;
            ctx.letterSpacing = '1.8px';
            ctx.fillText('WORD INSIGHT', 32, panelY + 18);

            ctx.fillStyle = this.COLORS.TEXT_SECONDARY;
            ctx.font = `italic 500 11px 'monalqo', sans-serif`;
            ctx.letterSpacing = '0px';
            
            const maxWidth = this.WIDTH - 70;
            const words = extraLine.split(' ');
            let line = '';
            let lineY = panelY + 32;
            let lineCount = 0;
            const maxLines = 2;

            for (let n = 0; n < words.length; n++) {
                const testLine = line + words[n] + ' ';
                const metrics = ctx.measureText(testLine);
                
                if (metrics.width > maxWidth && n > 0) {
                    lineCount++;
                    if (lineCount >= maxLines) {
                        ctx.fillText(line.trim() + '...', 32, lineY);
                        line = '';
                        break;
                    } else {
                        ctx.fillText(line, 32, lineY);
                        line = words[n] + ' ';
                        lineY += 14;
                    }
                } else {
                    line = testLine;
                }
            }
            if (line.length > 0) ctx.fillText(line, 32, lineY);
        }

        return canvas.toBuffer('image/webp', { quality: 95 });
    }
}

module.exports = new ToastGenerator();
