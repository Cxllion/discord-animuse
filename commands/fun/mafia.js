const {
    SlashCommandBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    MessageFlags,
    PermissionFlagsBits,
    EmbedBuilder
} = require('discord.js');

const gameManager = require('../../utils/archive/ArchiveManager');
const { buildLobbyPayload } = require('../../utils/archive/ArchiveUI');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mafia')
        .setDescription('Enter the Final Library and protect humanity\'s last records from the Viral Rot.')
        .addSubcommand(sub =>
            sub.setName('host')
                .setDescription('Start a new game lobby in this channel.')
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
            sub.setName('help')
                .setDescription('Open the Survival Guide to learn the rules and roles.')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'host') {
            await interaction.deferReply();
            
            // 1. Global Session Check: Only one session (Lobby or Game) bot-wide.
            const totalLobbies = gameManager.lobbies.size;
            const totalGames = gameManager.games.size;

            if (totalLobbies > 0 || totalGames > 0) {
                // If there's an ongoing session, verify if the current user is the host
                const existingLobby = gameManager.getLobbyByHost(interaction.user.id);
                const existingGame = Array.from(gameManager.games.values()).find(g => g.hostId === interaction.user.id && g.state !== 'GAME_OVER');

                if (existingLobby) {
                    await existingLobby.bumpLobby(interaction.channel);
                    return interaction.editReply({ content: '✅ **Sanctuary Relocated.** Your active lobby has been moved here for better visibility.' });
                }

                if (existingGame) {
                    return interaction.editReply({ content: '❌ **Access Denied.** You are already hosting an active Archive Session in another thread. Finish that session first.' });
                }

                // If some OTHER user is hosting
                return interaction.editReply({ 
                    content: '❌ **Bot Capacity Reached.** Another Archive Session is currently underway in the archives. Only one session can be supported at a time to ensure community spirit.' 
                });
            }

            // Placeholder msg to get ID
            const msg = await interaction.editReply('Sealing the Final Library gates...');
            
            const game = await gameManager.createGame(msg.id, interaction.user, interaction.channel);
            
            const payload = buildLobbyPayload(game);
            
            await interaction.editReply({ content: '', ...payload });
            return;
        }

        // --- OUT-OF-GAME COMMANDS ---

        if (subcommand === 'help') {
            const { buildSurvivalGuide } = require('../../utils/archive/ArchiveUI');
            const payload = buildSurvivalGuide();
            // Help requires ephemeral response if we want it private, but let's just make it ephemeral
            return interaction.reply(payload);
        }

        const game = gameManager.getGameByThread(interaction.channelId) || gameManager.getGameByLobby(interaction.channelId);
        
        if (subcommand === 'status' || subcommand === 'role' || subcommand === 'will') {
            if (!game || game.state === 'GAME_OVER') {
                return interaction.reply({ content: '📜 No active archive session found in this thread.', flags: MessageFlags.Ephemeral });
            }

            if (subcommand === 'status') {
                const alive = game.getAlivePlayers();
                const dead = Array.from(game.players.values()).filter(p => !p.alive);
                
                const embed = new EmbedBuilder()
                    .setTitle(`📚 Session Status: ${game.state}`)
                    .setColor('#8B5CF6')
                    .setDescription(`**Day:** ${game.dayCount}\n**Players:** ${game.players.size} (${alive.length} Alive)`)
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
                const modal = new ModalBuilder().setCustomId(`archive_setwill_${game.lobbyMessageId}`).setTitle('Compose Last Will');
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
            return interaction.reply({ content: 'No active archive session found in this thread.', flags: MessageFlags.Ephemeral });
        }

        if (subcommand === 'end') {
            game.state = 'GAME_OVER';
            if (game.activeTimer) {
                clearTimeout(game.activeTimer);
            }
            
            if (game.thread) {
                try {
                    await game.thread.send('⏹️ **The game has been forcefully terminated by an administrator.**');
                    await game.thread.setLocked(true, 'Force ended');
                } catch (e) {
                    console.error('Failed to notify thread closure', e);
                }
            }
            
            gameManager.endGame(game.threadId || game.lobbyMessageId);
            
            await interaction.reply({ content: 'Game forcefully ended and removed from memory.', flags: MessageFlags.Ephemeral });
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
        } else if (subcommand === 'stats') {
            await interaction.deferReply();
            const archiveService = new (require('../../utils/services/archiveService'))();
            const stats = await archiveService.getPlayerStats(interaction.user.id);
            const { buildArchiveProfile } = require('../../utils/archive/ArchiveUI');
            const profile = buildArchiveProfile(interaction.user, stats);
            // buildArchiveProfile uses flags: 64, but editReply doesn't support flags natively unless initialized with it, which we didn't deferReply(hidden). But discord allows embeds.
            await interaction.editReply({ embeds: profile.embeds });
        }
    }
};
