const MafiaGame = require('../utils/mafia/MafiaGame');
const { Collection } = require('discord.js');

// 1. Mock Client & Adapter
const mockClient = {
    users: {
        fetch: async (id) => ({ id, username: 'MockUser', send: async () => { } })
    },
    channels: {
        fetch: async (id) => ({ id, send: async () => { } })
    }
};

const mockManager = {
    deleteGame: (id) => console.log(`[MockManager] Game ${id} deleted.`)
};

// 2. Mock Adapter Methods (to avoid dependency on real Discord classes)
// We will monkey-patch the game's adapter after instantiation if needed, 
// OR simpler: relies on the fact that MafiaGame imports DiscordAdapter.

async function runTests() {
    console.log('🧪 Starting Mafia V2 Debug Verification...');

    try {
        // Instantiate
        const game = new MafiaGame('guild_1', 'channel_1', 'host_1', mockClient, mockManager);
        console.log('✅ Game Instantiated');

        // Override Adapter safeSend/safeUpdate to log instead of failing
        game.adapter.safeSend = async (chan, content) => console.log(`[MockDiscord] Send to ${chan}:`, typeof content === 'string' ? content : 'Embed/File');
        game.adapter.fetchUser = async (id) => ({ id });
        game.adapter.safeReply = async () => { };

        // Test 1: Add Mock Players
        await game.addMockPlayers(5);
        if (game.players.size !== 6) throw new Error(`Expected 6 players (1 host + 5 mock), got ${game.players.size}`);
        console.log('✅ addMockPlayers working');

        // Test 2: Force Kill
        const targetId = Array.from(game.players.keys())[1]; // Get a mock player
        await game.forceKill(targetId);
        if (game.players.get(targetId).isAlive !== false) throw new Error('Force Kill failed to set isAlive=false');
        if (game.players.get(targetId).status !== 'DEAD') throw new Error('Force Kill failed to set status=DEAD');
        console.log('✅ forceKill working');

        // Test 3: Log State (Serialize)
        game.serializeGame();
        console.log('✅ serializeGame working');

        // Test 4: Force Win
        await game.forceWin('MAFIA');
        if (game.phase !== 'GAME_OVER') throw new Error(`Expected timeout/cleanup, phase is ${game.phase}`);
        console.log('✅ forceWin working');

        console.log('🎉 ALL DEBUG TOOLS VERIFIED!');
        process.exit(0);

    } catch (e) {
        console.error('❌ VALIDATION FAILED:', e);
        process.exit(1);
    }
}

runTests();
