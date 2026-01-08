/**
 * Premium Color Catalog Configuration
 * 10 Families x 10 Shades + Simple Palette
 */

const COLOR_FAMILIES = {
    'Red': [
        { name: 'Scarlet', hex: '#FF2400' },
        { name: 'Vermilion', hex: '#E34234' },
        { name: 'Crimson', hex: '#DC143C' },
        { name: 'Ruby', hex: '#E0115F' },
        { name: 'Cherry', hex: '#D2042D' },
        { name: 'Rose', hex: '#FF007F' },
        { name: 'Carmine', hex: '#960018' },
        { name: 'Garnet', hex: '#733635' },
        { name: 'Brick', hex: '#CB4154' },
        { name: 'Burgundy', hex: '#800020' }
    ],
    'Pink': [
        { name: 'Blush', hex: '#DE5D83' },
        { name: 'Salmon', hex: '#FA8072' },
        { name: 'Coral', hex: '#F88379' },
        { name: 'Peach', hex: '#FFE5B4' },
        { name: 'Bubblegum', hex: '#FFC1CC' },
        { name: 'Magenta', hex: '#FF00FF' },
        { name: 'Fuchsia', hex: '#FF00FF' }, // Similar to Magenta, but distinct name
        { name: 'Hot Pink', hex: '#FF69B4' },
        { name: 'Raspberry', hex: '#E30B5D' },
        { name: 'Cerise', hex: '#DE3163' }
    ],
    'Orange': [
        { name: 'Tangerine', hex: '#F28500' },
        { name: 'Marigold', hex: '#FFA474' },
        { name: 'Apricot', hex: '#FBCEB1' },
        { name: 'Amber', hex: '#FFBF00' },
        { name: 'Saffron', hex: '#F4C430' },
        { name: 'Bronze', hex: '#CD7F32' },
        { name: 'Ginger', hex: '#B06500' },
        { name: 'Pumpkin', hex: '#FF7518' },
        { name: 'Rust', hex: '#B7410E' },
        { name: 'Ochre', hex: '#CC7722' }
    ],
    'Yellow': [
        { name: 'Lemon', hex: '#FFF700' },
        { name: 'Canary', hex: '#FFEF00' },
        { name: 'Cream', hex: '#FFFDD0' },
        { name: 'Ivory', hex: '#FFFFF0' },
        { name: 'Gold', hex: '#FFD700' },
        { name: 'Citrine', hex: '#E4D00A' },
        { name: 'Maize', hex: '#FBEC5D' },
        { name: 'Mustard', hex: '#FFDB58' },
        { name: 'Khaki', hex: '#F0E68C' },
        { name: 'Buff', hex: '#F0DC82' }
    ],
    'Green': [
        { name: 'Lime', hex: '#00FF00' },
        { name: 'Chartreuse', hex: '#7FFF00' },
        { name: 'Mint', hex: '#3EB489' },
        { name: 'Jade', hex: '#00A86B' },
        { name: 'Emerald', hex: '#50C878' },
        { name: 'Kelly', hex: '#4CBB17' },
        { name: 'Forest', hex: '#228B22' },
        { name: 'Olive', hex: '#808000' },
        { name: 'Sage', hex: '#BCB88A' },
        { name: 'Hunter', hex: '#355E3B' }
    ],
    'Blue': [
        { name: 'Cyan', hex: '#00FFFF' },
        { name: 'Sky', hex: '#87CEEB' },
        { name: 'Azure', hex: '#007FFF' },
        { name: 'Cobalt', hex: '#0047AB' },
        { name: 'Sapphire', hex: '#0F52BA' },
        { name: 'Indigo', hex: '#4B0082' },
        { name: 'Navy', hex: '#000080' },
        { name: 'Teal', hex: '#008080' },
        { name: 'Turquoise', hex: '#40E0D0' },
        { name: 'Cerulean', hex: '#007BA7' }
    ],
    'Purple': [
        { name: 'Lavender', hex: '#E6E6FA' },
        { name: 'Lilac', hex: '#C8A2C8' },
        { name: 'Mauve', hex: '#E0B0FF' },
        { name: 'Violet', hex: '#8F00FF' },
        { name: 'Amethyst', hex: '#9966CC' },
        { name: 'Plum', hex: '#8E4585' },
        { name: 'Orchid', hex: '#DA70D6' },
        { name: 'Grape', hex: '#6F2DA8' },
        { name: 'Periwinkle', hex: '#CCCCFF' },
        { name: 'Eggplant', hex: '#614051' }
    ],
    'Brown': [
        { name: 'Tan', hex: '#D2B48C' },
        { name: 'Beige', hex: '#F5F5DC' },
        { name: 'Sand', hex: '#C2B280' },
        { name: 'Taupe', hex: '#483C32' },
        { name: 'Cocoa', hex: '#D2691E' },
        { name: 'Chocolate', hex: '#7B3F00' },
        { name: 'Coffee', hex: '#6F4E37' },
        { name: 'Mahogany', hex: '#C04000' },
        { name: 'Sienna', hex: '#882D17' },
        { name: 'Sepia', hex: '#704214' }
    ],
    'Gray': [
        { name: 'Silver', hex: '#C0C0C0' },
        { name: 'Platinum', hex: '#E5E4E2' },
        { name: 'Ash', hex: '#B2BEB5' },
        { name: 'Slate', hex: '#708090' },
        { name: 'Gunmetal', hex: '#2a3439' },
        { name: 'Charcoal', hex: '#36454F' },
        { name: 'Smoke', hex: '#848884' },
        { name: 'Steel', hex: '#71797E' },
        { name: 'Pewter', hex: '#899499' },
        { name: 'Graphite', hex: '#251607' } // Approximate
    ],
    'Black': [
        // True black is problematic on Disord (transparent), so we use off-blacks
        { name: 'Void', hex: '#020202' },
        { name: 'Midnight', hex: '#191970' }, // Very dark blue-black
        { name: 'Obsidian', hex: '#0B0B0B' },
        { name: 'Onyx', hex: '#353839' },
        { name: 'Jet', hex: '#343434' },
        { name: 'Raven', hex: '#050301' },
        { name: 'Ink', hex: '#040404' },
        { name: 'Coal', hex: '#0C0908' },
        { name: 'Soot', hex: '#160D08' },
        { name: 'Ebony', hex: '#555D50' }
    ]
};

