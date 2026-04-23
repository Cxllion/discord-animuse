const logger = require('../core/logger');
const Player = require('./MafiaPlayer');
const { resolveNightStack } = require('./MafiaStack');
const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const EventEmitter = require('events');
const mafiaService = require('../services/mafiaService');

// Decomposed Architecture Modules
const MafiaVoice = require('./MafiaVoice');
const MafiaPhases = require('./MafiaPhases');
const MafiaThreads = require('./MafiaThreads');
const MafiaSerialization = require('./MafiaSerialization');
const MafiaManager = require('./MafiaManager');
const MafiaUI = require('./MafiaUI');
const MafiaModes = require('./MafiaModes');
const { generateRoleCard } = require('../generators/mafia/roleGenerator');

const EXILE_LORE = [
    "The library council detects a trace of the Virus in **{name}**. They are cast out into the toxic world below.",
    "Judgement is passed. **{name}** is unceremoniously shoved into the Air-Lock and erased from the manifests.",
    "Driven by survival, the Archivists bind **{name}** and exile them to the desolate surface.",
    "A collective decision redacts **{name}** from the Final Library's roster. The gates shut tight behind them.",
    "The gavel falls. **{name}** screams as they are pushed past the perimeter into the infected winds.",
    "Archives purge complete. **{name}**'s biometrics have been disconnected from the sanctuary lifelines.",
    "The council remains silent as **{name}** is escorted to the waste-disposal elevators.",
    "Protocol dictates removal. **{name}** is scrubbed from the active server list and sent to the surface.",
    "The final door hisses shut. **{name}** is no longer a part of humanity's last hope.",
    "A trace of blackened ink was found in **{name}**'s logs. They are exiled to prevent further spread."
];

const DEATH_LORE = [
    "In the dead of night, the Viral Rot caught up to **{name}**. Their flesh was found turning to grey static in the Archives.",
    "A pool of blackened bile marks the spot where **{name}** was violently taken by the infection.",
    "The ventilation hums a somber tune. **{name}** was found internally liquified, their essence stolen.",
    "Shadows consumed **{name}** while the library slept. Only a hollowed-out book remains.",
    "No one heard the struggle. **{name}** has been permanently silenced by an infected hand.",
    "The server room was cold. **{name}** was found slumped over a terminal, their mind rewritten by the Rot.",
    "Trace biological matter is all that remains of **{name}** in the lower archives.",
    "The internal scanners flatlined at 03:00. **{name}** has been redacted by a shadow.",
    "A digital scream echoed in the comms. **{name}** has been erased from the living manifest.",
    "The library breathes a little heavier today. Another seat in the canteen is empty. **{name}** is gone."
];

const NIGHT_WHISPERS = [
    "The oxygen levels are dropping in the lower wings tonight...",
    "They say the virus started in the archives themselves.",
    "Something is scratching at the air filters of the Safe Zone.",
    "The Final Library breathes... but its breath smells of ozone and decay.",
    "Eyes are watching from the gaps in the radiation shielding.",
    "The power grid is flickering near the Restricted Section.",
    "Somewhere below, an automated drone is searching for someone who no longer exists.",
    "The silence is too loud tonight. The archives are never truly empty.",
    "A ghost of a transmission is playing on a loop in the comms room.",
    "The grey static is visible through the reinforced windows. It's getting closer."
];

const DAY_EPITHETS = [
    "The Dawn of the Last Sanctuary",
    "The Morning of the Ruined World",
    "The Reckoning of the Final Library",
    "The Day of Faded Mankind",
    "The Sun Rises on a Sanctuary of Lies",
    "The Morning After the Infection Spread",
    "The First Light of a Fading Humanity",
    "The Daylight Reveals the Redacted",
    "The Archives Speak of Another Loss",
    "The Sun Peeks Through the Ash Clouds"
];

class MafiaGame extends EventEmitter {
    constructor(lobbyMessageId, hostUser) {
        super();
        this.lobbyMessageId = lobbyMessageId;
        this.hostId = hostUser.id;
        this.guildId = null; // Set on creation
        this.channelId = null; // Set on creation or first bump
        this.bumpTimer = null;
        this.threadId = null; 
        this.thread = null; // Direct reference to the Discord ThreadChannel

        // Settings defaults
        this.settings = {
            discussionTime: 120, // seconds
            votingTime: 60, // seconds
            nightTime: 60, // seconds
            prologueTime: 15, // seconds
            gameMode: 'Classic Archive',
            revealRoles: true, // Show roles on death/exile
            voiceSupport: 'new' // 'new', 'existing', 'disabled'
        };

        // Players collection: userId -> Player
        this.players = new Map();

        // Auto-add the host
        this.addPlayer(hostUser);
        
        // Game State
        this.state = 'LOBBY'; // LOBBY, PROLOGUE, NIGHT, DAY, VOTING, TWILIGHT, GAME_OVER
        this.dayCount = 0;
        this.activeTimer = null;
        this.hubMessageId = null;
        this.visitHistory = []; // { night, sourceId, targetId }
        this.botTimers = []; // Track bot setTimeouts for cleanup
        this.isProcessingLobby = false; // Mutex for concurrency control
        this.refreshTimer = null; // Debounce timer for bumping
        this.graveyardThreadId = null;
        this.voiceChannelId = null;
        this.isDestroyed = false;
        this.lastActivityAt = Date.now();
        this.stagnationNoticeSent = false;
        this.phaseEndTime = null; // Absolute timestamp for persistence
        this.isSecure = true; // Sanctuary Security Status
        this.voiceScanner = null; // Interval for active health scans
        this.visitHistory = []; // Track visits for forensic roles
        this.guiltDeaths = []; // Ledger for self-redaction (guilt)
    }

    /**
     * Checks if the current phase is in the final "lock-down" period (2 seconds).
     * Used to prevent race conditions during phase transitions.
     */
    isLocked() {
        if (!this.phaseEndTime || this.state === 'LOBBY' || this.state === 'GAME_OVER') return false;
        // Lock 2s before timeout or 2s after state change
        const now = Date.now();
        const isNearEnd = (this.phaseEndTime - now) < 2000;
        const isJustStarted = (now - this.lastActivityAt) < 2000;
        return isNearEnd || isJustStarted;
    }

