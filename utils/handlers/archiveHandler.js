const gameManager = require('../archive/ArchiveManager');
const { buildLobbyPayload } = require('../archive/ArchiveUI');
const { MessageFlags } = require('discord.js');

const handleArchiveInteraction = async (interaction) => {
    const parts = interaction.customId.split('_');
    let lobbyId;
    
    // Extract Lobby ID based on interaction schema
    if (interaction.customId.startsWith('archive_night_target_')) lobbyId = parts[3];
    else lobbyId = parts[2];
    
    const game = gameManager.getGameByLobby(lobbyId) || gameManager.getGameByThread(interaction.channelId);

    if (!game) {
        return interaction.reply({ content: '❌ This game session no longer exists or has expired.', flags: MessageFlags.Ephemeral });
    }

    if (interaction.isButton()) {
        if (interaction.customId.startsWith('archive_settimer_')) {
            if (!game || interaction.user.id !== game.hostId) return interaction.reply({ content: 'Only the host can do this.', flags: MessageFlags.Ephemeral });
            
            if (interaction.customId.includes('modal_')) {
                const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
                const modal = new ModalBuilder().setCustomId(`archive_custom_timings_${lobbyId}`).setTitle('Custom Phase Timings');
                const discInput = new TextInputBuilder().setCustomId('disc_time').setLabel('Discussion Time (seconds)').setStyle(TextInputStyle.Short).setValue(game.settings.discussionTime.toString()).setRequired(true);
                const voteInput = new TextInputBuilder().setCustomId('vote_time').setLabel('Voting Time (seconds)').setStyle(TextInputStyle.Short).setValue(game.settings.votingTime.toString()).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(discInput), new ActionRowBuilder().addComponents(voteInput));
                return interaction.showModal(modal);
            }
            
            const type = interaction.customId.split('_')[3];
            if (type === 'disc') {
                const times = [60, 120, 180, 240, 300];
                game.settings.discussionTime = times[(times.indexOf(game.settings.discussionTime) + 1) % times.length] || 120;
            } else if (type === 'vote') {
                const times = [30, 45, 60, 90, 120];
                game.settings.votingTime = times[(times.indexOf(game.settings.votingTime) + 1) % times.length] || 60;
            }
            gameManager.hostPreferences.set(game.hostId, game.settings);
            gameManager.saveState();
            await interaction.update(require('../archive/ArchiveUI').buildSettingsPayload(game));
            return;
        }

        if (interaction.customId.startsWith('archive_spectate_')) {
            if (!game || !game.thread) return interaction.reply({ content: 'Game thread not available.', flags: MessageFlags.Ephemeral });
            if (game.players.has(interaction.user.id)) return interaction.reply({ content: 'You are already playing the game!', flags: MessageFlags.Ephemeral });
            
            try {
                await game.thread.members.add(interaction.user.id);
                return interaction.reply({ content: '👻 You have entered the archives as a spectator.', flags: MessageFlags.Ephemeral });
            } catch (e) {
                return interaction.reply({ content: 'Failed to add you as a spectator. Permissions issue?', flags: MessageFlags.Ephemeral });
            }
        }
        
        if (interaction.customId.startsWith('archive_vote_')) {
            const parts = interaction.customId.split('_');
            const targetPlayerId = parts[3];
            
            if (game.state !== 'VOTING') return interaction.reply({ content: 'Voting is currently closed.', flags: MessageFlags.Ephemeral });
            
            const p = game.players.get(interaction.user.id);
            if (!p || !p.alive) return interaction.reply({ content: 'Dead men tell no tales.', flags: MessageFlags.Ephemeral });
            
            if (p.inkBoundTarget === targetPlayerId) {
                return interaction.reply({ content: '❌ You are Ink-Bound and cannot vote for this suspect today.', flags: MessageFlags.Ephemeral });
            }
            
            p.voteTarget = targetPlayerId;
            const targetName = game.players.get(targetPlayerId)?.name || 'Unknown';
            let response = `✅ You cast your vote for **${targetName}**.`;
            
            if (p.role && p.role.vote_feedback) {
                const randomIdx = Math.floor(Math.random() * p.role.vote_feedback.length);
                response = `✅ ` + p.role.vote_feedback[randomIdx].replace('{target}', targetName);
            }
            
            return interaction.reply({ content: response, flags: MessageFlags.Ephemeral });
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('archive_custom_timings_')) {
            if (!game) return interaction.reply({ content: 'Lobby expired.', flags: MessageFlags.Ephemeral });
            const dTime = parseInt(interaction.fields.getTextInputValue('disc_time'), 10);
            const vTime = parseInt(interaction.fields.getTextInputValue('vote_time'), 10);
            
            if (!isNaN(dTime) && !isNaN(vTime) && dTime > 0 && vTime > 0) {
                game.settings.discussionTime = dTime;
                game.settings.votingTime = vTime;
                gameManager.hostPreferences.set(game.hostId, game.settings);
                gameManager.saveState();
                await interaction.update(require('../archive/ArchiveUI').buildSettingsPayload(game));
            } else {
                await interaction.reply({ content: 'Invalid numbers provided. Settings unchanged.', flags: MessageFlags.Ephemeral });
            }
        }
        
        if (interaction.customId.startsWith('archive_setwill_')) {
            const p = game.players.get(interaction.user.id);
            if (!p) return interaction.reply({ content: 'You must be in the game to set a will.', flags: MessageFlags.Ephemeral });
            p.lastWill = interaction.fields.getTextInputValue('last_will_input').slice(0, 1000);
            await interaction.reply({ content: '✍️ **Your Last Will has been unsealed.** It will be revealed upon your erasure.', flags: MessageFlags.Ephemeral });
            gameManager.saveState();
        }
    }

    if (interaction.isStringSelectMenu()) {
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
        
        if (interaction.customId.startsWith('archive_night_target_')) {
            if (game.state !== 'NIGHT') return interaction.update({ content: 'Missed your chance.', components: [] });
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
                    // Special case for ignite
                    if (targetId === 'ignite') {
                        const randomIdx = Math.floor(Math.random() * p.role.feedback_ignite.length);
                        response = p.role.feedback_ignite[randomIdx];
                    } else {
                        const randomIdx = Math.floor(Math.random() * p.role.feedback_douse.length);
                        response = p.role.feedback_douse[randomIdx].replace('{target}', targetName);
                    }
                }
                
                await interaction.update({ content: response, components: [] });
            }
 else {
                await interaction.update({ content: 'You cannot act right now.', components: [] });
            }
            return;
        }

        const action = interaction.values[0];
        
        if (action === 'join') {
            if (game.addPlayer(interaction.user)) {
                await interaction.update(buildLobbyPayload(game));
            } else {
                await interaction.reply({ content: 'You have already joined!', flags: MessageFlags.Ephemeral });
            }
        }
        else if (action === 'leave') {
            if (game.removePlayer(interaction.user.id)) {
                await interaction.update(buildLobbyPayload(game));
            } else {
                await interaction.reply({ content: 'You are not in the lobby!', flags: MessageFlags.Ephemeral });
            }
        }
        else if (action === 'start') {
            if (interaction.user.id !== game.hostId) {
                return interaction.reply({ content: 'Only the host can start the game.', flags: MessageFlags.Ephemeral });
            }
            
            if (game.players.size < 4) {
                return interaction.reply({ content: 'Not enough players! A minimum of 4 is required.', flags: MessageFlags.Ephemeral });
            }
            
            await interaction.deferUpdate();
            
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
            const spectateRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`archive_spectate_${lobbyId}`).setLabel('👁️ Spectate').setStyle(ButtonStyle.Secondary)
            );
            
            const embed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor('#2ecc71')
                .setFields([]) // Securely clear any lingering fields
                .addFields({ name: 'Status', value: 'Game in Progress - Spectate in the thread below!' });
            
            await interaction.editReply({ embeds: [embed], components: [spectateRow] });
            await game.start(interaction);
        }
        else if (action === 'inject_bots') {
            if (!interaction.member.permissions.has('ManageGuild')) {
                return interaction.reply({ content: 'You need Manage Server permissions to inject bots.', flags: MessageFlags.Ephemeral });
            }
            
            await interaction.deferUpdate();
            
            const current = game.players.size;
            const needed = Math.max(1, 4 - current); 
            for (let i = 0; i < needed; i++) {
                const botNumber = game.players.size + 1;
                const botId = `mock_bot_${Date.now()}_${i}`;
                game.addPlayer({ id: botId, username: `Virtual Bot ${botNumber}`, displayName: `Virtual Bot ${botNumber}` }, true);
            }
            
            await interaction.editReply(buildLobbyPayload(game));
        }
        else if (action === 'settings') {
            if (interaction.user.id !== game.hostId) {
                return interaction.reply({ content: 'Only the host can change settings.', flags: MessageFlags.Ephemeral });
            }
            
            await interaction.reply(require('../archive/ArchiveUI').buildSettingsPayload(game));
        }
        else if (action === 'help') {
            await interaction.reply({ content: 'Help guide coming soon (WIP).', flags: MessageFlags.Ephemeral });
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
