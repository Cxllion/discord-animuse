const Player = require('./MafiaPlayer');
const { resolveNightStack } = require('./MafiaStack');
const { EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const EventEmitter = require('events');
const mafiaService = require('../services/mafiaService');

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
            revealRoles: true // Show roles on death/exile
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
        this.graveyardThreadId = null;
        this.voiceChannelId = null;
        this.isDestroyed = false;
        this.lastActivityAt = Date.now();
        this.stagnationNoticeSent = false;
        this.phaseEndTime = null; // Absolute timestamp for persistence
        this.isSecure = true; // Sanctuary Security Status
    }

    async destroy() {
        this.isDestroyed = true;
        if (this.activeTimer) clearTimeout(this.activeTimer);
        for (const timer of this.botTimers) clearTimeout(timer);
        this.botTimers = [];

        // --- VOICE PROTOCOL: REDACT HUB ---
        if (this.voiceChannelId) {
            try {
                const guild = this.thread?.guild;
                if (guild) {
                    const vc = await guild.channels.fetch(this.voiceChannelId).catch(() => null);
                    if (vc) await vc.delete('Game over').catch(() => null);
                }
            } catch (e) {}
        }

        this.thread = null;
        this.players.clear();
        this.removeAllListeners();
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
            this.players.delete(userId);
            this.lastActivityAt = Date.now();
            this.stagnationNoticeSent = false;
            this.emit('saveState');
            return true;
        }
        return false;
    }

    async bumpLobby(channel) {
        if (this.state !== 'LOBBY') return;
        
        const oldId = this.lobbyMessageId;
        const { buildLobbyPayload } = require('./MafiaUI');
        const payload = buildLobbyPayload(this);
        const manager = require('./MafiaManager');

        try {
            const oldMsg = await channel.messages.fetch(oldId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => null);
        } catch (e) {}

        const newMsg = await channel.send(payload);
        this.lobbyMessageId = newMsg.id;
        
        manager.saveState();
        return newMsg;
    }

    scheduleBump(channel) {
        if (this.state !== 'LOBBY' || this.isDestroyed) return;
        
        if (this.bumpTimer) clearTimeout(this.bumpTimer);
        this.bumpTimer = setTimeout(async () => {
            if (this.state !== 'LOBBY' || this.isDestroyed) return;
            
            try {
                const messages = await channel.messages.fetch({ limit: 5 });
                const lastMsg = messages.first();
                if (lastMsg && lastMsg.id === this.lobbyMessageId) return; 
                
                await this.bumpLobby(channel);
            } catch (e) {
                console.error('[Mafia Bump] Failed to auto-bump:', e);
            }
        }, 15000);
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
                    const { buildStagnationPayload } = require('./MafiaUI');
                    await host.send(buildStagnationPayload(this));
                    console.log(`[Mafia] Stagnation notice sent to host ${this.hostId}. Expiry at ${new Date(this.stagnationExpiresAt).toLocaleTimeString()}`);
                }
            } catch (e) {
                console.error(`[Mafia] Failed to send stagnation notice to ${this.hostId}:`, e);
            }
        }
    }

    getAlivePlayers() {
        return Array.from(this.players.values()).filter(p => p.alive);
    }

    async refreshControlPanel(player, content, components) {
        if (player.isBot) return;

        // 1. Delete old panel if it exists
        if (player.controlPanelMessageId) {
            try {
                const oldMsg = await player.user.send('Refreshed.').catch(() => null);
                if (oldMsg) {
                    const dmChannel = oldMsg.channel;
                    const prevPanel = await dmChannel.messages.fetch(player.controlPanelMessageId).catch(() => null);
                    if (prevPanel) await prevPanel.delete().catch(() => null);
                    await oldMsg.delete().catch(() => null);
                }
            } catch (e) {}
        }

        // 2. Send new panel
        try {
            const newMsg = await player.user.send({ content, components });
            player.controlPanelMessageId = newMsg.id;
            this.emit('saveState');
        } catch (e) {
            console.error(`[Mafia Refresh] Failed to send panel to ${player.name}:`, e);
        }
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
            console.warn('[Mafia] Secure Redaction Failed. Falling back to Public records:', e.message);
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
        try {
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
                        if (member && member.voice.channel) {
                            await member.voice.setChannel(voiceChannel).catch(() => null);
                        }
                    } catch (e) {}
                }
            }
        } catch (e) {
            console.error('[Mafia] Failed to initialize Voice Hub:', e);
        }

        this.emit('gameStarted', { lobbyId: this.hostId, threadId: thread.id, voiceId: this.voiceChannelId });

        // Add real players to the thread
        for (const [userId, player] of this.players.entries()) {
            if (!player.isBot) {
                try { await thread.members.add(userId); } catch (e) {}
            }
        }

        // Lock thread during setup
        await thread.setLocked(true, 'Setup phase');
        
        // Generate roles FIRST so the composition display is accurate
        const { generateRolesForMode } = require('./MafiaModes');
        const availableRoles = generateRolesForMode(this.settings.gameMode, this.players.size);
        
        let i = 0;
        for (const p of this.players.values()) {
            if (i < availableRoles.length) {
                p.assignRole(availableRoles[i]);
            }
            i++;
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
        
        const alivePlayers = Array.from(this.players.values());
        for (const p of alivePlayers) {
            if (p.role && p.role.name === 'The Critic') {
                // Priority: Non-Revision Archivists -> Any Non-Revision (Unbound/Other) -> Anyone but self
                let possibleTargets = alivePlayers.filter(target => target.id !== p.id && target.role && target.role.faction === 'Archivists');
                
                if (possibleTargets.length === 0) {
                    possibleTargets = alivePlayers.filter(target => target.id !== p.id && (!target.role || target.role.faction !== 'Revisions'));
                }

                if (possibleTargets.length === 0) {
                    possibleTargets = alivePlayers.filter(target => target.id !== p.id);
                }

                if (possibleTargets.length > 0) {
                    p.criticTarget = possibleTargets[Math.floor(Math.random() * possibleTargets.length)].id;
                }
            }
        }
        
        const { buildRoleCard } = require('./MafiaUI');
        for (const p of this.players.values()) {
            if (!p.isBot && p.role) {
                const { buildRoleCard } = require('./MafiaUI');
                const card = buildRoleCard(p, this);
                
                // Add Will button to the role card panel
                const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                const willRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`mafia_will_${this.hostId}`)
                        .setLabel('✍️ Write Last Will')
                        .setStyle(ButtonStyle.Secondary)
                );
                
                await this.refreshControlPanel(p, { embeds: card.embeds }, [willRow]);
            }
        }
        
        this.activeTimer = setTimeout(async () => {
            if (this.state === 'GAME_OVER') return;
            
            try {
                const graveyardThread = await interaction.channel.threads.create({
                    name: `💀 Deleted Records`,
                    autoArchiveDuration: 60,
                    type: 12, 
                    reason: 'Mafia graveyard channel',
                });
                this.graveyardThreadId = graveyardThread.id;
                await graveyardThread.send(`💀 **The Sanctuary Graveyard.**\nOnly the dead can read and speak here. The living cannot hear you.`);
            } catch (e) { console.error('Failed to create graveyard thread', e); }

            const revisions = Array.from(this.players.values()).filter(p => p.role?.faction === 'Revisions' && !p.isBot);
            if (revisions.length > 1) {
                try {
                    const archiveThread = await interaction.channel.threads.create({
                        name: `🌑 Viral Rot Secret Hub`,
                        autoArchiveDuration: 60,
                        type: 12, 
                        reason: 'Mafia secret channel',
                    });
                    this.archiveThreadId = archiveThread.id;
                    for (const p of revisions) {
                        await archiveThread.members.add(p.id);
                    }
                    await archiveThread.send(`🌑 **Revisions, coordinate your strategy here.**\nCurrently active: ${revisions.map(p => `<@${p.id}>`).join(', ')}`);
                } catch (e) { console.error('Failed to create mafia secret thread', e); }
            }
            
            this.startNight();
        }, this.settings.prologueTime * 1000);
        
        return thread;
    }

    checkWin() {
        if (this.state === 'GAME_OVER') return true;
        const alive = this.getAlivePlayers();
        
        const archive = alive.filter(p => p.role && p.role.faction === 'Revisions').length;
        const town = alive.filter(p => !p.role || p.role.faction === 'Archivists').length;
        const unbound = alive.filter(p => p.role && p.role.faction === 'Unbound').length;

        const arsonists = alive.filter(p => p.role?.name === 'The Bookburner');
        if (arsonists.length > 0 && arsonists.length === alive.length) {
            this.endGameWithWin('Unbound (The Bookburner)');
            return true;
        }

        if (archive > 0 && archive >= (town + unbound)) {
            this.endGameWithWin('Revisions');
            return true;
        }

        if (archive === 0) {
            // Arsonist is a threat to the town, check if it's the last one left
            if (arsonists.length === 0) {
                this.endGameWithWin('Archivists');
                return true;
            } else if (arsonists.length === 1 && alive.length <= 2) {
                // Arsonist wins 1v1
                this.endGameWithWin('Unbound (The Bookburner)');
                return true;
            }
        }
        
        return false;
    }

    async endGameWithWin(winner) {
        if (this.state === 'GAME_OVER') return;
        this.state = 'GAME_OVER';
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
        const gameOverMsg = buildGameOverPayload(this, winner);
        
        if (this.thread) {
            await this.thread.send(gameOverMsg);
            await this.thread.setLocked(false, 'Sanctuary session concluded.');
            
            try {
                const { buildEndedLobbyPayload } = require('./MafiaUI');
                const lobbyMsg = await this.thread.parent.messages.fetch(this.lobbyMessageId);
                if (lobbyMsg) await lobbyMsg.edit(buildEndedLobbyPayload(this, winner));
            } catch (e) {
                console.error('Failed to update main lobby embed on game over', e);
            }
        }
        
        this.emit('gameEnded', this.threadId);
        
        // --- AGGRESSIVE ARCHIVAL ---
        // We do this almost immediately (5s) to allow users to see the Victory screen,
        // then lock it down forever.
        setTimeout(async () => {
            try {
                if (this.thread && !this.thread.archived) {
                    await this.thread.setLocked(true).catch(() => null);
                    await this.thread.setArchived(true).catch(() => null);
                }
                if (this.archiveThreadId) {
                    const secret = (this.thread && this.thread.parent) ? await this.thread.parent.threads.fetch(this.archiveThreadId).catch(()=>null) : null;
                    if (secret && !secret.archived) {
                        await secret.setLocked(true).catch(() => null);
                        await secret.setArchived(true).catch(() => null);
                    }
                }
                if (this.graveyardThreadId) {
                    const grave = (this.thread && this.thread.parent) ? await this.thread.parent.threads.fetch(this.graveyardThreadId).catch(()=>null) : null;
                    if (grave && !grave.archived) {
                        await grave.setLocked(true).catch(() => null);
                        await grave.setArchived(true).catch(() => null);
                    }
                }
            } catch (e) {}
        }, 5000);
    }

    async startNight() {
        if (this.isDestroyed || this.state === 'GAME_OVER') return;
        this.state = 'NIGHT';
        this.dayCount++;
        this.emit('stateChanged', 'NIGHT');
        
        for (const timer of this.botTimers) clearTimeout(timer);
        this.botTimers = [];
        
        for (const p of this.players.values()) { p.resetForNight(); }

        this.guiltDeaths = [];
        for (const p of this.getAlivePlayers()) {
            if (p.guilt) {
                p.die();
                p.deathDay = this.dayCount;
                this.guiltDeaths.push(p);
                this.moveToGraveyard(p.id);
            }
        }

        if (this.thread) {
            await this.thread.setLocked(true, 'Night phase');
            const nightDuration = this.settings.nightTime || 60;
            this.phaseEndTime = Date.now() + (nightDuration * 1000);
            const endTime = Math.floor(this.phaseEndTime / 1000);
            
            const whisper = NIGHT_WHISPERS[Math.floor(Math.random() * NIGHT_WHISPERS.length)];
            const { baseEmbed } = require('./MafiaUI');
            const embed = baseEmbed(`🌑 Night ${this.dayCount}`, 
                `*${whisper}*\n\n📝 **Check your DMs to perform your night actions.**`, 
                null
            )
                .setColor('#2c3e50');

            const nightMsg = await this.thread.send({ 
                content: `🌑 **Phase: Night ${this.dayCount}** | Ends <t:${endTime}:R>`,
                embeds: [embed] 
            });
            this.activePhaseMessageId = nightMsg.id;
        }
        
        const alivePlayers = this.getAlivePlayers();
        const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        for (const p of alivePlayers) {
            if (p.isBot) continue;

            const components = [];
            
            if (p.role && p.role.priority !== 99) {
                let optionsData = [];
                if (p.role.name === 'The Scribe') {
                    optionsData = Array.from(this.players.values()).filter(ap => !ap.alive && !this.guiltDeaths.includes(ap)).map(ap => ({ label: ap.name, value: ap.id }));
                } else if (p.role.name === 'The Bookburner') {
                    optionsData = alivePlayers.filter(ap => ap.id !== p.id).map(ap => ({ label: ap.name, value: ap.id }));
                    optionsData.unshift({ label: '🔥 Ignite All Doused', description: 'Erase everyone currently doused', value: 'ignite' });
                } else {
                    optionsData = alivePlayers.filter(ap => ap.id !== p.id).map(ap => ({ label: ap.name, value: ap.id }));
                }

                if (optionsData.length === 0 && p.role.name === 'The Scribe') {
                    optionsData.push({ label: 'No bodies to scan yet', value: 'none', description: 'Wait for a casualty.' });
                }

                if (optionsData.length > 0) {
                    const dropdown = new StringSelectMenuBuilder()
                        .setCustomId(`mafia_night_target_${this.hostId}`)
                        .setPlaceholder(`${p.role.emoji} Select a target for: ${p.role.name}`)
                        .addOptions(optionsData.slice(0, 25));
                    components.push(new ActionRowBuilder().addComponents(dropdown));
                }
            }

            const willLabel = p.lastWill ? '✍️ Update Last Will' : '✍️ Write Last Will';
            const willRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`mafia_will_${this.hostId}`)
                    .setLabel(willLabel)
                    .setStyle(ButtonStyle.Secondary)
            );
            components.push(willRow);

            try {
                const nightDuration = this.settings.nightTime || 60;
                const endTime = Math.floor(Date.now() / 1000) + nightDuration;
                const willStatus = p.lastWill ? `📜 Current will: *"${p.lastWill}"*` : `📜 You haven't written a last will yet.`;
                const roleInfo = p.role && p.role.priority !== 99 ? `**Your Role:** ${p.role.emoji} ${p.role.name}` : '';
                const content = `🌑 **Night ${this.dayCount}** · Ends <t:${endTime}:R>\n${roleInfo}\n${willStatus}`;
                
                await this.refreshControlPanel(p, content, components);
            } catch (e) {
                console.error(`Failed to DM player ${p.name}:`, e);
            }
        }
        
        this.activeTimer = setTimeout(() => {
            if (this.state !== 'GAME_OVER') this.endNight();
        }, this.settings.nightTime * 1000);

        // --- VOICE PROTOCOL: NIGHT SILENCE ---
        if (this.voiceChannelId) {
            try {
                const voiceChannel = await this.thread.guild.channels.fetch(this.voiceChannelId).catch(() => null);
                if (voiceChannel) {
                    for (const [id, p] of this.players) {
                        if (p.alive && !p.isBot) {
                            const member = await voiceChannel.guild.members.fetch(id).catch(() => null);
                            if (member && member.voice.channelId === this.voiceChannelId) {
                                await member.voice.setDeaf(true, 'Sanctuary Night Silence').catch(() => null);
                            }
                        }
                    }
                }
            } catch (e) {}
        }
        
        this.emit('saveState');
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
        if (this.isDestroyed || this.state === 'GAME_OVER') return;
        await this.cleanupPhaseMessage();
        const { deaths, readings } = resolveNightStack(this);
        
        const guiltDeaths = (this.guiltDeaths || []).map(p => ({ target: p, source: null, isGuilt: true }));
        const allDeaths = [...guiltDeaths, ...deaths];
        
        for (const d of deaths) {
            this.moveToGraveyard(d.target.id);
        }
        
        if (this.thread) {
            const { buildMorningReport } = require('./MafiaUI');
            const report = buildMorningReport(this, allDeaths);
            await this.thread.send(report);
            
            for (const r of readings) {
                const viewer = this.players.get(r.viewerId);
                if (viewer && !viewer.isBot) {
                    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                    const willRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`mafia_will_${this.hostId}`)
                            .setLabel('✍️ Update Last Will')
                            .setStyle(ButtonStyle.Secondary)
                    );
                    await this.refreshControlPanel(viewer, r.message, [willRow]);
                }
            }
        }
        
        // --- CRITIC TARGET LOSS ADAPTATION ---
        for (const p of this.players.values()) {
            if (p.alive && p.role?.name === 'The Critic' && p.criticTarget) {
                const target = this.players.get(p.criticTarget);
                if (target && !target.alive) {
                    // Target was killed at night, Critic fails objective
                    // (Optionally convert to Anomaly here if desired, but for now just fail)
                }
            }
        }
        
        if (this.checkWin()) return;

        // --- VOICE PROTOCOL: RESTORE COMMS ---
        if (this.voiceChannelId) {
            try {
                const voiceChannel = await this.thread.guild.channels.fetch(this.voiceChannelId).catch(() => null);
                if (voiceChannel) {
                    for (const [id, p] of this.players) {
                        if (p.alive && !p.isBot) {
                            const member = await voiceChannel.guild.members.fetch(id).catch(() => null);
                            if (member && member.voice.channelId === this.voiceChannelId) {
                                await member.voice.setDeaf(false, 'Morning Restoration').catch(() => null);
                            }
                        }
                    }
                }
            } catch (e) {}
        }

        this.startDay();
    }

    async startDay() {
        if (this.isDestroyed || this.state === 'GAME_OVER') return;
        this.state = 'DAY';
        this.emit('stateChanged', 'DAY');
        
        for (const p of this.players.values()) { p.resetForDay(); }

        if (this.thread) {
            await this.thread.setLocked(false, 'Day phase');
            const duration = this.settings.discussionTime || 120;
            this.phaseEndTime = Date.now() + (duration * 1000);
            const endTime = Math.floor(this.phaseEndTime / 1000);
            
            const epithet = DAY_EPITHETS[Math.floor(Math.random() * DAY_EPITHETS.length)];
            const { baseEmbed } = require('./MafiaUI');
            const embed = baseEmbed(`🌅 ${epithet} (Day ${this.dayCount})`, 
                `*The sanctuary is restless. The world outside is dead, but the library must survive.*\n\n**Survivors Remaining:** ${this.getAlivePlayers().length}/${this.players.size}\n\n**Discussion Period:** Talk amongst yourselves. Humanity's last hope rests on your decisions.`, 
                null
            )
                .setColor('#f39c12');

            const dayMsg = await this.thread.send({
                content: `🗣️ **Phase: Day ${this.dayCount} (Discussion)** | Ends <t:${endTime}:R>`,
                embeds: [embed]
            });
            this.activePhaseMessageId = dayMsg.id;
            
            const { handleBotDaySpeech } = require('./MafiaBots');
            const timers = await handleBotDaySpeech(this);
            if (timers && Array.isArray(timers)) {
                this.botTimers.push(...timers);
            }
        }
        
        this.activeTimer = setTimeout(() => {
            if (this.state !== 'GAME_OVER') this.startVoting();
        }, (this.settings.discussionTime || 120) * 1000);
        
        this.emit('saveState');
    }

    async startVoting() {
        if (this.isDestroyed || this.state === 'GAME_OVER') return;
        await this.cleanupPhaseMessage();
        this.state = 'VOTING';
        this.emit('stateChanged', 'VOTING');
        
        if (this.thread) {
            const alivePlayers = this.getAlivePlayers();
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
            
            let rows = [];
            let currentRow = new ActionRowBuilder();
            
            for (const p of alivePlayers) {
                if (currentRow.components.length === 5) {
                    rows.push(currentRow);
                    currentRow = new ActionRowBuilder();
                }
                currentRow.addComponents(
                    new ButtonBuilder().setCustomId(`mafia_vote_${this.hostId}_${p.id}`).setLabel(p.name).setStyle(ButtonStyle.Secondary)
                );
            }
            if (currentRow.components.length === 5) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }
            currentRow.addComponents(
                new ButtonBuilder().setCustomId(`mafia_vote_${this.hostId}_skip`).setLabel('⏭️ Skip Vote').setStyle(ButtonStyle.Danger)
            );
            rows.push(currentRow);
            
            const duration = this.settings.votingTime || 60;
            this.phaseEndTime = Date.now() + (duration * 1000);
            const endTime = Math.floor(this.phaseEndTime / 1000);
            
            let flavorText = "";
            const mayor = alivePlayers.find(p => p.role?.name === 'The Plurality');
            if (mayor) flavorText = `\n👑 **The Plurality** is active. Their vote carries the weight of two.`;

            const votingMsg = await this.thread.send({
                content: `🗳️ **Phase: Voting** | Ends <t:${endTime}:R>\n**Survivors Remaining:** ${alivePlayers.length}/${this.players.size}\n\nThe floor is open. Cast your ballots by selecting a name below:${flavorText}\n\n**Current Tallies:**\n*No votes cast yet.*`,
                components: rows
            });
            this.activePhaseMessageId = votingMsg.id;
        }

        // --- GRADUAL BOT VOTING ---
        const { handleBotDayVoting } = require('./MafiaBots');
        const aliveBots = this.getAlivePlayers().filter(p => p.isBot);
        for (const bot of aliveBots) {
            const delay = Math.random() * (this.settings.votingTime - 5) * 1000;
            const timer = setTimeout(async () => {
                if (this.state === 'VOTING' && bot.alive && !this.isDestroyed) {
                    handleBotDayVoting(this, bot);
                    await this.updateVotingBoard().catch(() => null);
                }
            }, delay);
            this.botTimers.push(timer);
        }

        this.activeTimer = setTimeout(() => {
            if (this.state !== 'GAME_OVER') this.endDay();
        }, (this.settings.votingTime || 60) * 1000);
        
        this.emit('saveState');
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
            }
        } catch (e) {
            console.error('Failed to update voting board', e);
        }
    }

    async endDay() {
        if (this.isDestroyed || this.state !== 'VOTING') return;

        const { handleBotDayVoting } = require('./MafiaBots');
        handleBotDayVoting(this);
        
        this.state = 'TWILIGHT';
        this.emit('stateChanged', 'TWILIGHT');
        
        await this.cleanupPhaseMessage();
        await this.updateVotingBoard(true);
        
        let afkErased = [];
        for (const p of this.getAlivePlayers()) {
            if (!p.isBot) {
                if (!p.voteTarget) {
                    p.missedVotes = (p.missedVotes || 0) + 1;
                    if (p.missedVotes >= 2) {
                        p.die();
                        p.deathDay = this.dayCount;
                        afkErased.push(p);
                        this.moveToGraveyard(p.id);
                    }
                } else {
                    p.missedVotes = 0; 
                }
            }
        }
        
        if (this.thread && afkErased.length > 0) {
            const afkNames = afkErased.map(p => p.name).join(', ');
            await this.thread.send(`⚠️ **System Purge:** ${afkNames} ${afkErased.length === 1 ? 'was' : 'were'} erased due to biometric inactivity.`);
            if (this.checkWin()) return;
        }
        
        const tallies = {};
        for (const p of this.players.values()) {
            if (p.alive && p.voteTarget) {
                if (p.role?.name === 'The Scribe' && p.inkBoundTarget === p.voteTarget) continue;

                const weight = p.role?.name === 'The Plurality' ? 2 : 1;
                tallies[p.voteTarget] = (tallies[p.voteTarget] || 0) + weight;
            }
        }
        
        let maxVotes = 0;
        let tied = [];
        for (const [id, votes] of Object.entries(tallies)) {
            if (votes > maxVotes) {
                maxVotes = votes;
                tied = [id];
            } else if (votes === maxVotes) {
                tied.push(id);
            }
        }
        
        const alivePlayers = this.getAlivePlayers().length;
        const minVotesRequired = alivePlayers <= 4 ? 2 : 3;

        if (this.thread) {
            await this.thread.setLocked(true, 'Voting ended');
            
            // Build Tally Summary for Transparency
            const tallyLines = [];
            for (const [targetId, count] of Object.entries(tallies).sort((a,b) => b[1] - a[1])) {
                const targetName = targetId === 'skip' ? '⏭️ Skip Vote' : (this.players.get(targetId)?.name || 'Unknown');
                const voters = Array.from(this.players.values())
                    .filter(p => (p.alive || afkErased.includes(p)) && p.voteTarget === targetId)
                    .map(p => p.name)
                    .join(', ');
                tallyLines.push(`• **${targetName}** (${count}): ${voters}`);
            }
            const tallyStr = tallyLines.length > 0 ? `\n\n**Final Tally:**\n${tallyLines.join('\n')}` : '';

            if (tied.length === 0) {
                await this.thread.send('⚖️ **The town was completely silent.** No votes were cast today.' + tallyStr);
                this.activeTimer = setTimeout(() => {
                    if (this.state !== 'GAME_OVER') this.startNight();
                }, 10000);
            } else if (tied.length > 1) {
                await this.thread.send('⚖️ **The town could not reach a consensus.** The execution vote ended in a tie. No one is exiled today.' + tallyStr);
                this.activeTimer = setTimeout(() => {
                    if (this.state !== 'GAME_OVER') this.startNight();
                }, 10000);
            } else if (tied.length === 1) {
                if (tied[0] === 'skip') {
                    await this.thread.send('⚖️ **The sanctuary chose to skip the execution.** No one is exiled today.' + tallyStr);
                    this.activeTimer = setTimeout(() => {
                        if (this.state !== 'GAME_OVER') this.startNight();
                    }, 10000);
                    return;
                }
                const exiled = this.players.get(tied[0]);
                if (exiled) {
                    // --- VOICE PROTOCOL: LAST WORDS ---
                    if (this.voiceChannelId && !exiled.isBot) {
                        try {
                            const guild = this.thread.guild;
                            for (const [id, p] of this.players) {
                                if (p.alive && !p.isBot) {
                                    const member = await guild.members.fetch(id).catch(() => null);
                                    if (member && member.voice.channelId === this.voiceChannelId) {
                                        await member.voice.setMute(id !== exiled.id, 'Twilight: Last Words Protocol').catch(() => null);
                                    }
                                }
                            }
                            await this.thread.send(`🎙️ **Audio Priority:** Channel focused on <@${exiled.id}> for final transmissions.`);
                        } catch (e) {}
                    }

                    exiled.die();
                    exiled.deathDay = this.dayCount;
                    
                    // --- UNBOUND WIN CONDITIONS ---
                    if (exiled.role?.name === 'The Anomaly') {
                        exiled.won = true; // Jester wins!
                    }
                    
                    for (const p of this.players.values()) {
                        if (p.alive && p.role?.name === 'The Critic' && p.criticTarget === exiled.id) {
                            p.won = true; // Executioner wins!
                        }
                    }
                    
                    const lore = EXILE_LORE[Math.floor(Math.random() * EXILE_LORE.length)].replace('{name}', `**${exiled.name}**`);
                    const roleStr = this.settings.revealRoles ? (exiled.role ? `\n**Role:** ${exiled.role.emoji} ${exiled.role.name} (${exiled.role.faction})` : '\n**Role:** Unknown') : '';
                    
                    await this.thread.send(`⚖️ **The decision is absolute.**\n${lore}${roleStr}${tallyStr}`);

                    if (this.checkWin()) return;

                    this.activeTimer = setTimeout(async () => {
                        // Restore voice for everyone before moving the ghost
                        if (this.voiceChannelId) {
                            try {
                                const guild = this.thread.guild;
                                for (const [id, p] of this.players) {
                                    if (!p.isBot) {
                                        const member = await guild.members.fetch(id).catch(() => null);
                                        if (member && member.voice.channelId === this.voiceChannelId) {
                                            await member.voice.setMute(false).catch(() => null);
                                        }
                                    }
                                }
                            } catch (e) {}
                        }

                        this.moveToGraveyard(exiled.id);
                        if (this.state !== 'GAME_OVER') this.startNight();
                    }, 10000);
                }
            }
        }
        this.emit('saveState');
    }

    async moveToGraveyard(userId) {
        if (this.isDestroyed || !this.thread) return;

        // 1. Move to Graveyard Thread
        if (this.graveyardThreadId) {
            try {
                const grave = await this.thread.parent.threads.fetch(this.graveyardThreadId).catch(() => null);
                if (grave) {
                    await grave.members.add(userId).catch(() => null);
                    await grave.send(`🕯️ **Survivor Entry:** <@${userId}> has been redacted from the living records and entered the spectator archives.`);
                }
            } catch (e) {}
        }

        // 2. Internal Voice Mute Protocol
        try {
            if (this.voiceChannelId) {
                const member = await this.thread.guild.members.fetch(userId).catch(() => null);
                if (member && member.voice.channelId === this.voiceChannelId) {
                    await member.voice.setDeaf(false).catch(() => null); // Undeafen if they were dead at night
                    await member.voice.setMute(true, 'Biological Redaction (Spectator)').catch(() => null);
                }
            }
        } catch (e) {}

        // 3. Silence in Main Thread
        try {
            if (this.thread) {
                await this.thread.members.remove(userId).catch(e => {
                    console.error(`[Mafia Redaction] Failed to eject ${userId} from thread ${this.threadId}:`, e.message);
                });
            }
            
            // Notify user in DM
            const player = this.players.get(userId);
            if (player && player.user) {
                await player.user.send(`💀 **Connection Terminated.** You have been redacted from the living archives. You can continue to spectate the simulation from <#${this.graveyardThreadId}> and by listening in the Hub Voice channel.`).catch(() => null);
            }
        } catch (e) {}
    }

    resumePhase() {
        if (this.isDestroyed || this.state === 'GAME_OVER' || this.state === 'LOBBY') return;
        
        console.log(`[Mafia] Resuming phase: ${this.state} (Day ${this.dayCount})`);
        
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
        return {
            lobbyMessageId: this.lobbyMessageId,
            hostId: this.hostId,
            guildId: this.guildId,
            channelId: this.channelId,
            threadId: this.threadId,
            state: this.state,
            dayCount: this.dayCount,
            settings: this.settings,
            graveyardThreadId: this.graveyardThreadId,
            archiveThreadId: this.archiveThreadId,
            activePhaseMessageId: this.activePhaseMessageId,
            hubMessageId: this.hubMessageId,
            lastActivityAt: this.lastActivityAt,
            stagnationNoticeSent: this.stagnationNoticeSent,
            phaseEndTime: this.phaseEndTime,
            voiceChannelId: this.voiceChannelId,
            isSecure: this.isSecure,
            players: Array.from(this.players.entries()).map(([id, p]) => ({ id, ...p.toJSON() }))
        };
    }

    fromJSON(data) {
        this.lobbyMessageId = data.lobbyMessageId;
        this.hostId = data.hostId;
        this.guildId = data.guildId;
        this.channelId = data.channelId;
        this.threadId = data.threadId;
        this.state = data.state;
        this.dayCount = data.dayCount;
        this.settings = data.settings || this.settings;
        this.graveyardThreadId = data.graveyardThreadId;
        this.archiveThreadId = data.archiveThreadId;
        this.hubMessageId = data.hubMessageId || data.activePhaseMessageId;
        this.activePhaseMessageId = data.activePhaseMessageId || data.hubMessageId;
        this.lastActivityAt = data.lastActivityAt || Date.now();
        this.stagnationNoticeSent = data.stagnationNoticeSent || false;
        this.phaseEndTime = data.phaseEndTime || null;
        this.voiceChannelId = data.voiceChannelId || null;
        this.isSecure = data.isSecure !== undefined ? data.isSecure : true;

        if (data.players) {
            for (const pData of data.players) {
                const player = new Player({ id: pData.id, displayName: pData.name }, pData.isBot);
                player.fromJSON(pData);
                this.players.set(pData.id, player);
            }
        }
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
                console.warn(`[Mafia] Failed to hydrate thread ${this.threadId} during restoration.`);
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
                console.error(`[Mafia] Failed to sync user ${id} during restoration:`, e.message);
            }
        }
    }
}

module.exports = MafiaGame;
