const Player = require('./ArchivePlayer');
const { resolveNightStack } = require('./ArchiveStack');
const { EmbedBuilder } = require('discord.js');
const EventEmitter = require('events');
const archiveService = require('../services/archiveService');

const EXILE_LORE = [
    "The library council detects a trace of the Virus in **{name}**. They are cast out into the toxic world below.",
    "Judgement is passed. **{name}** is unceremoniously shoved into the Air-Lock and erased from the manifests.",
    "Driven by survival, the Archivists bind **{name}** and exile them to the desolate surface.",
    "A collective decision redacts **{name}** from the Final Library's roster. The gates shut tight behind them.",
    "The gavel falls. **{name}** screams as they are pushed past the perimeter into the infected winds."
];

const DEATH_LORE = [
    "In the dead of night, the Viral Rot caught up to **{name}**. Their flesh was found turning to grey static in the Archives.",
    "A pool of blackened bile marks the spot where **{name}** was violently taken by the infection.",
    "The ventilation hums a somber tune. **{name}** was found internally liquified, their essence stolen.",
    "Shadows consumed **{name}** while the library slept. Only a hollowed-out book remains.",
    "No one heard the struggle. **{name}** has been permanently silenced by an infected hand."
];

const NIGHT_WHISPERS = [
    "The oxygen levels are dropping in the lower wings tonight...",
    "They say the virus started in the archives themselves.",
    "Something is scratching at the air filters of the Safe Zone.",
    "The Final Library breathes... but its breath smells of ozone and decay.",
    "Eyes are watching from the gaps in the radiation shielding."
];

const DAY_EPITHETS = [
    "The Dawn of the Last Sanctuary",
    "The Morning of the Ruined World",
    "The Reckoning of the Final Library",
    "The Day of Faded Mankind",
    "The Sun Rises on a Sanctuary of Lies"
];

class ArchiveGame extends EventEmitter {
    constructor(lobbyMessageId, hostUser) {
        super();
        this.lobbyMessageId = lobbyMessageId;
        this.hostId = hostUser.id;
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
            gameMode: 'First Edition',
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
        this.isDestroyed = false;
        this.lastActivityAt = Date.now();
        this.stagnationNoticeSent = false;
    }

