const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');

GlobalFonts.registerFromPath('./assets/fonts/Lora-Variable.ttf', 'lora');
GlobalFonts.registerFromPath('./assets/fonts/Lora-Italic-Variable.ttf', 'lora');

const canvas = createCanvas(800, 400);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#1a1520';
ctx.fillRect(0, 0, 800, 400);

ctx.fillStyle = '#F5E6D3';
ctx.font = '60px lora';
ctx.fillText('cal - Lora Regular', 50, 100);

ctx.font = 'italic 40px lora';
ctx.fillText('Muse Reader - Lora Italic', 50, 160);

fs.writeFileSync('font_test_2.png', canvas.encodeSync('png'));
console.log('Done');
