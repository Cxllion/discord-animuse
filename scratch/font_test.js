const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');

GlobalFonts.registerFromPath('../assets/fonts/Monalqo.otf', 'monalqo');

const canvas = createCanvas(800, 400);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#1a1520';
ctx.fillRect(0, 0, 800, 400);

ctx.fillStyle = '#F5E6D3';
ctx.font = '60px monalqo';
ctx.fillText('cal - Monalqo', 50, 100);

ctx.font = 'italic 40px monalqo';
ctx.fillText('Muse Reader - Monalqo Italic', 50, 160);

ctx.font = '60px Georgia';
ctx.fillText('cal - Georgia', 50, 240);

ctx.font = 'italic 40px Georgia';
ctx.fillText('Muse Reader - Georgia Italic', 50, 300);

fs.writeFileSync('font_test.png', canvas.encodeSync('png'));
