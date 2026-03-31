const gameManager = require('../archive/ArchiveManager');
const { MessageFlags } = require('discord.js');

const handleArchiveInteraction = async (interaction) => {
    const parts = interaction.customId.split('_');
    let lobbyId;
    
    // Extract Lobby ID based on interaction schema
    // Most IDs: archive_{type}_{lobbyId}
    // Deeper IDs: archive_{type}_{subtype}_{lobbyId} or archive_{type}_{subtype}_{lobbyId}_{extra}
    if (interaction.customId.startsWith('archive_night_target_') || 
        interaction.customId.startsWith('archive_setphase_') ||
        interaction.customId.startsWith('archive_help_general_') ||
        interaction.customId.startsWith('archive_lobby_back_')) {
        lobbyId = parts[3];
    } else if (interaction.customId.startsWith('archive_vote_')) {
        lobbyId = parts[2];
    } else {
        lobbyId = parts[2];
    }
    
    const game = gameManager.getGameByLobby(lobbyId) || gameManager.getGameByThread(interaction.channelId);

    if (!game) {
        return interaction.reply({ content: '❌ This game session no longer exists or has expired.', flags: MessageFlags.Ephemeral });
    }

    // ═══════════════════════════════════════
    // BUTTONS
    // ═══════════════════════════════════════
    if (interaction.isButton()) {

        // Access Terminal (lobby button)
        if (interaction.customId.startsWith('archive_access_')) {
            const { buildActionHub } = require('../archive/ArchiveUI');
            return interaction.reply(buildActionHub(game, interaction.user));
        }

        // Survival Guide (lobby button)
        if (interaction.customId.startsWith('archive_help_general_')) {
            const { buildSurvivalGuide } = require('../archive/ArchiveUI');
            return interaction.reply(buildSurvivalGuide());
        }

        // Back to Lobby (settings back button)
        if (interaction.customId.startsWith('archive_lobby_back_')) {
            const { buildActionHub } = require('../archive/ArchiveUI');
            return interaction.update(buildActionHub(game, interaction.user));
        }

        // Toggle role reveal setting
        if (interaction.customId.startsWith('archive_togglereveal_')) {
            if (interaction.user.id !== game.hostId) return interaction.reply({ content: 'Only the host can do this.', flags: MessageFlags.Ephemeral });
            game.settings.revealRoles = !game.settings.revealRoles;
            gameManager.hostPreferences.set(game.hostId, game.settings);
            gameManager.saveState();
            return interaction.update(require('../archive/ArchiveUI').buildSettingsPayload(game));
        }

        // Queue for next game
        if (interaction.customId.startsWith('archive_queuenext_')) {
            const channelId = (interaction.channel.parentId || interaction.channel.id);
            if (!gameManager.globalQueues.has(channelId)) {
                gameManager.globalQueues.set(channelId, new Set());
            }
            const queue = gameManager.globalQueues.get(channelId);
            
            if (queue.has(interaction.user.id)) {
                queue.delete(interaction.user.id);
                await interaction.update(require('../archive/ArchiveUI').buildStartedLobbyPayload(game));
                return interaction.followUp({ content: 'You have left the next-game queue.', flags: MessageFlags.Ephemeral });
            } else {
                queue.add(interaction.user.id);
                gameManager.saveState();
                await interaction.update(require('../archive/ArchiveUI').buildStartedLobbyPayload(game));
                return interaction.followUp({ content: '✅ You have joined the waitlist for the next session!', flags: MessageFlags.Ephemeral });
            }
        }

        // Waitlist confirmation ("I'm here")
        if (interaction.customId.startsWith('archive_here_')) {
            const hereParts = interaction.customId.split('_');
            const hereLobbyId = hereParts[2];
            const userId = hereParts[3];
            
            if (interaction.user.id !== userId) {
                return interaction.reply({ content: '❌ This beacon is not synchronized to your signature.', flags: MessageFlags.Ephemeral });
            }
            
            const targetGame = gameManager.getGameByLobby(hereLobbyId);
            if (!targetGame) return interaction.reply({ content: '❌ The sanctuary you are trying to enter has been lost.', flags: MessageFlags.Ephemeral });
            
            const p = targetGame.players.get(userId);
            if (p) {
                p.isConfirmed = true;
                await interaction.update({ content: `✅ **Synchronized:** <@${userId}> is here and ready.`, components: [] });
                
                try {
                    const lobbyMsg = await interaction.channel.messages.fetch(hereLobbyId);
                    const { buildLobbyPayload } = require('../archive/ArchiveUI');
                    await lobbyMsg.edit(buildLobbyPayload(targetGame));
                } catch(e) {}
            }
            return;
        }

        // Last Will button (from Night DM)
        if (interaction.customId.startsWith('archive_will_')) {
            const p = game.players.get(interaction.user.id);
            if (!p) return interaction.reply({ content: 'You must join the game first.', flags: MessageFlags.Ephemeral });
            
            const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
            const modal = new ModalBuilder().setCustomId(`archive_setwill_${lobbyId}`).setTitle('Compose Last Will');
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
        if (interaction.customId.startsWith('archive_vote_')) {
            const voteParts = interaction.customId.split('_');
            const targetPlayerId = voteParts[3];
            
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
        if (interaction.customId.startsWith('archive_spectate_')) {
            if (!game.thread) return interaction.reply({ content: 'Session not active yet.', flags: MessageFlags.Ephemeral });
            if (game.players.has(interaction.user.id)) return interaction.reply({ content: 'You are already playing!', flags: MessageFlags.Ephemeral });
            
            try {
                await game.thread.members.add(interaction.user.id);
                return interaction.reply({ content: '👁️ You have entered the archives as a spectator.', flags: MessageFlags.Ephemeral });
            } catch (e) {
                return interaction.reply({ content: 'Failed to add you as a spectator.', flags: MessageFlags.Ephemeral });
            }
        }

        // Graveyard Living View
        if (interaction.customId.startsWith('archive_graveL_')) {
            const alive = game.getAlivePlayers();
            const str = `🧍 **Living Roster (${alive.length} remaining):**\n` + alive.map(p => `• ${p.name}`).join('\n');
            return interaction.reply({ content: str, flags: MessageFlags.Ephemeral });
        }

        // Graveyard Dead View
        if (interaction.customId.startsWith('archive_graveD_')) {
            const dead = Array.from(game.players.values()).filter(p => !p.alive);
            const str = `💀 **Casualties & Roles (${dead.length} dead):**\n` + dead.map(p => `• ${p.name} - ${p.role ? p.role.name : 'Unknown'}`).join('\n');
            return interaction.reply({ content: str, flags: MessageFlags.Ephemeral });
        }
    }

    // ═══════════════════════════════════════
    // MODAL SUBMITS
    // ═══════════════════════════════════════
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('archive_setwill_')) {
            const p = game.players.get(interaction.user.id);
            if (!p) return interaction.reply({ content: 'Player biometrics not found.', flags: MessageFlags.Ephemeral });
            p.lastWill = interaction.fields.getTextInputValue('last_will_input').slice(0, 1000);
            gameManager.saveState();
            return interaction.reply({ content: `✅ **Last Will Recorded.** It will be revealed upon your erasure.`, flags: MessageFlags.Ephemeral });
        }
        return;
    }

    // ═══════════════════════════════════════
    // SELECT MENUS
    // ═══════════════════════════════════════
    if (interaction.isStringSelectMenu()) {

        // Survival Guide Pagination
        if (interaction.customId === 'archive_help_menu') {
            const page = interaction.values[0];
            return interaction.update(require('../archive/ArchiveUI').buildSurvivalGuide(page));
        }

        // Game Mode selector (settings)
        if (interaction.customId.startsWith('archive_setmode_')) {
            if (interaction.user.id !== game.hostId) return interaction.reply({ content: 'Only the host can do this.', flags: MessageFlags.Ephemeral });
            game.settings.gameMode = interaction.values[0];
            gameManager.hostPreferences.set(game.hostId, game.settings);
            gameManager.saveState();
            await interaction.update(require('../archive/ArchiveUI').buildSettingsPayload(game));
            try {
                const lobbyMsg = await interaction.channel.messages.fetch(game.lobbyMessageId);
                await lobbyMsg.edit(require('../archive/ArchiveUI').buildLobbyPayload(game));
            } catch(e) {}
            return;
        }

        // Phase Category selector (settings step 1)
        if (interaction.customId.startsWith('archive_setphase_cat_')) {
            if (interaction.user.id !== game.hostId) return interaction.reply({ content: 'Only the host can do this.', flags: MessageFlags.Ephemeral });
            const cat = interaction.values[0];
            return interaction.update(require('../archive/ArchiveUI').buildSettingsPayload(game, cat));
        }

        // Phase Duration selector (settings step 2)
        if (interaction.customId.startsWith('archive_setphase_val_')) {
            if (interaction.user.id !== game.hostId) return interaction.reply({ content: 'Only the host can do this.', flags: MessageFlags.Ephemeral });
            
            const valParts = interaction.customId.split('_');
            const cat = valParts[4];
            const val = parseInt(interaction.values[0]);

            if (cat === 'discussion') game.settings.discussionTime = val;
            else if (cat === 'voting') game.settings.votingTime = val;
            else if (cat === 'night') game.settings.nightTime = val;
            else if (cat === 'prologue') game.settings.prologueTime = val;

            gameManager.hostPreferences.set(game.hostId, game.settings);
            gameManager.saveState();
            return interaction.update(require('../archive/ArchiveUI').buildSettingsPayload(game, cat));
        }
        
        // Night ability target selector (DM)
        if (interaction.customId.startsWith('archive_night_target_')) {
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
        const { buildLobbyPayload, buildActionHub } = require('../archive/ArchiveUI');
        
        if (action === 'join') {
            if (game.addPlayer(interaction.user)) {
                await interaction.update(buildActionHub(game, interaction.user));
                try {
                    const lobbyMsg = await interaction.channel.messages.fetch(game.lobbyMessageId);
                    await lobbyMsg.edit(buildLobbyPayload(game));
                } catch(e) {}
            } else {
                await interaction.reply({ content: 'You have already entered the sanctuary!', flags: MessageFlags.Ephemeral });
            }
        }
        else if (action === 'leave') {
            if (game.removePlayer(interaction.user.id)) {
                await interaction.update(buildActionHub(game, interaction.user));
                try {
                    const lobbyMsg = await interaction.channel.messages.fetch(game.lobbyMessageId);
                    await lobbyMsg.edit(buildLobbyPayload(game));
                } catch(e) {}
            } else {
                await interaction.reply({ content: 'You are not in the lobby!', flags: MessageFlags.Ephemeral });
            }
        }
        else if (action === 'personal_stats') {
            await interaction.deferReply({ flags: 64 });
            const archiveService = new (require('../services/archiveService'))();
            const stats = await archiveService.getPlayerStats(interaction.user.id);
            const { buildArchiveProfile } = require('../archive/ArchiveUI');
            const profile = buildArchiveProfile(interaction.user, stats);
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
            const payload = require('../archive/ArchiveUI').buildStartedLobbyPayload(game);
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
                const botId = `mock_bot_${Date.now()}_${i}`;
                game.addPlayer({ id: botId, username: randomName, displayName: randomName }, true);
            }
            
            await interaction.update(buildActionHub(game, interaction.user));
            try {
                const lobbyMsg = await interaction.channel.messages.fetch(game.lobbyMessageId);
                await lobbyMsg.edit(buildLobbyPayload(game));
            } catch(e) {}
        }
        else if (action === 'settings') {
            if (interaction.user.id !== game.hostId) {
                return interaction.reply({ content: 'Only the host can change settings.', flags: MessageFlags.Ephemeral });
            }
            await interaction.reply(require('../archive/ArchiveUI').buildSettingsPayload(game));
        }
        else if (action === 'last_will') {
            const p = game.players.get(interaction.user.id);
            if (!p) return interaction.reply({ content: 'You must join the game first.', flags: MessageFlags.Ephemeral });
            
            const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
            const modal = new ModalBuilder().setCustomId(`archive_setwill_${lobbyId}`).setTitle('Compose Last Will');
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

module.exports = { handleArchiveInteraction };
