/**
 * Premium Color Catalog Configuration
 * 10 Families x 10 Shades + 10 Basic Palette
 */

const COLOR_FAMILIES = {
    'Monochrome': [
        { name: 'Snow', hex: '#FFFFFF' },
        { name: 'Ghost', hex: '#F8F8FF' },
        { name: 'Platinum', hex: '#E5E4E2' },
        { name: 'Silver', hex: '#C0C0C0' },
        { name: 'Steel', hex: '#71797E' },
        { name: 'Slate', hex: '#708090' },
        { name: 'Smoke', hex: '#848884' },
        { name: 'Charcoal', hex: '#36454F' },
        { name: 'Obsidian', hex: '#0B0B0B' },
        { name: 'Void', hex: '#020202' }
    ],
    'Yellow': [
        { name: 'Lemon', hex: '#FFF700' },
        { name: 'Canary', hex: '#FFEF00' },
        { name: 'Banana', hex: '#FFE135' },
        { name: 'Butter', hex: '#F3E5AB' },
        { name: 'Gold', hex: '#FFD700' },
        { name: 'Amber', hex: '#FFBF00' },
        { name: 'Saffron', hex: '#F4C430' },
        { name: 'Citrine', hex: '#E4D00A' },
        { name: 'Mustard', hex: '#E1AD01' },
        { name: 'Ochre', hex: '#CC7722' }
    ],
    'Orange': [
        { name: 'Apricot', hex: '#FBCEB1' },
        { name: 'Peach', hex: '#FFE5B4' },
        { name: 'Carrot', hex: '#ED9121' },
        { name: 'Marigold', hex: '#FFA000' },
        { name: 'Tangerine', hex: '#F28500' },
        { name: 'Pumpkin', hex: '#FF7518' },
        { name: 'Flame', hex: '#E25822' },
        { name: 'Ginger', hex: '#B06500' },
        { name: 'Bronze', hex: '#CD7F32' },
        { name: 'Rust', hex: '#B7410E' }
    ],
    'Red': [
        { name: 'Scarlet', hex: '#FF2400' },
        { name: 'Tomato', hex: '#FF6347' },
        { name: 'Vermilion', hex: '#E34234' },
        { name: 'Lava', hex: '#CF1020' },
        { name: 'Crimson', hex: '#DC143C' },
        { name: 'Ruby', hex: '#E0115F' },
        { name: 'Cherry', hex: '#DE3163' },
        { name: 'Cardinal', hex: '#C41E3A' },
        { name: 'Garnet', hex: '#733635' },
        { name: 'Maroon', hex: '#800000' }
    ],
    'Pink': [
        { name: 'Cotton Candy', hex: '#FFB7C5' },
        { name: 'Bubblegum', hex: '#FFC1CC' },
        { name: 'Flamingo', hex: '#FC8EAC' },
        { name: 'Blossom', hex: '#FFB4E3' },
        { name: 'Rose', hex: '#FF007F' },
        { name: 'Magenta', hex: '#FF00FF' },
        { name: 'Fuchsia', hex: '#F05BC4' },
        { name: 'Hot Pink', hex: '#FF69B4' },
        { name: 'Deep Pink', hex: '#C71585' },
        { name: 'Berry', hex: '#990066' }
    ],
    'Purple': [
        { name: 'Lavender', hex: '#E6E6FA' },
        { name: 'Lilac', hex: '#C8A2C8' },
        { name: 'Periwinkle', hex: '#CCCCFF' },
        { name: 'Orchid', hex: '#DA70D6' },
        { name: 'Amethyst', hex: '#9966CC' },
        { name: 'Violet', hex: '#8F00FF' },
        { name: 'Plum', hex: '#8E4585' },
        { name: 'Grape', hex: '#6F2DA8' },
        { name: 'Pansy', hex: '#4B0082' },
        { name: 'Indigo', hex: '#2E0854' }
    ],
    'Blue': [
        { name: 'Sky', hex: '#87CEEB' },
        { name: 'Azure', hex: '#007FFF' },
        { name: 'Cyan', hex: '#00FFFF' },
        { name: 'Turquoise', hex: '#40E0D0' },
        { name: 'Teal', hex: '#008080' },
        { name: 'Cerulean', hex: '#007BA7' },
        { name: 'Cobalt', hex: '#0047AB' },
        { name: 'Sapphire', hex: '#0F52BA' },
        { name: 'Navy', hex: '#000080' },
        { name: 'Midnight', hex: '#191970' }
    ],
    'Green': [
        { name: 'Mint', hex: '#3EB489' },
        { name: 'Lime', hex: '#00FF00' },
        { name: 'Chartreuse', hex: '#7FFF00' },
        { name: 'Jade', hex: '#00A86B' },
        { name: 'Pistachio', hex: '#93C572' },
        { name: 'Emerald', hex: '#50C878' },
        { name: 'Kelly', hex: '#4CBB17' },
        { name: 'Forest', hex: '#228B22' },
        { name: 'Olive', hex: '#808000' },
        { name: 'Hunter', hex: '#355E3B' }
    ],
    'Brown': [
        { name: 'Tan', hex: '#D2B48C' },
        { name: 'Khaki', hex: '#F0E68C' },
        { name: 'Sand', hex: '#C2B280' },
        { name: 'Camel', hex: '#C19A6B' },
        { name: 'Caramel', hex: '#AF6E4D' },
        { name: 'Cocoa', hex: '#D2691E' },
        { name: 'Chocolate', hex: '#7B3F00' },
        { name: 'Coffee', hex: '#6F4E37' },
        { name: 'Mahogany', hex: '#C04000' },
        { name: 'Umber', hex: '#635147' }
    ]
};

const BASIC_COLORS = [
    { name: 'White', hex: '#FFFFFF', emoji: '⚪' },
    { name: 'Black', hex: '#000001', emoji: '⚫' },
    { name: 'Yellow', hex: '#FFFF00', emoji: '🟡' },
    { name: 'Orange', hex: '#FFA500', emoji: '🟠' },
    { name: 'Red', hex: '#FF0000', emoji: '🔴' },
    { name: 'Pink', hex: '#FFC0CB', emoji: '<:Pink_circle:1416714148753965147>' },
    { name: 'Purple', hex: '#800080', emoji: '🟣' },
    { name: 'Blue', hex: '#0000FF', emoji: '🔵' },
    { name: 'Green', hex: '#008000', emoji: '🟢' },
    { name: 'Brown', hex: '#653b0f', emoji: '🟤' }
];

const lightenColor = (hex, percent) => {
    try {
        const num = parseInt(hex.replace("#", ""), 16),
            amt = Math.round(2.55 * percent),
            R = (num >> 16) + amt,
            G = (num >> 8 & 0x00FF) + amt,
            B = (num & 0x0000FF) + amt;
        return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1).toUpperCase();
    } catch (e) {
        return "#FFFFFF";
    }
};

module.exports = {
    COLOR_FAMILIES,
    BASIC_COLORS,
    lightenColor
};
