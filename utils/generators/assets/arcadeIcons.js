/**
 * Arcade Icons V3: Self-Centering Neural Sigils.
 * Built to be perfectly aligned at any scale (Mini-Dock to Hero-Header).
 */
const ArcadeIcons = {
    drawWordleIcon(ctx, x, y, size, color) {
        ctx.save();
        ctx.translate(x, y);
        
        // Footprint Normalization (0.85 * size)
        const cellSize = size * 0.23; 
        const gap = size * 0.08;
        const totalSize = (cellSize * 3) + (gap * 2);
        const offset = (size - totalSize) / 2;
        
        ctx.translate(offset, offset);

        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const cx = c * (cellSize + gap);
                const cy = r * (cellSize + gap);
                
                ctx.beginPath(); ctx.roundRect(cx, cy, cellSize, cellSize, cellSize * 0.2);
                if (r === 1 && c === 1) {
                    ctx.fillStyle = color;
                    ctx.shadowColor = color; ctx.shadowBlur = size * 0.2;
                } else {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                    ctx.shadowBlur = 0;
                }
                ctx.fill();
            }
        }
        ctx.restore();
    },

    drawConnect4Icon(ctx, x, y, size, color) {
        ctx.save();
        ctx.translate(x, y);
        
        // Footprint Normalization (0.85 * size)
        const cellSize = size * 0.175;
        const gap = size * 0.05;
        const totalSize = (cellSize * 4) + (gap * 3);
        const offset = (size - totalSize) / 2;
        
        ctx.translate(offset, offset);

        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                const cx = c * (cellSize + gap) + cellSize / 2;
                const cy = r * (cellSize + gap) + cellSize / 2;
                
                ctx.beginPath(); ctx.arc(cx, cy, cellSize / 2, 0, Math.PI * 2);
                if (r + c === 3) {
                    ctx.fillStyle = color;
                    ctx.shadowColor = color; ctx.shadowBlur = size * 0.25;
                } else {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                    ctx.shadowBlur = 0;
                }
                ctx.fill();
            }
        }
        ctx.restore();
    },

    drawSummaryIcon(ctx, x, y, size, color) {
        ctx.save();
        ctx.translate(x, y);
        const r = size / 2;

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI * 2 * i) / 6;
            ctx.lineTo(r + Math.cos(angle) * r, r + Math.sin(angle) * r);
        }
        ctx.closePath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = size * 0.03;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(r, r, size * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.shadowColor = color; ctx.shadowBlur = size * 0.3;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(r, r - size * 0.25); ctx.lineTo(r, 0);
        ctx.moveTo(r, r + size * 0.25); ctx.lineTo(r, size);
        ctx.moveTo(r - size * 0.25, r); ctx.lineTo(0, r);
        ctx.moveTo(r + size * 0.25, r); ctx.lineTo(size, r);
        ctx.strokeStyle = color; ctx.lineWidth = size * 0.02; ctx.stroke();
        
        ctx.restore();
    }
};

module.exports = ArcadeIcons;
