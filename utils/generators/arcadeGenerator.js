const { createCanvas, loadImage } = require('@napi-rs/canvas');
const path = require('path');
const ArcadeIcons = require('./assets/arcadeIcons');

/**
 * Arcade Generator V11: "The Ghost Rank Archive"
 * Aesthetic: Large Ghost Typography, Hero Rank focus, Specular Glass.
 * Compact (400x420).
 */
class ArcadeGenerator {
    constructor() {
        this.WIDTH = 400;
        this.HEIGHT = 420;
        this.SCALE = 3; 
        
        this.COLORS = {
            lavender: '#E9D5FF',
            sakura: '#FFB7C5',
            mint: '#2DD4BF',
            glass: 'rgba(255, 255, 255, 0.08)',
            text: '#FFFFFF',
            subtext: 'rgba(255, 255, 255, 0.4)'
        };
    }

    async generatePage(pageType, stats, user) {
        const canvas = createCanvas(this.WIDTH * this.SCALE, this.HEIGHT * this.SCALE);
        const ctx = canvas.getContext('2d');
        ctx.scale(this.SCALE, this.SCALE);

        const themeColor = this.getThemeColor(pageType);
        const isSummary = pageType === 'summary';

        ctx.clearRect(0, 0, this.WIDTH, this.HEIGHT);
        
        // 1. Base Layer (High Density)
        this.drawLiquidBase(ctx, themeColor, isSummary);

        // 2. Ghost Rank Background
        this.drawGhostRank(ctx, stats.rank, themeColor);

        // 3. Icons (Games only)
        if (!isSummary) this.drawIconHeader(ctx, pageType, themeColor);

        // 4. Identity Stack
        await this.drawIdentityStack(ctx, stats, user, themeColor, isSummary);

        // 5. Game Frequency Dock (Summary Only)
        if (isSummary) this.drawGameDock(ctx, stats, themeColor);

        // 6. Data Pills
        this.drawPillGrid(ctx, pageType, stats, themeColor);

        // 7. Finishing
        this.drawFooter(ctx);

        const buffer = canvas.toBuffer('image/webp');
        // Let V8 garbage collect, but explicit clear context
        ctx.clearRect(0, 0, this.WIDTH, this.HEIGHT);

        return buffer;
    }

    getThemeColor(pageType) {
        if (pageType === 'wordle') return this.COLORS.mint;
        if (pageType === 'connect4') return this.COLORS.sakura;
        return this.COLORS.lavender;
    }

    drawGameDock(ctx, stats, color) {
        const cx = this.WIDTH / 2;
        const y = 207; 
        
        const games = [
            { id: 'wordle', count: stats.wordle.totalSolved || 0, color: this.COLORS.mint },
            { id: 'connect4', count: stats.connect4.total || 0, color: this.COLORS.sakura }
        ].filter(g => g.count > 0).sort((a, b) => b.count - a.count);

        if (games.length === 0) return;

        const iconSize = 32;
        const gap = 15;
        const totalW = (games.length * iconSize) + ((games.length - 1) * gap);
        let startX = cx - totalW / 2;

        games.forEach(game => {
            if (game.id === 'wordle') ArcadeIcons.drawWordleIcon(ctx, startX, y, iconSize, game.color);
            else if (game.id === 'connect4') ArcadeIcons.drawConnect4Icon(ctx, startX, y, iconSize, game.color);
            
            startX += iconSize + gap;
        });
    }

