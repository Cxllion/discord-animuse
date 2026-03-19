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
    }

    createGame(lobbyMessageId, hostUser) {
        const Game = require('./ArchiveGame');
        const game = new Game(lobbyMessageId, hostUser);
        
        if (this.hostPreferences.has(hostUser.id)) {
            // Soft-clone settings to avoid reference linkage
            game.settings = { ...this.hostPreferences.get(hostUser.id), gameMode: game.settings.gameMode };
        }
        
        this.lobbies.set(lobbyMessageId, game);
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

    endGame(threadId) {
        const game = this.games.get(threadId);
        if (game) {
            this.games.delete(threadId);
            this.lobbies.delete(game.lobbyMessageId);
            this.saveState();
        }
    }

    async saveState() {
        const gamesArray = [];
        for (const [id, game] of this.games) {
            gamesArray.push(game.toJSON());
        }
        try {
            await fs.promises.writeFile(STATE_FILE, JSON.stringify({
                games: gamesArray,
                prefs: Array.from(this.hostPreferences.entries())
            }));
        } catch (e) {
            console.error('Archive State serialization failed:', e);
        }
    }

    async loadState(client) {
        if (!fs.existsSync(STATE_FILE)) return;
        try {
            const data = fs.readFileSync(STATE_FILE, 'utf8');
            const payload = JSON.parse(data);
            const gamesArray = Array.isArray(payload) ? payload : payload.games || [];
            
            if (payload.prefs) {
                this.hostPreferences = new Map(payload.prefs);
            }
            
            const Game = require('./ArchiveGame');
            for (const gData of gamesArray) {
                const game = new Game(gData.lobbyMessageId, { id: gData.hostId });
                game.fromJSON(gData);
                
                this.games.set(game.threadId, game);
                this.lobbies.set(game.lobbyMessageId, game);
                
                if (game.threadId) {
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
        } catch (e) {
            console.error('Failed to load archive state', e);
        }
    }
}

// Export a singleton instance
module.exports = new ArchiveManager();
