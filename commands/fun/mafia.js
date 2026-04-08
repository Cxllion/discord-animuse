const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    MessageFlags,
    PermissionFlagsBits
} = require('discord.js');
const baseEmbed = require('../../utils/generators/baseEmbed');
const CONFIG = require('../../utils/config');

const MafiaManager = require('../../utils/mafia/MafiaManager');
const MafiaUI = require('../../utils/mafia/MafiaUI');

module.exports = {
    category: 'fun',
    dbRequired: true,
    data: new SlashCommandBuilder()
        .setName('mafia')
        .setDescription('Enter the Final Library and protect humanity\'s last records from the Viral Rot.')
        .addSubcommand(sub =>
            sub.setName('host')
                .setDescription('Start a new mafia lobby in this channel.')
        )
        .addSubcommand(sub =>
            sub.setName('status')
                .setDescription('Check the current game status and participants.')
        )
        .addSubcommand(sub =>
            sub.setName('role')
                .setDescription('Discreetly view your assigned role and objectives.')
        )
        .addSubcommand(sub =>
            sub.setName('will')
                .setDescription('Set your last will to be revealed upon erasure.')
        )
        .addSubcommand(sub =>
            sub.setName('end')
                .setDescription('ADMIN: Forcefully end the active game in this channel.')
        )
        .addSubcommand(sub =>
            sub.setName('skip')
                .setDescription('ADMIN: Instantly skip the current phase timeout.')
        )
        .addSubcommand(sub =>
            sub.setName('stats')
                .setDescription('View your historical survival records and biometrics.')
        )
        .addSubcommand(sub =>
            sub.setName('restore')
                .setDescription('Resume a session that was interrupted by a system restart (Available for 10 mins).')
        )
        .addSubcommand(sub =>
            sub.setName('help')
                .setDescription('Open the Survival Guide to learn the rules and roles.')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        // 1. HELP: Works regardless of active session
        if (subcommand === 'help') {
            const payload = MafiaUI.buildSurvivalGuide();
            return interaction.reply(payload);
        }

        // 2. STATS: Works regardless of active session
        if (subcommand === 'stats') {
            await interaction.deferReply({ flags: 64 });
            const mafiaService = require('../../utils/services/mafiaService');
            const stats = await mafiaService.getPlayerStats(interaction.user.id);
            const profile = MafiaUI.buildMafiaProfile(interaction.user, stats);
            return interaction.editReply({ embeds: profile.embeds });
        }

        if (subcommand === 'host') {
            await interaction.deferReply();
            
            // Guild Session Check: Only one session (Lobby or Game) per server.
            const existingLobbyInGuild = MafiaManager.getLobbyByGuild(interaction.guildId);
            const existingGameInGuild = MafiaManager.getGameByGuild(interaction.guildId);

            if (existingLobbyInGuild || existingGameInGuild) {
                const gameInServer = existingLobbyInGuild || existingGameInGuild;
                
                // If the user already has a lobby, allow them to relocate it.
                if (gameInServer.hostId === interaction.user.id && gameInServer.state === 'LOBBY') {
                    await gameInServer.bumpLobby(interaction.channel);
                    return interaction.editReply({ 
                        content: '✅ **Sanctuary Relocated.** Your active lobby has been moved here for better visibility within the archives.' 
                    });
                }

                if (gameInServer.hostId === interaction.user.id) {
                    return interaction.editReply({ content: '❌ **Access Denied.** You are already hosting an active Mafia Session in another thread in this server. Finish that session first.' });
                }

                return interaction.editReply({ 
                    content: '❌ **Sanctuary Occupied.** Another Mafia Session is already underway in this server. Only one session can be supported per sanctuary at a time.' 
                });
            }

            // Still check if the USER is hosting elsewhere to prevent bypasses
            const userIsHostingElsewhere = Array.from(MafiaManager.lobbies.values()).find(g => g.hostId === interaction.user.id);
            const userIsGamingElsewhere = Array.from(MafiaManager.games.values()).find(g => g.hostId === interaction.user.id && g.state !== 'GAME_OVER');
            
            if (userIsHostingElsewhere || userIsGamingElsewhere) {
                return interaction.editReply({ content: '❌ **Identity Conflict.** You are already hosting a Mafia Session in another server. You cannot maintain multiple archival records simultaneously.' });
            }

            const msg = await interaction.editReply('Sealing the Final Library gates...');
            const game = await MafiaManager.createGame(msg.id, interaction.user, interaction.channel);
            const payload = MafiaUI.buildLobbyPayload(game);
            
            await interaction.editReply({ content: '', ...payload });
            return;
        }

        if (subcommand === 'restore') {
            await interaction.deferReply({ flags: 64 });
            
            // Look for a pending restore for this user or this guild
            const pending = Array.from(MafiaManager.pendingRestores.values())
                .find(d => d.game.hostId === interaction.user.id || (d.game.guildId === interaction.guildId && interaction.member.permissions.has(PermissionFlagsBits.Administrator)));
            
            if (!pending) {
                return interaction.editReply({ content: '❌ **Restoration Failed.** No buffered game states found for your signature or this sanctuary. Lobbies are only eligible for restoration for 10 minutes after a restart.' });
            }

            const restoredGame = await MafiaManager.restoreGame(pending.game.hostId, interaction.client);
            if (restoredGame) {
                return interaction.editReply({ content: `✅ **Sanctuary Restored.** The archives have been re-synchronized in <#${restoredGame.threadId || restoredGame.channelId}>.` });
            } else {
                return interaction.editReply({ content: '❌ **Restoration Failed.** Could not re-establish the archival connection.' });
            }
        }

        const game = MafiaManager.getGameByThread(interaction.channelId) || MafiaManager.getGameByLobby(interaction.channelId) || MafiaManager.getLobbyByHost(interaction.user.id);
        
        if (subcommand === 'status' || subcommand === 'role' || subcommand === 'will') {
            if (!game || game.state === 'GAME_OVER') {
                return interaction.reply({ 
                    content: '📜 **Archival Error**: No active mafia session found in this thread.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            if (subcommand === 'status') {
                const alive = game.getAlivePlayers();
                const dead = Array.from(game.players.values()).filter(p => !p.alive);
                
                const embed = baseEmbed(`📚 Session Status: ${game.state}`, 
                    `**Day:** ${game.dayCount}\n**Players:** ${game.players.size} (${alive.length} Alive)`,
                    interaction.client.user.displayAvatarURL()
                )
                    .setColor('#8B5CF6')
                    .addFields(
                        { name: 'Alive', value: alive.map(p => `• ${p.name}`).join('\n') || 'None' },
                        { name: 'Redacted', value: dead.map(p => `• ~~${p.name}~~ (${p.role?.name || 'Unknown'})`).join('\n') || 'None' }
                    )
                    .setTimestamp();
                
                return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            }

            if (subcommand === 'role') {
                const player = game.players.get(interaction.user.id);
                if (!player) return interaction.reply({ content: 'You are not a participant in this session.', flags: MessageFlags.Ephemeral });
                if (!player.role) return interaction.reply({ content: 'Roles have not been assigned yet.', flags: MessageFlags.Ephemeral });

                const header = player.role.faction === 'Revisions' ? '🩸 **The Corrupted Page (Revision)**' : '📜 **The Final Library (Archivist)**';
                let dmStr = `${header}\n\nYou are **${player.role.emoji} ${player.role.name}** (${player.role.faction}).\n*${player.role.description}*`;
                
                if (player.role.name === 'The Critic' && player.criticTarget) {
                    const tgt = game.players.get(player.criticTarget);
                    dmStr += `\n\n🎯 **Your Target:** You must subtly manipulate the town into voting out **${tgt?.name}** during the Day phase.`;
                }

                return interaction.reply({ content: dmStr, flags: MessageFlags.Ephemeral });
            }

            if (subcommand === 'will') {
                const player = game.players.get(interaction.user.id);
                if (!player) return interaction.reply({ content: 'You are not a participant in this session.', flags: MessageFlags.Ephemeral });

                const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
                const modal = new ModalBuilder().setCustomId(`mafia_setwill_${game.lobbyMessageId}`).setTitle('Compose Last Will');
                const input = new TextInputBuilder()
                    .setCustomId('last_will_input')
                    .setLabel('Your Final Message')
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('If I die, trust Bot 2...')
                    .setValue(player.lastWill || '')
                    .setMaxLength(1000);
                
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return interaction.showModal(modal);
            }
        }

        // --- ADMIN COMMANDS ---
        if (!interaction.member?.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '📜 This section of the archives is restricted to administrators.', flags: MessageFlags.Ephemeral });
        }

        if (!game) {
            return interaction.reply({ content: 'No active mafia session found in this thread.', flags: MessageFlags.Ephemeral });
        }

        if (subcommand === 'end') {
            await interaction.deferReply({ flags: 64 });
            // Priority for key: threadId -> hostId -> lobbyMessageId
            const key = game.threadId || game.hostId || game.lobbyMessageId;
            MafiaManager.endGame(key);
            await interaction.editReply({ content: '✅ **Sanctuary Purged.** The session has been forcefully terminated and records archived.' });
        } else if (subcommand === 'skip') {
            if (game.state === 'GAME_OVER') {
                return interaction.reply({ content: 'Game is already over.', flags: MessageFlags.Ephemeral });
            }

            if (game.activeTimer) clearTimeout(game.activeTimer);
            
            await interaction.reply({ content: `⏩ Skipping **${game.state}** phase timeout...`, flags: MessageFlags.Ephemeral });
            
            switch (game.state) {
                case 'PROLOGUE': game.startNight(); break;
                case 'NIGHT': game.endNight(); break;
                case 'DAY': game.startVoting(); break;
                case 'VOTING': game.endDay(); break;
                case 'TWILIGHT': game.startNight(); break;
                default: 
                    await interaction.followUp({ content: `Cannot skip phase: ${game.state}`, flags: MessageFlags.Ephemeral });
            }
        }
    }
};
