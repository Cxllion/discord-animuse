const logger = require('../core/logger');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Lore = require('./MafiaLore');

const DAY_EPITHETS = [
    "Echoes of the Past", "Terminal Sunlight", "Broken Dawn", 
    "Data Convergence", "The Scribe's Awakening", "Digital Morning"
];

/**
 * MafiaPhases: Logic for game phase transitions and win conditions.
 */
class MafiaPhases {
    static async startDay(game) {
        if (game.isDestroyed || game.state === 'GAME_OVER') return;
        
        await game.cleanupPhaseMessage();
        game.state = 'DAY';
        game.dayCount++;
        game.emit('stateChanged', 'DAY');

        if (game.thread) {
            await game.thread.setLocked(false, 'Day phase');
            const duration = game.settings.discussionTime || 120;
            game.phaseEndTime = Date.now() + (duration * 1000);
            const endTime = Math.floor(game.phaseEndTime / 1000);
            
            const epithet = DAY_EPITHETS[Math.floor(Math.random() * DAY_EPITHETS.length)];
            const { baseEmbed } = require('./MafiaUI');
            const embed = baseEmbed(`🌅 ${epithet} (Day ${game.dayCount})`, 
                `*The sanctuary is restless. The world outside is dead, but the library must survive.*\n\n**Survivors Remaining:** ${game.getAlivePlayers().length}/${game.players.size}\n\n**Discussion Period:** Talk amongst yourselves. Humanity's last hope rests on your decisions.`, 
                null
            ).setColor(Lore.COLORS.DAY).setImage(Lore.BANNERS.DAY);

            const dayMsg = await game.thread.send({
                content: `🗣️ **Phase: Day ${game.dayCount} (Discussion)** | Ends <t:${endTime}:R>`,
                embeds: [embed],
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`mafia_roster_view_${game.hostId}`).setLabel('📖 View Roster').setStyle(ButtonStyle.Secondary)
                )]
            });
            game.activePhaseMessageId = dayMsg.id;
            
            const { handleBotDaySpeech } = require('./MafiaBots');
            const timers = await handleBotDaySpeech(game);
            if (timers && Array.isArray(timers)) {
                game.botTimers.push(...timers);
            }

            // DM Refresh (Terminal Sync)
            const { buildDayHUD } = require('./MafiaUI');
            for (const p of game.getAlivePlayers()) {
                if (p.isBot) continue;
                const hud = buildDayHUD(p, game);
                await game.refreshControlPanel(p, hud.content, hud.components);
            }
        }
        
        game.activeTimer = setTimeout(() => {
            if (game.state !== 'GAME_OVER') game.startVoting();
        }, (game.settings.discussionTime || 120) * 1000);
        
        game.emit('saveState');
    }

    static async startVoting(game) {
        if (game.isDestroyed || game.state === 'GAME_OVER') return;
        await game.cleanupPhaseMessage();
        game.state = 'VOTING';
        game.emit('stateChanged', 'VOTING');
        
        if (game.thread) {
            const alivePlayers = game.getAlivePlayers();
            let rows = [];
            let currentRow = new ActionRowBuilder();
            
            for (const p of alivePlayers) {
                if (currentRow.components.length === 5) {
                    rows.push(currentRow);
                    currentRow = new ActionRowBuilder();
                }
                currentRow.addComponents(
                    new ButtonBuilder().setCustomId(`mafia_vote_${game.hostId}_${p.id}`).setLabel(p.name).setStyle(ButtonStyle.Secondary)
                );
            }
            if (currentRow.components.length < 5) {
                currentRow.addComponents(new ButtonBuilder().setCustomId(`mafia_vote_${game.hostId}_skip`).setLabel('⏭️ Skip Vote').setStyle(ButtonStyle.Danger));
                rows.push(currentRow);
            } else {
                rows.push(currentRow);
                rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`mafia_vote_${game.hostId}_skip`).setLabel('⏭️ Skip Vote').setStyle(ButtonStyle.Danger)));
            }
            
            const duration = game.settings.votingTime || 60;
            game.phaseEndTime = Date.now() + (duration * 1000);
            const endTime = Math.floor(game.phaseEndTime / 1000);
            
            let flavorText = "";
            const mayor = alivePlayers.find(p => p.role?.name === 'The Plurality');
            if (mayor) flavorText = `\n👑 **The Plurality** is active. Their vote carries the weight of two.`;

            const votingMsg = await game.thread.send({
                content: `🗳️ **Phase: Voting** | Ends <t:${endTime}:R>\n**Survivors Remaining:** ${alivePlayers.length}/${game.players.size}\n\nThe floor is open. Cast your ballots by selecting a name below:${flavorText}\n\n**Current Tallies:**\n*No votes cast yet.*`,
                components: [
                    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`mafia_roster_view_${game.hostId}`).setLabel('📖 View Roster').setStyle(ButtonStyle.Secondary)),
                    ...rows
                ]
            });
            game.activePhaseMessageId = votingMsg.id;
        }

        // --- BOT VOTING ---
        const { handleBotDayVoting } = require('./MafiaBots');
        const aliveBots = game.getAlivePlayers().filter(p => p.isBot);
        for (const bot of aliveBots) {
            const delay = Math.random() * (game.settings.votingTime - 5) * 1000;
            const timer = setTimeout(async () => {
                if (game.state === 'VOTING' && bot.alive && !game.isDestroyed) {
                    handleBotDayVoting(game, bot);
                    await game.updateVotingBoard().catch(() => null);
                }
            }, delay);
            game.botTimers.push(timer);
        }

        game.activeTimer = setTimeout(() => {
            if (game.state !== 'GAME_OVER') game.endDay();
        }, (game.settings.votingTime || 60) * 1000);
        
        game.emit('saveState');
    }

    static async endDay(game) {
        if (game.isDestroyed || game.state !== 'VOTING') return;

        const { handleBotDayVoting } = require('./MafiaBots');
        handleBotDayVoting(game);
        
        game.state = 'TWILIGHT';
        game.emit('stateChanged', 'TWILIGHT');
        
        await game.cleanupPhaseMessage();
        await game.updateVotingBoard(true);
        
        let afkErased = [];
        let afkWarned = [];
        for (const p of game.getAlivePlayers()) {
            if (!p.isBot) {
                if (!p.voteTarget) {
                    p.missedVotes = (p.missedVotes || 0) + 1;
                    if (p.missedVotes >= 2) {
                        p.die();
                        p.deathDay = game.dayCount;
                        afkErased.push(p);
                        game.moveToGraveyard(p.id);
                        const MafiaVoice = require('./MafiaVoice');
                        await MafiaVoice.updateStates(game);
                        
                        if (game.checkWin()) return;

                    await game.cleanupControlPanel(exiled);
                    } else {
                        afkWarned.push(p);
                    }
                } else {
                    p.missedVotes = 0; 
                }
            }
        }
        
        if (game.thread) {
            if (afkErased.length > 0) {
                const afkNames = afkErased.map(p => p.name).join(', ');
                await game.thread.send(`⚠️ **System Purge:** ${afkNames} ${afkErased.length === 1 ? 'was' : 'were'} erased due to biometric inactivity.`);
            }
            if (afkWarned.length > 0) {
                const pings = afkWarned.map(p => `<@${p.id}>`).join(' ');
                await game.thread.send(`⚠️ **Biometric Instability:** ${pings}, you have missed a vote. This is your **last chance**. If you miss the next update, you will be **redacted**.`);
            }
        }
        
        const tallies = {};
        for (const p of game.players.values()) {
            if (p.alive && p.voteTarget) {
                const weight = (p.role?.name === 'The Head Curator' || p.role?.name === 'The Plurality') ? 2 : 1;
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
        
        if (game.thread) {
            let hasExile = tied.length === 1 && tied[0] !== 'skip';
            let exiled = null;
            if (hasExile) exiled = game.players.get(tied[0]);

            if (hasExile && exiled) {
                await game.thread.send(`⚖️ **Consensus Reached.** The sanctuary has decided to execute **${exiled.name}**. You have 5 seconds for final words.`);
                await new Promise(r => setTimeout(r, 5000));
            } else if (tied.length === 1 && tied[0] === 'skip') {
                await game.thread.send(`⚖️ **Consensus Reached.** The sanctuary decided to skip the execution today. Gathering final thoughts...`);
                await new Promise(r => setTimeout(r, 5000));
            } else {
                const reason = tied.length === 0 ? 'The town was completely silent.' : 'The town could not reach a consensus.';
                await game.thread.send(`⚖️ **Voting Failed:** ${reason} Gathering final thoughts...`);
                await new Promise(r => setTimeout(r, 5000));
            }

            await game.thread.setLocked(true, 'Voting ended');
            
            if (!hasExile) {
                // Was skip or tie
                const msg = (tied.length === 1 && tied[0] === 'skip') ? 'The sanctuary skipped the execution. No one is exiled today.' : 'No consensus was reached. No one is exiled today.';
                await game.thread.send(`> ${msg}\n\nThe simulation continues... Night protocol initiating...`);
                game.activeTimer = setTimeout(() => {
                    if (game.state !== 'GAME_OVER') game.startNight();
                }, 5000); // reduced timeout because they already waited 5s
            } else {
                // Process Exile
                if (exiled) {
                    const MafiaVoice = require('./MafiaVoice');
                    await MafiaVoice.updateStates(game, 'TWILIGHT', exiled.id);

                    const roleStr = game.settings.revealRoles && exiled.role ? exiled.role.name : "REDACTED";
                    const lore = Lore.STORY.EXILE_TEXT[Math.floor(Math.random() * Lore.STORY.EXILE_TEXT.length)].replace('{name}', exiled.name);
                    
                    await game.thread.send(`> ${lore}\n> **Revealed Identity:** \`${roleStr}\``);

                    exiled.die();
                    exiled.deathDay = game.dayCount;
                    
                    await game.cleanupControlPanel(exiled);

                    if (game.checkWin()) return;

                    await game.thread.send(`The simulation continues... Night protocol initiating...`);

                    game.activeTimer = setTimeout(async () => {
                        await MafiaVoice.updateStates(game);
                        game.moveToGraveyard(exiled.id);
                        if (game.state !== 'GAME_OVER') game.startNight();
                    }, 5000); // reduced timeout as well
                }
            }
        }
        game.emit('saveState');
    }

    static async startNight(game) {
        if (game.isDestroyed || game.state === 'GAME_OVER') return;
        
        await game.cleanupPhaseMessage();
        game.state = 'NIGHT';
        game.emit('stateChanged', 'NIGHT');

        // Clear all targets
        for (const p of game.players.values()) {
            p.voteTarget = null;
            p.nightActionTarget = null;
        }

        const MafiaVoice = require('./MafiaVoice');
        await MafiaVoice.updateStates(game, 'NIGHT');

        if (game.thread) {
            await game.thread.setLocked(true, 'Night phase');
            const duration = game.settings.nightTime || 60;
            game.phaseEndTime = Date.now() + (duration * 1000);
            
            const nightEmbed = baseEmbed(`🌑 The Long Night (Cycle ${game.dayCount})`, 
                `*Static hisses through the vents. The Infection moves in the shadows while the Archivists dream of sunlight.*\n\n**Protocol:** Night-active roles, check your private terminals for instructions.`, 
                null
            ).setColor(Lore.COLORS.NIGHT).setImage(Lore.BANNERS.NIGHT);

            const nightMsg = await game.thread.send({
                content: `🌙 **Phase: Night ${game.dayCount}** | Ends <t:${Math.floor(game.phaseEndTime / 1000)}:R>`,
                embeds: [nightEmbed],
                components: [new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`mafia_roster_view_${game.hostId}`).setLabel('📖 View Roster').setStyle(ButtonStyle.Secondary)
                )]
            });
            game.activePhaseMessageId = nightMsg.id;
        }

        // Notify Night roles (Terminal Sync)
        const { buildNightHUD } = require('./MafiaUI');
        for (const p of game.getAlivePlayers()) {
            if (p.isBot) continue;
            const hud = buildNightHUD(p, game);
            await game.refreshControlPanel(p, hud.content, hud.components);
        }

        game.activeTimer = setTimeout(() => {
            if (game.state !== 'GAME_OVER') game.endNight();
        }, (game.settings.nightTime || 60) * 1000);
        
        game.emit('saveState');
    }
    static async endNight(game) {
        if (game.isDestroyed || game.state === 'GAME_OVER') return;
        await game.cleanupPhaseMessage();
        
        const { resolveNightStack } = require('./MafiaStack');
        const { deaths, readings, diagnosticLog } = await resolveNightStack(game);

        if (game.graveyardThreadId && diagnosticLog.length > 0) {
            try {
                const grave = await game.thread.parent.threads.fetch(game.graveyardThreadId).catch(() => null);
                if (grave) {
                    await grave.send(`🔍 **Security Diagnostic: Night ${game.dayCount}**\n${diagnosticLog.map(l => `> ${l}`).join('\n')}`);
                }
            } catch (e) {}
        }
        
        const guiltDeaths = (game.guiltDeaths || []).map(p => ({ target: p, source: null, isGuilt: true }));
        const allDeaths = [...guiltDeaths, ...deaths];
        
        for (const d of allDeaths) {
            game.moveToGraveyard(d.target.id);
            await game.cleanupControlPanel(d.target);
        }
        
        game.emit('nightEnded', { deaths, readings });
        const MafiaVoice = require('./MafiaVoice');
        await MafiaVoice.updateStates(game);

        if (game.thread) {
            const { buildMorningReport } = require('./MafiaUI');
            const report = buildMorningReport(game, allDeaths);
            await game.thread.send(report);
            
            for (const r of readings) {
                const viewer = game.players.get(r.viewerId);
                if (viewer && !viewer.isBot) {
                    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                    const willRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`mafia_will_${game.hostId}`).setLabel('✍️ Update Last Will').setStyle(ButtonStyle.Secondary)
                    );
                    await game.refreshControlPanel(viewer, r.message, [willRow], true);
                }
            }
        }
        
        if (game.checkWin()) return;
        await MafiaVoice.updateStates(game);
        game.startDay();
    }

    static checkWin(game) {
        if (game.state === 'GAME_OVER') return true;
        const alive = game.getAlivePlayers();
        
        const revisions = alive.filter(p => p.role && p.role.faction === 'Revisions').length;
        const archivists = alive.filter(p => !p.role || p.role.faction === 'Archivists').length;
        const unbound = alive.filter(p => p.role && p.role.faction === 'Unbound').length;
        const bookburners = alive.filter(p => p.role?.name === 'The Bookburner');

        // Bookburner win condition (Solo/Last remaining)
        if (bookburners.length > 0 && bookburners.length === alive.length) {
            game.endGameWithWin('Unbound (The Bookburner)');
            return true;
        }

        // Revisions win condition (Majority/Equality)
        if (revisions > 0 && revisions >= (archivists + unbound)) {
            game.endGameWithWin('Revisions');
            return true;
        }

        // Mutual Destruction
        if (alive.length === 0) {
            game.endGameWithWin('Draw');
            return true;
        }

        // Archivists win condition (No Revisions/Bookburners left)
        if (revisions === 0) {
            if (bookburners.length === 0) {
                game.endGameWithWin('Archivists');
                return true;
            } else if (bookburners.length === 1 && alive.length <= 2) {
                // Bookburner wins 1v1 vs town
                game.endGameWithWin('Unbound (The Bookburner)');
                return true;
            }
        }
        
        return false;
    }
}

module.exports = MafiaPhases;
