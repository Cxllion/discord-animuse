const { Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const STATE_FILE = path.join(__dirname, 'archive_state.json');

class ArchiveManager {
    constructor() {
        // Map of threadId -> Game instance
        this.games = new Collection();
        // Map of lobby messageId -> Game instance (before starting)
        this.lobbies = new Collection();
        this.hostPreferences = new Map();
        this.saveMutex = false;
        // Global Waitlist: channelId -> Set of userIds who want to join the NEXT game
        this.globalQueues = new Collection();
        this.cleanupInterval = setInterval(() => this.cleanupStagnantGames(), 3600000); // Every 1 hour
    }

    cleanupStagnantGames() {
        const now = Date.now();
        for (const [id, game] of this.games) {
            // If game is in a thread and hasn't been updated recently (if we had a lastUpdated)
            // For now, simple cleanup for lobbies older than 24 hours
            if (game.state === 'LOBBY' && game.createdAt && now - game.createdAt > 86400000) {
                this.endGame(id);
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
        const Game = require('./ArchiveGame');
        const game = new Game(lobbyMessageId, hostUser);
        
        if (this.hostPreferences.has(hostUser.id)) {
            // Soft-clone settings to avoid reference linkage
            game.settings = { ...this.hostPreferences.get(hostUser.id), gameMode: game.settings.gameMode };
        }
        
        // --- QUEUE AUTO-IMPORT ---
        if (channel && this.globalQueues.has(channel.id)) {
            const queue = this.globalQueues.get(channel.id);
            if (queue.size > 0) {
                const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                const queueUsers = Array.from(queue);
                
                for (const uid of queueUsers) {
                    // Fetch user object to add to game
                    try {
                        const user = await channel.client.users.fetch(uid);
                        if (user) {
                            const p = game.addPlayer(user);
                            if (p) {
                                p.requiresConfirmation = true;
                                p.isConfirmed = false;
                                
                                // Send individual confirmation ping
                                const row = new ActionRowBuilder().addComponents(
                                    new ButtonBuilder()
                                        .setCustomId(`archive_here_${lobbyMessageId}_${uid}`)
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
                // Clear queue after import
                this.globalQueues.delete(channel.id);
            }
        }
        // -------------------------

        this.lobbies.set(lobbyMessageId, game);
        game.createdAt = Date.now();
        this.setupGameListeners(game);
        this.saveState();
        return game;
    }
    
    getGameByLobby(messageId) {
        return this.lobbies.get(messageId);
    }

    getGameByThread(threadId) {
        return this.games.get(threadId);
    }

    startGame(messageId, threadId) {
        const game = this.lobbies.get(messageId);
        if (game) {
            game.threadId = threadId;
            this.games.set(threadId, game);
        }
        return game;
    }

    async endGame(threadId) {
        const game = this.games.get(threadId);
        if (game) {
            const channelId = game.thread?.parentId || game.thread?.id; // Parent channel or actual channel
            const lobbyMsgId = game.lobbyMessageId;
            
            this.games.delete(threadId);
            this.lobbies.delete(lobbyMsgId);
            
            // Check for next game queue
            if (channelId && this.globalQueues.has(channelId)) {
                const queue = this.globalQueues.get(channelId);
                if (queue.size > 0) {
                    // Logic to automatically trigger next lobby would go here if desired, 
                    // but usually we wait for user to /mafia host or we auto-redeploy?
                    // User said: "they'll be automatically added to the party and pinged"
                    // This implies the bot should wait for the host to start a NEW lobby or we just create it.
                }
            }
            
            this.saveState();
        }
    }

    async saveState() {
        if (this.saveMutex) return;
        this.saveMutex = true;
        
        try {
            // Get all unique game instances from both lobbies and active games
            const allGames = Array.from(new Set([...this.lobbies.values(), ...this.games.values()]));
            const gamesArray = allGames.map(game => game.toJSON());

            await fs.promises.writeFile(STATE_FILE, JSON.stringify({
                games: gamesArray,
                prefs: Array.from(this.hostPreferences.entries()),
                queues: Array.from(this.globalQueues.entries()).map(([k, v]) => [k, Array.from(v)])
            }));
        } catch (e) {
            console.error('Archive State serialization failed:', e);
        } finally {
            this.saveMutex = false;
        }
    }

    async loadState(client) {
        if (!fs.existsSync(STATE_FILE)) return;
        try {
            const data = fs.readFileSync(STATE_FILE, 'utf8');
            const payload = JSON.parse(data);
            const gamesArray = payload.games || [];
            
            if (payload.prefs) {
                this.hostPreferences = new Map(payload.prefs);
            }
            if (payload.queues) {
                this.globalQueues = new Collection(payload.queues.map(([k, v]) => [k, new Set(v)]));
            }
            
            const Game = require('./ArchiveGame');
            for (const gData of gamesArray) {
                const game = new Game(gData.lobbyMessageId, { id: gData.hostId });
                game.fromJSON(gData);
                
                // Restore both collections
                this.lobbies.set(game.lobbyMessageId, game);
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
                            // Thread deleted? Let's keep it in lobbies at least, but maybe game is dead.
                            // If channel is missing, the game can't really continue.
                            this.endGame(game.threadId);
                        }
                    } catch(e) {
                        this.endGame(game.threadId);
                    }
                }
            }
            console.log(`[Archive] Restored ${this.lobbies.size} total game states.`);
        } catch (e) {
            console.error('Failed to load archive state', e);
        }
    }
}

// Export a singleton instance
module.exports = new ArchiveManager();
