const { 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    AttachmentBuilder,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');
const tictactoeService = require('../services/tictactoeService');
const tictactoeGenerator = require('../generators/tictactoeGenerator');
const minigameService = require('../services/minigameService');
const { getResolvableName } = require('../core/visualUtils');
const toastGenerator = require('../generators/toastGenerator');
const logger = require('../core/logger');
const { handleInteractionError } = require('../core/errorHandler');

// Memory locks for initialization to prevent race conditions
const initLocks = new Set();

const rateLimitCache = new Set();

const handleTicTacToeInteraction = async (interaction) => {
    const { customId, user } = interaction;
    const parts = customId.split('_'); 
    const action = parts[1];
    
    let gameId = parts[2];
    
    if (parts.length > 4 && action !== 'accept') {
        gameId = parts.slice(2, -2).join('_'); // e.g. t3_drop_id_r_c -> id
    }

    if (rateLimitCache.has(user.id)) {
        return interaction.reply({ content: '⏳ **System Processing:** Please wait for the terminal to synchronize.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
    }
    
    rateLimitCache.add(user.id);
    setTimeout(() => rateLimitCache.delete(user.id), 1000);

    const gameActions = ['drop', 'forfeit', 'forfeitconfirm', 'rematch', 'cancel'];
    let game = null;

    if (gameActions.includes(action)) {
        game = await tictactoeService.getGame(gameId);
        if (!game) {
            return interaction.reply({ 
                content: '❌ **Tic Tac Toe:** Match not found.', 
                flags: [MessageFlags.Ephemeral] 
            });
        }

        if (user.id !== game.player1 && user.id !== game.player2) {
            return interaction.reply({ 
                content: '🔒 **Unauthorized Access:** This tactical link is restricted to the engaged patrons.', 
                flags: [MessageFlags.Ephemeral] 
            });
        }

        if (game.status !== 'PLAYING' && action !== 'rematch') {
            return interaction.reply({ 
                content: '🏁 **Tic Tac Toe:** This match has already been finalized.', 
                flags: [MessageFlags.Ephemeral] 
            });
        }
    }

    try {
        if (action === 'drop') {
            const row = parseInt(parts[parts.length - 2]);
            const col = parseInt(parts[parts.length - 1]);
            
            if (isNaN(row) || isNaN(col)) {
                return interaction.reply({ content: '❌ **Protocol Error:** Invalid navigational coordinates received.', flags: [MessageFlags.Ephemeral] });
            }
            
            // No deferUpdate here for immediate response speed

            const oldGame = await tictactoeService.getGame(gameId);
            if (!oldGame) return;

            const currentTurn = oldGame.current_turn || oldGame.currentTurn;
            if (user.id !== currentTurn) {
                return interaction.reply({
                    content: '⚠️ **Protocol Deviation:** It is not your turn in this link sequence. Please wait for your opponent.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const updatedGame = await tictactoeService.submitMove(gameId, user.id, row, col);
            if (!updatedGame) return; 

            if (oldGame.playerData) {
                updatedGame.playerData = oldGame.playerData;
            }

            // Respond immediately with the updated view for maximum speed
            await updateTicTacToeViews(interaction, updatedGame);
        } else if (action === 'forfeit') {
            const prefix = process.env.TEST_MODE === 'true' ? 't3t' : 't3';
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
            
            const updatedGame = await tictactoeService.forfeitGame(gameId, user.id);
            if (!updatedGame) return;

            const channel = await interaction.client.channels.fetch(updatedGame.publicChannelId || updatedGame.public_channel_id).catch(() => null);
            if (channel) {
                const mainMsg = await channel.messages.fetch(updatedGame.publicMessageId || updatedGame.public_message_id).catch(() => null);
                if (mainMsg) {
                    await updateTicTacToeViews({ message: mainMsg, client: interaction.client, guild: interaction.guild }, updatedGame);
                }
            }
        } else if (action === 'cancel') {
            await interaction.update({ content: '⚙️ **Protocol Resumed:** Tactical link remains active.', components: [] });
        } else if (action === 'rematch') {
            const opponentId = user.id === game.player1 ? game.player2 : game.player1;
            const initLockId = `ttt_rematch_${gameId}`;
            
            if (initLocks.has(initLockId)) return;
            initLocks.add(initLockId);

            if (game.rematch_requested || game.rematchRequested) {
                initLocks.delete(initLockId);
                return interaction.reply({ content: '⚠️ **Protocol Active:** A rematch request has already been broadcast for this link.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
            }

            await interaction.deferUpdate();

            try {
                const prefix = process.env.TEST_MODE === 'true' ? 't3t' : 't3';

                // Lock session for rematch
                await tictactoeService.saveSession(gameId, { ...game, rematch_requested: true });

            const inviteEmbed = new EmbedBuilder()
                .setTitle('Tic Tac Toe Rematch Invitation')
                .setDescription(`<@${user.id}> is requesting a **Tic Tac Toe** rematch with <@${opponentId}>.`)
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

            const initLockId = `ttt_init_${challengerId}_${opponentId}`;
            if (initLocks.has(initLockId)) return;
            initLocks.add(initLockId);

            await interaction.deferUpdate();

            try {
                const gameState = await tictactoeService.startNewGame(challengerId, opponentId, interaction.guildId);
                
                if (!gameState) {
                    throw new Error('FAILED_TO_START: Service returned null session.');
                }

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

                // Generate initial views
                const prefix = process.env.TEST_MODE === 'true' ? 't3t' : 't3';
                const boardBuffer = await tictactoeGenerator.generateBoard(gameState, playerData.p1, playerData.p2);
                const attachment = new AttachmentBuilder(boardBuffer, { name: 'tictactoe-board.webp' });
                
                const components = [];
                for (let r = 0; r < 3; r++) {
                    const row = new ActionRowBuilder();
                    for (let c = 0; c < 3; c++) {
                        row.addComponents(
                            new ButtonBuilder()
                                .setCustomId(`${prefix}_drop_${gameState.id}_${r}_${c}`)
                                .setStyle(ButtonStyle.Secondary)
                                .setLabel('\u200b')
                        );
                    }
                    components.push(row);
                }
                const controlsRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`${prefix}_forfeit_${gameState.id}`).setLabel('Forfeit').setStyle(ButtonStyle.Danger)
                );
                components.push(controlsRow);

                // NEW: Send board as a NEW message to keep the channel clean
                const isGameOver = gameState.status !== 'PLAYING';
                const turnText = isGameOver ? 'Link Terminated.' : `<@${gameState.current_turn}>'s Turn.`;
                
                const gameMessage = await interaction.channel.send({
                    content: `🕹️ **Tactical Link Active:** ${turnText}`,
                    files: [attachment],
                    components: components
                });

                gameState.publicMessageId = gameMessage.id;
                gameState.publicChannelId = interaction.channelId;
                gameState.playerData = playerData;
                await tictactoeService.saveSession(gameState.id, gameState);

                // Delete the invitation to keep the channel clean
                await interaction.deleteReply().catch(() => null);

            } catch (innerError) {
                logger.error('[TicTacToe] Accept Logic Failure:', innerError);
                const errorMsg = innerError.message.includes('ACTIVE_LINK_DETECTED') 
                    ? '🛡️ **Engagement Error:** One or more patrons are already engaged in an active Tactical Link. Please finalize your current match first.'
                    : `❌ **Protocol Error:** ${innerError.message}`;
                await interaction.followUp({ content: errorMsg, flags: [MessageFlags.Ephemeral] }).catch(() => null);
            } finally {
                initLocks.delete(`ttt_init_${challengerId}_${opponentId}`);
            }
        } else if (action === 'decline') {
            const opponentId = parts[3];
            if (user.id !== opponentId) {
                return interaction.reply({ content: '🔒 **Unauthorized Access:** Only the invited patron can decline this tactical link.', flags: [MessageFlags.Ephemeral] });
            }
            await interaction.update({ content: '❌ **Protocol Terminated:** The requested patron has declined the tactical link.', embeds: [], components: [] });
        }
    } catch (error) {
        await handleInteractionError(interaction, error, 'An error occurred within the Tic Tac Toe protocol.');
    }
};

const updateTicTacToeViews = async (context, gameState) => {
    try {
        const prefix = process.env.TEST_MODE === 'true' ? 't3t' : 't3';
        const p1Meta = gameState.playerData?.p1 || { username: 'PLAYER ONE' };
        const p2Meta = gameState.playerData?.p2 || { username: 'PLAYER TWO' };

        const boardBuffer = await tictactoeGenerator.generateBoard(gameState, p1Meta, p2Meta);
        const attachment = new AttachmentBuilder(boardBuffer, { name: 'tictactoe-board.webp' });

        const isGameOver = ['WON', 'DRAW', 'FORFEITED', 'CANCELLED'].includes(gameState.status);
        
        // Build 3x3 Grid of Buttons (Only if active)
        const components = [];
        if (!isGameOver) {
            for (let r = 0; r < 3; r++) {
                const row = new ActionRowBuilder();
                for (let c = 0; c < 3; c++) {
                    const val = gameState.board[r][c];
                    const btn = new ButtonBuilder()
                        .setCustomId(`${prefix}_drop_${gameState.id}_${r}_${c}`)
                        .setStyle(val === 1 ? ButtonStyle.Danger : (val === 2 ? ButtonStyle.Primary : ButtonStyle.Secondary))
                        .setDisabled(val !== 0);

                    if (val === 1) btn.setEmoji('✖️');
                    else if (val === 2) btn.setEmoji('⭕');
                    else btn.setLabel('\u200b'); // Empty Space

                    row.addComponents(btn);
                }
                components.push(row);
            }
        }
        if (isGameOver) {
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
        } else {
            // Active Game: Add Forfeit Button
            const forfeitBtn = new ButtonBuilder()
                .setCustomId(`${prefix}_forfeit_${gameState.id}`)
                .setLabel('Forfeit')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🏳️');
            const controlsRow = new ActionRowBuilder().addComponents(forfeitBtn);
            components.push(controlsRow);
        }

        const currentTurn = gameState.current_turn || gameState.currentTurn;
        let content = '';
        if (gameState.status === 'PLAYING') {
            content = `🕹️ **Tactical Link Active:** <@${currentTurn}>'s Turn.`;
        } else {
            // Game Over: Clear the content as requested
            content = '';
        }

        const msgOptions = {
            content: content,
            files: [attachment],
            components,
            attachments: [] 
        };

        let messageUpdated = false;
        if (context.isButton && context.isButton() && !context.deferred && !context.replied) {
            await context.update(msgOptions);
        } else if (context.editReply && (context.deferred || context.replied)) {
            await context.editReply(msgOptions);
        } else if (context.edit) {
            await context.edit(msgOptions);
        } else if (context.message && context.message.edit) {
            await context.message.edit(msgOptions);
        } else {
            await context.channel.send(msgOptions);
        }

        if (isGameOver && gameState.reward?.pointsAwarded > 0 && gameState.winner) {
            const winnerMeta = gameState.winner === p1Meta.id ? p1Meta : p2Meta;
            const themeColor = gameState.winner === p1Meta.id ? tictactoeGenerator.COLORS.P1_NEON : tictactoeGenerator.COLORS.P2_NEON;
            
            const slipBuffer = await toastGenerator.generateSuccessSlip({
                user: winnerMeta,
                pointsEarned: gameState.reward.pointsAwarded,
                totalPoints: gameState.reward.totalPoints,
                gameName: 'TICTACTOE',
                streak: 0,
                color: themeColor
            });

            const channel = context.channel || (context.message && context.message.channel) || await context.client.channels.fetch(gameState.publicChannelId);
            if (channel) {
                await channel.send({
                    files: [new AttachmentBuilder(slipBuffer, { name: 'success-slip.webp' })]
                });
            }
        }
        
        // Auto-cleanup for game over buttons
        if (isGameOver && (context.editReply || context.message?.edit)) {
            setTimeout(async () => {
                try {
                    const finalMsg = context.message || (await context.fetchReply().catch(() => null));
                    if (finalMsg) {
                        await finalMsg.edit({ components: [] }).catch(() => null);
                    }
                } catch (e) {}
            }, 60000); // 1 Minute cleanup
        }
    } catch (e) {
        logger.error('[TicTacToe] Visual Update Failure:', e);
    }
};

module.exports = {
    handleTicTacToeInteraction,
    routerConfig: {
        prefixes: ['t3_', 't3t_'],
        handle: async (interaction) => {
            const { customId } = interaction;
            if (customId.startsWith('t3_cancel') || customId.startsWith('t3t_cancel')) {
                return interaction.deleteReply().catch(() => {});
            }
            return handleTicTacToeInteraction(interaction);
        }
    }
};
