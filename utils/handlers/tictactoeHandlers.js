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
            
            await interaction.deferUpdate();

            const oldGame = await tictactoeService.getGame(gameId);
            if (!oldGame) return;

            const currentTurn = oldGame.current_turn || oldGame.currentTurn;
            if (user.id !== currentTurn) {
                return interaction.followUp({
                    content: '⚠️ **Protocol Deviation:** It is not your turn in this link sequence. Please wait for your opponent.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            const updatedGame = await tictactoeService.submitMove(gameId, user.id, row, col);
            if (!updatedGame) return; 

            if (oldGame.playerData) {
                updatedGame.playerData = oldGame.playerData;
            }

            const originalComponents = interaction.message.components;
            const thinkingComponents = originalComponents.map(compRow => {
                const newRow = ActionRowBuilder.from(compRow);
                newRow.components.forEach(btn => {
                    const btnData = btn.toJSON();
                    if (btnData.custom_id === customId) {
                        btn.setLabel('...').setDisabled(true);
                    } else {
                        btn.setDisabled(true);
                    }
                });
                return newRow;
            });
            await interaction.editReply({ components: thinkingComponents });

            await updateTicTacToeViews(interaction, updatedGame);

        } else if (action === 'rematch') {
            await interaction.deferUpdate();

            const opponentId = user.id === game.player1 ? game.player2 : game.player1;
            const prefix = process.env.TEST_MODE === 'true' ? 't3t' : 't3';

            const inviteMessage = `🌸 **TACTICAL LINK: REMATCH REQUESTED**\n\n<@${user.id}> is challenging <@${opponentId}> to a **Tic Tac Toe** rematch!\n\n**Protocol Details:**\n• Turn Limit: 2 Minutes\n• Victory Prize: 1 Arcade Point\n• Board State: Initialized\n\n*Awaiting biometric authorization...*`;

            const rematchRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`${prefix}_accept_${user.id}_${opponentId}`).setLabel('Accept').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`${prefix}_decline_${user.id}_${opponentId}`).setLabel('Decline').setStyle(ButtonStyle.Secondary)
            );

            await interaction.editReply({ components: [] }).catch(() => {});

            await interaction.channel.send({
                content: `👋 <@${opponentId}>, a rematch request has arrived!\n\n${inviteMessage}`,
                components: [rematchRow]
            });

        } else if (action === 'accept') {
            const challengerId = parts[2];
            const opponentId = parts[3];
            
            if (user.id !== opponentId) {
                return interaction.reply({ content: '🔒 **Unauthorized Access:** Only the invited patron can accept this tactical link.', flags: [MessageFlags.Ephemeral] });
            }

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

                gameState.publicMessageId = interaction.message.id;
                gameState.publicChannelId = interaction.channelId;
                gameState.playerData = playerData;
                await tictactoeService.saveSession(gameState.id, gameState);

                await updateTicTacToeViews(interaction, gameState);

            } catch (innerError) {
                logger.error('[TicTacToe] Accept Logic Failure:', innerError);
                await interaction.followUp({ content: `❌ **Protocol Error:** ${innerError.message}`, flags: [MessageFlags.Ephemeral] }).catch(() => null);
            }
        } else if (action === 'decline') {
            const opponentId = parts[3];
            if (user.id !== opponentId) {
                return interaction.reply({ content: '🔒 **Unauthorized Access:** Only the invited patron can decline this tactical link.', flags: [MessageFlags.Ephemeral] });
            }
            await interaction.update({ content: '❌ **Protocol Terminated:** The requested patron has declined the tactical link.', embeds: [], components: [] });
        }
    } catch (error) {
        logger.error('[TicTacToe] Handler Error:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ **Critical System Failure:** ' + error.message, flags: [MessageFlags.Ephemeral] });
        }
    }
};

const updateTicTacToeViews = async (context, gameState) => {
    try {
        const prefix = process.env.TEST_MODE === 'true' ? 't3t' : 't3';
        const p1Meta = gameState.playerData?.p1 || { username: 'PLAYER ONE' };
        const p2Meta = gameState.playerData?.p2 || { username: 'PLAYER TWO' };

        const boardBuffer = await tictactoeGenerator.generateBoard(gameState, p1Meta, p2Meta);
        const attachment = new AttachmentBuilder(boardBuffer, { name: 'tictactoe-board.webp' });

        const isGameOver = gameState.status !== 'PLAYING';
        
        // Build 3x3 Grid of Buttons
        const components = [];
        for (let r = 0; r < 3; r++) {
            const row = new ActionRowBuilder();
            for (let c = 0; c < 3; c++) {
                const val = gameState.board[r][c];
                const btn = new ButtonBuilder()
                    .setCustomId(`${prefix}_drop_${gameState.id}_${r}_${c}`)
                    .setStyle(val === 1 ? ButtonStyle.Primary : (val === 2 ? ButtonStyle.Danger : ButtonStyle.Secondary))
                    .setDisabled(isGameOver || val !== 0);

                if (val === 1) btn.setEmoji('✖️');
                else if (val === 2) btn.setEmoji('⭕');
                else btn.setLabel('\u200b'); // Empty Space

                row.addComponents(btn);
            }
            components.push(row);
        }

        if (isGameOver) {
            const rematchBtn = new ButtonBuilder()
                .setCustomId(`${prefix}_rematch_${gameState.id}`)
                .setLabel('Request Rematch')
                .setStyle(ButtonStyle.Success);
            const controlsRow = new ActionRowBuilder().addComponents(rematchBtn);
            components.push(controlsRow);
        }

        const msgOptions = {
            content: isGameOver ? `🏁 **Match Finalized!**` : `🕹️ **Tactical Link Active:** <@${gameState.current_turn || gameState.currentTurn}>'s Turn.`,
            files: [attachment],
            components,
            attachments: [] 
        };

        let messageUpdated = false;
        if (context.editReply && !context.replied && context.deferred) {
            await context.editReply(msgOptions);
            messageUpdated = true;
        } else if (context.message && context.message.edit) {
            await context.message.edit(msgOptions);
            messageUpdated = true;
        } else {
            await context.channel.send(msgOptions);
        }

        if (isGameOver && gameState.reward && gameState.winner) {
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
