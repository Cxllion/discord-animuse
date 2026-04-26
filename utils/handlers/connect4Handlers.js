const { 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    AttachmentBuilder,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');
const connect4Service = require('../services/connect4Service');
const connect4Generator = require('../generators/connect4Generator');
const toastGenerator = require('../generators/toastGenerator');
const { fetchConfig } = require('../core/database');
const logger = require('../core/logger');

// Strict memory-based rate limiting to prevent database DOS attacks from button spam
const rateLimitCache = new Set();

/**
 * Connect4 Handlers: Manages real-time interactions for the Tactical Link minigame.
 */

const handleConnect4Interaction = async (interaction) => {
    const { customId, user, guildId } = interaction;
    const parts = customId.split('_'); // c4, action, gameId, index?
    const action = parts[1];
    const gameId = parts[2];

    // 0. Strict Rate Limiting (1.5 seconds)
    if (rateLimitCache.has(user.id)) {
        return interaction.reply({ content: '⏳ **System Processing:** Please wait for the terminal to synchronize.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
    }
    
    rateLimitCache.add(user.id);
    setTimeout(() => rateLimitCache.delete(user.id), 1500);

    // 1. Fetch Game State
    const game = await connect4Service.getGame(gameId);
    if (!game) {
        return interaction.reply({ 
            content: '❌ **Terminal Link Severed:** This session could not be found in the archives. It may have expired or been purged.', 
            flags: [MessageFlags.Ephemeral] 
        });
    }

    // 2. Security Check (Only participants can interact)
    const p1 = game.player1;
    const p2 = game.player2;

    if (user.id !== p1 && user.id !== p2) {
        return interaction.reply({ 
            content: '🔒 **Unauthorized Access:** This tactical link is restricted to the engaged patrons. Use `/connect4` to initialize your own session.', 
            flags: [MessageFlags.Ephemeral] 
        });
    }

    // 3. Status Verification
    if (game.status !== 'PLAYING') {
        return interaction.reply({ 
            content: '🏁 **Protocol Terminated:** This tactical link has already been finalized and archived.', 
            flags: [MessageFlags.Ephemeral] 
        });
    }

    try {
        if (action === 'drop') {
            const col = parseInt(parts[3]);
            
            // Validate Turn
            const currentTurn = game.current_turn || game.currentTurn;
            if (user.id !== currentTurn) {
                return interaction.reply({
                    content: '⚠️ **Protocol Deviation:** It is not your turn in this link sequence. Please wait for your opponent.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            // [20] Interactive Thinking State (MOVED AFTER SUBMIT)
            // Wait to update UI until we know it's a valid move
            const updatedGame = await connect4Service.submitMove(gameId, user.id, col);
            if (!updatedGame) return; 

            // Disable buttons to show synchronization
            const originalComponents = interaction.message.components;
            const thinkingComponents = originalComponents.map(row => {
                const newRow = ActionRowBuilder.from(row);
                newRow.components.forEach(btn => {
                    if (btn.data.custom_id === customId) {
                        btn.setLabel('Synchronizing...').setDisabled(true);
                    } else {
                        btn.setDisabled(true);
                    }
                });
                return newRow;
            });
            await interaction.editReply({ components: thinkingComponents });

            await updateConnect4Views(interaction, updatedGame);
        } else if (action === 'forfeit') {
            // [4] Forfeit Confirmation
            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`c4_forfeitconfirm_${gameId}_${user.id}`).setLabel('Confirm Abandonment').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`c4_cancel_${gameId}`).setLabel('Resume Protocol').setStyle(ButtonStyle.Secondary)
            );
            await interaction.reply({ content: '⚠️ **Protocol Warning:** Are you sure you wish to sever this tactical link? This will count as a forfeit.', components: [confirmRow], flags: [MessageFlags.Ephemeral] });
        } else if (action === 'forfeitconfirm') {
            const allowedUserId = parts[3];
            if (user.id !== allowedUserId) {
                return interaction.reply({ content: '🔒 **Unauthorized Access:** You cannot confirm abandonment for another patron.', flags: [MessageFlags.Ephemeral] });
            }
            await interaction.deferUpdate();
            const updatedGame = await connect4Service.forfeitGame(gameId, user.id);
            await updateConnect4Views(interaction, updatedGame);
        } else if (action === 'rematch') {
            // [3] Rematch logic: Challenge original opponent
            const opponentId = user.id === game.player1 ? game.player2 : game.player1;
            const connect4Command = require('../../commands/minigames/connect4');
            
            // Mock interaction for command re-execution
            const mockInteraction = {
                ...interaction,
                user: user, // Keep the challenger the same
                options: { getUser: () => ({ id: opponentId }) },
                deferReply: () => interaction.reply({ content: '🔄 **Protocol Restarting...**', flags: [MessageFlags.Ephemeral] }), // Changed to reply since we can't defer a button as a command directly if we want to send a new message easily
                editReply: (o) => interaction.channel.send(o), // Fallback to sending in channel since deferring buttons is tricky
                followUp: (o) => interaction.channel.send(o)
            };
            return await connect4Command.execute(mockInteraction);
        } else if (action === 'accept') {
            const challengerId = parts[2];
            const opponentId = parts[3];
            
            if (user.id !== opponentId) {
                return interaction.reply({ content: '🔒 **Unauthorized Access:** Only the invited patron can accept this tactical link.', flags: [MessageFlags.Ephemeral] });
            }

            await interaction.deferUpdate();

            // Fetch User Data for Caching
            const p1User = await interaction.client.users.fetch(challengerId).catch(() => null);
            const p2User = user; // Current user is opponent
            const p1Member = await interaction.guild.members.fetch(challengerId).catch(() => null);
            const p2Member = await interaction.guild.members.fetch(opponentId).catch(() => null);

            const playerData = {
                p1: {
                    id: challengerId,
                    username: p1User?.username || 'Patron',
                    displayName: p1Member?.displayName || p1User?.username || 'Patron',
                    avatarURL: p1User?.displayAvatarURL({ extension: 'png', size: 128 })
                },
                p2: {
                    id: opponentId,
                    username: p2User?.username || 'Patron',
                    displayName: p2Member?.displayName || p2User?.username || 'Patron',
                    avatarURL: p2User?.displayAvatarURL({ extension: 'png', size: 128 })
                }
            };

            const gameState = await connect4Service.startNewGame(challengerId, opponentId);
            
            // Set public message tracking and cached data
            gameState.publicMessageId = interaction.message.id;
            gameState.publicChannelId = interaction.channelId;
            gameState.playerData = playerData;
            await connect4Service.saveSession(gameState.id, gameState);

            await updateConnect4Views(interaction, gameState);
        } else if (action === 'decline') {
            const opponentId = parts[3];
            if (user.id !== opponentId) {
                return interaction.reply({ content: '🔒 **Unauthorized Access:** Only the invited patron can decline this tactical link.', flags: [MessageFlags.Ephemeral] });
            }
            await interaction.update({ content: '🏳️ **Tactical Link Refused:** The invitation has been declined by the opponent.', components: [] });
        }
    } catch (error) {
        logger.error('[Connect4] Interaction failure:', error);
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content: `❌ **Protocol Error:** ${error.message}`, flags: [MessageFlags.Ephemeral] }).catch(()=>null);
        } else {
            await interaction.reply({ content: `❌ **Protocol Error:** ${error.message}`, flags: [MessageFlags.Ephemeral] }).catch(()=>null);
        }
    }
};

