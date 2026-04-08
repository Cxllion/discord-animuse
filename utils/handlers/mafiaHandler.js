const MafiaManager = require('../mafia/MafiaManager');
const { MessageFlags } = require('discord.js');

const handleMafiaInteraction = async (interaction) => {
    // 1. EXTRACT LOBBY ID ROBUSTLY
    const parts = interaction.customId.split('_');
    let lobbyId = null;

    // The hostId is typically the first 17-20 digit numeric string in the ID
    // or follows a specific sequence.
    // Standard format: [prefix]_[action]_[hostId]_[optional_targetId]
    
    if (interaction.customId.includes('_vote_')) {
        // mafia_vote_123456789_target OR archive_vote_...
        lobbyId = parts[2];
    } else if (interaction.customId.includes('_night_target_')) {
        // mafia_night_target_123456789 OR archive_night_target_...
        lobbyId = parts[3];
    } else if (interaction.customId.startsWith('mafia_setphase_val_')) {
        lobbyId = parts[3];
    } else if (interaction.customId.startsWith('mafia_setphase_cat_')) {
        lobbyId = parts[3];
    } else if (parts[0] === 'mafia' || parts[0] === 'archive') {
        // Default: use the 3rd or 2nd part, but be careful with many parts
        // Find the first part that looks like a snowflake
        const found = parts.find(p => /^\d{17,20}$/.test(p));
        if (found) lobbyId = found;
        else lobbyId = parts[2] || parts[1];
    }

    // Double check that lobbyId looks like a Discord snowflake
    if (lobbyId && !/^\d{17,20}$/.test(lobbyId)) {
        // If not a snowflake, search all parts for one
        const found = parts.find(p => /^\d{17,20}$/.test(p));
        if (found) lobbyId = found;
    }
    
    // ═══════════════════════════════════════
    // GLOBAL INTERACTIONS (No Game Required)
    // ═══════════════════════════════════════
    
    // Survival Guide Select Menu
    if (interaction.customId === 'mafia_help_menu') {
        const page = interaction.values[0];
        try {
            return await interaction.update(require('../mafia/MafiaUI').buildSurvivalGuide(page));
        } catch (e) {
            console.error('Help menu update failed:', e);
            return;
        }
    }

    // Survival Guide General Button (Lobby)
    if (interaction.customId.startsWith('mafia_help_general_')) {
        const { buildSurvivalGuide } = require('../mafia/MafiaUI');
        return await interaction.reply(buildSurvivalGuide());
    }

    const game = MafiaManager.getGameByLobby(lobbyId) || MafiaManager.getGameByThread(interaction.channelId);

    if (!game) {
        return await interaction.reply({ 
            content: '❌ **Session Redacted.** This game session no longer exists or has expired. Use `/mafia host` to start a new one if the archives are clear.', 
            flags: MessageFlags.Ephemeral 
        });
    }

    // ═══════════════════════════════════════
    // BUTTONS
    // ═══════════════════════════════════════
    if (interaction.isButton()) {

        // Access Terminal (lobby button)
        if (interaction.customId.startsWith('mafia_access_')) {
            const { buildActionHub } = require('../mafia/MafiaUI');
            return interaction.reply(buildActionHub(game, interaction.user));
        }

        // Join Button (from Action Hub)
        if (interaction.customId.startsWith('mafia_join_')) {
            if (game.addPlayer(interaction.user)) {
                const { buildActionHub } = require('../mafia/MafiaUI');
                await interaction.update(buildActionHub(game, interaction.user));
                await game.bumpLobby(interaction.channel);
            } else {
                await interaction.reply({ content: 'You have already entered the sanctuary!', flags: MessageFlags.Ephemeral });
            }
            return;
        }

        // Leave Button (from Action Hub)
        if (interaction.customId.startsWith('mafia_leave_')) {
            if (game.removePlayer(interaction.user.id)) {
                const { buildActionHub } = require('../mafia/MafiaUI');
                await interaction.update(buildActionHub(game, interaction.user));
                await game.bumpLobby(interaction.channel);
            } else {
                await interaction.reply({ content: 'You are not in the lobby!', flags: MessageFlags.Ephemeral });
            }
            return;
        }


        // Back to Lobby (settings back button)
        if (interaction.customId.startsWith('mafia_lobby_back_')) {
            const { buildActionHub } = require('../mafia/MafiaUI');
            return interaction.update(buildActionHub(game, interaction.user));
        }

        // Toggle role reveal setting
        if (interaction.customId.startsWith('mafia_togglereveal_')) {
            if (interaction.user.id !== game.hostId) return interaction.reply({ content: 'Only the host can do this.', flags: MessageFlags.Ephemeral });
            game.settings.revealRoles = !game.settings.revealRoles;
            MafiaManager.hostPreferences.set(game.hostId, game.settings);
            MafiaManager.saveState();
            await interaction.update(require('../mafia/MafiaUI').buildSettingsPayload(game));
            try {
                const lobbyMsg = await interaction.channel.messages.fetch(game.lobbyMessageId);
                await lobbyMsg.edit(require('../mafia/MafiaUI').buildLobbyPayload(game));
            } catch(e) {}
            return;
        }

        // Queue for next game
        if (interaction.customId.startsWith('mafia_queuenext_')) {
            const channelId = (interaction.channel.parentId || interaction.channel.id);
            if (!MafiaManager.globalQueues.has(channelId)) {
                MafiaManager.globalQueues.set(channelId, new Set());
            }
            const queue = MafiaManager.globalQueues.get(channelId);
            
            if (queue.has(interaction.user.id)) {
                queue.delete(interaction.user.id);
                await interaction.update(require('../mafia/MafiaUI').buildStartedLobbyPayload(game));
                return interaction.followUp({ content: 'You have left the next-game queue.', flags: MessageFlags.Ephemeral });
            } else {
                queue.add(interaction.user.id);
                MafiaManager.saveState();
                await interaction.update(require('../mafia/MafiaUI').buildStartedLobbyPayload(game));
                return interaction.followUp({ content: '✅ You have joined the waitlist for the next session!', flags: MessageFlags.Ephemeral });
            }
        }

        // Waitlist confirmation ("I'm here")
        if (interaction.customId.startsWith('mafia_here_')) {
            const hereParts = interaction.customId.split('_');
            const hereLobbyId = hereParts[2];
            const userId = hereParts[3];
            
            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '❌ This beacon is not synchronized to your signature.', flags: MessageFlags.Ephemeral });
            }
            
            const targetGame = MafiaManager.getGameByLobby(hereLobbyId);
            if (!targetGame) return interaction.reply({ content: '❌ The sanctuary you are trying to enter has been lost.', flags: MessageFlags.Ephemeral });
            
            const p = targetGame.players.get(userId);
            if (p) {
                p.isConfirmed = true;
                await interaction.update({ content: `✅ **Synchronized:** <@${userId}> is here and ready.`, components: [] });
                
                try {
                    const lobbyMsg = await interaction.channel.messages.fetch(targetGame.lobbyMessageId);
                    const { buildLobbyPayload } = require('../mafia/MafiaUI');
                    await lobbyMsg.edit(buildLobbyPayload(targetGame));
                } catch(e) {}
            }
            return;
        }

        // Last Will button (from Night DM)
        if (interaction.customId.startsWith('mafia_will_')) {
            const p = game.players.get(interaction.user.id);
            if (!p) return interaction.reply({ content: 'You must join the game first.', flags: MessageFlags.Ephemeral });
            
            const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
            const modal = new ModalBuilder().setCustomId(`mafia_setwill_${lobbyId}`).setTitle('Compose Last Will');
            const input = new TextInputBuilder()
                .setCustomId('last_will_input')
                .setLabel('Your Final Message')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('If I die, trust Bot 2... or tell my story to the stars.')
                .setValue(p.lastWill || '')
                .setMaxLength(1000);
            
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        // Voting buttons
        if (interaction.customId.startsWith('mafia_vote_')) {
            const voteParts = interaction.customId.split('_');
            const targetPlayerId = voteParts.slice(3).join('_'); // Robustly join remaining parts in case targetId has underscores
            
            if (game.state !== 'VOTING') return interaction.reply({ content: 'Voting is currently closed.', flags: MessageFlags.Ephemeral });
            
            const p = game.players.get(interaction.user.id);
            if (!p || !p.alive) return interaction.reply({ content: 'The dead cannot vote.', flags: MessageFlags.Ephemeral });
            
            if (p.inkBoundTarget === targetPlayerId) {
                return interaction.reply({ content: '❌ You are Ink-Bound and cannot vote for this suspect today.', flags: MessageFlags.Ephemeral });
            }
            
            p.voteTarget = targetPlayerId;
            let targetName = 'Skip Vote';
            let response = `✅ You cast your vote to **Skip Vote**.`;
            
            if (targetPlayerId !== 'skip') {
                targetName = game.players.get(targetPlayerId)?.name || 'Unknown';
                response = `✅ You cast your vote for **${targetName}**.`;
                
                if (p.role && p.role.vote_feedback) {
                    const randomIdx = Math.floor(Math.random() * p.role.vote_feedback.length);
                    response = `✅ ` + p.role.vote_feedback[randomIdx].replace('{target}', targetName);
                }
            }
            
            await interaction.reply({ content: response, flags: MessageFlags.Ephemeral });
            return game.updateVotingBoard();
        }

        // Spectate button
        if (interaction.customId.startsWith('mafia_spectate_')) {
            if (!game.thread) return await interaction.reply({ content: 'Session not active yet.', flags: MessageFlags.Ephemeral });
            if (game.players.has(interaction.user.id)) return await interaction.reply({ content: 'You are already playing!', flags: MessageFlags.Ephemeral });
            
            try {
                await game.thread.members.add(interaction.user.id);
                
                // --- HOST NOTIFICATION ---
                try {
                    const host = await interaction.client.users.fetch(game.hostId);
                    if (host) {
                        await host.send(`👁️ **Spectator Alert:** <@${interaction.user.id}> has entered the archives of your session in **${interaction.guild.name}**.`);
                    }
                } catch(e) {}

                return await interaction.reply({ content: '👁️ You have entered the archives as a spectator.', flags: MessageFlags.Ephemeral });
            } catch (e) {
                return await interaction.reply({ content: 'Failed to add you as a spectator.', flags: MessageFlags.Ephemeral });
            }
        }

        // --- STAGNATION WATCHDOG ---

        if (interaction.customId.startsWith('mafia_stagnation_keep_')) {
            game.lastActivityAt = Date.now();
            game.stagnationNoticeSent = false;
            game.stagnationExpiresAt = null;
            return interaction.update({ content: '✅ **Sanctuary Maintained.** Protocol will continue monitoring for activity.', embeds: [], components: [] });
        }

        if (interaction.customId.startsWith('mafia_stagnation_disband_')) {
            MafiaManager.endGame(game.hostId);
            return interaction.update({ content: '🗑️ **Sanctuary Disbanded.** This session has been removed from the records.', embeds: [], components: [] });
        }
    }

    // ═══════════════════════════════════════
    // MODAL SUBMITS
    // ═══════════════════════════════════════
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('mafia_setwill_')) {
            const p = game.players.get(interaction.user.id);
            if (!p) return interaction.reply({ content: 'Player biometrics not found.', flags: MessageFlags.Ephemeral });
            p.lastWill = interaction.fields.getTextInputValue('last_will_input').slice(0, 1000);
            MafiaManager.saveState();
            return interaction.reply({ content: `✅ **Last Will Recorded.** It will be revealed upon your erasure.`, flags: MessageFlags.Ephemeral });
        }
        return;
    }

    // ═══════════════════════════════════════
    // SELECT MENUS
    // ═══════════════════════════════════════
    if (interaction.isStringSelectMenu()) {

        // Game Mode selector (settings)
        if (interaction.customId.startsWith('mafia_setmode_')) {
            if (interaction.user.id !== game.hostId) return interaction.reply({ content: 'Only the host can do this.', flags: MessageFlags.Ephemeral });
            game.settings.gameMode = interaction.values[0];
            MafiaManager.hostPreferences.set(game.hostId, game.settings);
            MafiaManager.saveState();
            await interaction.update(require('../mafia/MafiaUI').buildSettingsPayload(game));
            try {
                const lobbyMsg = await interaction.channel.messages.fetch(game.lobbyMessageId);
                await lobbyMsg.edit(require('../mafia/MafiaUI').buildLobbyPayload(game));
            } catch(e) {}
            return;
        }

        // Phase Category selector (settings step 1)
        if (interaction.customId.startsWith('mafia_setphase_cat_')) {
            if (interaction.user.id !== game.hostId) return interaction.reply({ content: 'Only the host can do this.', flags: MessageFlags.Ephemeral });
            const cat = interaction.values[0];
            return interaction.update(require('../mafia/MafiaUI').buildSettingsPayload(game, cat));
        }

        // Phase Duration selector (settings step 2)
        if (interaction.customId.startsWith('mafia_setphase_val_')) {
            if (interaction.user.id !== game.hostId) return interaction.reply({ content: 'Only the host can do this.', flags: MessageFlags.Ephemeral });
            
            const valParts = interaction.customId.split('_');
            const cat = valParts[4];
            const val = parseInt(interaction.values[0]);

            if (cat === 'discussion') game.settings.discussionTime = val;
            else if (cat === 'voting') game.settings.votingTime = val;
            else if (cat === 'night') game.settings.nightTime = val;
            else if (cat === 'prologue') game.settings.prologueTime = val;

            MafiaManager.hostPreferences.set(game.hostId, game.settings);
            MafiaManager.saveState();
            await interaction.update(require('../mafia/MafiaUI').buildSettingsPayload(game, cat));
            try {
                const lobbyMsg = await interaction.channel.messages.fetch(game.lobbyMessageId);
                await lobbyMsg.edit(require('../mafia/MafiaUI').buildLobbyPayload(game));
            } catch(e) {}
            return;
        }
        
        // Night ability target selector (DM)
        if (interaction.customId.startsWith('mafia_night_target_')) {
            if (game.state !== 'NIGHT') return interaction.update({ content: 'The night has passed.', components: [] });
            const p = game.players.get(interaction.user.id);
            const targetId = interaction.values[0];
            if (p && p.alive) {
                p.nightActionTarget = targetId;
                const targetName = game.players.get(targetId)?.name || 'Unknown';
                let response = `Target locked: **${targetName}**.`;
                
                if (p.role && p.role.feedback) {
                    const randomIdx = Math.floor(Math.random() * p.role.feedback.length);
                    response = p.role.feedback[randomIdx].replace('{target}', targetName);
                } else if (p.role && p.role.name === 'The Bookburner') {
                    if (targetId === 'ignite') {
                        const randomIdx = Math.floor(Math.random() * p.role.feedback_ignite.length);
                        response = p.role.feedback_ignite[randomIdx];
                    } else {
                        const randomIdx = Math.floor(Math.random() * p.role.feedback_douse.length);
                        response = p.role.feedback_douse[randomIdx].replace('{target}', targetName);
                    }
                }
                
                await interaction.update({ content: response, components: [] });
            } else {
                await interaction.update({ content: 'You cannot act right now.', components: [] });
            }
            return;
        }

        // ─── Lobby Terminal Actions ───
        const action = interaction.values[0];
        const { buildActionHub } = require('../mafia/MafiaUI');
        
        if (action === 'join') {
            if (game.addPlayer(interaction.user)) {
                await interaction.update(buildActionHub(game, interaction.user));
                await game.bumpLobby(interaction.channel);
            } else {
                await interaction.reply({ content: 'You have already entered the sanctuary!', flags: MessageFlags.Ephemeral });
            }
        }
        else if (action === 'leave') {
            if (game.removePlayer(interaction.user.id)) {
                await interaction.update(buildActionHub(game, interaction.user));
                await game.bumpLobby(interaction.channel);
            } else {
                await interaction.reply({ content: 'You are not in the lobby!', flags: MessageFlags.Ephemeral });
            }
        }
        else if (action === 'personal_stats') {
            await interaction.deferReply({ flags: 64 });
            const mafiaService = require('../services/mafiaService');
            const stats = await mafiaService.getPlayerStats(interaction.user.id);
            const { buildMafiaProfile } = require('../mafia/MafiaUI');
            const profile = buildMafiaProfile(interaction.user, stats);
            await interaction.editReply(profile);
        }
        else if (action === 'status') {
            const alive = game.getAlivePlayers();
            const dead = Array.from(game.players.values()).filter(p => !p.alive);
            const statusStr = `📊 **Roster Status**\nAlive: ${alive.length} | Redacted: ${dead.length}\n\n**Survivors:**\n${alive.map(p => `• ${p.name}`).join('\n')}`;
            await interaction.update({ content: statusStr, components: [] });
        }
        else if (action === 'start') {
            if (interaction.user.id !== game.hostId) {
                return interaction.reply({ content: 'Only the host can start the game.', flags: MessageFlags.Ephemeral });
            }
            if (game.players.size < 4) {
                return interaction.reply({ content: 'Not enough survivors! A minimum of 4 is required.', flags: MessageFlags.Ephemeral });
            }
            
            await interaction.deferUpdate();
            const payload = require('../mafia/MafiaUI').buildStartedLobbyPayload(game);
            await interaction.editReply(payload);
            await game.start(interaction);
        }
        else if (action === 'inject_bots') {
            if (!interaction.member.permissions.has('ManageGuild')) {
                return interaction.reply({ content: 'You need Manage Server permissions to inject bots.', flags: MessageFlags.Ephemeral });
            }
            
            const thematicNames = ['Synth-Scribe', 'Drone Protocol', 'Automated Guard', 'Library Construct', 'Data Phantom', 'Security Node', 'Index Crawler', 'Archive Proxy'];
            const current = game.players.size;
            const needed = Math.max(1, 4 - current); 
            for (let i = 0; i < needed; i++) {
                const botNumber = game.players.size + 1;
                const randomName = thematicNames[Math.floor(Math.random() * thematicNames.length)] + ` [${botNumber}]`;
                const botId = `mock-bot-${Date.now()}-${i}`; // Switched to hyphens to avoid split conflicts
                game.addPlayer({ id: botId, username: randomName, displayName: randomName }, true);
            }
            
            await interaction.update(buildActionHub(game, interaction.user));
            await game.bumpLobby(interaction.channel);
        }
        else if (action === 'disband') {
            if (interaction.user.id !== game.hostId) return interaction.reply({ content: 'Only the host can disband the sanctuary.', flags: MessageFlags.Ephemeral });
            
            MafiaManager.endGame(game.hostId);
            
            return interaction.update({ content: '✅ **Sanctuary Disbanded.** This session has been removed from the records.', embeds: [], components: [] });
        }
        else if (action === 'settings') {
            if (interaction.user.id !== game.hostId) {
                return interaction.reply({ content: 'Only the host can change settings.', flags: MessageFlags.Ephemeral });
            }
            await interaction.reply(require('../mafia/MafiaUI').buildSettingsPayload(game));
        }
        else if (action === 'last_will') {
            const p = game.players.get(interaction.user.id);
            if (!p) return interaction.reply({ content: 'You must join the game first.', flags: MessageFlags.Ephemeral });
            
            const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
            const modal = new ModalBuilder().setCustomId(`mafia_setwill_${lobbyId}`).setTitle('Compose Last Will');
            const input = new TextInputBuilder()
                .setCustomId('last_will_input')
                .setLabel('Your Final Message')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('If I die, trust Bot 2... or tell my story to the stars.')
                .setValue(p.lastWill || '')
                .setMaxLength(1000);
            
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }
    }
};

module.exports = { handleMafiaInteraction };
