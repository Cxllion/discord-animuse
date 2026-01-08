/**
 * Centralized Visual Utilities for Card Generators
 */

/**
 * Normalizes a Hex color to be high-contrast and premium for dark mode.
 * Caps saturation and clamps lightness to prevent "neon" or "washed out" colors.
 * @param {string} hex 
 * @returns {string} Normalized Hex
 */
const normalizeColor = (hex) => {
    if (!hex || !hex.startsWith('#')) return hex || '#FFACD1'; // Fallback to default pink

    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) h = s = 0;
    else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h /= 6;
    }

    // SOPHISTICATED CONSTRAINTS (Muted & Deep)
    s = Math.min(s, 0.55); // Aggressive Saturation Cap
    l = Math.max(0.4, Math.min(l, 0.65)); // Clamp Lightness (prevent too dark or too white)

    const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = x => Math.round(hue2rgb(p, q, x) * 255).toString(16).padStart(2, '0');

    return `#${f(h + 1 / 3)}${f(h)}${f(h - 1 / 3)}`.toUpperCase();
};

/**
 * Extracts metadata tags (Season, Part, Cour, etc.) from a title and returns the cleaned title.
 * @param {string} fullTitle 
 * @returns {{ title: string, tags: string[] }}
 */
const parseMetadata = (fullTitle) => {
    let title = fullTitle;
    let tags = [];

    const patterns = [
        { regex: /Season\s+(\d+)/i, type: 'SEASON' },
        { regex: /Cour\s+(\d+)/i, type: 'COUR' },
        { regex: /Part\s+(\d+)/i, type: 'PART' },
        { regex: /\bS(\d+)\b/i, type: 'SEASON' },
        { regex: /(\d+)(?:st|nd|rd|th)\s+Season/i, type: 'SEASON' },
        { regex: /Final\s+Season/i, type: 'FINAL SEASON', literal: true },
        { regex: /The\s+Final\s+Chapters/i, type: 'FINAL CHAPTERS', literal: true },
        { regex: /Special\s+(\d+)/i, type: 'SPECIAL' },
        { regex: /\bSpecial\b/i, type: 'SPECIAL', literal: true }
    ];

    for (const p of patterns) {
        let match;
        while ((match = title.match(p.regex)) !== null) {
            if (p.literal) tags.push(p.type);
            else tags.push(`${p.type} ${match[1]}`);
            title = title.replace(match[0], '').trim();
        }
    }

    // Scrub trailing separators
    title = title.replace(/[:\-–\s]+$/, '');

    return { title, tags };
};

module.exports = {
    normalizeColor,
    parseMetadata
};