/**
 * Shared utility to update the game board and controls.
 */
const updateConnect4Views = async (interaction, gameState) => {
    try {
        const guild = interaction.guild;
        const p1Id = gameState.player1;
        const p2Id = gameState.player2;

        // Use cached data if available to save API calls
        let p1Data, p2Data;
        if (gameState.playerData) {
            p1Data = gameState.playerData.p1;
            p2Data = gameState.playerData.p2;
        } else {
            // Fetch User Data (Fallback)
            const p1User = await interaction.client.users.fetch(p1Id).catch(() => null);
            const p2User = await interaction.client.users.fetch(p2Id).catch(() => null);
            const p1Member = guild ? await guild.members.fetch(p1Id).catch(() => null) : null;
            const p2Member = guild ? await guild.members.fetch(p2Id).catch(() => null) : null;

            p1Data = {
                username: p1User?.username || 'Patron',
                displayName: p1Member?.displayName || p1User?.username || 'Patron',
                avatarURL: p1User?.displayAvatarURL({ extension: 'png', size: 128 })
            };
            p2Data = {
                username: p2User?.username || 'Patron',
                displayName: p2Member?.displayName || p2User?.username || 'Patron',
                avatarURL: p2User?.displayAvatarURL({ extension: 'png', size: 128 })
            };
        }

        // [1] Turn Timer Check
        const lastMove = new Date(gameState.last_move_at || gameState.startedAt).getTime();
        const now = Date.now();
        const secondsPassed = Math.floor((now - lastMove) / 1000);
        const timerText = gameState.status === 'PLAYING' ? `\n⏳ **Time since last move:** ${secondsPassed}s` : '';

        // Generate Frame
        const buffer = await connect4Generator.generateBoard(gameState, { p1Data, p2Data });
        const attachment = new AttachmentBuilder(buffer, { name: `connect4-${Date.now()}.webp` });

        const currentTurn = gameState.current_turn || gameState.currentTurn;
        let content = '';
        if (gameState.status === 'PLAYING') {
            content = `⚔️ **Tactical Link Active:** <@${p1Id}> vs <@${p2Id}>\nIt is currently <@${currentTurn}>'s turn.${timerText}`;
        } else if (gameState.status === 'WON') {
            content = `🏁 **Tactical Link Finalized:** <@${gameState.winner}> has achieved Connect Muse dominance! ♡`;
        } else if (gameState.status === 'DRAW') {
            content = `🏁 **Tactical Link Finalized:** The grid is saturated. A mutual stalemate has been recorded.`;
        } else if (gameState.status === 'FORFEITED') {
            content = `🏳️ **Tactical Link Severed:** <@${gameState.winner}> wins by forfeit.`;
        } else if (gameState.status === 'CANCELLED') {
            return await interaction.editReply({
                content: '🏳️ **Tactical Link Dissolved:** The session was abandoned before initiation and has been purged from the archives.',
                components: [],
                files: [],
                attachments: []
            }).catch(() => {});
        }

        // Build Interface
        const components = [];
        if (gameState.status === 'PLAYING') {
            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`c4_drop_${gameState.id}_0`).setLabel('1️⃣').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`c4_drop_${gameState.id}_1`).setLabel('2️⃣').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`c4_drop_${gameState.id}_2`).setLabel('3️⃣').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`c4_drop_${gameState.id}_3`).setLabel('4️⃣').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`c4_drop_${gameState.id}_4`).setLabel('5️⃣').setStyle(ButtonStyle.Primary)
            );
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`c4_drop_${gameState.id}_5`).setLabel('6️⃣').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`c4_drop_${gameState.id}_6`).setLabel('7️⃣').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`c4_forfeit_${gameState.id}`).setLabel('Forfeit').setStyle(ButtonStyle.Danger).setEmoji('🏳️')
            );
            components.push(row1, row2);
        } else {
            const endRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`c4_rematch_${gameState.id}`).setLabel('Quick Rematch').setStyle(ButtonStyle.Success).setEmoji('⚔️'),
                new ButtonBuilder().setCustomId('leaderboard_minigames').setLabel('View Leaderboard').setStyle(ButtonStyle.Secondary).setEmoji('📊')
            );
            components.push(endRow);
        }

        // Update the message
        await interaction.editReply({
            content: content,
            files: [attachment],
            attachments: [], 
            components: components
        });


        // 🏆 Winner Broadcaster (Success Slip)
        if (gameState.status === 'WON' && gameState.reward?.pointsAwarded > 0) {
            const winnerId = gameState.winner;
            const winnerData = winnerId === p1Id ? p1Data : p2Data;
            
            const toastBuffer = await toastGenerator.generateSuccessSlip({
                user: winnerData,
                pointsEarned: gameState.reward.pointsAwarded,
                totalPoints: 'CHECK /LEADERBOARD',
                gameName: 'Connect 4',
                attempts: gameState.moves
            });

            await interaction.channel.send({
                content: `🎊 **Arcade Protocol Success**: <@${winnerId}> has successfully synchronized the grid in **Connect Muse**! ♡`,
                files: [new AttachmentBuilder(toastBuffer, { name: 'victory-slip.webp' })]
            }).catch(err => logger.error('[Connect4] Failed to send victory slip:', err));
        }

        // 📊 Game Summary Embed
        if (gameState.status !== 'PLAYING') {
            const durationMs = Date.now() - new Date(gameState.startedAt).getTime();
            const durationSec = Math.floor(durationMs / 1000);
            const durationStr = durationSec > 60 ? `${Math.floor(durationSec / 60)}m ${durationSec % 60}s` : `${durationSec}s`;

            const summaryEmbed = new EmbedBuilder()
                .setTitle('📊 ARCADE PROTOCOL: SESSION SUMMARY')
                .setColor(gameState.status === 'WON' ? 0x22D3EE : 0xFFB7C5)
                .setDescription(`The tactical link between <@${gameState.player1}> and <@${gameState.player2}> has been finalized.`)
                .addFields(
                    { name: '🏁 Result', value: gameState.status === 'WON' ? `Winner: <@${gameState.winner}>` : (gameState.status === 'DRAW' ? 'Stalemate' : 'Forfeit'), inline: true },
                    { name: '⏱️ Duration', value: durationStr, inline: true },
                    { name: '🔢 Total Moves', value: `${gameState.moves}`, inline: true }
                )
                .setFooter({ text: `Session ID: ${gameState.id}` })
                .setTimestamp();

            await interaction.channel.send({ embeds: [summaryEmbed] }).catch(() => {});
        }

    } catch (err) {
        logger.error('[Connect4] View update failure:', err);
    }
};

module.exports = {
    handleConnect4Interaction,
    routerConfig: {
        prefixes: ['c4_'],
        handle: async (interaction) => {
            const { customId } = interaction;
            if (customId.startsWith('c4_cancel')) {
                const parts = customId.split('_');
                const gameId = parts[2];
                if (gameId) {
                    const game = await connect4Service.getGame(gameId);
                    if (game && (game.moves || 0) === 0) {
                        await connect4Service.deleteSession(gameId);
                    }
                }
                return interaction.deleteReply().catch(() => {});
            }
            return handleConnect4Interaction(interaction);
        }
    }
};