    drawLiquidBase(ctx, color, isSummary) {
        ctx.save();
        const r = 50; 
        
        // 1. Clip to Card Shape
        ctx.beginPath(); ctx.roundRect(0, 0, this.WIDTH, this.HEIGHT, r);
        ctx.clip();

        // 2. Base Gradient
        const bgGrad = ctx.createLinearGradient(0, 0, 0, this.HEIGHT);
        bgGrad.addColorStop(0, 'rgba(24, 18, 35, 0.98)');
        bgGrad.addColorStop(1, 'rgba(10, 8, 12, 1)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, this.WIDTH, this.HEIGHT);

        // 3. Tactical Hex-Mesh (Higher Density)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.lineWidth = 0.8;
        const hexSize = 12;
        for (let y = 0; y < this.HEIGHT + hexSize; y += hexSize * 1.5) {
            for (let x = 0; x < this.WIDTH + hexSize; x += hexSize * Math.sqrt(3)) {
                const ox = (y / (hexSize * 1.5)) % 2 === 0 ? 0 : (hexSize * Math.sqrt(3)) / 2;
                this.drawHex(ctx, x + ox, y, hexSize);
            }
        }

        // 4. Circuit Traces
        ctx.strokeStyle = `${color}08`;
        ctx.lineWidth = 0.5;
        [60, 150, 300].forEach(y => {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.WIDTH, y); ctx.stroke();
            ctx.fillStyle = `${color}15`;
            ctx.beginPath(); ctx.arc(this.WIDTH * 0.8, y, 1.5, 0, Math.PI * 2); ctx.fill();
        });

        // 5. Digital Grain (Noise - Finer)
        for (let i = 0; i < 2500; i++) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.01)';
            ctx.fillRect(Math.random() * this.WIDTH, Math.random() * this.HEIGHT, 0.8, 0.8);
        }

        // 6. Special Summary Flare
        if (isSummary) {
            const flare = ctx.createRadialGradient(this.WIDTH / 2, this.HEIGHT / 3, 0, this.WIDTH / 2, this.HEIGHT / 3, 300);
            flare.addColorStop(0, `${color}12`);
            flare.addColorStop(1, 'transparent');
            ctx.fillStyle = flare; ctx.fillRect(0, 0, this.WIDTH, this.HEIGHT);
        }

        ctx.restore();
        
        // 7. Double Outer Rim (Premium Depth)
        ctx.save();
        ctx.beginPath(); ctx.roundRect(0, 0, this.WIDTH, this.HEIGHT, r);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.beginPath(); ctx.roundRect(1, 1, this.WIDTH - 2, this.HEIGHT - 2, r - 1);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    }

    drawHex(ctx, x, y, size) {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            ctx.lineTo(x + size * Math.cos(i * Math.PI / 3), y + size * Math.sin(i * Math.PI / 3));
        }
        ctx.closePath();
        ctx.stroke();
    }

    drawGhostRank(ctx, rank, color) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.05; 
        
        const displayRank = rank < 10 ? `0${rank}` : rank.toString();
        // Dynamic Font Scaling
        let fontSize = 180;
        if (displayRank.length > 2) fontSize = 140;
        if (displayRank.length > 4) fontSize = 100;
        
        ctx.font = `900 ${fontSize}px 'monalqo', sans-serif`;
        ctx.fillText(displayRank, this.WIDTH / 2, this.HEIGHT / 2 + (fontSize / 3));
        ctx.restore();
    }

    drawIconHeader(ctx, pageType, color) {
        if (pageType === 'summary') return;
        const cx = this.WIDTH / 2;
        const size = 55;
        const y = 12;
        
        // 1. Data Link Connectivity
        ctx.save();
        ctx.strokeStyle = `${color}33`;
        ctx.setLineDash([2, 4]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, y + size + 2);
        ctx.lineTo(cx, 75); // Target avY
        ctx.stroke();
        ctx.restore();

        if (pageType === 'wordle') ArcadeIcons.drawWordleIcon(ctx, cx - size / 2, y, size, color);
        else if (pageType === 'connect4') ArcadeIcons.drawConnect4Icon(ctx, cx - size / 2, y, size, color);
    }

    async drawIdentityStack(ctx, stats, user, color, isSummary) {
        const cx = this.WIDTH / 2;
        const avR = isSummary ? 50 : 36;
        const avY = isSummary ? 30 : 75; // Compressed

        // Avatar
        ctx.save();
        ctx.shadowColor = color; ctx.shadowBlur = isSummary ? 25 : 15;
        ctx.beginPath(); ctx.arc(cx, avY + avR, avR + 2, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        ctx.shadowBlur = 0;
        try {
            // Promise.race to prevent CDN hangs
            const avatarPromise = loadImage(user.avatarURL);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Avatar fetch timeout')), 1500));
            const avatar = await Promise.race([avatarPromise, timeoutPromise]);
            
            ctx.save(); ctx.beginPath(); ctx.arc(cx, avY + avR, avR, 0, Math.PI * 2); ctx.clip();
            ctx.drawImage(avatar, cx - avR, avY, avR * 2, avR * 2); ctx.restore();
        } catch (e) { ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(cx, avY + avR, avR, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();

        // Username
        ctx.fillStyle = '#fff';
        ctx.font = `900 ${isSummary ? '18px' : '15px'} 'monalqo', sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(user.displayName.toUpperCase(), cx, avY + avR * 2 + 22);

        // Hero Rank (STANDING OUT)
        const rankY = avY + avR * 2 + (isSummary ? 58 : 50);
        ctx.save();
        ctx.shadowColor = color; ctx.shadowBlur = 15;
        ctx.fillStyle = '#fff';
        ctx.font = `900 ${isSummary ? '40px' : '30px'} 'monalqo', sans-serif`;
        ctx.fillText(`#${stats.rank}`, cx, rankY);
        
        ctx.shadowBlur = 0;
        ctx.fillStyle = color;
        ctx.font = `800 8px 'monalqo', sans-serif`;
        ctx.letterSpacing = '3px';
        ctx.fillText("GLOBAL RANKING", cx, rankY + 12);
        ctx.restore();
    }

    drawPillGrid(ctx, pageType, stats, color) {
        const cx = this.WIDTH / 2;
        const isSummary = pageType === 'summary';
        const startY = isSummary ? 245 : 255;
        const pillW = isSummary ? 340 : 280;

        if (isSummary) {
            // Global Totals (Connect Muse + Wordle)
            const totalPlays = (stats.wordle.totalPlays || 0) + (stats.connect4.total || 0);
            const totalWins = (stats.wordle.totalSolved || 0) + (stats.connect4.wins || 0);
            const globalWinRate = totalPlays > 0 ? Math.round((totalWins / totalPlays) * 100) : 0;
            
            // 1. Total Points (Full Width)
            this.drawLiquidPill(ctx, cx - pillW / 2, startY, pillW, 55, "TOTAL POINTS", stats.points.toLocaleString(), color);
            
            // 2. Side-by-Side Stats (Half Width)
            const halfW = (pillW / 2) - 5;
            this.drawLiquidPill(ctx, cx - pillW / 2, startY + 65, halfW, 48, "SESSIONS", totalPlays, color);
            this.drawLiquidPill(ctx, cx + 5, startY + 65, halfW, 48, "WIN RATE", `${globalWinRate}%`, color);
        } else {
            const data = pageType === 'connect4' ? [
                { label: "CONNECT MUSE WINS", value: stats.connect4.wins },
                { label: "CONNECT MUSE WIN RATE", value: stats.connect4.total > 0 ? Math.round((stats.connect4.wins / stats.connect4.total) * 100) + '%' : '0%' }
            ] : [
                { label: "DECRYPTION STREAK", value: stats.wordle.streak },
                { label: "TOTAL SOLVED", value: stats.wordle.totalSolved }
            ];

            data.forEach((s, i) => {
                const py = startY + (i * 62);
                this.drawLiquidPill(ctx, cx - pillW / 2, py, pillW, 48, s.label, s.value, color);
            });
        }
    }

    drawLiquidPill(ctx, x, y, w, h, label, value, color) {
        ctx.save();
        // 1. Thick Glass Base
        const pillGrad = ctx.createLinearGradient(x, y, x, y + h);
        pillGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
        pillGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.03)');
        pillGrad.addColorStop(1, 'rgba(255, 255, 255, 0.01)');
        
        ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2);
        ctx.fillStyle = pillGrad;
        ctx.fill();
        
        // 2. Luminous Side Accent
        ctx.save();
        ctx.shadowColor = color; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.roundRect(x + 10, y + 12, 3, h - 24, 1.5);
        ctx.fillStyle = color; ctx.fill();
        ctx.restore();

        // 3. Specular Highlight (The 'Liquid' touch)
        ctx.beginPath();
        ctx.moveTo(x + h/2, y + 3);
        ctx.lineTo(x + w - h/2, y + 3);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // 4. Outer Rim
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.stroke();

        // 5. Content (Maximum Volume & Readable)
        ctx.fillStyle = this.COLORS.subtext;
        const labelSize = label.length > 15 ? 9 : 11;
        ctx.font = `800 ${labelSize}px 'monalqo', sans-serif`;
        ctx.textAlign = 'left';
        ctx.fillText(label, x + 20, y + h / 2 + 2);

        ctx.fillStyle = '#fff';
        ctx.font = `900 26px 'monalqo', sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(value, x + w - 20, y + h / 2 + 6);
        ctx.restore();
    }



    drawFooter(ctx) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.font = `900 7.5px 'monalqo', sans-serif`;
        ctx.letterSpacing = '5px';
        ctx.fillText("ANIMUSE ARCADE PROTOCOL", this.WIDTH / 2, this.HEIGHT - 20);
        ctx.restore();
    }
}

module.exports = new ArcadeGenerator();
