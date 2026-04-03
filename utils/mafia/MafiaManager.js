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
    }

    startPulse(client) {
        if (this.pulseInterval) clearInterval(this.pulseInterval);
        this.client = client;
        this.pulseInterval = setInterval(() => this.pulse(client), 60000); // Pulse every 1 minute
    }

    pulse(client) {
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
            this.endGame(id);
        }
    }

    setupGameListeners(game) {
        game.on('gameStarted', ({ lobbyId, threadId }) => {
            this.startGame(lobbyId, threadId);
            this.saveState();
        });

        game.on('gameEnded', (threadId) => {
            // Keep in memory for a bit to allow post-game chat, then cleanup
            setTimeout(() => {
                const g = this.games.get(threadId);
                if (g) {
                    g.destroy();
                    this.endGame(threadId);
                }
            }, 300000); // 5 minutes post-game cleanup
        });

        game.on('saveState', () => this.saveState());
        game.on('stateChanged', () => this.saveState());
    }

    async createGame(lobbyMessageId, hostUser, channel) {
        const Game = require('./MafiaGame');
        const game = new Game(lobbyMessageId, hostUser);
        if (channel) game.channelId = channel.id;
        
        if (this.hostPreferences.has(hostUser.id)) {
            game.settings = { ...game.settings, ...this.hostPreferences.get(hostUser.id) };
        }
        
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

    startGame(hostId, threadId) {
        const game = this.lobbies.get(hostId);
        if (game) {
            game.threadId = threadId;
            this.games.set(threadId, game);
        }
        return game;
    }

    async endGame(key) {
        const game = this.games.get(key) || this.lobbies.get(key);
        if (game) {
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
            const gamesArray = payload.games || [];
            
            this.startPulse(client);
            if (payload.prefs) {
                this.hostPreferences = new Map(payload.prefs);
            }
            if (payload.queues) {
                this.globalQueues = new Collection(payload.queues.map(([k, v]) => [k, new Set(v)]));
            }
            
            const Game = require('./MafiaGame');
            for (const gData of gamesArray) {
                const game = new Game(gData.lobbyMessageId, { id: gData.hostId });
                game.fromJSON(gData);
                
                // Restore both collections
                this.lobbies.set(game.hostId, game);
                if (game.threadId) {
                    this.games.set(game.threadId, game);
                }
                
                this.setupGameListeners(game);
                
                if (game.threadId && game.state !== 'LOBBY') {
                    try {
                        const channel = await client.channels.fetch(game.threadId);
                        if (channel) {
                            game.thread = channel;
                            game.resumePhase();
                        } else {
                            this.endGame(game.threadId);
                        }
                    } catch(e) {
                        this.endGame(game.threadId);
                    }
                }
            }
            console.log(`[Mafia] Restored ${this.lobbies.size} total game states.`);
        } catch (e) {
            console.error('Failed to load mafia state', e);
        }
    }
}

module.exports = new MafiaManager();
