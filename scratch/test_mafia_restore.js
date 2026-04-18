const MafiaManager = require('../utils/mafia/MafiaManager');
const MafiaGame = require('../utils/mafia/MafiaGame');
const logger = require('../utils/core/logger');
const EventEmitter = require('events');

// --- MOCKS ---

// 1. Mock mafiaService
const mockMafiaService = {
    getAllSessions: async () => [
        {
            guild_id: '123456789',
            channel_id: '987654321',
            host_id: '111222333',
            state: {
                lobbyMessageId: '123',
                hostId: '111222333',
                guildId: '123456789',
                channelId: '987654321',
                threadId: '999888777',
                state: 'NIGHT', // ACTIVE PHASE
                dayCount: 1,
                phaseEndTime: Date.now() + 60000,
                players: [
                    ['111222333', { id: '111222333', name: 'Host', alive: true, role: { name: 'Indexer', faction: 'Archivists', priority: 5 } }]
                ]
            }
        }
    ],
    saveSession: async () => true
};

// Replace mafiaService in MafiaManager context (it's required internally)
// Since it's already required, we might need to mock it in the require cache if we wanted 100% purity,
// but for a scratch test, we can just monkey-patch the required module.
const mafiaService = require('../utils/services/mafiaService');
Object.assign(mafiaService, mockMafiaService);

// 2. Mock Discord Client
class MockClient extends EventEmitter {
    constructor() {
        super();
        this.shard = null;
        this.users = { fetch: async (id) => ({ id, username: 'TestUser' }) };
        this.channels = { 
            fetch: async (id) => ({ 
                id, 
                send: async (msg) => {
                    console.log(`[TEST] Channel Send:`, msg);
                    return { id: 'msg-recov-id' };
                },
                members: { add: async () => true },
                setLocked: async () => true,
                setArchived: async () => true,
                guild: { fetch: async () => ({ id: '123456789' }) }
            }) 
        };
        this.guilds = { 
            cache: new Map([
                ['123456789', { 
                    id: '123456789',
                    channels: { 
                        fetchActiveThreads: async () => ({ 
                            threads: new Map() 
                        }) 
                    } 
                }]
            ]) 
        };
    }
}

const client = new MockClient();

// --- TEST EXECUTION ---

async function runTest() {
    console.log('--- STARTING MAFIA AUTO-RECOVERY TEST ---');
    
    // Clear initial state
    MafiaManager.games.clear();
    MafiaManager.lobbies.clear();
    MafiaManager.pendingRestores.clear();
    
    // Disable Test Mode check in MafiaManager (it skips restoration if true)
    process.env.TEST_MODE = 'false';

    console.log('Testing loadState with active game...');
    await MafiaManager.loadState(client);

    console.log(`Lobbies size: ${MafiaManager.lobbies.size}`);
    console.log(`Games size: ${MafiaManager.games.size}`);
    console.log(`Pending Restores size: ${MafiaManager.pendingRestores.size}`);

    const game = MafiaManager.getGameByLobby('111222333');
    if (game && game.state === 'NIGHT') {
        console.log('✅ SUCCESS: Active game was auto-recovered!');
        if (game.activeTimer) {
            console.log('✅ SUCCESS: Game timer was resumed!');
        } else {
            console.log('❌ FAILURE: Game timer was NOT resumed.');
        }
    } else {
        console.log('❌ FAILURE: Active game was not found or has wrong state.');
    }

    console.log('--- TEST COMPLETE ---');
    process.exit(0);
}

runTest().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
