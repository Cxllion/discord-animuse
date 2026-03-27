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

    // --- BUTTONS ---
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
            if (!game || !game.thread) return interaction.reply({ content: 'Session not active yet. Join via the lobby!', flags: MessageFlags.Ephemeral });
            if (game.players.has(interaction.user.id)) return interaction.reply({ content: 'You are already playing the game!', flags: MessageFlags.Ephemeral });
            
            try {
                await game.thread.members.add(interaction.user.id);
                return interaction.reply({ content: '👁️ You have entered the archives as a spectator.', flags: MessageFlags.Ephemeral });
            } catch (e) {
                return interaction.reply({ content: 'Failed to add you as a spectator. Threads might be archived or permissions locked.', flags: MessageFlags.Ephemeral });
            }
        }

        if (interaction.customId.startsWith('archive_hub_')) {
            // No longer used, but kept for legacy button cleanup if needed
            return interaction.reply({ content: 'Please use the dropdown menu on the main sanctuary message.', flags: MessageFlags.Ephemeral });
        }

        if (interaction.customId.startsWith('archive_lobby_back_')) {
            const { buildActionHub } = require('../archive/ArchiveUI');
            await interaction.update(buildActionHub(game, interaction.user));
            return;
        }

        if (interaction.customId.startsWith('archive_queue_')) {
            if (!game) return;
            if (game.players.has(interaction.user.id)) return interaction.reply({ content: 'You are already in the sanctuary!', flags: MessageFlags.Ephemeral });
            
            if (game.waitlist.has(interaction.user.id)) {
                game.waitlist.delete(interaction.user.id);
                await interaction.update(require('../archive/ArchiveUI').buildStartedLobbyPayload(game));
                return interaction.followUp({ content: 'You have left the rescue queue.', flags: MessageFlags.Ephemeral });
            } else {
                game.waitlist.add(interaction.user.id);
                await interaction.update(require('../archive/ArchiveUI').buildStartedLobbyPayload(game));
                return interaction.followUp({ content: 'You have joined the rescue queue. Our Archivists will reach out if a slot opens.', flags: MessageFlags.Ephemeral });
            }
        }
        
        if (interaction.customId.startsWith('archive_vote_')) {
            const voteParts = interaction.customId.split('_');
            const targetPlayerId = voteParts[3];
            
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
            
            await interaction.reply({ content: response, flags: MessageFlags.Ephemeral });
            return game.updateVotingBoard();
        }
    }

    // --- MODALS ---
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

    // --- SELECT MENUS ---
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
                await interaction.update({ content: 'You cannot interfere right now.', components: [] });
            }
            return;
        }

        const action = interaction.values[0];
        const { buildLobbyPayload } = require('../archive/ArchiveUI');
        
        if (action === 'join') {
            if (game.addPlayer(interaction.user)) {
                await interaction.update(buildLobbyPayload(game));
            } else {
                await interaction.reply({ content: 'You have already entered the sanctuary!', flags: MessageFlags.Ephemeral });
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
                return interaction.reply({ content: 'Not enough survivors! A minimum of 4 is required to hold the gates.', flags: MessageFlags.Ephemeral });
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
            return showHelp(interaction);
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

async function showHelp(interaction) {
    const { EmbedBuilder, MessageFlags } = require('discord.js');
    const helpEmbed = new EmbedBuilder()
        .setTitle('📚 The Final Library | Sanctuary Protocol')
        .setColor('#8B5CF6')
        .setDescription('The world outside has fallen to the Virus. The sanctuary is humanity\'s last hope. Identify the carriers of the Rot before the library is lost.')
        .addFields(
            { name: '📜 Archivists (Survivors)', value: 'Your goal is to identify and exile all infected Revisions. You win when the library is clean.' },
            { name: '🔪 Revisions (Infected)', value: 'Your goal is to compromise the sanctuary and outnumber the survivors. Coordinate in your secret hub at night.' },
            { name: '🔍 Security Roles', value: '• **The Indexer**: Scans for infection.\n• **The Conservator**: Protects from the Rot.\n• **The Shredder**: Neutralizes threats.\n• **The Censor**: Quarantines abilities.' },
            { name: '🔥 Unbound (Third Party)', value: '• **The Anomaly**: Wins if exiled by the council.\n• **The Critic**: Wins if their target is exiled.\n• **The Bookburner**: Wins if they ignite the sanctuary.' }
        )
        .setFooter({ text: 'Ensure humanity\'s records survive.' });
    
    if (interaction.replied || interaction.deferred) {
        return interaction.followUp({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ embeds: [helpEmbed], flags: MessageFlags.Ephemeral });
}

module.exports = { handleArchiveInteraction };