    destroy() {
        this.isDestroyed = true;
        if (this.activeTimer) clearTimeout(this.activeTimer);
        for (const timer of this.botTimers) clearTimeout(timer);
        this.botTimers = [];
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
        const { buildLobbyPayload } = require('./ArchiveUI');
        const payload = buildLobbyPayload(this);
        const manager = require('./ArchiveManager');

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
                console.error('[Archive Bump] Failed to auto-bump:', e);
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
                    const { buildStagnationPayload } = require('./ArchiveUI');
                    await host.send(buildStagnationPayload(this));
                    console.log(`[Archive] Stagnation notice sent to host ${this.hostId}. Expiry at ${new Date(this.stagnationExpiresAt).toLocaleTimeString()}`);
                }
            } catch (e) {
                console.error(`[Archive] Failed to send stagnation notice to ${this.hostId}:`, e);
                // If we can't DM them, we'll still auto-disband after the expiry to keep the archives clean
            }
        }
    }

    getAlivePlayers() {
        return Array.from(this.players.values()).filter(p => p.alive);
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
        
        let thread;
        try {
            // Attempt to start a thread from the interaction message (if it exists)
            if (interaction.message) {
                thread = await interaction.message.startThread({
                    name: `📚 Final Library | Session #${this.lobbyMessageId.slice(-4)}`,
                    autoArchiveDuration: 60,
                    reason: 'Started a Sanctuary Session',
                });
            } else {
                throw new Error('No attached message found for threading.');
            }
        } catch (e) {
            if (e.code !== 10008) console.error('Thread attachment failed, creating a new thread instead:', e);
            // Fallback: Create a standalone thread in the same channel (MUST have name)
            thread = await interaction.channel.threads.create({
                name: `📚 Final Library | Session #${this.lobbyMessageId.slice(-4)}`,
                autoArchiveDuration: 60,
                reason: 'Started a game of Mafia',
            });
        }
        
        this.threadId = thread.id;
        this.thread = thread;
        this.emit('gameStarted', { lobbyId: this.hostId, threadId: thread.id }); // Pass hostId as the look-up key

        // Add real players to the thread
        for (const [userId, player] of this.players.entries()) {
            if (!player.isBot) {
                try { await thread.members.add(userId); } catch (e) {}
            }
        }

        // Lock thread during setup
        await thread.setLocked(true, 'Setup phase');
        
        // Generate roles FIRST so the composition display is accurate
        const { generateRolesForMode } = require('./ArchiveModes');
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

        await thread.send(`📜 The Final Library is sealed... The last record of humanity begins! Check your DMs for your Role Cards. ${roleEx}\n\n*Wait quietly... Night falls over the ruined world.*`);
        
        // Assign targets for special roles
        const alivePlayers = Array.from(this.players.values());
        for (const p of alivePlayers) {
            if (p.role && p.role.name === 'The Critic') {
                const possibleTargets = alivePlayers.filter(target => target.id !== p.id && target.role && target.role.faction === 'Archivists');
                if (possibleTargets.length > 0) {
                    p.criticTarget = possibleTargets[Math.floor(Math.random() * possibleTargets.length)].id;
                }
            }
        }
        
        // Send actual Cinematic Role Cards to human players via Direct Transmission
        const { buildRoleCard } = require('./ArchiveUI');
        for (const p of this.players.values()) {
            if (!p.isBot && p.role) {
                try {
                    const card = buildRoleCard(p, this);
                    await p.user.send(card);
                } catch (e) {
                    console.log(`[WARN] Transmission error to survivor ${p.name}: Potential block.`);
                }
            }
        }
        
        // Start Night Loop
        this.activeTimer = setTimeout(async () => {
            if (this.state === 'GAME_OVER') return;
            
            // Create Graveyard Thread
            try {
                const graveyardThread = await interaction.channel.threads.create({
                    name: `💀 Deleted Records`,
                    autoArchiveDuration: 60,
                    type: 12, 
                    reason: 'FinalLibrary graveyard channel',
                });
                this.graveyardThreadId = graveyardThread.id;
                await graveyardThread.send(`💀 **The Sanctuary Graveyard.**\nOnly the dead can read and speak here. The living cannot hear you.`);
            } catch (e) { console.error('Failed to create graveyard thread', e); }

            // Create Revision Secret Thread if needed
            const revisions = Array.from(this.players.values()).filter(p => p.role?.faction === 'Revisions' && !p.isBot);
            if (revisions.length > 1) {
                try {
                    const archiveThread = await interaction.channel.threads.create({
                        name: `🌑 Viral Rot Secret Hub`,
                        autoArchiveDuration: 60,
                        type: 12, 
                        reason: 'FinalLibrary secret channel',
                    });
                    this.archiveThreadId = archiveThread.id;
                    for (const p of revisions) {
                        await archiveThread.members.add(p.id);
                    }
                    await archiveThread.send(`🌑 **Revisions, coordinate your strategy here.**\nCurrently active: ${revisions.map(p => `<@${p.id}>`).join(', ')}`);
                } catch (e) { console.error('Failed to create archive thread', e); }
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

        // Arsonist (Bookburner) solo win
        const arsonists = alive.filter(p => p.role?.name === 'The Bookburner');
        if (arsonists.length > 0 && arsonists.length === alive.length) {
            this.endGameWithWin('Unbound (The Bookburner)');
            return true;
        }

        // Archive win: Archive >= non-Archive
        if (archive > 0 && archive >= (town + unbound)) {
            this.endGameWithWin('Revisions');
            return true;
        }

        // Town win: All Archive dead and no threatening Unbound
        if (archive === 0) {
            if (arsonists.length === 0) {
                this.endGameWithWin('Archivists');
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

        // Record Statistics to Database
        const aliveParticipants = Array.from(this.players.values()).filter(p => !p.isBot);
        const winners = [];
        const losers = [];

        for (const p of aliveParticipants) {
            // Check win conditions based on faction and role
            let won = false;
            if (winner === 'Archivists' && p.role?.faction === 'Archivists') won = true;
            else if (winner === 'Revisions' && p.role?.faction === 'Revisions') won = true;
            else if (winner.includes(p.role?.name)) won = true;
            else if (p.won) won = true; // Special condition for The Critic etc.

            if (won) winners.push(p.id);
            else losers.push(p.id);
        }

        if (winners.length > 0) archiveService.recordMatchResults(winners, true);
        if (losers.length > 0) archiveService.recordMatchResults(losers, false);
        
        // Use Cinematic Game Over UI
        const { buildGameOverPayload } = require('./ArchiveUI');
        const gameOverMsg = buildGameOverPayload(this, winner);
        
        if (this.thread) {
            await this.thread.send(gameOverMsg);
            await this.thread.setLocked(false, 'Sanctuary session concluded.');
            
            try {
                const { buildEndedLobbyPayload } = require('./ArchiveUI');
                const lobbyMsg = await this.thread.parent.messages.fetch(this.lobbyMessageId);
                if (lobbyMsg) await lobbyMsg.edit(buildEndedLobbyPayload(this, winner));
            } catch (e) {
                console.error('Failed to update main lobby embed on game over', e);
            }
        }
        
        this.emit('gameEnded', this.threadId);
        
        // Auto-archive threads after 10 seconds
        setTimeout(async () => {
            try {
                if (this.thread && !this.thread.archived) {
                    await this.thread.setLocked(true);
                    await this.thread.setArchived(true);
                }
                if (this.archiveThreadId && this.thread) {
                    const secret = await this.thread.parent.threads.fetch(this.archiveThreadId).catch(()=>null);
                    if (secret && !secret.archived) await secret.setArchived(true);
                }
                if (this.graveyardThreadId && this.thread) {
                    const grave = await this.thread.parent.threads.fetch(this.graveyardThreadId).catch(()=>null);
                    if (grave && !grave.archived) await grave.setArchived(true);
                }
            } catch (e) {
                console.error('Failed to auto-archive threads:', e);
            }
        }, 10000);
    }

    async startNight() {
        if (this.isDestroyed) return;
        this.state = 'NIGHT';
        this.dayCount++;
        this.emit('stateChanged', 'NIGHT');
        
        // Clean up bot timers from previous phase
        for (const timer of this.botTimers) clearTimeout(timer);
        this.botTimers = [];
        
        for (const p of this.players.values()) { p.resetForNight(); }

        // Handle guilt deaths (from Ghostwriter killing an Archivist)
        // These are tracked and revealed in the morning report
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
            const endTime = Math.floor(Date.now() / 1000) + nightDuration;
            
            const whisper = NIGHT_WHISPERS[Math.floor(Math.random() * NIGHT_WHISPERS.length)];
            const baseEmbed = require('./ArchiveUI').baseEmbed; // Exported from ArchiveUI
            const embed = baseEmbed(`🌑 Night ${this.dayCount}`, 
                `*${whisper}*\n\n📝 **Check your DMs to perform your night actions.**`, 
                null
            )
                .setColor('#2c3e50')
                .setFooter({ text: `Night ends <t:${endTime}:R>` });

            await this.thread.send({ embeds: [embed] });
        }
        
        const alivePlayers = this.getAlivePlayers();
        const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        for (const p of alivePlayers) {
            if (p.isBot) continue;

            const components = [];
            
            // 1. Ability Select Menu (if they have one)
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
                        .setCustomId(`archive_night_target_${this.hostId}`) // Use stable hostId
                        .setPlaceholder(`${p.role.emoji} Select a target for: ${p.role.name}`)
                        .addOptions(optionsData.slice(0, 25));
                    components.push(new ActionRowBuilder().addComponents(dropdown));
                }
            }

            // 2. Last Will Button
            const willLabel = p.lastWill ? '✍️ Update Last Will' : '✍️ Write Last Will';
            const willRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`archive_will_${this.hostId}`) // Use stable hostId
                    .setLabel(willLabel)
                    .setStyle(ButtonStyle.Secondary)
            );
            components.push(willRow);

            try {
                const nightDuration = this.settings.nightTime || 60;
                const endTime = Math.floor(Date.now() / 1000) + nightDuration;
                const willStatus = p.lastWill ? `📜 Current will: *"${p.lastWill}"*` : `📜 You haven't written a last will yet.`;
                const roleInfo = p.role.priority !== 99 ? `**Your Role:** ${p.role.emoji} ${p.role.name}` : '';
                await p.user.send({ 
                    content: `🌑 **Night ${this.dayCount}** · Ends <t:${endTime}:R>\n${roleInfo}\n${willStatus}`, 
                    components 
                });
            } catch (e) {
                console.error(`Failed to DM player ${p.name}:`, e);
            }
        }
        
        // End night after configured duration
        this.activeTimer = setTimeout(() => {
            if (this.state !== 'GAME_OVER') this.endNight();
        }, this.settings.nightTime * 1000);
        
        this.emit('saveState');
    }

    async endNight() {
        const { deaths, readings } = resolveNightStack(this);
        
        // Merge guilt deaths into the morning report
        const guiltDeaths = (this.guiltDeaths || []).map(p => ({ target: p, source: null, isGuilt: true }));
        const allDeaths = [...guiltDeaths, ...deaths];
        
        for (const d of deaths) {
            this.moveToGraveyard(d.target.id);
        }
        
        if (this.thread) {
            const { buildMorningReport } = require('./ArchiveUI');
            const report = buildMorningReport(this, allDeaths);
            await this.thread.send(report);
            
            for (const r of readings) {
                const viewer = this.players.get(r.viewerId);
                if (viewer && !viewer.isBot) {
                    try { await viewer.user.send(r.message); } catch(e){}
                }
            }
        }
        
        if (this.checkWin()) return;
        this.startDay();
    }

    async startDay() {
        if (this.isDestroyed) return;
        this.state = 'DAY';
        this.emit('stateChanged', 'DAY');
        
        for (const p of this.players.values()) { p.resetForDay(); }

        if (this.thread) {
            await this.thread.setLocked(false, 'Day phase');
            const duration = this.settings.discussionTime || 120;
            const endTime = Math.floor(Date.now() / 1000) + duration;
            
            const epithet = DAY_EPITHETS[Math.floor(Math.random() * DAY_EPITHETS.length)];
            const { baseEmbed } = require('./ArchiveUI');
            const embed = baseEmbed(`🌅 ${epithet} (Day ${this.dayCount})`, 
                `*The sanctuary is restless. The world outside is dead, but the library must survive.*\n\n**Survivors Remaining:** ${this.getAlivePlayers().length}/${this.players.size}\n\n**Discussion Period:** Talk amongst yourselves. Humanity's last hope rests on your decisions.`, 
                null
            )
                .setColor('#f39c12')
                .setFooter({ text: `Discussion ends in ${duration}s` });

            const dayMsg = await this.thread.send({
                content: `🗣️ **Phase: Day ${this.dayCount} (Discussion)** | Ends <t:${endTime}:R>`,
                embeds: [embed]
            });
            this.dayMessageId = dayMsg.id;
            
            // Trigger Conversational Bots
            const { handleBotDaySpeech } = require('./ArchiveBots');
            handleBotDaySpeech(this);
        }
        
        // Schedule Voting Phase
        this.activeTimer = setTimeout(() => {
            if (this.state !== 'GAME_OVER') this.startVoting();
        }, (this.settings.discussionTime || 120) * 1000);
        
        this.emit('saveState');
    }

    async startVoting() {
        if (this.isDestroyed) return;
        this.state = 'VOTING';
        this.emit('stateChanged', 'VOTING');
        this.hubMessageId = null; // Reset current board ID for new block
        
        if (this.thread) {
            if (this.dayMessageId) {
                try {
                    const dayMsg = await this.thread.messages.fetch(this.dayMessageId).catch(()=>null);
                    if (dayMsg) {
                        const newContent = dayMsg.content.replace(/Ends <t:\d+:R>/, '**Ended**');
                        await dayMsg.edit({ content: newContent });
                    }
                } catch(e) {}
            }
            
            // Keep thread unlocked so players can discuss while voting
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
                    new ButtonBuilder().setCustomId(`archive_vote_${this.hostId}_${p.id}`).setLabel(p.name).setStyle(ButtonStyle.Secondary)
                );
            }
            if (currentRow.components.length === 5) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }
            currentRow.addComponents(
                new ButtonBuilder().setCustomId(`archive_vote_${this.hostId}_skip`).setLabel('⏭️ Skip Vote').setStyle(ButtonStyle.Danger)
            );
            rows.push(currentRow);
            
            const endTime = Math.floor(Date.now() / 1000) + (this.settings.votingTime || 60);
            
            let flavorText = "";
            const mayor = alivePlayers.find(p => p.role?.name === 'The Plurality');
            if (mayor) flavorText = `\n👑 **The Plurality** is active. Their vote carries the weight of two.`;

            const boardMsg = await this.thread.send({
                content: `🗣️ **Phase: Voting** | Ends <t:${endTime}:R>\n**Survivors Remaining:** ${alivePlayers.length}/${this.players.size}\n\nThe floor is open. Cast your ballots by selecting a name below:${flavorText}\n\n**Current Tallies:**\n*No votes cast yet.*`,
                components: rows
            });
            this.hubMessageId = boardMsg.id;
        }
        
        this.activeTimer = setTimeout(() => {
            if (this.state !== 'GAME_OVER') this.endDay();
        }, (this.settings.votingTime || 60) * 1000);
        
        this.emit('saveState');
    }

    async updateVotingBoard(isFinal = false) {
        if (!this.thread || !this.hubMessageId || (this.state !== 'VOTING' && !isFinal)) return;

        const tallies = {};
        const voters = {};
        for (const p of this.players.values()) {
            if (p.alive && p.voteTarget) {
                // Ink-Bound Rule: Scribes cannot vote for their analyzed suspect
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
            const board = await this.thread.messages.fetch(this.hubMessageId);
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
        if (this.state !== 'VOTING') return;

        const { handleBotDayVoting } = require('./ArchiveBots');
        handleBotDayVoting(this);
        
        this.state = 'TWILIGHT';
        this.emit('stateChanged', 'TWILIGHT');
        
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
                    p.missedVotes = 0; // Reset on valid vote
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
                // Ink-Bound Rule: Scribes cannot vote for their analyzed suspect
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
            
            if (tied.length === 0) {
                await this.thread.send('⚖️ **The town was completely silent.** No votes were cast today.');
                this.activeTimer = setTimeout(() => {
                    if (this.state !== 'GAME_OVER') this.startNight();
                }, 10000);
            } else if (tied.length > 1) {
                await this.thread.send('⚖️ **The town could not reach a consensus.** The execution vote ended in a tie. No one is exiled today.');
                this.activeTimer = setTimeout(() => {
                    if (this.state !== 'GAME_OVER') this.startNight();
                }, 10000);
            } else if (maxVotes < minVotesRequired) {
                await this.thread.send(`⚖️ **Insufficient Support.** Only ${maxVotes} ${maxVotes === 1 ? 'vote was' : 'votes were'} cast for the leading decision. A minimum of ${minVotesRequired} is required to exile someone. No one is exiled today.`);
                this.activeTimer = setTimeout(() => {
                    if (this.state !== 'GAME_OVER') this.startNight();
                }, 10000);
            } else if (tied.length === 1) {
                if (tied[0] === 'skip') {
                    await this.thread.send('⚖️ **The sanctuary chose to skip the execution.** No one is exiled today.');
                    this.activeTimer = setTimeout(() => {
                        if (this.state !== 'GAME_OVER') this.startNight();
                    }, 10000);
                    return;
                }
                const exiled = this.players.get(tied[0]);
                if (exiled) {
                    exiled.die();
                    exiled.deathDay = this.dayCount;
                    this.moveToGraveyard(exiled.id);
                } else {
                    await this.thread.send('⚖️ **The Archive shifted unexpectedly.** The intended target has vanished from the records.');
                    this.activeTimer = setTimeout(() => {
                        if (this.state !== 'GAME_OVER') this.startNight();
                    }, 10000);
                    return;
                }
                let lore = EXILE_LORE[Math.floor(Math.random() * EXILE_LORE.length)].replace('{name}', exiled.name);
                
                const roleReveal = this.settings.revealRoles ? `${exiled.role?.emoji} **${exiled.role?.name}** (${exiled.role?.faction})` : '🔒 **Classified**';
                lore += `\n\n**Role:** ${roleReveal}`;
                
                // Track critics
                const wonCritics = this.getAlivePlayers().filter(p => p.role?.name === 'The Critic' && p.criticTarget === exiled.id);
                for (const c of wonCritics) {
                    c.won = true;
                    lore += `\n\n🎯 **Wait... The Critic engineered this.** ${c.name} has flawlessly executed their target!`;
                }

                if (exiled.role?.name === 'The Anomaly') {
                    lore += `\n\n🃏 **Wait... The Anomaly wanted this.** The Anomaly has won the game!`;
                    await this.thread.send(`⚖️ **The town has spoken.**\n\n${lore}`);
                    this.endGameWithWin('Unbound (The Anomaly)');
                    return;
                }
                
                if (exiled.lastWill) lore += `\n\n📜 **Last Will:** "*${exiled.lastWill}*"`;
                
                await this.thread.send(`⚖️ **The town has spoken.**\n\n${lore}`);
                if (this.checkWin()) return;
                this.triggerTwilight();
            } else {
                const tiedNames = tied.map(id => id === 'skip' ? 'Skip Vote' : this.players.get(id)?.name || 'Unknown').join(' and ');
                await this.thread.send(`⚖️ **A tie has occurred between ${tiedNames}.** The execution is cancelled.`);
                this.activeTimer = setTimeout(() => {
                    if (this.state !== 'GAME_OVER') this.startNight();
                }, 10000);
            }
        } else {
            this.startNight();
        }
    }

    async triggerTwilight() {
        if (!this.thread) {
            this.startNight();
            return;
        }
        
        const { baseEmbed } = require('./ArchiveUI');
        const embed = baseEmbed('🌆 Twilight: Pressure in the Archives', 
            '**The sanctuary is under immense pressure.** You have **10 seconds** to react before the library seals for the night.', 
            null
        )
            .setColor('#8e44ad');
        
        await this.thread.send({ embeds: [embed] });
        
        this.activeTimer = setTimeout(async () => {
            if (this.state === 'GAME_OVER' || this.isDestroyed) return;
            if (this.thread) await this.thread.setLocked(true, 'End Twilight');
            this.startNight();
        }, 10000);
        
        this.emit('saveState');
    }

    async moveToGraveyard(playerId) {
        if (!this.graveyardThreadId || !this.thread) return;
        try {
            const graveyard = await this.thread.parent.threads.fetch(this.graveyardThreadId).catch(()=>null);
            if (graveyard) {
                const p = this.players.get(playerId);
                if (p && !p.isBot) {
                    await graveyard.members.add(playerId);
                    
                    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`archive_graveL_${this.hostId}`).setLabel('🧍 View Living Roster').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId(`archive_graveD_${this.hostId}`).setLabel('💀 View Casualties & Roles').setStyle(ButtonStyle.Secondary)
                    );

                    await graveyard.send({ content: `👻 <@${p.id}> has joined the Deleted Records.`, components: [row] });
                }
            }
        } catch (e) {
            console.error('Failed to move player to graveyard', e);
        }
    }

    toJSON() {
        return {
            lobbyMessageId: this.lobbyMessageId,
            hostId: this.hostId,
            channelId: this.channelId,
            threadId: this.threadId,
            settings: this.settings,
            state: this.state,
            dayCount: this.dayCount,
            players: Array.from(this.players.values()).map(p => ({
                id: p.id, name: p.name, isBot: p.isBot, alive: p.alive,
                roleObject: p.role?.constructor.name,
                nightActionTarget: p.nightActionTarget,
                voteTarget: p.voteTarget,
                isRoleblocked: p.isRoleblocked,
                isProtected: p.isProtected,
                inkBoundTarget: p.inkBoundTarget,
                criticTarget: p.criticTarget,
                isDoused: p.isDoused,
                guilt: p.guilt,
                won: p.won,
                factionOverride: p.role?.faction,
                lastWill: p.lastWill,
                deathDay: p.deathDay,
                requiresConfirmation: p.requiresConfirmation,
                isConfirmed: p.isConfirmed
            })),
            visitHistory: this.visitHistory,
            archiveThreadId: this.archiveThreadId,
            graveyardThreadId: this.graveyardThreadId
        };
    }

    fromJSON(data) {
        this.channelId = data.channelId || null;
        this.threadId = data.threadId;
        this.settings = data.settings;
        this.state = data.state;
        this.dayCount = data.dayCount;
        
        const Player = require('./ArchivePlayer');
        const rolesList = require('./ArchiveRoles');
        
        this.players.clear();
        for (const pData of data.players) {
            const p = new Player({ id: pData.id, username: pData.name }, pData.isBot);
            p.alive = pData.alive;
            p.nightActionTarget = pData.nightActionTarget;
            p.voteTarget = pData.voteTarget;
            p.isRoleblocked = pData.isRoleblocked;
            p.isProtected = pData.isProtected;
            
            p.inkBoundTarget = pData.inkBoundTarget;
            p.criticTarget = pData.criticTarget;
            p.isDoused = pData.isDoused;
            p.guilt = pData.guilt;
            p.won = pData.won;
            p.lastWill = pData.lastWill;
            p.deathDay = pData.deathDay || null;
            p.requiresConfirmation = pData.requiresConfirmation || false;
            p.isConfirmed = pData.isConfirmed || false;
            
            if (pData.roleObject && rolesList[pData.roleObject]) {
                const RoleClass = rolesList[pData.roleObject];
                p.assignRole(new RoleClass(p)); 
                if (pData.factionOverride) p.role.faction = pData.factionOverride;
            }
            this.players.set(p.id, p);
        }
        this.visitHistory = data.visitHistory || [];
        this.archiveThreadId = data.archiveThreadId || null;
        this.graveyardThreadId = data.graveyardThreadId || null;
    }
    
    resumePhase() {
        if (this.state === 'GAME_OVER' || this.state === 'LOBBY') return;
        
        if (this.state === 'PROLOGUE') this.activeTimer = setTimeout(() => this.startNight(), this.settings.prologueTime * 1000);
        else if (this.state === 'NIGHT') this.activeTimer = setTimeout(() => this.endNight(), this.settings.nightTime * 1000);
        else if (this.state === 'DAY') this.activeTimer = setTimeout(() => this.startVoting(), this.settings.discussionTime * 1000);
        else if (this.state === 'VOTING') this.activeTimer = setTimeout(() => this.endDay(), this.settings.votingTime * 1000);
        else if (this.state === 'TWILIGHT') this.activeTimer = setTimeout(() => this.startNight(), 10000);
    }
}

module.exports = ArchiveGame;
