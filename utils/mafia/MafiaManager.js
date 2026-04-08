const { Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const STATE_FILE = path.join(__dirname, 'mafia_state.json');

class MafiaManager {
    constructor() {
        // Map of threadId -> Game instance
        this.games = new Collection();
        // Map of hostId -> Game instance (lobbies)
        this.lobbies = new Collection();
        this.hostPreferences = new Map();
        this.saveMutex = false;
        // Global Waitlist: channelId -> Set of userIds who want to join the NEXT game
        this.globalQueues = new Collection();
        this.client = null; // Set during loadState
        this.pulseInterval = null; 
        // Map of hostId -> { game, expiresAt }
        this.pendingRestores = new Collection();
    }

    startPulse(client) {
        if (this.pulseInterval) clearInterval(this.pulseInterval);
        this.client = client;
        this.pulseInterval = setInterval(() => this.pulse(client), 60000); // Pulse every 1 minute
    }

    async pulse(client) {
        const now = Date.now();
        const toDisband = [];

        for (const [hostId, game] of this.lobbies) {
            if (game.state === 'LOBBY') {
                game.checkStagnation(client);

                if (game.stagnationNoticeSent && game.stagnationExpiresAt && now > game.stagnationExpiresAt) {
                    toDisband.push(hostId); 
                }
            }
        }

        for (const id of toDisband) {
            console.log(`[Mafia] Auto-disbanding stagnant lobby (Host: ${id})`);
            await this.endGame(id);
        }

        // --- PENDING RESTORES EXPIRY ---
        for (const [hostId, data] of this.pendingRestores) {
            if (now > data.expiresAt) {
                console.log(`[Mafia] Restore window expired for Host: ${hostId}. Archiving session.`);
                const g = data.game;
                // Archive the thread if it exists
                if (g.threadId) {
                    client.channels.fetch(g.threadId).then(thread => {
                        if (thread) {
                            thread.send('🗑️ **Sanctuary Lost.** This session was not restored in time and has been redacted from the records.').then(() => {
                                thread.setLocked(true);
                                thread.setArchived(true);
                            });
                        }
                    }).catch(() => null);
                }
                this.pendingRestores.delete(hostId);
            }
        }
    }

    setupGameListeners(game) {
        game.on('gameStarted', ({ lobbyId, threadId }) => {
            this.startGame(lobbyId, threadId);
            this.saveState();
        });

        game.on('gameEnded', (threadId) => {
            // Keep in memory for a bit to allow post-game chat, then cleanup
            setTimeout(async () => {
                const g = this.games.get(threadId);
                if (g) {
                    await this.endGame(threadId);
                }
            }, 300000); // 5 minutes post-game cleanup
        });

        game.on('saveState', () => this.saveState());
        game.on('stateChanged', () => this.saveState());
    }

    applyHostPreferences(game, userId) {
        if (this.hostPreferences.has(userId)) {
            game.settings = { ...game.settings, ...this.hostPreferences.get(userId) };
            return true;
        }
        return false;
    }

    async createGame(lobbyMessageId, hostUser, channel) {
        const Game = require('./MafiaGame');
        const game = new Game(lobbyMessageId, hostUser);
        if (channel) {
            game.channelId = channel.id;
            game.guildId = channel.guildId;
        }
        
        this.applyHostPreferences(game, hostUser.id);
        
        // --- QUEUE AUTO-IMPORT ---
        if (channel && this.globalQueues.has(channel.id)) {
            const queue = this.globalQueues.get(channel.id);
            if (queue.size > 0) {
                const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                const queueUsers = Array.from(queue);
                
                for (const uid of queueUsers) {
                    try {
                        const user = await channel.client.users.fetch(uid);
                        if (user) {
                            const p = game.addPlayer(user);
                            if (p) {
                                p.requiresConfirmation = true;
                                p.isConfirmed = false;
                                
                                const row = new ActionRowBuilder().addComponents(
                                    new ButtonBuilder()
                                        .setCustomId(`mafia_here_${hostUser.id}_${uid}`) 
                                        .setLabel("🙋 I'm here!")
                                        .setStyle(ButtonStyle.Success)
                                );
                                await channel.send({ 
                                    content: `🛎️ **Waitlist Arrival:** <@${uid}>, a new session of the **Final Library** is starting! Press the button below to confirm your presence at the sanctuary gates.`, 
                                    components: [row] 
                                });
                            }
                        }
                    } catch(e) {}
                }
                this.globalQueues.delete(channel.id);
            }
        }

        this.lobbies.set(hostUser.id, game); // Map by Host ID
        game.createdAt = Date.now();
        this.setupGameListeners(game);
        this.saveState();
        return game;
    }
    
    getGameByLobby(id) {
        return this.lobbies.get(id);
    }

    getGameByThread(threadId) {
        return this.games.get(threadId);
    }

    getLobbyByHost(hostId) {
        return this.lobbies.get(hostId);
    }

    getLobbyByGuild(guildId) {
        return Array.from(this.lobbies.values()).find(g => g.guildId === guildId && g.state === 'LOBBY');
    }

    getGameByGuild(guildId) {
        return Array.from(this.games.values()).find(g => g.guildId === guildId && g.state !== 'GAME_OVER');
    }

    startGame(hostId, threadId) {
        const game = this.lobbies.get(hostId);
        if (game) {
            game.threadId = threadId;
            this.games.set(threadId, game);
        }
        return game;
    }

    async restoreGame(hostId, client) {
        const data = this.pendingRestores.get(hostId);
        if (!data) return null;

        const game = data.game;
        this.pendingRestores.delete(hostId);

        this.lobbies.set(game.hostId, game);
        if (game.threadId) {
            this.games.set(game.threadId, game);
            try {
                const thread = await client.channels.fetch(game.threadId);
                if (thread) {
                    game.thread = thread;
                    await thread.send(`🔄 **Sanctuary Restored.** The archives have been re-synchronized. Resuming protocol...`);
                    game.resumePhase();
                }
            } catch(e) {}
        }
        
        this.saveState();
        return game;
    }

    async endGame(key) {
        const game = this.games.get(key) || this.lobbies.get(key);
        if (game) {
            await game.destroy().catch(() => null);
            
            const hostId = game.hostId;
            const threadId = game.threadId;
            
            // CLEAN DISCORD LOBBY IF IT EXISTS
            if (game.state === 'LOBBY' && game.lobbyMessageId) {
                try {
                    const channel = this.client?.channels.cache.get(game.channelId);
                    if (channel) {
                        const msg = await channel.messages.fetch(game.lobbyMessageId).catch(() => null);
                        if (msg) await msg.delete().catch(() => null);
                    }
                } catch(e) {}
            }

            this.games.delete(threadId);
            this.lobbies.delete(hostId);

            // ARCHIVE ALL RELEVANT THREADS
            const threadsToClose = [game.threadId, game.graveyardThreadId, game.archiveThreadId].filter(id => id);
            for (const tId of threadsToClose) {
                try {
                    const thread = await this.client?.channels.fetch(tId).catch(() => null);
                    if (thread) {
                        await thread.setLocked(true).catch(() => null);
                        await thread.setArchived(true).catch(() => null);
                    }
                } catch(e) {}
            }

            this.saveState();
        }
    }

    async saveState() {
        if (this.saveMutex) return;
        this.saveMutex = true;
        
        try {
            const allGames = Array.from(new Set([...this.lobbies.values(), ...this.games.values()]));
            const gamesArray = allGames.map(game => game.toJSON());

            await fs.promises.writeFile(STATE_FILE, JSON.stringify({
                games: gamesArray,
                prefs: Array.from(this.hostPreferences.entries()),
                queues: Array.from(this.globalQueues.entries()).map(([k, v]) => [k, Array.from(v)])
            }));
        } catch (e) {
            console.error('Mafia State serialization failed:', e);
        } finally {
            this.saveMutex = false;
        }
    }

    async loadState(client) {
        this.client = client;
        if (!fs.existsSync(STATE_FILE)) return;
        try {
            const data = fs.readFileSync(STATE_FILE, 'utf8');
            const payload = JSON.parse(data);
            let gamesArray = payload.games || [];
            
            // --- TEST MODE SAFEGUARD ---
            if (process.env.TEST_MODE === 'true') {
                console.log('[Mafia] Test Mode detected: Skipping archival restoration to ensure a clean slate.');
                gamesArray = [];
            }
            
            this.startPulse(client);
            if (payload.prefs) {
                // Migrate legacy 'First Edition' to 'Classic Archive'
                const migratedPrefs = payload.prefs.map(([k, v]) => {
                    if (v && v.gameMode === 'First Edition') v.gameMode = 'Classic Archive';
                    return [k, v];
                });
                this.hostPreferences = new Map(migratedPrefs);
            }
            if (payload.queues) {
                this.globalQueues = new Collection(payload.queues.map(([k, v]) => [k, new Set(v)]));
            }
            
            const Game = require('./MafiaGame');
            const restoreWindow = 10 * 60 * 1000; // 10 minutes

            for (const gData of gamesArray) {
                const game = new Game(gData.lobbyMessageId, { id: gData.hostId });
                game.fromJSON(gData);
                await game.syncState(client);
                
                this.setupGameListeners(game);
                
                // Add to PENDING instead of LIVE
                this.pendingRestores.set(game.hostId, {
                    game: game,
                    expiresAt: Date.now() + restoreWindow
                });
            }
            console.log(`[Mafia] Buffered ${this.pendingRestores.size} game states for restoration.`);

            // --- AGGRESSIVE ORPHAN SCAN ---
            // Scan all active threads in servers we have games in.
            // If any thread name starts with "📚 Final Library" but IS NOT in our buffers, archive it.
            const guildsToScan = new Set(gamesArray.map(g => g.guildId).filter(id => id));
            for (const guildId of guildsToScan) {
                try {
                    const guild = await client.guilds.fetch(guildId).catch(() => null);
                    if (!guild) continue;
                    
                    const { threads } = await guild.channels.fetchActiveThreads().catch(() => ({ threads: new Collection() }));
                    for (const thread of threads.values()) {
                        if (thread.name.includes('Final Library') || thread.name.includes('Viral Rot Secret Hub')) {
                            // Check if this threadId is in our pending list
                            const isPending = Array.from(this.pendingRestores.values()).some(d => d.game.threadId === thread.id || d.game.archiveThreadId === thread.id || d.game.graveyardThreadId === thread.id);
                            
                            if (!isPending) {
                                console.log(`[Mafia] Redacting orphan thread: ${thread.name} (${thread.id})`);
                                await thread.send('⚠️ **Record Redacted.** This sanctuary was lost during a system destabilization and is no longer valid.').catch(() => null);
                                await thread.setLocked(true).catch(() => null);
                                await thread.setArchived(true).catch(() => null);
                            }
                        }
                    }
                } catch(e) {}
            }
        } catch (e) {
            console.error('Failed to load mafia state', e);
        }
    }
}

module.exports = new MafiaManager();
