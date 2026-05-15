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
const minigameService = require('../services/minigameService');
const { getResolvableName } = require('../core/visualUtils');
const toastGenerator = require('../generators/toastGenerator');
const { fetchConfig } = require('../core/database');
const logger = require('../core/logger');

// Memory locks for initialization to prevent race conditions
const initLocks = new Set();

// Strict memory-based rate limiting to prevent database DOS attacks from button spam
const rateLimitCache = new Set();

/**
 * Connect4 Handlers: Manages real-time interactions for the Tactical Link minigame.
 */

const { handleInteractionError } = require('../core/errorHandler');

const handleConnect4Interaction = async (interaction) => {
    const { customId, user, guildId } = interaction;
    // Custom ID parsing: c4_{action}_{gameId/challengerId}_{extra}
    // Since gameId might contain underscores or hyphens, we need a more robust split.
    const parts = customId.split('_'); 
    const action = parts[1];
    
    // gameId is usually the 3rd part. In 'drop', it's followed by the column.
    // In 'accept', parts[2] is challengerId and parts[3] is opponentId.
    let gameId = parts[2];
    
    // Reconstruct gameId if it was split incorrectly (though hyphens should solve this)
    if (parts.length > 4 && action !== 'accept') {
        // Handle legacy IDs that used underscores
        gameId = parts.slice(2, -1).join('_');
    }

    // 0. Strict Rate Limiting (1.5 seconds)
    if (rateLimitCache.has(user.id)) {
        return interaction.reply({ content: '⏳ **System Processing:** Please wait for the terminal to synchronize.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
    }
    
    rateLimitCache.add(user.id);
    setTimeout(() => rateLimitCache.delete(user.id), 1500);

    // Actions that require an existing game session
    const gameActions = ['drop', 'forfeit', 'forfeitconfirm', 'rematch', 'cancel'];
    let game = null;

    if (gameActions.includes(action)) {
        game = await connect4Service.getGame(gameId);
        if (!game) {
            return interaction.reply({ 
                content: '❌ **Connect Muse:** Match not found.', 
                flags: [MessageFlags.Ephemeral] 
            });
        }

        // Security Check (Only participants can interact)
        if (user.id !== game.player1 && user.id !== game.player2) {
            return interaction.reply({ 
                content: '🔒 **Unauthorized Access:** This tactical link is restricted to the engaged patrons. Use `/connect4` to initialize your own session.', 
                flags: [MessageFlags.Ephemeral] 
            });
        }

        // Status Verification
        if (game.status !== 'PLAYING' && action !== 'rematch') {
            return interaction.reply({ 
                content: '🏁 **Connect Muse:** This match has already been finalized.', 
                flags: [MessageFlags.Ephemeral] 
            });
        }
    }

    try {
        if (action === 'drop') {
            const col = parseInt(parts[parts.length - 1]);
            
            if (isNaN(col)) {
                return interaction.reply({ content: '❌ **Protocol Error:** Invalid navigational coordinates received.', flags: [MessageFlags.Ephemeral] });
            }
            
            // [20] Interactive Thinking State
            // Defer update immediately to prevent 3s timeout
            // No deferUpdate here for immediate response speed

            // Fetch old state to preserve metadata (like playerData)
            const oldGame = await connect4Service.getGame(gameId);
            if (!oldGame) return;

            // Validate Turn
            const currentTurn = oldGame.current_turn || oldGame.currentTurn;
            if (user.id !== currentTurn) {
                return interaction.reply({
                    content: '⚠️ **Protocol Deviation:** It is not your turn in this link sequence. Please wait for your opponent.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const updatedGame = await connect4Service.submitMove(gameId, user.id, col);
            if (!updatedGame) return; 

            // Preserve cached player data to avoid re-fetching from Discord API
            if (oldGame.playerData) {
                updatedGame.playerData = oldGame.playerData;
            }

            // Respond immediately with the updated view for maximum speed
            await updateConnect4Views(interaction, updatedGame);
        } else if (action === 'forfeit') {
            // [4] Forfeit Confirmation
            const prefix = process.env.TEST_MODE === 'true' ? 't4' : 'c4';
            const confirmRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`${prefix}_forfeitconfirm_${gameId}_${user.id}`).setLabel('Confirm Abandonment').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`${prefix}_cancel_${gameId}`).setLabel('Resume Protocol').setStyle(ButtonStyle.Secondary)
            );
            await interaction.reply({ content: '⚠️ **Protocol Warning:** Are you sure you wish to sever this tactical link? This will count as a forfeit.', components: [confirmRow], flags: [MessageFlags.Ephemeral] });
        } else if (action === 'forfeitconfirm') {
            const allowedUserId = parts[3];
            if (user.id !== allowedUserId) {
                return interaction.reply({ content: '🔒 **Unauthorized Access:** You cannot confirm abandonment for another patron.', flags: [MessageFlags.Ephemeral] });
            }
            
            await interaction.update({ content: '🏳️ **Sanctuary Protocol:** Tactical link severed.', components: [] });
            
            const updatedGame = await connect4Service.forfeitGame(gameId, user.id);
            if (!updatedGame) return;

            // Update the main board message
            const channel = await interaction.client.channels.fetch(updatedGame.publicChannelId).catch(() => null);
            if (channel) {
                const mainMsg = await channel.messages.fetch(updatedGame.publicMessageId).catch(() => null);
                if (mainMsg) {
                    await updateConnect4Views({ message: mainMsg, client: interaction.client, guild: interaction.guild }, updatedGame);
                }
            }
        } else if (action === 'rematch') {
            const opponentId = user.id === game.player1 ? game.player2 : game.player1;
            const initLockId = `c4_rematch_${gameId}`;
            
            if (initLocks.has(initLockId)) return;
            initLocks.add(initLockId);

            if (game.rematch_requested || game.rematchRequested) {
                initLocks.delete(initLockId);
                return interaction.reply({ content: '⚠️ **Protocol Active:** A rematch request has already been broadcast for this link.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
            }

            await interaction.deferUpdate();

            try {
                const prefix = process.env.TEST_MODE === 'true' ? 't4' : 'c4';

                // Lock session for rematch
                await connect4Service.saveSession(gameId, { ...game, rematch_requested: true });

            const inviteEmbed = new EmbedBuilder()
                .setTitle('Connect Muse Rematch Invitation')
                .setDescription(`<@${user.id}> is requesting a **Connect 4** rematch with <@${opponentId}>.`)
                .setColor(0xFFB7C5)
                .setFooter({ text: 'This request will expire in 5 minutes.' });

            const rematchRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`${prefix}_accept_${user.id}_${opponentId}`).setLabel('Accept Rematch').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`${prefix}_decline_${user.id}_${opponentId}`).setLabel('Decline').setStyle(ButtonStyle.Secondary)
            );

            await interaction.editReply({ components: [] }).catch(() => {});

            await interaction.channel.send({
                content: `🕹️ **Rematch Requested:** <@${opponentId}>`,
                embeds: [inviteEmbed],
                components: [rematchRow]
            });
            } finally {
                initLocks.delete(initLockId);
            }

        } else if (action === 'accept') {
            const challengerId = parts[2];
            const opponentId = parts[3];
            


            if (user.id !== opponentId) {
                return interaction.reply({ content: '🔒 **Unauthorized Access:** Only the invited patron can accept this tactical link.', flags: [MessageFlags.Ephemeral] });
            }

            // 0. Arcade Protocol: Session Locking
            const [challengerBusy, opponentBusy] = await Promise.all([
                minigameService.isUserInAnyGame(challengerId),
                minigameService.isUserInAnyGame(opponentId)
            ]);

            if (challengerBusy || opponentBusy) {
                const busyUser = challengerBusy ? (challengerId === user.id ? 'You are' : 'The challenger is') : 'You are';
                return interaction.reply({ 
                    content: `⚠️ **Link Failed:** ${busyUser} currently engaged in another active Arcade Protocol session.`, 
                    flags: [MessageFlags.Ephemeral] 
                });
            }

            const initLockId = `c4_init_${challengerId}_${opponentId}`;
            if (initLocks.has(initLockId)) return;
            initLocks.add(initLockId);

            await interaction.deferUpdate();

            try {
                // Fetch User Data for Caching

                const gameState = await connect4Service.startNewGame(challengerId, opponentId, interaction.guildId);
                
                if (!gameState) {
                    throw new Error('FAILED_TO_START: Service returned null session.');
                }

                // Dynamically fetch and map player data based on the shuffled gameState
                const p1Id = gameState.player1;
                const p2Id = gameState.player2;

                const p1User = await interaction.client.users.fetch(p1Id).catch(() => null);
                const p2User = await interaction.client.users.fetch(p2Id).catch(() => null);
                const p1Member = interaction.guild ? await interaction.guild.members.fetch(p1Id).catch(() => null) : null;
                const p2Member = interaction.guild ? await interaction.guild.members.fetch(p2Id).catch(() => null) : null;

                const p1Stats = await minigameService.getUserStats(p1Id).catch(() => null);
                const p2Stats = await minigameService.getUserStats(p2Id).catch(() => null);

                const playerData = {
                    p1: {
                        id: p1Id,
                        username: p1User?.username || 'Patron',
                        displayName: getResolvableName(p1Member) || p1User?.username || 'Patron',
                        avatarURL: p1User?.displayAvatarURL({ extension: 'png', size: 128 }),
                        rank: p1Stats?.rank || '?'
                    },
                    p2: {
                        id: p2Id,
                        username: p2User?.username || 'Patron',
                        displayName: getResolvableName(p2Member) || p2User?.username || 'Patron',
                        avatarURL: p2User?.displayAvatarURL({ extension: 'png', size: 128 }),
                        rank: p2Stats?.rank || '?'
                    }
                };

                // Set public message tracking and cached data
                // Generate initial views
                const prefix = process.env.TEST_MODE === 'true' ? 't4' : 'c4';
                const boardBuffer = await connect4Generator.generateBoard(gameState, { p1Data: playerData.p1, p2Data: playerData.p2 });
                const attachment = new AttachmentBuilder(boardBuffer, { name: 'connect4-board.webp' });
                
                const components = [];
                for (let c = 0; c < 7; c++) {
                    const row = new ActionRowBuilder();
                    // We only need one row for the 7 drop buttons
                    // But Discord allows 5 buttons per row. 
                    // So we use 2 rows for the 7 columns.
                }
                // Wait, I should use the standard component generation from updateConnect4Views
                
                const dropRow1 = new ActionRowBuilder();
                const dropRow2 = new ActionRowBuilder();
                for (let c = 0; c < 7; c++) {
                    const btn = new ButtonBuilder()
                        .setCustomId(`${prefix}_drop_${gameState.id}_${c}`)
                        .setLabel(`${c + 1}`)
                        .setStyle(ButtonStyle.Secondary);
                    if (c < 4) dropRow1.addComponents(btn);
                    else dropRow2.addComponents(btn);
                }
                const controlsRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`${prefix}_forfeit_${gameState.id}`).setLabel('Forfeit').setStyle(ButtonStyle.Danger)
                );
                
                const initialComponents = [dropRow1, dropRow2, controlsRow];

                // NEW: Send board as a NEW message to keep the channel clean
                const isGameOver = ['WON', 'DRAW', 'FORFEITED', 'CANCELLED'].includes(gameState.status);
                const turnText = isGameOver ? 'Protocol Terminated.' : `<@${gameState.current_turn}>'s Turn.`;

                const gameMessage = await interaction.channel.send({
                    content: `🕹️ **Connect Muse Active:** ${turnText}`,
                    files: [attachment],
                    components: initialComponents
                });

                gameState.publicMessageId = gameMessage.id;
                gameState.publicChannelId = interaction.channelId;
                gameState.playerData = playerData;
                await connect4Service.saveSession(gameState.id, gameState);

                // Delete the invitation
                await interaction.deleteReply().catch(() => null);


            } catch (innerError) {
                logger.error('[Connect4] Accept Logic Failure:', innerError);
                const errorMsg = innerError.message.includes('ACTIVE_LINK_DETECTED') 
                    ? '🛡️ **Engagement Error:** One or more patrons are already engaged in an active Tactical Link. Please finalize your current match first.'
                    : `❌ **Protocol Error:** ${innerError.message}`;
                await interaction.followUp({ content: errorMsg, flags: [MessageFlags.Ephemeral] }).catch(() => null);
            } finally {
                initLocks.delete(`c4_init_${challengerId}_${opponentId}`);
            }
        } else if (action === 'decline') {
            const opponentId = parts[3];
            if (user.id !== opponentId) {
                return interaction.reply({ content: '🔒 **Unauthorized Access:** Only the invited patron can decline this tactical link.', flags: [MessageFlags.Ephemeral] });
            }
            await interaction.update({ content: '🏳️ **Connect Muse:** The invitation was declined.', components: [] });
        }
    } catch (error) {
        await handleInteractionError(interaction, error, 'An error occurred within the Connect Muse protocol.');
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

            const p1Stats = await minigameService.getUserStats(p1Id).catch(() => null);
            const p2Stats = await minigameService.getUserStats(p2Id).catch(() => null);

            p1Data = {
                username: p1User?.username || 'Patron',
                displayName: getResolvableName(p1Member) || p1User?.username || 'Patron',
                avatarURL: p1User?.displayAvatarURL({ extension: 'png', size: 128 }),
                rank: p1Stats?.rank || '?'
            };
            p2Data = {
                username: p2User?.username || 'Patron',
                displayName: getResolvableName(p2Member) || p2User?.username || 'Patron',
                avatarURL: p2User?.displayAvatarURL({ extension: 'png', size: 128 }),
                rank: p2Stats?.rank || '?'
            };
        }

        const isGameOver = ['WON', 'DRAW', 'FORFEITED', 'CANCELLED'].includes(gameState.status);

        // [1] Turn Expiry Calculation
        const lastMove = new Date(gameState.last_move_at || gameState.startedAt).getTime();
        const expiryTimestamp = Math.floor((lastMove + (120 * 1000)) / 1000);

        // Generate Frame
        const buffer = await connect4Generator.generateBoard(gameState, { p1Data, p2Data });
        const attachment = new AttachmentBuilder(buffer, { name: `connect4-${Date.now()}.webp` });

        const currentTurn = gameState.current_turn || gameState.currentTurn;
        let content = '';
        if (gameState.status === 'PLAYING') {
            content = `🎮 **Connect Muse:** It is <@${currentTurn}>'s turn! (Expires <t:${expiryTimestamp}:R>)`;
            content += `\n*Protocol Sequence: ${gameState.moves} moves | 2-minute move limit enforced*`;
        } else {
            // Game Over: Clear text
            content = '';
        }

        // Build Interface
        const components = [];
        const prefix = process.env.TEST_MODE === 'true' ? 't4' : 'c4';

        if (gameState.status === 'PLAYING') {
            // Logic: Disable buttons for columns that are already full
            const board = gameState.board;
            const isColFull = (c) => board[0][c] !== 0;

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`${prefix}_drop_${gameState.id}_0`).setLabel('1').setStyle(ButtonStyle.Primary).setDisabled(isColFull(0)),
                new ButtonBuilder().setCustomId(`${prefix}_drop_${gameState.id}_1`).setLabel('2').setStyle(ButtonStyle.Primary).setDisabled(isColFull(1)),
                new ButtonBuilder().setCustomId(`${prefix}_drop_${gameState.id}_2`).setLabel('3').setStyle(ButtonStyle.Primary).setDisabled(isColFull(2)),
                new ButtonBuilder().setCustomId(`${prefix}_drop_${gameState.id}_3`).setLabel('4').setStyle(ButtonStyle.Primary).setDisabled(isColFull(3)),
                new ButtonBuilder().setCustomId(`${prefix}_drop_${gameState.id}_4`).setLabel('5').setStyle(ButtonStyle.Primary).setDisabled(isColFull(4))
            );
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`${prefix}_drop_${gameState.id}_5`).setLabel('6').setStyle(ButtonStyle.Primary).setDisabled(isColFull(5)),
                new ButtonBuilder().setCustomId(`${prefix}_drop_${gameState.id}_6`).setLabel('7').setStyle(ButtonStyle.Primary).setDisabled(isColFull(6)),
                new ButtonBuilder().setCustomId(`${prefix}_forfeit_${gameState.id}`).setLabel('Forfeit').setStyle(ButtonStyle.Danger).setEmoji('🏳️')
            );
            components.push(row1, row2);
        } else if (isGameOver) {
            content = ''; // Clear text for any game over state
            // Only show Rematch/Leaderboard for natural end games (not forfeits)
            if (['WON', 'DRAW'].includes(gameState.status)) {
                const rematchBtn = new ButtonBuilder()
                    .setCustomId(`${prefix}_rematch_${gameState.id}`)
                    .setLabel('Rematch')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄');
                
                const leaderboardBtn = new ButtonBuilder()
                    .setCustomId('leaderboard_minigames')
                    .setLabel('View Leaderboard')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📊');

                const controlsRow = new ActionRowBuilder().addComponents(rematchBtn, leaderboardBtn);
                components.push(controlsRow);
            }
        }

        // Update the message
        const payload = {
            content: content,
            files: [attachment],
            attachments: [], 
            components: components
        };

        if (interaction.isButton && interaction.isButton() && !interaction.deferred && !interaction.replied) {
            await interaction.update(payload);
        } else if (interaction.editReply && (interaction.deferred || interaction.replied)) {
            await interaction.editReply(payload);
        } else if (interaction.edit) {
            await interaction.edit(payload);
        } else if (interaction.message && interaction.message.edit) {
            await interaction.message.edit(payload);
        }


        // 🏆 Winner Broadcaster (Success Slip)
        if (isGameOver && gameState.reward?.pointsAwarded > 0) {
            const winnerId = gameState.winner;
            const winnerData = winnerId === p1Id ? p1Data : p2Data;
            
            const toastBuffer = await toastGenerator.generateSuccessSlip({
                user: winnerData,
                pointsEarned: gameState.reward.pointsAwarded,
                totalPoints: gameState.reward.totalPoints,
                gameName: 'CONNECT4',
                color: winnerData.color // Passing theme color if available
            });
            await interaction.channel.send({
                files: [new AttachmentBuilder(toastBuffer, { name: 'victory-slip.webp' })]
            }).catch(err => logger.error('[Connect Muse] Failed to send victory slip:', err));
        }

        // Auto-cleanup for game over buttons
        if (isGameOver && (interaction.editReply || (interaction.message && interaction.message.edit))) {
            setTimeout(async () => {
                try {
                    const finalMsg = interaction.message || (await interaction.fetchReply().catch(() => null));
                    if (finalMsg) {
                        await finalMsg.edit({ components: [] }).catch(() => null);
                    }
                } catch (e) {}
            }, 60000); // 1 Minute cleanup
        }
    } catch (err) {
        logger.error('[Connect4] View update failure:', err);
    }
};

module.exports = {
    handleConnect4Interaction,
    routerConfig: {
        prefixes: ['c4_', 't4_'],
        handle: async (interaction) => {
            const { customId } = interaction;
            if (customId.startsWith('c4_cancel') || customId.startsWith('t4_cancel')) {
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
