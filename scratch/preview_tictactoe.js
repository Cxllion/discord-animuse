const tictactoeGenerator = require('../utils/generators/tictactoeGenerator');
const fs = require('fs');

async function test() {
    const gameState = {
        board: [
            [1, 2, 0],
            [0, 1, 0],
            [2, 0, 1]
        ],
        status: 'WON',
        winner: '123',
        player1: '123',
        player2: '456',
        current_turn: '456',
        winningTiles: [{r:0, c:0}, {r:1, c:1}, {r:2, c:2}]
    };

    const p1Meta = { username: 'PLAYER ONE', avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png' };
    const p2Meta = { username: 'PLAYER TWO', avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png' };

    const buf = await tictactoeGenerator.generateBoard(gameState, p1Meta, p2Meta);
    fs.writeFileSync('preview-ttt.webp', buf);
    console.log('Done.');
}

test().catch(console.error);