const SIMPLE_COLORS = [
    { name: 'Simple Red', hex: '#FF0000', emoji: '🔴' },
    { name: 'Simple Blue', hex: '#0000FF', emoji: '🔵' },
    { name: 'Simple Green', hex: '#008000', emoji: '🟢' },
    { name: 'Simple Yellow', hex: '#FFFF00', emoji: '🟡' },
    { name: 'Simple Purple', hex: '#800080', emoji: '🟣' },
    { name: 'Simple Pink', hex: '#FFC0CB', emoji: '🌸' },
    { name: 'Simple White', hex: '#FFFFFE', emoji: '⚪' }, // Not pure FFFFFF
    { name: 'Simple Black', hex: '#010101', emoji: '⚫' }
];

/**
 * Calculates perceived lightness (0-255).
 * Formula: 0.2126*R + 0.7152*G + 0.0722*B
 * @param {string} hex 
 */
const calculateLightness = (hex) => {
    let c = hex.substring(1);      // strip #
    const rgb = parseInt(c, 16);   // convert rrggbb to decimal
    const r = (rgb >> 16) & 0xff;  // extract red
    const g = (rgb >> 8) & 0xff;  // extract green
    const b = (rgb >> 0) & 0xff;  // extract blue

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * Lightens a hex color by a percentage.
 * @param {string} hex The color to lighten.
 * @param {number} percent 0-100
 */
const lightenColor = (hex, percent) => {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;

    return '#' + (
        0x1000000 +
        (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
        (B < 255 ? B < 1 ? 0 : B : 255)
    ).toString(16).slice(1);
};

module.exports = {
    COLOR_FAMILIES,
    SIMPLE_COLORS,
    calculateLightness,
    lightenColor
};