    async resumePhase() {
        if (this.isDestroyed || this.state === 'LOBBY' || this.state === 'GAME_OVER') return;
        
        const { startDay, startVoting, startNight } = MafiaPhases;
        
        // Calculate remaining time from stored timestamp or use default
        let remainingSeconds = 60;
        if (this.phaseEndTime) {
            remainingSeconds = Math.max(5, Math.ceil((this.phaseEndTime - Date.now()) / 1000));
        }

        switch (this.state) {
            case 'DAY':
                this.activeTimer = setTimeout(() => {
                    if (this.state !== 'GAME_OVER') startVoting(this);
                }, remainingSeconds * 1000);
                break;
            case 'VOTING':
                const voting = MafiaPhases.endDay;
                this.activeTimer = setTimeout(() => {
                    if (this.state !== 'GAME_OVER') voting(this);
                }, remainingSeconds * 1000);
                break;
            case 'NIGHT':
                const night = MafiaPhases.endNight;
                this.activeTimer = setTimeout(() => {
                    if (this.state !== 'GAME_OVER') night(this);
                }, remainingSeconds * 1000);
                break;
        }

        this.startVoiceScan();
        logger.info(`[Mafia] Session Resumed: ${this.hostId} in ${this.state} (${remainingSeconds}s remaining).`, 'Mafia');
    }

    async destroy() {
        this.isDestroyed = true;
        this.clearAllTimers();

        // --- VOICE PROTOCOL: REDACT HUB ---
        try {
            // STOP THE SCANNER FIRST
            this.stopVoiceScan();

            const client = MafiaManager.client;
            
            // Fallback: If thread is missing, fetch target guild directly via ID
            const guild = this.thread?.guild || (client && this.guildId ? await client.guilds.fetch(this.guildId).catch(() => null) : null);
            
            if (guild) {
                // 1. UNMUTE & UNDEAFEN EVERYONE IMMEDIATELY
                for (const [id, player] of this.players) {
                    if (!player.isBot) {
                        try {
                            const member = await guild.members.fetch(id).catch(() => null);
                            if (member && member.voice.channelId) {
                                await member.voice.setMute(false, 'Sanctuary Restoration').catch(() => null);
                                await member.voice.setDeaf(false, 'Sanctuary Restoration').catch(() => null);
                            }
                        } catch (e) {}
                    }
                }

                // 2. MOVE BACK TO ORIGINAL VCs
                if (this.settings.voiceSupport === 'new') {
                    for (const [id, player] of this.players) {
                        if (!player.isBot && player.initialVoiceChannelId) {
                            try {
                                const member = await guild.members.fetch(id).catch(() => null);
                                if (member && member.voice.channelId) {
                                    await member.voice.setChannel(player.initialVoiceChannelId, 'Protocol Concluded').catch(() => null);
                                }
                            } catch (e) {}
                        }
                    }
                    
                    // Small delay to allow movement to finalize
                    await new Promise(r => setTimeout(r, 1200));

                    // 3. DELETE TEMPORARY VC
                    if (this.voiceChannelId) {
                        const vc = await guild.channels.fetch(this.voiceChannelId).catch(() => null);
                        if (vc) {
                            logger.info(`[Mafia] [Redaction] Deleting voice channel: ${vc.name} (${vc.id})`, 'Mafia');
                            await vc.delete('Game over / Sanctuary Redacted').catch(() => null);
                        }
                    }
                }
            }
        } catch (e) {
            logger.error('[Mafia] Cleanup failed:', e, 'Mafia');
        }

        this.thread = null;
        this.players.clear();
        this.removeAllListeners();
    }

    clearAllTimers() {
        if (this.activeTimer) {
            clearTimeout(this.activeTimer);
            this.activeTimer = null;
        }
        for (const timer of this.botTimers) {
            clearTimeout(timer);
        }
        this.botTimers = [];
        logger.debug(`[Mafia] [Clock] Global purge complete for sanctuary ${this.hostId}.`);
    }

    addPlayer(user, isBot = false) {
        if (!this.players.has(user.id)) {
            const player = new Player(user, isBot);
            this.players.set(user.id, player);
            this.lastActivityAt = Date.now();
            this.stagnationNoticeSent = false;
            this.emit('saveState');
            return player;
        }
        return null; // Already joined
    }

    removePlayer(userId) {
        if (this.players.has(userId)) {
            const wasHost = this.hostId === userId;
            this.players.delete(userId);
            this.lastActivityAt = Date.now();
            this.stagnationNoticeSent = false;
            
            if (wasHost && this.state === 'LOBBY') {
                const nextHost = Array.from(this.players.values()).find(p => !p.isBot);
                if (nextHost) {
                    this.hostId = nextHost.id;
                    this.emit('hostChanged', this.hostId);
                    logger.info(`[Mafia] Host migrated to ${nextHost.name} (${this.hostId})`, 'Mafia');
                }
            }

            this.emit('saveState');
            return true;
        }
        return false;
    }

    /**
     * The single source of truth for lobby UI updates.
     * Decides whether to Edit (if at bottom) or Resend (if buried).
     */
    async refreshLobby(channel, forceResend = false) {
        if (!channel || this.isProcessingLobby) return;
        this.isProcessingLobby = true;

        try {
            const { buildLobbyPayload, buildSpectatePayload, buildEndedLobbyPayload } = MafiaUI;

            // 1. Resolve correct payload based on state
            let payload;
            if (this.state === 'LOBBY') payload = buildLobbyPayload(this);
            else if (this.state === 'GAME_OVER') payload = buildEndedLobbyPayload(this, this.winner);
            else payload = buildSpectatePayload(this);

            const oldId = this.lobbyMessageId;
            let needsResend = forceResend || this.state === 'LOBBY';

            // 2. Optimization: If we are in LOBBY, check if we are already at the bottom
            if (this.state === 'LOBBY' && !forceResend && oldId) {
                try {
                    const messages = await channel.messages.fetch({ limit: 1 }).catch(() => null);
                    if (messages && messages.first()?.id === oldId) {
                        needsResend = false;
                    }
                } catch (e) {}
            }

            // 3. Locking Rule: Once the game starts, NEVER resend/move the lobbyhub.
            // It stays fixed as the landing point for the thread.
            if (this.state !== 'LOBBY') {
                needsResend = false;
            }

            // 4. Execute UI Action
            if (needsResend) {
                // DELETE old
                if (oldId) {
                    try {
                        const oldMsg = await channel.messages.fetch(oldId).catch(() => null);
                        if (oldMsg) await oldMsg.delete().catch(() => null);
                    } catch (e) {}
                }
                // SEND new
                const newMsg = await channel.send(payload);
                this.lobbyMessageId = newMsg.id;
            } else {
                // EDIT existing
                if (oldId) {
                    try {
                        const oldMsg = await channel.messages.fetch(oldId).catch(() => null);
                        if (oldMsg) {
                            await oldMsg.edit(payload);
                        } else {
                            // Recover if message was manually deleted
                            const newMsg = await channel.send(payload);
                            this.lobbyMessageId = newMsg.id;
                        }
                    } catch (e) {
                        // Fallback if edit fails
                        const newMsg = await channel.send(payload);
                        this.lobbyMessageId = newMsg.id;
                    }
                } else {
                    const newMsg = await channel.send(payload);
                    this.lobbyMessageId = newMsg.id;
                }
            }

            MafiaManager.saveState();
        } catch (err) {
            logger.error('[Mafia Hub] Refresh failed:', err, 'Mafia');
        } finally {
            this.isProcessingLobby = false;
        }
    }

