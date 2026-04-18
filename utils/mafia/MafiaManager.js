const fs = require('fs');
const path = require('path');
const { Collection, ChannelType } = require('discord.js');
const logger = require('../core/logger');
const mafiaService = require('../services/mafiaService');
// (Optional) Path to local fallback for prefs/queues if needed
const STATE_FILE = path.join(__dirname, 'mafia_state.json');

class MafiaManager {
    constructor() {
        // Map of threadId -> Game instance
        this.games = new Collection();
        // Map of hostId -> Game instance (lobbies)
        this.lobbies = new Collection();
        this.hostPreferences = new Map();
        // Promise-chain mutex: serializes all saveState() calls to prevent concurrent JSON write corruption
        this._saveMutex = Promise.resolve();
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
            logger.info(`[Mafia] Auto-disbanding stagnant lobby (Host: ${id})`, 'Mafia');
            await this.endGame(id);
        }

        // --- PENDING RESTORES EXPIRY ---
        for (const [hostId, data] of this.pendingRestores) {
            if (now > data.expiresAt) {
                logger.info(`[Mafia] Restore window expired for Host: ${hostId}. Archiving session.`, 'Mafia');
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
            // Remove thread mapping but keep the lobby mapping for reset potential
            this.games.delete(threadId);
            this.saveState();
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

    async saveHostPreferences(userId, settings) {
        this.hostPreferences.set(userId, { ...settings });
        logger.info(`[Mafia] Identity Synced: Updated default settings for Host ${userId}`, 'Mafia');
        await this.saveState();
    }

    async createGame(lobbyMessageId, hostUser, channel, initialUsers = []) {
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

        // --- INITIAL PLAYERS (Play Again / Manual Import) ---
        if (initialUsers && initialUsers.length > 0) {
            for (const user of initialUsers) {
                game.addPlayer(user);
            }
        }
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

    getGameByHost(hostId) {
        return Array.from(this.games.values()).find(g => g.hostId === hostId && g.state !== 'GAME_OVER');
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

    async playAgain(oldGame, client) {
        const hostId = oldGame.hostId;
        const channelId = oldGame.channelId;
        
        // 1. Gather players who were in the simulation
        // (We fetch full User objects from client cache or fetch them)
        const playersToImport = [];
        for (const p of oldGame.players.values()) {
            if (!p.isBot) {
                try {
                    const user = await client.users.fetch(p.id).catch(() => null);
                    if (user) playersToImport.push(user);
                } catch(e) {}
            }
        }

        // 2. Clear old session mappings
        await this.endGame(hostId);

        // 3. Create new session in the same channel
        try {
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (channel) {
                const hostUser = await client.users.fetch(hostId).catch(() => null);
                if (hostUser) {
                    const msg = await channel.send('♻️ **Sanctuary Re-initialized.** Restoring survivor biometrics...');
                    
                    const newGame = await this.createGame(msg.id, hostUser, channel, playersToImport);
                    const { buildLobbyPayload } = require('./MafiaUI');
                    await msg.edit(buildLobbyPayload(newGame));
                    return newGame;
                }
            }
        } catch (e) {
            logger.error('[Mafia PlayAgain] Failed to restart session:', e, 'Mafia');
        }
        return null;
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

            // 1. DELETE FROM DATABASE
            if (game.guildId) {
                await mafiaService.deleteSession(game.guildId).catch(() => null);
            }

            // ARCHIVE ALL RELEVANT THREADS
            // (Strict Archiving to keep sidebar clean)
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

    async shutdown() {
        logger.info('[Mafia] Initiating graceful sanctuary shutdown... ♡', 'Mafia');
        
        const allActive = Array.from(new Set([...this.lobbies.values(), ...this.games.values()]));
        for (const game of allActive) {
            // 1. VOID THE HARDWARE: Delete temporary VCs and cleanup memory
            await game.destroy().catch(() => null);

            // 2. REDACT THE RECORDS: Archive all threads
            const threadsToClose = [game.threadId, game.graveyardThreadId, game.archiveThreadId].filter(id => id);
            
            for (const tId of threadsToClose) {
                try {
                    const thread = await this.client?.channels.fetch(tId).catch(() => null);
                    if (thread) {
                        const isMain = tId === game.threadId;
                        if (isMain) {
                            await thread.send('⚠️ **System Destabilization Detected.** The sanctuary is being forcefully archived for structural integrity.').catch(() => null);
                        } else {
                            await thread.send('⚠️ **Record Fragment Redaction.** This auxiliary archive is being secured.').catch(() => null);
                        }
                        
                        await thread.setLocked(true).catch(() => null);
                        await thread.setArchived(true).catch(() => null);
                    }
                } catch(e) {}
            }
        }
        
        this.lobbies.clear();
        this.games.clear();
        logger.info('[Mafia] All active sanctuary records (including Graveyards and Hubs) have been secured and archived.', 'Mafia');
    }

    async saveState() {
        // Debounce the save to prevent write storms during rapid interactions
        if (this._saveTimeout) clearTimeout(this._saveTimeout);
        
        return new Promise((resolve) => {
            this._saveTimeout = setTimeout(() => {
                // Serialize all saveState calls through a Promise chain to prevent concurrent JSON write corruption
                this._saveMutex = this._saveMutex.then(() => this._doSave()).then(resolve).catch(resolve);
            }, 2000); // 2s debounce
        });
    }

    async _doSave() {
        try {
            const allGames = Array.from(new Set([...this.lobbies.values(), ...this.games.values()]));
            
            // 1. SAVE TO DATABASE (Parallel)
            const dbPromises = allGames.map(game => {
                if (!game.guildId) return Promise.resolve();
                return mafiaService.saveSession(
                    game.guildId, 
                    game.channelId, 
                    game.hostId, 
                    game.toJSON()
                );
            });
            await Promise.all(dbPromises);

            // 2. SAVE LOCAL BACKUP (For prefs and local discovery)
            const gamesArray = allGames.map(game => game.toJSON());
            await fs.promises.writeFile(STATE_FILE, JSON.stringify({
                games: gamesArray,
                prefs: Array.from(this.hostPreferences.entries()),
                queues: Array.from(this.globalQueues.entries()).map(([k, v]) => [k, Array.from(v)])
            }));
        } catch (e) {
            logger.error('Mafia State serialization failed:', e, 'Mafia');
        }
    }

    async loadState(client) {
        this.client = client;
        
        try {
            // 1. LOAD FROM DATABASE (Master source)
            const dbSessions = await mafiaService.getAllSessions();
            let gamesArray = dbSessions.map(s => s.state);

            // 2. LOAD LOCAL (For prefs and queues)
            if (fs.existsSync(STATE_FILE)) {
                try {
                    const localData = fs.readFileSync(STATE_FILE, 'utf8');
                    const payload = JSON.parse(localData);
                    
                    if (payload.prefs) {
                        this.hostPreferences = new Map(payload.prefs);
                    }
                    if (payload.queues) {
                        this.globalQueues = new Collection(payload.queues.map(([k, v]) => [k, new Set(v)]));
                    }

                    // Fallback to local games if DB is empty (Migration phase)
                    if (gamesArray.length === 0 && payload.games && payload.games.length > 0) {
                        logger.info('[Mafia] DB session store is empty. Migrating local states to Supabase... ♡', 'Mafia');
                        gamesArray = payload.games;
                    }
                } catch (e) {
                    logger.warn('Failed to parse local mafia_state.json fallback', e, 'Mafia');
                }
            }
            
            // --- TEST MODE SAFEGUARD ---
            if (process.env.TEST_MODE === 'true') {
                logger.info('[Mafia] Test Mode detected: Wiping local and remote archives for a clean slate.', 'Mafia');
                
                // 1. Wipe local state file
                if (fs.existsSync(STATE_FILE)) {
                    try {
                        fs.unlinkSync(STATE_FILE);
                        logger.info('[Mafia] Local state file erased.', 'Mafia');
                    } catch (e) {
                        logger.warn(`Failed to erase local state: ${e.message}`, 'Mafia');
                    }
                }

                // 2. Wipe DB sessions for CURRENT guilds (to avoid polluting prod)
                try {
                    const guilds = Array.from(client.guilds.cache.keys());
                    for (const gid of guilds) {
                        await mafiaService.deleteSession(gid).catch(() => null);
                    }
                    logger.info(`[Mafia] Wiped ${guilds.length} guild sessions from DB.`, 'Mafia');
                    
                    // 3. DEEP SCAVENGE: Purge any orphan threads in these guilds
                    await this.scavengeOrphanThreads(client);
                } catch (e) {
                    logger.warn(`Failed to wipe DB sessions: ${e.message}`, 'Mafia');
                }

                gamesArray = [];
            }
            
            this.startPulse(client);
            
            const Game = require('./MafiaGame');
            const restoreWindow = 10 * 60 * 1000; // 10 minutes

            for (const gData of gamesArray) {
                const game = new Game(gData.lobbyMessageId, { id: gData.hostId });
                game.fromJSON(gData);
                await game.syncState(client);
                
                this.setupGameListeners(game);
                
                // Only buffer restores for guilds belonging to THIS shard
                // If not sharded, client.shard is null, so we restore everything.
                if (!client.shard || client.shard.ids.includes(Math.floor(Number(game.guildId) / (2**22) % client.shard.count))) {
                    // Check if game was in an ACTIVE phase (not Lobby or Over)
                    const isActive = !['LOBBY', 'GAME_OVER'].includes(game.state);

                    if (isActive) {
                        logger.info(`[Mafia] Auto-recovering active session: ${game.state} (Host: ${game.hostId})`, 'Mafia');
                        this.lobbies.set(game.hostId, game);
                        if (game.threadId) this.games.set(game.threadId, game);
                        
                        // Hydrate and resume 
                        game.resumePhase();
                    } else {
                        // Buffer for manual restore
                        this.pendingRestores.set(game.hostId, {
                            game: game,
                            expiresAt: Date.now() + restoreWindow
                        });
                    }
                }
            }
            if (this.pendingRestores.size > 0) {
                logger.info(`[Mafia] Buffered ${this.pendingRestores.size} game states for restoration on Shard.`, 'Mafia');
            }

            // Move Scavenge logic to a dedicated helper if needed, but it's used in loadState too
            const ShardingAdapter = require('../core/shardingAdapter');
            if (ShardingAdapter.isMasterShard(client)) {
                await this.scavengeOrphanThreads(client, new Set(dbSessions.map(s => s.guild_id)));
            }
        } catch (e) {
            logger.error('Failed to load mafia state', e, 'Mafia');
        }
    }

    async scavengeOrphanThreads(client, validGuildIds = null) {
        const guildsToScan = Array.from(client.guilds.cache.keys());
        for (const guildId of guildsToScan) {
            try {
                const guild = client.guilds.cache.get(guildId);
                if (!guild) continue;
                
                // --- THREAD SCAVENGING ---
                const { threads } = await guild.channels.fetchActiveThreads().catch(() => ({ threads: new Collection() }));
                for (const thread of threads.values()) {
                    const isMafiaThread = thread.name.includes('Final Library') || 
                                         thread.name.includes('Viral Rot Secret Hub') ||
                                         thread.name.includes('Archive Graveyard');

                    if (isMafiaThread) {
                        const isPending = Array.from(this.pendingRestores.values()).some(d => 
                            d.game.threadId === thread.id || 
                            d.game.archiveThreadId === thread.id || 
                            d.game.graveyardThreadId === thread.id
                        );
                        
                        if (!isPending && (process.env.TEST_MODE === 'true' || (validGuildIds && !validGuildIds.has(guildId)))) {
                            logger.info(`[Mafia] [Bulletproof] Redacting orphan thread: ${thread.name} (${thread.id})`, 'Mafia');
                            await thread.send('⚠️ **Record Redacted.** This sanctuary was lost during a previous system cycle and has been archived.').catch(() => null);
                            await thread.setLocked(true).catch(() => null);
                            await thread.setArchived(true).catch(() => null);
                        }
                    }
                }

                // --- VOICE CHANNEL SCAVENGING ---
                const channels = await guild.channels.fetch().catch(() => new Collection());
                const hubs = channels.filter(c => c.type === ChannelType.GuildVoice && c.name.includes('Library Hub'));
                
                for (const hub of hubs.values()) {
                    const isPending = Array.from(this.pendingRestores.values()).some(d => d.game.voiceChannelId === hub.id);
                    const isActive = Array.from(this.lobbies.values()).concat(Array.from(this.games.values())).some(g => g.voiceChannelId === hub.id);

                    if (!isPending && !isActive && (process.env.TEST_MODE === 'true' || (validGuildIds && !validGuildIds.has(guildId)))) {
                        logger.info(`[Mafia] [Bulletproof] Redacting lingering voice hub: ${hub.name} (${hub.id})`, 'Mafia');
                        await hub.delete('Orphaned Sanctuary Hub').catch(() => null);
                    }
                }
            } catch(e) {
                logger.error(`[Mafia] Scavenging failed for guild ${guildId}:`, e, 'Mafia');
            }
        }
    }
}

module.exports = new MafiaManager();
