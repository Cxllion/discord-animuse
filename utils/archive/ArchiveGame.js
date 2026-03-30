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
        this.threadId = null; 
        this.thread = null; // Direct reference to the Discord ThreadChannel

        // Settings defaults
        this.settings = {
            discussionTime: 120, // seconds
            votingTime: 60, // seconds
            gameMode: 'First Edition'
        };

        // Players collection: userId -> Player
        this.players = new Map();

        // Auto-add the host
        this.addPlayer(hostUser);
        
        // Game State
        this.state = 'LOBBY'; // LOBBY, PROLOGUE, NIGHT, DAY, STAND, GAME_OVER
        this.dayCount = 0;
        this.activeTimer = null;
        this.hubMessageId = null;
        this.visitHistory = []; // { night, sourceId, targetId }
        this.botTimers = []; // Track bot setTimeouts for cleanup
        this.isDestroyed = false;
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
            this.emit('saveState');
            return player;
        }
        return null; // Already joined
    }

    removePlayer(userId) {
        if (this.players.has(userId)) {
            this.players.delete(userId);
            this.emit('saveState');
            return true;
        }
        return false;
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
            // Attempt to start a thread from the interaction message
            thread = await interaction.message.startThread({
                name: `📚 Final Library | Session #${this.lobbyMessageId.slice(-4)}`,
                autoArchiveDuration: 60,
                reason: 'Started a Sanctuary Session',
            });
        } catch (e) {
            console.error('Thread attachment failed, creating a new thread instead:', e);
            // Fallback: Create a standalone thread in the same channel
            thread = await interaction.channel.threads.create({
                autoArchiveDuration: 60,
                reason: 'Started a game of Mafia',
            });
        }
        
        this.threadId = thread.id;
        this.thread = thread;
        this.emit('gameStarted', { lobbyId: this.lobbyMessageId, threadId: thread.id });

        // Add real players to the thread
        for (const [userId, player] of this.players.entries()) {
            if (!player.isBot) {
                try { await thread.members.add(userId); } catch (e) {}
            }
        }

        // Lock thread (if we want them silent during setup)
        await thread.setLocked(true, 'Setup phase');
        
        // Build dynamic role mapping for initial post
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
        
        // Generate mathematically balanced roles depending on mode and player count
        const { generateRolesForMode } = require('./ArchiveModes');
        const availableRoles = generateRolesForMode(this.settings.gameMode, this.players.size);
        
        let i = 0;
        for (const p of this.players.values()) {
            if (i < availableRoles.length) {    
                p.assignRole(availableRoles[i]);
            }
            i++;
        }
        
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
        
        // Send actual DMs to human players
        for (const p of this.players.values()) {
            if (!p.isBot && p.role) {
                try {
                    const header = p.role.faction === 'Revisions' ? '🩸 **The Corrupted Page (Revision)**' : '📜 **The Final Library (Archivist)**';
                    let dmStr = `${header}\n\nYou are **${p.role.emoji} ${p.role.name}** (${p.role.faction}).\n*${p.role.description}*`;
                    if (p.role.name === 'The Critic') {
                        const tgt = this.players.get(p.criticTarget);
                        dmStr += `\n\n🎯 **Your Target:** You must subtly manipulate the town into voting out **${tgt?.name}** during the Day phase.`;
                    }
                    await p.user.send(dmStr);
                } catch (e) {
                    console.log(`[WARN] Could not DM player ${p.name}`);
                }
            }
        }
        
        // Start Night Loop
        this.activeTimer = setTimeout(async () => {
            if (this.state === 'GAME_OVER') return;
            
            // Create Revision Secret Thread if needed
            const revisions = Array.from(this.players.values()).filter(p => p.role?.faction === 'Revisions' && !p.isBot);
            if (revisions.length > 1) { // Only if more than 1 human archive
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
                    await archiveThread.send(`🌑 **Revisions, coordinate your strategy here.** Only your faction can see this thread.\nCurrently active: ${revisions.map(p => `<@${p.id}>`).join(', ')}`);
                } catch (e) { console.error('Failed to create archive thread', e); }
            }
            
            this.startNight();
        }, 15000);
        
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
        
        const colors = {
            'Archivists': '#3498db',
            'Revisions': '#e74c3c',
            'Unbound (The Bookburner)': '#e67e22',
            'Unbound (The Anomaly)': '#9b59b6'
        };

        const embed = new EmbedBuilder()
            .setTitle('🏆 The Game Has Ended!')
            .setColor(colors[winner] || '#f1c40f')
            .setDescription(`**Winner:** ${winner}\n\n**Final Survivor Roster:**\n`);
            
        let rosterStr = '';
        for (const p of this.getAlivePlayers()) {
            rosterStr += `- ${p.role?.emoji || '👤'} ${p.name} (${p.role?.name || 'Unknown'})\n`;
        }
        if (rosterStr) embed.setDescription(`**Winner:** ${winner}\n\n**Survivor Roster:**\n${rosterStr}`);
        
        // Display victorious third-party roles
        const wonCritics = Array.from(this.players.values()).filter(p => p.won && p.role?.name === 'The Critic');
        if (wonCritics.length > 0) {
            embed.addFields({ name: 'Unbound Victories', value: wonCritics.map(c => `- ${c.name} (The Critic) successfully executed their target.`).join('\n') });
        }
        
        if (this.thread) {
            await this.thread.send({ embeds: [embed] });
            await this.thread.setLocked(false, 'Game Over - Post Game Chat');
        }
        
        this.emit('gameEnded', this.threadId);
        // We don't call destroy() immediately to allow post-game chat, but the manager will handle removal
    }

    async startNight() {
        if (this.isDestroyed) return;
        this.state = 'NIGHT';
        this.emit('stateChanged', 'NIGHT');
        
        for (const p of this.players.values()) { p.resetForNight(); }

        if (this.thread) {
            await this.thread.setLocked(true, 'Night phase');
            const endTime = Math.floor(Date.now() / 1000) + 60;
            
            const whisper = NIGHT_WHISPERS[Math.floor(Math.random() * NIGHT_WHISPERS.length)];
            const embed = new EmbedBuilder()
                .setTitle('🌑 Phase: Night Falling')
                .setColor('#2c3e50') // Midnight blue/grey
                .setDescription(`*${whisper}*\n\n📝 **Human players must check their DMs to perform actions.**`)
                .setFooter({ text: `Night ends in 60s` })
                .setTimestamp();

            await this.thread.send({
                content: `🌑 **Phase: Night** | Ends <t:${endTime}:R>`,
                embeds: [embed]
            });
        }
        
        const aliveActPool = this.getAlivePlayers();
        for (const p of aliveActPool) {
            if (p.guilt) {
                p.die();
                let deathMsg = `💀 **${p.name}** (The Ghostwriter) could not bear the guilt of erasing an innocent Archivist. They have tragically taken their own life.`;
                if (p.lastWill) deathMsg += `\n\n📜 **Last Will:** "*${p.lastWill}*"`;
                if (this.thread) await this.thread.send(deathMsg);
            }
        }
        
        const alivePlayers = this.getAlivePlayers();
        // DM human players with night actions and the Last Will button
        const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        for (const p of alivePlayers) {
            if (p.isBot) continue;

            const components = [];
            
            // 1. Ability Select Menu (if they have one)
            if (p.role && p.role.priority !== 99) {
                let optionsData = [];
                if (p.role.name === 'The Scribe') {
                    optionsData = Array.from(this.players.values()).filter(ap => !ap.alive).map(ap => ({ label: ap.name, value: ap.id }));
                } else if (p.role.name === 'The Bookburner') {
                    optionsData = alivePlayers.filter(ap => ap.id !== p.id).map(ap => ({ label: ap.name, value: ap.id }));
                    optionsData.unshift({ label: '🔥 Ignite All Doused', description: 'Erase everyone currently doused', value: 'ignite' });
                } else {
                    optionsData = alivePlayers.filter(ap => ap.id !== p.id).map(ap => ({ label: ap.name, value: ap.id }));
                }

                if (optionsData.length > 0) {
                    const dropdown = new StringSelectMenuBuilder()
                        .setCustomId(`archive_night_target_${this.lobbyMessageId}`)
                        .setPlaceholder('Select a target for your ability...')
                        .addOptions(optionsData.slice(0, 25));
                    components.push(new ActionRowBuilder().addComponents(dropdown));
                }
            }

            // 2. Last Will Button
            const willLabel = p.lastWill ? '✍️ Update Last Will' : '✍️ Write Last Will';
            const willRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`archive_will_${this.lobbyMessageId}`)
                    .setLabel(willLabel)
                    .setStyle(ButtonStyle.Secondary)
            );
            components.push(willRow);

            try {
                const endTime = Math.floor(Date.now() / 1000) + 60;
                const willStatus = p.lastWill ? `Current last will: *${p.lastWill}*` : `You haven't written a last will yet.`;
                await p.user.send({ 
                    content: `🌑 **Night ${this.dayCount} (Ends <t:${endTime}:R>)**\n${willStatus}`, 
                    components 
                });
            } catch (e) {
                console.error(`Failed to DM player ${p.name}:`, e);
            }
        }
        
        // End night after 60s
        this.activeTimer = setTimeout(() => {
            if (this.state !== 'GAME_OVER') this.endNight();
        }, 60000);
        
        this.emit('saveState');
    }

    async endNight() {
        const { deaths, readings } = resolveNightStack(this);
        
        if (this.thread) {
            if (deaths.length === 0) {
                await this.thread.send('🌅 **Morning arrives.** The safe-zone filters held. No one was lost to the Rot last night.');
            } else {
                let msg = '🌅 **Morning arrives. The air feels heavy with decay.**\n\n';
                for (const d of deaths) {
                    const lore = DEATH_LORE[Math.floor(Math.random() * DEATH_LORE.length)].replace('{name}', d.target.name);
                    msg += `💀 ${lore}\n`;
                    if (d.target.lastWill) msg += `📜 **Last Will:** "*${d.target.lastWill}*"\n\n`;
                    else msg += `\n`;
                }
                await this.thread.send(msg);
            }
            
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
        this.dayCount++;
        this.emit('stateChanged', 'DAY');
        
        for (const p of this.players.values()) { p.resetForDay(); }

        if (this.thread) {
            await this.thread.setLocked(false, 'Day phase');
            const duration = this.settings.discussionTime || 120;
            const endTime = Math.floor(Date.now() / 1000) + duration;
            
            const epithet = DAY_EPITHETS[Math.floor(Math.random() * DAY_EPITHETS.length)];
            const embed = new EmbedBuilder()
                .setTitle(`🌅 ${epithet} (Day ${this.dayCount})`)
                .setColor('#f39c12')
                .setDescription(`*The sanctuary is restless. The world outside is dead, but the library must survive.*\n\n**Discussion Period:** Talk amongst yourselves. Humanity's last hope rests on your decisions.`)
                .setFooter({ text: `Discussion ends in ${duration}s` })
                .setTimestamp();

            await this.thread.send({
                content: `🗣️ **Phase: Day ${this.dayCount} (Discussion)** | Ends <t:${endTime}:R>`,
                embeds: [embed]
            });
        }
        
        
        // Schedule Voting Phase instead of immediate End Day
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
            await this.thread.setLocked(true, 'Voting Phase');
            
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
                    new ButtonBuilder().setCustomId(`archive_vote_${this.lobbyMessageId}_${p.id}`).setLabel(p.name).setStyle(ButtonStyle.Secondary)
                );
            }
            if (currentRow.components.length > 0) rows.push(currentRow);
            
            const endTime = Math.floor(Date.now() / 1000) + (this.settings.votingTime || 60);
            
            let flavorText = "";
            const mayor = alivePlayers.find(p => p.role?.name === 'The Plurality');
            if (mayor) flavorText = `\n👑 **The Plurality** is active. Their vote carries the weight of two.`;

            const boardMsg = await this.thread.send({
                content: `🗣️ **Phase: Voting** | Ends <t:${endTime}:R>\n\nThe floor is open. Cast your ballots by selecting a name below:${flavorText}\n\n**Current Tallies:**\n*No votes cast yet.*`,
                components: rows
            });
            this.hubMessageId = boardMsg.id;
        }
        
        const { handleBotDayVoting } = require('./ArchiveBots');
        handleBotDayVoting(this);
        
        this.activeTimer = setTimeout(() => {
            if (this.state !== 'GAME_OVER') this.endDay();
        }, (this.settings.votingTime || 60) * 1000);
        
        this.emit('saveState');
    }

    async updateVotingBoard() {
        if (!this.thread || !this.hubMessageId || this.state !== 'VOTING') return;

        const tallies = {};
        const alivePlayers = this.getAlivePlayers();
        for (const p of this.players.values()) {
            if (p.alive && p.voteTarget) {
                const weight = p.role?.name === 'The Plurality' ? 2 : 1;
                tallies[p.voteTarget] = (tallies[p.voteTarget] || 0) + weight;
            }
        }

        let tallyStr = '';
        const sorted = Object.entries(tallies).sort((a, b) => b[1] - a[1]);
        for (const [id, count] of sorted) {
            const p = this.players.get(id);
            if (p) tallyStr += `- **${p.name}**: ${count} vote(s)\n`;
        }
        if (!tallyStr) tallyStr = '*No votes cast yet.*';

        try {
            const board = await this.thread.messages.fetch(this.hubMessageId);
            if (board) {
                const currentContent = board.content.split('**Current Tallies:**')[0];
                await board.edit({
                    content: `${currentContent}**Current Tallies:**\n${tallyStr}`
                });
            }
        } catch (e) {
            console.error('Failed to update voting board', e);
        }
    }

    async endDay() {
        if (this.state !== 'VOTING') return;
        this.state = 'TWILIGHT';
        this.emit('stateChanged', 'TWILIGHT');
        
        const tallies = {};
        for (const p of this.players.values()) {
            if (p.alive && p.voteTarget) {
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
        
        if (this.thread) {
            await this.thread.setLocked(true, 'Voting ended');
            
            if (tied.length === 0) {
                await this.thread.send('⚖️ **The town could not reach a consensus.** No one is exiled today.');
                this.activeTimer = setTimeout(() => {
                    if (this.state !== 'GAME_OVER') this.startNight();
                }, 10000);
            } else if (tied.length === 1) {
                const exiled = this.players.get(tied[0]);
                if (exiled) {
                    exiled.die();
                } else {
                    await this.thread.send('⚖️ **The Archive shifted unexpectedly.** The intended target has vanished from the records.');
                    this.activeTimer = setTimeout(() => {
                        if (this.state !== 'GAME_OVER') this.startNight();
                    }, 10000);
                    return;
                }
                let lore = EXILE_LORE[Math.floor(Math.random() * EXILE_LORE.length)].replace('{name}', exiled.name);
                
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
                await this.thread.send(`⚖️ **A tie has occurred between ${tied.map(id => this.players.get(id).name).join(' and ')}.** The execution is cancelled.`);
                this.activeTimer = setTimeout(() => {
                    if (this.state !== 'GAME_OVER') this.startNight();
                }, 10000);
            }
        } else {
            this.startNight();
        }
    }

    triggerTwilight() {
        if (!this.thread) {
            this.startNight();
            return;
        }
        
        this.thread.setLocked(false, 'Twilight Chaos');
        const embed = new EmbedBuilder()
            .setTitle('🌆 Phase: Twilight')
            .setColor('#8e44ad')
            .setDescription('**The sanctuary is under pressure.** You have **10 seconds** to react before the rot spreads further!');
        
        this.thread.send({ embeds: [embed] });
        
        this.activeTimer = setTimeout(async () => {
            if (this.state === 'GAME_OVER') return;
            await this.thread.setLocked(true, 'End Twilight');
            this.startNight();
        }, 10000);
        
        this.emit('saveState');
    }

    toJSON() {
        return {
            lobbyMessageId: this.lobbyMessageId,
            hostId: this.hostId,
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
                requiresConfirmation: p.requiresConfirmation,
                isConfirmed: p.isConfirmed
            })),
            visitHistory: this.visitHistory,
            archiveThreadId: this.archiveThreadId
        };
    }

    fromJSON(data) {
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
    }
    
    resumePhase() {
        if (this.state === 'GAME_OVER' || this.state === 'LOBBY') return;
        
        if (this.state === 'PROLOGUE') this.activeTimer = setTimeout(() => this.startNight(), 15000);
        else if (this.state === 'NIGHT') this.activeTimer = setTimeout(() => this.endNight(), 30000);
        else if (this.state === 'DAY') this.activeTimer = setTimeout(() => this.startVoting(), 30000);
        else if (this.state === 'VOTING') this.activeTimer = setTimeout(() => this.endDay(), 30000);
        else if (this.state === 'TWILIGHT') this.activeTimer = setTimeout(() => this.startNight(), 10000);
    }
}

module.exports = ArchiveGame;