    /**
     * Debounced resend logic for channel activity.
     */
    scheduleRefresh(channel) {
        if (this.state !== 'LOBBY' || this.isDestroyed) return;
        
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => {
            this.refreshLobby(channel);
        }, 5000); 
    }

    async bumpLobby(channel) {
        // Deprecated, redirecting to refresh
        return await this.refreshLobby(channel, true);
    }

    scheduleBump(channel) {
        // Deprecated, redirecting to scheduleRefresh
        return this.scheduleRefresh(channel);
    }

    async addSpectator(user) {
        if (this.players.has(user.id)) return { success: false, message: 'Players cannot spectate.' };
        
        try {
            // 1. Thread Access (Muted)
            if (this.thread) {
                await this.thread.members.add(user.id).catch(() => null);
                await this.thread.permissionOverwrites.create(user.id, {
                    [PermissionFlagsBits.SendMessages]: false
                }).catch(() => null);
            }

            // 2. VC Access (Muted)
            if (this.voiceChannelId) {
                const client = MafiaManager.client;
                const vc = await client.channels.fetch(this.voiceChannelId).catch(() => null);
                if (vc) {
                    await vc.permissionOverwrites.create(user.id, {
                        [PermissionFlagsBits.Connect]: true,
                        [PermissionFlagsBits.Speak]: false
                    }).catch(() => null);
                }
            }
            
            return { success: true };
        } catch (e) {
            logger.error('[Mafia Spectate] Failed to add spectator:', e, 'Mafia');
            return { success: false, message: 'Failed to establish archival uplink.' };
        }
    }

    async checkStagnation(client) {
        if (this.state !== 'LOBBY' || this.isDestroyed || this.stagnationNoticeSent) return;
        
        const now = Date.now();
        const idleTime = now - this.lastActivityAt;
        
        // 10 minutes of inactivity
        if (idleTime > 600000) {
            this.stagnationNoticeSent = true;
            this.stagnationExpiresAt = Date.now() + 120000; // 2 minutes to respond
            try {
                const host = await client.users.fetch(this.hostId);
                if (host) {
                    await host.send(MafiaUI.buildStagnationPayload(this));
                    logger.info(`[Mafia] Stagnation notice sent to host ${this.hostId}. Expiry at ${new Date(this.stagnationExpiresAt).toLocaleTimeString()}`, 'Mafia');
                }
            } catch (e) {
                logger.error(`[Mafia] Failed to send stagnation notice to ${this.hostId}:`, e, 'Mafia');
            }
        }
    }

    getAlivePlayers() {
        return Array.from(this.players.values()).filter(p => p.alive);
    }

    /**
     * Centralized logic to determine if a player has night action options
     * and what those options are, enforcing hierarchies (like Revision Kill).
     */
    getNightActionOptions(player) {
        if (!player || !player.alive || !player.role || player.role.priority === 99) return [];

        const alivePlayers = this.getAlivePlayers();
        const roleName = player.role.name;

        // --- SPECIFIC ROLE LOGIC ---
        if (roleName === 'The Scribe') {
            return Array.from(this.players.values())
                .filter(ap => !ap.alive && !this.guiltDeaths.includes(ap))
                .map(ap => ({ label: ap.name, value: ap.id }));
        }

        if (roleName === 'The Bookburner') {
            const options = alivePlayers.filter(ap => ap.id !== player.id).map(ap => ({ label: ap.name, value: ap.id }));
            options.unshift({ label: '🔥 Ignite All Doused', description: 'Erase everyone currently doused', value: 'ignite' });
            return options;
        }

        if (roleName === 'The Conservator') {
            // Can't heal the same person twice in a row
            return alivePlayers.filter(ap => ap.id !== player.role.lastTargetId).map(ap => ({ label: ap.name, value: ap.id }));
        }

        if (roleName === 'The Shredder' || roleName === 'The Plagiarist') {
            // --- REVISION KILL HIERARCHY ---
            const aliveRevisions = alivePlayers.filter(ap => ap.role?.faction === 'Revisions');
            
            // PRIORITY 1: The Plagiarist
            const firstPlagiarist = aliveRevisions.find(ap => ap.role.name === 'The Plagiarist');
            const hasPlagiarist = !!firstPlagiarist;

            let isKiller = false;

            if (roleName === 'The Plagiarist') {
                // Only the first Plagiarist in the list is the designated killer
                if (player.id === firstPlagiarist?.id) isKiller = true;
            } else if (roleName === 'The Shredder' && !hasPlagiarist) {
                // Secondary fallback: First Shredder in list takes the mantle only if no Plagiarist is alive
                const firstShredder = aliveRevisions.find(ap => ap.role.name === 'The Shredder');
                if (player.id === firstShredder?.id) isKiller = true;
            }

            if (!isKiller) return [];
            return alivePlayers.filter(ap => ap.id !== player.id).map(ap => ({ label: ap.name, value: ap.id }));
        }

        if (roleName === 'The Corruptor') {
            return alivePlayers.filter(ap => ap.id !== player.id && ap.role?.faction !== 'Revisions').map(ap => ({ label: ap.name, value: ap.id }));
        }

        // --- DEFAULT DROPDOWN (Indexer, Censor, Ghostwriter, etc.) ---
        return alivePlayers.filter(ap => ap.id !== player.id).map(ap => ({ label: ap.name, value: ap.id }));
    }

    /**
     * Strictly manages voice states (mute/deaf) for all players based on phase and health.
     * ensures dead players stay silent and alive players follow phase protocols.
     */
    async updateVoiceStates(specialMode = null, focusId = null) {
        if (!this.voiceChannelId || !this.thread) return;

        try {
            const client = MafiaManager.client;
            if (!client) return;

            // --- CACHE-FIRST LOGIC ---
            // We use client.channels.cache.get to avoid API network latency.
            const voiceChannel = client.channels.cache.get(this.voiceChannelId);
            if (!voiceChannel) return;

            const updateTasks = [];
            let taskCounter = 0;

            // --- PASSIVE SCANNING ---
            // We only iterate over members ACTUALLY in the VC. This is massive for performance.
            for (const [id, member] of voiceChannel.members) {
                const p = this.players.get(id);
                if (!p || p.isBot) continue;

                let targetMute = false;
                let reason = 'Protocol Update';

                const currentState = specialMode || this.state;

                if (currentState === 'GAME_OVER') {
                    targetMute = false;
                    reason = 'Restoration Pulse';
                } else if (!p.alive) {
                    targetMute = true;
                    reason = 'Redacted Observation';
                } else if (currentState === 'TWILIGHT') {
                    targetMute = id !== (focusId || this.activeFocusId);
                    reason = 'Twilight Focus';
                } else if (currentState === 'NIGHT') {
                    targetMute = true;
                    reason = 'Night Silence';
                } else {
                    targetMute = false;
                    reason = 'Day Protocols';
                }

                const needsMuteUpdate = member.voice.mute !== targetMute;
                const needsDeafCleanup = member.voice.deaf === true;

                if (needsMuteUpdate || needsDeafCleanup) {
                    const currentTaskIdx = taskCounter++;
                    updateTasks.push((async () => {
                        await new Promise(r => setTimeout(r, currentTaskIdx * 100)); // Increased stagger for large groups
                        try {
                            if (needsMuteUpdate) await member.voice.setMute(targetMute, reason).catch(() => null);
                            if (needsDeafCleanup) await member.voice.setDeaf(false, 'Mute-Only Protocol').catch(() => null);
                        } catch (e) {}
                    })());
                }
            }

            if (updateTasks.length > 0) {
                await Promise.all(updateTasks);
            }
        } catch (e) {
            logger.debug('[Mafia] Voice scan pulse skipping (API congestion or member leave).', 'Mafia');
        }
    }

    startVoiceScan() {
        this.stopVoiceScan();
        logger.info(`[Mafia] [Voice] Initiating Active Health Scanner for Sanctuary ${this.hostId}`, 'Mafia');
        this.voiceScanner = setInterval(() => {
            if (!this.isDestroyed && this.voiceChannelId) {
                this.updateVoiceStates().catch(() => null);
            }
        }, 300000); // 5m pulse for performance (Safety Backup)
    }

    stopVoiceScan() {
        if (this.voiceScanner) {
            clearInterval(this.voiceScanner);
            this.voiceScanner = null;
        }
    }

    async checkNightSkip() {
        if (this.state !== 'NIGHT' || this.isDestroyed) return;
        
        const alivePlayers = this.getAlivePlayers();
        const pendingRoles = alivePlayers.filter(p => !p.isBot && p.role && p.role.priority !== 99 && !p.nightActionTarget);
        
        if (pendingRoles.length === 0) {
            if (this.activeTimer) clearTimeout(this.activeTimer);
            this.endNight();
        }
    }

    async refreshControlPanel(player, payload, components, forceRefresh = false) {
        if (player.isBot || !player.user) return;

        const content = typeof payload === 'string' ? payload : (payload.content || '');
        const embeds = (payload.embeds || []);
        
        // --- DIRTY CHECK: Avoid redundant API spam ---
        // DEEP HASH: Checks content, embeds, and raw component JSON to detect dropdown/button changes
        const compHash = components ? JSON.stringify(components.map(c => c.toJSON())) : 'none';
        const stateHash = JSON.stringify({ content, embeds, comps: compHash });
        
        if (!forceRefresh && player.lastControlState === stateHash) return;

        const sendOptions = { content, embeds };
        if (components) sendOptions.components = components;

        try {
            // --- DM CHANNEL CACHING ---
            if (!player.dmChannel) {
                player.dmChannel = await player.user.createDM().catch(() => null);
            }

            // 1. ATTEMPT SMOOTH EDIT (Reduce DM Spam)
            if (player.controlPanelMessageId && player.dmChannel) {
                try {
                    const prevPanel = await player.dmChannel.messages.fetch(player.controlPanelMessageId).catch(() => null);
                    if (prevPanel) {
                        await prevPanel.edit(sendOptions);
                        player.lastControlState = stateHash;
                        return;
                    }
                } catch (e) {
                    logger.debug(`[Mafia Edit Fail] Falling back to send for ${player.name}`, 'Mafia');
                }
            }

            // 2. FALLBACK: SEND NEW
            if (player.dmChannel) {
                const newMsg = await player.dmChannel.send(sendOptions);
                player.controlPanelMessageId = newMsg.id;
                player.lastControlState = stateHash;
                this.emit('saveState');
            }
        } catch (e) {
            if (e.code === 50007) {
                logger.warn(`[Mafia Refresh] Cannot send DM to ${player.name} (DMs closed).`, 'Mafia');
            } else {
                logger.error(`[Mafia Refresh] Failed to send panel to ${player.name}: ${e.message}`, 'Mafia');
            }
        }
    }

    async cleanupControlPanel(player) {
        if (player.isBot || !player.controlPanelMessageId) return;
        try {
            const dmChannel = await player.user.createDM();
            const prevPanel = await dmChannel.messages.fetch(player.controlPanelMessageId).catch(() => null);
            if (prevPanel && prevPanel.deletable) await prevPanel.delete().catch(() => null);
            player.controlPanelMessageId = null;
            this.emit('saveState');
        } catch (e) {}
    }

    async start(interaction) {
        if (this.state !== 'LOBBY') return false;
        
        // Remove unconfirmed queue players
        for (const [id, p] of this.players) {
            if (p.requiresConfirmation && !p.isConfirmed) {
                this.players.delete(id);
            }
        }
        
        if (this.players.size < 4) {
            await interaction.followUp({ content: '❌ **Simulation aborted.** Not enough confirmed survivors remained to hold the sanctuary.', flags: 64 });
            return false;
        }

        this.state = 'PROLOGUE';
        this.isSecure = true; // Track if we are in a private thread
        
        let thread;
        try {
            // Private thread for the main game to allow removing dead players 
            thread = await interaction.channel.threads.create({
                name: `📚 Final Library | ${this.settings.gameMode}`,
                autoArchiveDuration: 60,
                type: 12, // PrivateThread
                reason: 'Mafia secure simulation',
            });
        } catch (e) {
            logger.warn('[Mafia] Secure Redaction Failed. Falling back to Public records:', e.message, 'Mafia');
            this.isSecure = false;
            thread = await interaction.channel.threads.create({
                name: `📚 Final Library (Public) | ${this.settings.gameMode}`,
                autoArchiveDuration: 60,
                reason: 'Mafia public simulation',
            });
        }
        
        this.threadId = thread.id;
        this.thread = thread;

        // --- VOICE CHANNEL SETUP ---
        if (this.settings.voiceSupport !== 'disabled') {
            try {
                // Record initial VCs for restoration
                for (const [userId, player] of this.players.entries()) {
                    if (!player.isBot) {
                        try {
                            const member = await interaction.guild.members.fetch(userId).catch(() => null);
                            if (member && member.voice.channelId) {
                                player.initialVoiceChannelId = member.voice.channelId;
                            }
                        } catch (e) {}
                    }
                }

                if (this.settings.voiceSupport === 'new') {
                    const voiceChannel = await interaction.channel.guild.channels.create({
                        name: `🎙️ Library Hub | ${this.settings.gameMode}`,
                        type: ChannelType.GuildVoice,
                        permissionOverwrites: [
                            {
                                id: interaction.channel.guild.roles.everyone.id,
                                deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
                            },
                            ...Array.from(this.players.entries()).filter(([id, p]) => !p.isBot).map(([id]) => ({
                                id: id,
                                allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
                            })),
                        ],
                        reason: 'Mafia Voice Hub',
                    });
                    this.voiceChannelId = voiceChannel.id;

                    // Move players who are in voice
                    for (const [userId, player] of this.players.entries()) {
                        if (!player.isBot) {
                            try {
                                const member = await interaction.guild.members.fetch(userId).catch(() => null);
                                if (member && member.voice.channelId) {
                                    await member.voice.setChannel(voiceChannel).catch(() => null);
                                }
                            } catch (e) {}
                        }
                    }
                    await thread.send(`🎙️ **Voice Hub Synced.** Connect to <#${voiceChannel.id}> for the briefing.`);
                } else if (this.settings.voiceSupport === 'existing') {
                    // Use the host's current VC as the hub
                    const hostMember = await interaction.guild.members.fetch(this.hostId).catch(() => null);
                    if (hostMember && hostMember.voice.channelId) {
                        this.voiceChannelId = hostMember.voice.channelId;
                        await thread.send(`🎧 **Existing Frequency Locked.** Audio protocols will be enforced in <#${this.voiceChannelId}>.`);
                    } else {
                        await thread.send(`⚠️ **Audio Sync Failed.** Host is not connected to a voice sector. Falling back to text-only.`);
                    }
                }
            } catch (e) {
                logger.error('[Mafia] Failed to initialize Voice Hub:', e, 'Mafia');
            }
        }

        this.emit('gameStarted', { lobbyId: this.hostId, threadId: thread.id, voiceId: this.voiceChannelId });

        // Start Active Voice Scanner
        if (this.voiceChannelId) {
            this.startVoiceScan();
        }

        // Add real players to the thread
        for (const [userId, player] of this.players.entries()) {
            if (!player.isBot) {
                try { await thread.members.add(userId); } catch (e) {}
            }
        }

        // Lock thread during setup
        await thread.setLocked(true, 'Setup phase');
        
        // Generate roles FIRST so the composition display is accurate
        const availableRoles = MafiaModes.generateRolesForMode(this.settings.gameMode, this.players.size);
        
        // --- HUMAN-FIRST ASSIGNMENT PROTOCOL ---
        // 1. Identify "Power" roles (Action roles or Unique Passives)
        const powerRoles = availableRoles.filter(r => r.priority < 99 || ['The Critic', 'The Anomaly', 'The Plurality'].includes(r.name));
        const basicRoles = availableRoles.filter(r => !powerRoles.includes(r));
        
        // 2. Sort Players: Humans first
        const players = Array.from(this.players.values());
        const humans = players.filter(p => !p.isBot);
        const bots = players.filter(p => p.isBot);
        
        // 3. Re-assemble with priority
        const sortedRoles = [...powerRoles, ...basicRoles];
        const sortedPlayers = [...humans, ...bots];

        for (let i = 0; i < sortedPlayers.length; i++) {
            if (i < sortedRoles.length) {
                sortedPlayers[i].assignRole(sortedRoles[i]);
            }
        }
        
        // Build role composition display
        const arch = {};
        const rev = {};
        const unb = {};
        
        for (const p of this.players.values()) {
            if (p.role) {
                const fac = p.role.faction;
                if (fac === 'Archivists') arch[p.role.name] = (arch[p.role.name] || 0) + 1;
                else if (fac === 'Revisions') rev[p.role.name] = (rev[p.role.name] || 0) + 1;
                else unb[p.role.name] = (unb[p.role.name] || 0) + 1;
            }
        }
        
        let roleEx = `\n\n🛡️ **The Archivists:**\n`;
        for (const [k, v] of Object.entries(arch)) roleEx += `- \`${v}x\` ${k}\n`;
        
        roleEx += `\n🌑 **The Revisions:**\n`;
        for (const [k, v] of Object.entries(rev)) roleEx += `- \`${v}x\` ${k}\n`;
        
        if (Object.keys(unb).length > 0) {
            roleEx += `\n🃏 **The Unbound:**\n`;
            for (const [k, v] of Object.entries(unb)) roleEx += `- \`${v}x\` ${k}\n`;
        }

        if (this.settings.gameMode === 'Chaos' || this.settings.gameMode === 'Unabridged Archive' || this.settings.gameMode === 'Redacted Files') {
            roleEx = `\n\n**Mode: ${this.settings.gameMode}**\n*The records here are highly redacted. Any combination of powerful or third-party roles could be lurking in the darkness. Trust no one.*`;
        }

        await thread.send(`📜 The Final Library is sealed... The last record of humanity begins!\n🎙️ **Audio Uplink Active:** Connect to the **Library Hub** VC for coordinate biometrics.\nCheck your DMs for your Role Cards. ${roleEx}\n\n*Wait quietly... Night falls over the ruined world.*`);
        
        // --- CHUNKED ROLE DISTRIBUTION (Burst Protection) ---
        const playerList = Array.from(this.players.values());
        const CHUNK_SIZE = 4;
        
        for (let i = 0; i < playerList.length; i += CHUNK_SIZE) {
            const chunk = playerList.slice(i, i + CHUNK_SIZE);
            
            const chunkTasks = chunk.map(async (p) => {
                // Initialize Critic Targeting if applicable
                if (p.role && p.role.name === 'The Critic') {
                    const possibleTargets = playerList.filter(t => t.id !== p.id && (!t.role || t.role.faction !== 'Revisions'));
                    if (possibleTargets.length > 0) {
                        p.criticTarget = possibleTargets[Math.floor(Math.random() * possibleTargets.length)].id;
                    }
                }

                if (!p.isBot) {
                    try {
                        let msg;
                        if (p.roleCardUrl) {
                            // --- CDN REUSE (Performance Anchor) ---
                            msg = await p.user.send({
                                embeds: [
                                    baseEmbed('📜 Biometrics Restored', `Your archival identity has been re-synchronized.`, null)
                                        .setImage(p.roleCardUrl)
                                        .setColor(p.role.faction === 'Revisions' ? Lore.COLORS.VICTORY_MAFIA : Lore.COLORS.LOBBY)
                                ]
                            });
                        } else {
                            // --- INITIAL GENERATION ---
                            const canvasBuffer = await generateRoleCard(p.role, p.name, this.thread?.guild?.name || 'The Final Library');
                            const attachment = { files: [{ attachment: canvasBuffer, name: `role_card_${p.id}.png` }] };
                            
                            msg = await p.user.send({ 
                                content: `📜 **Biometrics Scanned.** Your identity in the sanctuary has been established.`,
                                ...attachment
                            });

                            // Capture URL for future reuse
                            if (msg.attachments.size > 0) {
                                p.roleCardUrl = msg.attachments.first().url;
                            }
                        }
                    } catch (e) {
                        // DM Failure Handling
                        if (this.thread) {
                            await this.thread.send({ 
                                content: `⚠️ <@${p.id}>, your archival connection is restricted (DMs closed). Your role is **${p.role.name}** (${p.role.faction}).\n> ${p.role.description}`,
                                flags: 64 
                            }).catch(() => null);
                        }
                        logger.error(`Failed to generate or send role card to ${p.name}`, e, 'Mafia');
                    }
                }
            });

            await Promise.all(chunkTasks);
            if (i + CHUNK_SIZE < playerList.length) {
                await new Promise(r => setTimeout(r, 500)); // 0.5s rest between batches
            }
        }
        
        this.activeTimer = setTimeout(async () => {
            if (this.state === 'GAME_OVER') return;
            
            const threadTasks = [];

            // 1. Create Graveyard
            threadTasks.push((async () => {
                try {
                    const graveyardThread = await interaction.channel.threads.create({
                        name: `💀 Deleted Records`,
                        autoArchiveDuration: 60,
                        type: 12, 
                        reason: 'Mafia graveyard channel',
                    });
                    this.graveyardThreadId = graveyardThread.id;
                    await graveyardThread.send(`💀 **The Sanctuary Graveyard.**\nOnly the dead can read and speak here. The living cannot hear you.`);
                } catch (e) { logger.error('Failed to create graveyard thread', e, 'Mafia'); }
            })());

            // 2. Create Secret Hub
            const revisions = Array.from(this.players.values()).filter(p => p.role?.faction === 'Revisions' && !p.isBot);
            if (revisions.length > 1 || this.settings.gameMode === 'Ink Rot') {
                threadTasks.push((async () => {
                    try {
                        const archiveThread = await thread.parent.threads.create({
                            name: `🌑 Viral Rot Secret Hub`,
                            autoArchiveDuration: 60,
                            type: 12, 
                            reason: 'Mafia secret channel',
                        });
                        this.archiveThreadId = archiveThread.id;
                        for (const p of revisions) {
                            await archiveThread.members.add(p.id).catch(() => null);
                        }
                        await archiveThread.send(`🌑 **Revisions, coordinate your strategy here.**\nCurrently active: ${revisions.map(p => `<@${p.id}>`).join(', ')}`);
                    } catch (e) { logger.error('Failed to create mafia secret thread', e, 'Mafia'); }
                })());
            }

            await Promise.all(threadTasks);
            this.startNight();
        }, this.settings.prologueTime * 1000);
        
        // --- UI TRANSITION: LOBBY -> SPECTATE ---
        try {
            const { buildSpectatePayload } = require('./MafiaUI');
            const MafiaManager = require('./MafiaManager');
            const client = MafiaManager.client;
            const channel = await client.channels.fetch(this.channelId).catch(() => null);
            if (channel) {
                const lobbyMsg = await channel.messages.fetch(this.lobbyMessageId).catch(() => null);
                if (lobbyMsg) await lobbyMsg.edit(buildSpectatePayload(this));
            }
        } catch (e) {
            logger.error('[Mafia UI] Failed to transition to Spectate hub:', e, 'Mafia');
        }

        return thread;
    }

    checkWin() {
        return MafiaPhases.checkWin(this);
    }

    async endGameWithWin(winner) {
        if (this.state === 'GAME_OVER') return;
        this.state = 'GAME_OVER';
        this.winner = winner;
        this.emit('stateChanged', 'GAME_OVER');
        clearTimeout(this.activeTimer);

        const aliveParticipants = Array.from(this.players.values()).filter(p => !p.isBot);
        const winners = [];
        const losers = [];

        for (const p of aliveParticipants) {
            let won = false;
            // Check faction wins or individual 'won' status (for Jester/Executioner)
            if (p.won) won = true;
            else if (winner === 'Archivists' && p.role?.faction === 'Archivists') won = true;
            else if (winner === 'Revisions' && p.role?.faction === 'Revisions') won = true;
            else if (winner.includes(p.role?.name)) won = true;
            else if (p.role?.name === 'The Anomaly' && p.alive) won = true; // Survivor/Anomaly variant win

            if (won) winners.push(p.id);
            else losers.push(p.id);
        }

        if (winners.length > 0) mafiaService.recordMatchResults(winners, true);
        if (losers.length > 0) mafiaService.recordMatchResults(losers, false);
        
        const { buildGameOverPayload } = require('./MafiaUI');
        
        // --- SECONDARY WIN RECOGNITION (ANOMALY/CRITIC) ---
        const secondaryWinners = Array.from(this.players.values())
            .filter(p => p.won && !p.isBot)
            .map(p => p.name);
        
        const gameOverMsg = buildGameOverPayload(this, winner, secondaryWinners);
        
        if (this.thread) {
            const Lore = require('./MafiaLore');
            const { buildVictoryBanner } = require('./MafiaUI');

            // --- STAGE 1: CINEMATIC LORE ---
            if (winner === 'Revisions') {
                const loreText = Lore.STORY.REVISIONS_WIN[Math.floor(Math.random() * Lore.STORY.REVISIONS_WIN.length)];
                await this.thread.send(`> 🛑 **CRITICAL SYSTEM COMPROMISE**\n> *${loreText}*`);
                await new Promise(r => setTimeout(r, 4500)); 
            } else if (winner === 'Archivists') {
                const loreText = Lore.STORY.TOWN_WIN[Math.floor(Math.random() * Lore.STORY.TOWN_WIN.length)];
                await this.thread.send(`> 🛡️ **ARCHIVES SECURED**\n> *${loreText}*`);
                await new Promise(r => setTimeout(r, 4500));
            } else if (winner.includes('Unbound') || winner === 'Draw') {
                const presets = Lore.STORY.UNBOUND_WIN || ["The simulation collapsed. An Unbound signature outshone the archives."];
                const loreText = presets[Math.floor(Math.random() * presets.length)];
                await this.thread.send(`> 🃏 **ANOMALY DETECTED**\n> *${loreText}*`);
                await new Promise(r => setTimeout(r, 4500));
            }

            // --- STAGE 2: HIGH-IMPACT VICTORY BANNER ---
            const victoryBanner = buildVictoryBanner(this, winner);
            await this.thread.send(victoryBanner);
            await new Promise(r => setTimeout(r, 2000)); // Minimal pulse before debrief

            // --- STAGE 3: ARCHIVAL DEBRIEF ---
            await this.thread.send(gameOverMsg);
            await this.thread.setLocked(false, 'Sanctuary session concluded.');
        }

        // --- UI TRANSITION: SPECTATE -> RESULTS ---
        try {
            const { buildEndedLobbyPayload } = MafiaUI;
            const client = MafiaManager.client;
            const channel = await client.channels.fetch(this.channelId).catch(() => null);
            if (channel) {
                const lobbyMsg = await channel.messages.fetch(this.lobbyMessageId).catch(() => null);
                if (lobbyMsg) await lobbyMsg.edit(buildEndedLobbyPayload(this, winner));
                
                // Set a timer to redaction the "Play Again" button after 5 minutes
                setTimeout(async () => {
                    const freshMsg = await channel.messages.fetch(this.lobbyMessageId).catch(() => null);
                    if (freshMsg) {
                        const payload = MafiaUI.buildEndedLobbyPayload(this, winner);
                        // Remove components
                        await freshMsg.edit({ ...payload, components: [] }).catch(() => null);
                    }
                }, 5 * 60 * 1000);
            }
        } catch (e) {
            logger.error('[Mafia UI] Failed to transition to Results hub:', e, 'Mafia');
        }
        
        // --- AUDIO/VOICE RESTORATION (single call after all messages are sent) ---
        await this.updateVoiceStates('GAME_OVER');
        
        this.emit('gameEnded', this.threadId);
    }

    async resetSession() {
        if (this.isDestroyed) return;
        
        // 1. Reset state
        this.state = 'LOBBY';
        this.dayCount = 0;
        this.phaseEndTime = null;
        if (this.activeTimer) clearTimeout(this.activeTimer);
        this.activeTimer = null;
        
        // 2. Clear players
        this.players.clear();
        this.visitHistory = [];
        this.guiltDeaths = [];
        this.stagnationNoticeSent = false;
        this.stagnationExpiresAt = null;
        this.lastActivityAt = Date.now();
        
        // 3. Clear threads
        this.threadId = null;
        this.thread = null;
        this.archiveThreadId = null;
        this.graveyardThreadId = null;
        this.voiceChannelId = null;
        
        this.emit('saveState');
        this.emit('stateChanged', 'LOBBY');
    }

    async startNight() {
        return MafiaPhases.startNight(this);
    }

    // --- VOICE PROTOCOL: NIGHT SILENCE ---
    async updateVoiceStates() {
        return MafiaVoice.updateStates(this);
    }

    /**
     * Surgically updates voice state for a single member (Real-time sync)
     */
    async syncMemberVoice(member) {
        if (this.isDestroyed || !this.voiceChannelId) return;
        return MafiaVoice.updateMemberState(this, member);
    }

    async cleanupPhaseMessage() {
        if (this.thread && this.activePhaseMessageId) {
            try {
                const msg = await this.thread.messages.fetch(this.activePhaseMessageId).catch(() => null);
                if (msg) {
                    const newContent = msg.content.replace(/Ends <t:\d+:R>/, '**Ended**');
                    await msg.edit({ content: newContent });
                }
            } catch (e) {}
            this.activePhaseMessageId = null;
        }
    }

    async endNight() {
        return MafiaPhases.endNight(this);
    }

    async startDay() {
        return MafiaPhases.startDay(this);
    }

    async startVoting() {
        return MafiaPhases.startVoting(this);
    }

    async updateVotingBoard(isFinal = false) {
        if (this.isDestroyed || !this.thread || !this.activePhaseMessageId || (this.state !== 'VOTING' && !isFinal)) return;

        const tallies = {};
        const voters = {};
        for (const p of this.players.values()) {
            if (p.alive && p.voteTarget) {
                if (p.role?.name === 'The Scribe' && p.inkBoundTarget === p.voteTarget) continue;

                const weight = p.role?.name === 'The Plurality' ? 2 : 1;
                tallies[p.voteTarget] = (tallies[p.voteTarget] || 0) + weight;
                if (!voters[p.voteTarget]) voters[p.voteTarget] = [];
                voters[p.voteTarget].push(p.name + (weight > 1 ? ` (x${weight})` : ''));
            }
        }

        let tallyStr = '';
        const sorted = Object.entries(tallies).sort((a, b) => b[1] - a[1]);
        for (const [id, count] of sorted) {
            const label = id === 'skip' ? '⏭️ Skip Vote' : this.players.get(id)?.name || 'Unknown';
            tallyStr += `- **${label}** (${count} votes): ${voters[id].join(', ')}\n`;
        }
        if (!tallyStr) tallyStr = '*No votes cast yet.*';

        try {
            const board = await this.thread.messages.fetch(this.activePhaseMessageId).catch(() => null);
            if (board) {
                let currentContent = board.content;
                if (isFinal) {
                    currentContent = currentContent.replace(/Ends <t:\d+:R>/, '**Ended**');
                }
                currentContent = currentContent.split('**Current Tallies:**')[0];
                await board.edit({
                    content: `${currentContent}**Current Tallies:**\n${tallyStr}`,
                    components: isFinal ? [] : board.components
                });

                // --- CONSENSUS SKIP: ALL VOTES CAST ---
                if (!isFinal && this.state === 'VOTING') {
                    const alivePlayers = this.getAlivePlayers();
                    const totalVotes = alivePlayers.filter(p => p.voteTarget).length;
                    if (totalVotes === alivePlayers.length) {
                        if (this.activeTimer) clearTimeout(this.activeTimer);
                        await this.endDay();
                    }
                }
            }
        } catch (e) {
            logger.error('Failed to update voting board', e, 'Mafia');
        }
    }

    async endDay() {
        return MafiaPhases.endDay(this);
    }

    async moveToGraveyard(userId) {
        if (this.isDestroyed || !this.thread) return;
        const player = this.players.get(userId);
        if (!player) return;

        try {
            // 1. Thread Perms Redaction
            if (this.isSecure) {
                await this.thread.members.remove(userId, 'Redacted from active manifest').catch(() => null);
            } else {
                await this.thread.permissionOverwrites.create(userId, {
                    [PermissionFlagsBits.SendMessages]: false
                }).catch(() => null);
            }

            // 2. Graveyard Entry
            if (this.graveyardThreadId && !player.isBot) {
                const grave = await this.thread.parent.threads.fetch(this.graveyardThreadId).catch(() => null);
                if (grave) {
                    await grave.members.add(userId).catch(() => null);
                    await grave.send(`🕯️ **Survivor Entry:** <@${userId}> has been redacted from the living records.`);
                }
            }

            // 3. Secret Biolink Removal
            if (this.archiveThreadId) {
                const secretHub = await this.thread.parent.threads.fetch(this.archiveThreadId).catch(() => null);
                if (secretHub) await secretHub.members.remove(userId).catch(() => null);
            }

            // 4. Voice Locking
            await this.updateVoiceStates().catch(() => null);

            // 5. Final Notification
            if (player.user && !player.isBot) {
                await player.user.send(`💀 **Connection Locked.** You have been redacted. Use <#${this.graveyardThreadId}> for afterlife discussion.`).catch(() => null);
            }
        } catch (e) {
            logger.error('[Mafia] Graveyard transition failed:', e, 'Mafia');
        }
    }

    resumePhase() {
        if (this.isDestroyed || this.state === 'GAME_OVER' || this.state === 'LOBBY') return;
        
        logger.info(`[Mafia] Resuming phase: ${this.state} (Day ${this.dayCount})`, 'Mafia');

        // Restart Active Voice Scanner if VC exists
        if (this.voiceChannelId) {
            this.startVoiceScan();
        }
        
        if (this.state === 'PROLOGUE') {
            this.activeTimer = setTimeout(() => {
                if (!this.isDestroyed) this.startNight();
            }, 5000);
        } else {
            const remaining = this.phaseEndTime ? Math.max(5000, this.phaseEndTime - Date.now()) : 10000;
            
            if (this.state === 'NIGHT') {
                this.activeTimer = setTimeout(() => {
                    if (!this.isDestroyed) this.endNight();
                }, remaining);
            } else if (this.state === 'DAY') {
                this.activeTimer = setTimeout(() => {
                    if (!this.isDestroyed) this.startVoting();
                }, remaining);
            } else if (this.state === 'VOTING') {
                this.activeTimer = setTimeout(() => {
                    if (!this.isDestroyed) this.endDay();
                }, remaining);
            } else if (this.state === 'TWILIGHT') {
                this.activeTimer = setTimeout(() => {
                    if (!this.isDestroyed) this.startNight();
                }, remaining);
            }
        }
    }

    toJSON() {
        return MafiaSerialization.serialize(this);
    }

    fromJSON(data) {
        return MafiaSerialization.deserialize(this, data);
    }

    /**
     * Re-synchronizes all Discord objects (Users, Threads, Channels) after a state restoration.
     * Ensures that 'missing' references are hydrated before the simulation resumes.
     */
    async syncState(client) {
        // 1. Restore Thread Reference
        if (this.threadId) {
            try {
                const thread = await client.channels.fetch(this.threadId).catch(() => null);
                if (thread) this.thread = thread;
            } catch (e) {
                logger.warn(`[Mafia] Failed to hydrate thread ${this.threadId} during restoration.`, null, 'Mafia');
            }
        }

        // 2. Restore Voice Hub Reference
        if (this.voiceChannelId) {
            try {
                // Fetching the voice channel to ensure current reference
                await client.channels.fetch(this.voiceChannelId).catch(() => null);
            } catch (e) {}
        }

        // 3. Sync Player User objects
        const participantIds = Array.from(this.players.keys());
        for (const id of participantIds) {
            try {
                const player = this.players.get(id);
                if (player && !player.isBot) {
                    const user = await client.users.fetch(id).catch(() => null);
                    if (user) player.user = user;
                }
            } catch (e) {
                logger.error(`[Mafia] Failed to sync user ${id} during restoration:`, e.message, 'Mafia');
            }
        }
    }
}

module.exports = MafiaGame;
