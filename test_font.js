const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');

// Register the font manually for the test
const fontPath = path.join(__dirname, 'assets', 'fonts', 'DigitalGalaxy-Regular-BF694e28ddc2259.otf');
GlobalFonts.registerFromPath(fontPath, 'digitalgalaxy');

const canvas = createCanvas(800, 200);
const ctx = canvas.getContext('2d');

ctx.fillStyle = 'white';
ctx.fillRect(0, 0, 800, 200);

ctx.fillStyle = 'black';
ctx.font = '40px digitalgalaxy';
ctx.fillText('0 1 2 3 4 5 6 7 8 9', 50, 80);
ctx.fillText('A B C D E F G H I J', 50, 150);

fs.writeFileSync('font_test.png', canvas.toBuffer('image/png'));
console.log('Generated font_test.png');
