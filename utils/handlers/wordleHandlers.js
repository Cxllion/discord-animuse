const { 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    AttachmentBuilder,
    MessageFlags
} = require('discord.js');
const wordleService = require('../services/wordleService');
const wordleGenerator = require('../generators/wordleGenerator');
const toastGenerator = require('../generators/toastGenerator');
const baseEmbed = require('../generators/baseEmbed');
const { fetchConfig } = require('../core/database');
const minigameService = require('../services/minigameService');
const logger = require('../core/logger');

/**
 * Wordle Handlers: Manages interactions and modal submissions for the Wordle game.
 */

const handleWordleInteraction = async (interaction) => {
    const { customId, user, guildId } = interaction;

    // 0. Arcade Protocol: Channel Verification
    const config = await fetchConfig(guildId);
    const isAdmin = interaction.member?.permissions.has('Administrator');
    const isArcadeChannel = config?.arcade_channel_id && interaction.channelId === config.arcade_channel_id;

    if (config?.arcade_channel_id && !isArcadeChannel) {
        if (!isAdmin) {
            return await interaction.reply({
                content: `❌ **Arcade Protocol Deviation**: The Daily Wordle terminal can only be accessed within the designated Arcade wing: <#${config.arcade_channel_id}>.`,
                flags: [MessageFlags.Ephemeral]
            });
        }
        // Nudge already provided during initialization usually, but let's keep it robust
    }

    const parts = customId.split('_'); // wordle, action, userId
    const action = parts[1];
    const targetUserId = parts[2];

    // Security Check: Only the game owner can interact with their own board
    if (user.id !== targetUserId) {
        return interaction.reply({ 
            content: '🔒 **Terminal Locked.** This session is synchronized to another patron. Please use `/wordle` to initialize your own terminal.', 
            flags: [MessageFlags.Ephemeral] 
        });
    }

    if (action === 'guess') {
        const modal = new ModalBuilder()
            .setCustomId(`wordle_modal_guess_${user.id}`)
            .setTitle('Wordle: Submit Guess');

        const input = new TextInputBuilder()
            .setCustomId('guess_input')
            .setLabel('5-Letter Word')
            .setStyle(TextInputStyle.Short)
            .setMinLength(5)
            .setMaxLength(5)
            .setRequired(true)
            .setPlaceholder('Enter your 5-letter guess...');

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    if (action === 'forfeit') {
        try {
            // NEW: Source-aware defer logic to prevent public board corruption
            if (!interaction.deferred && !interaction.replied) {
                if (interaction.message?.flags?.has(MessageFlags.Ephemeral)) {
                    await interaction.deferUpdate();
                } else {
                    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
                }
            }
            // Ensure session is in memory first
            await wordleService.getGame(user.id); 
            const gameState = await wordleService.forfeitGame(user.id);
            if (!gameState) {
                return interaction.followUp({ content: '⚠️ **Invalid State.** Your terminal may have already synced. Please check the public board.', flags: [MessageFlags.Ephemeral] }).catch(()=>null);
            }

            // Update views to show game over
            await updateWordleViews(interaction, gameState, user, { isFreshEnd: true });
        } catch (error) {
            logger.error('[Wordle] Forfeit failed:', error);
            await interaction.followUp({ content: `❌ **Forfeit Failure:** ${error.message}`, flags: [MessageFlags.Ephemeral] });
        }
        return;
    }

    if (action === 'progress') {
        try {
            const gameState = await wordleService.getGame(user.id);
            if (!gameState) {
                return interaction.reply({ content: '❌ **No Active Session.** Use `/wordle` to start a new one.', flags: [MessageFlags.Ephemeral] });
            }

            await updateWordleViews(interaction, gameState, user);
        } catch (error) {
            logger.error('[Wordle] Progress recovery failed:', error);
            await interaction.reply({ content: `❌ **Recovery Failure:** ${error.message}`, flags: [MessageFlags.Ephemeral] });
        }
        return;
    }

    if (action === 'result') {
        try {
            const history = await minigameService.getWordleHistory(user.id);
            if (!history) return interaction.reply({ content: '❌ No history found for today.', flags: [MessageFlags.Ephemeral] });

            const bufferPersonal = await wordleGenerator.generateBoard(history, { anonymize: false, user: { username: user.username, avatarURL: user.displayAvatarURL({ extension: 'png', size: 128 }) } });
            const attachmentPersonal = new AttachmentBuilder(bufferPersonal, { name: 'wordle-result.png' });
            
            await interaction.reply({
                files: [attachmentPersonal],
                flags: [MessageFlags.Ephemeral]
            });
        } catch (error) {
            logger.error('[Wordle] Result view failed:', error);
            await interaction.reply({ content: '❌ Failed to fetch result.', flags: [MessageFlags.Ephemeral] });
        }
        return;
    }
};

const handleWordleModals = async (interaction) => {
    const { customId, user, fields, guildId } = interaction;

    // 0. Arcade Protocol: Channel Verification
    const config = await fetchConfig(guildId);
    const isAdmin = interaction.member?.permissions.has('Administrator');
    const isArcadeChannel = config?.arcade_channel_id && interaction.channelId === config.arcade_channel_id;

    if (config?.arcade_channel_id && !isArcadeChannel) {
        if (!isAdmin) {
            return await interaction.reply({
                content: `❌ **Arcade Protocol Deviation**: Submission refused. Terminal input must be synchronized within the designated Arcade wing: <#${config.arcade_channel_id}>.`,
                flags: [MessageFlags.Ephemeral]
            });
        }
    }

    const guess = fields.getTextInputValue('guess_input').toUpperCase();

    // Basic Validation
    if (!/^[A-Z]{5}$/.test(guess)) {
        return interaction.reply({ content: '❌ **Invalid Input.** Please enter exactly 5 letters (A-Z).', flags: MessageFlags.Ephemeral });
    }

    // 1. Retrieve Private Game
    const game = await wordleService.getGame(user.id);
    if (!game) {
        const hasPlayed = await minigameService.hasPlayedToday(user.id);
        if (hasPlayed) {
            return interaction.reply({ 
                content: '🏁 **Archive Synchronized.** You have already completed the decoding protocol for this cycle.', 
                flags: [MessageFlags.Ephemeral] 
            });
        }
        return interaction.reply({ 
            content: '❌ **Session Expired.** The Daily Wordle archives have shifted. Please use `/wordle` to initialize a new decoding session.', 
            flags: [MessageFlags.Ephemeral] 
        });
    }

    // NEW: Graceful Game-Over Handling
    if (game.status !== 'PLAYING') {
        return interaction.reply({
            content: `🏁 **Archive Synchronized.** The word **${game.targetWord}** has already been identified for this cycle. ♡`,
            flags: [MessageFlags.Ephemeral]
        });
    }

    // NEW: Duplicate Guess Prevention
    if (game.guesses.some(g => g.word === guess)) {
        return interaction.reply({
            content: `⚠️ **"${guess}"** has already been attempted on this shared board. Coordinate with your fellow patrons to find the key!`,
            flags: [MessageFlags.Ephemeral]
        });
    }

    // 1. Source-aware defer logic to prevent public board corruption
    if (!interaction.deferred && !interaction.replied) {
        if (interaction.message?.flags?.has(MessageFlags.Ephemeral)) {
            await interaction.deferUpdate();
        } else {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        }
    }

    try {
        // 2. Validate Word (External API)
        const isValid = await wordleService.isValidWord(guess);
        if (!isValid) {
            return interaction.followUp({ content: `❌ **"${guess}"** is not a recognized word in our archives.`, flags: MessageFlags.Ephemeral });
        }

        // 3. Process Guess
        const gameState = await wordleService.submitGuess(user.id, guess);
        if (!gameState) {
            return interaction.followUp({ content: '⚠️ **Processing.** Your terminal is already synchronizing a previous input. Please wait.', flags: [MessageFlags.Ephemeral] }).catch(()=>null);
        }

    // 4. Update BOTH views (updateWordleViews handles all rendering and UI logic)

    // 5. Update BOTH views
    await updateWordleViews(interaction, gameState, user, { isFreshEnd: true });
    } catch (error) {
        logger.error('[Wordle] Modal submission error:', error);
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ content: `❌ **Protocol Error:** ${error.message}`, flags: [MessageFlags.Ephemeral] });
        } else {
            await interaction.reply({ content: `❌ **Protocol Error:** ${error.message}`, flags: [MessageFlags.Ephemeral] });
        }
    }
};

/**
 * Shared utility to update public and private views.
 */
const updateWordleViews = async (interaction, gameState, user, options = {}) => {
    const { isFreshEnd = false } = options;
    const userData = {
        username: user.username,
        displayName: interaction.member?.displayName || user.username,
        avatarURL: user.displayAvatarURL({ extension: 'png', size: 128 })
    };

    try {
        // 1. Create Private Row
        const privateRow = new ActionRowBuilder();
        if (gameState.status === 'PLAYING') {
            privateRow.addComponents(
                new ButtonBuilder().setCustomId(`wordle_guess_${user.id}`).setLabel('Submit Guess').setStyle(ButtonStyle.Primary).setEmoji('⌨️'),
                new ButtonBuilder().setCustomId(`wordle_forfeit_${user.id}`).setLabel('Forfeit').setStyle(ButtonStyle.Danger).setEmoji('🏳️')
            );
        } else {
            // V2: Private console is dismissed/simplified at the end. Only provide a way to check the leaderboard.
            privateRow.addComponents(
                new ButtonBuilder().setCustomId('leaderboard_minigames').setLabel('View Leaderboard').setStyle(ButtonStyle.Secondary).setEmoji('📊')
            );
        }

        // 2. Create Public Row
        let publicRow = null; // Default to no row (closed)
        if (gameState.status === 'PLAYING') {
            publicRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`wordle_guess_${user.id}`).setLabel('Submit Guess').setStyle(ButtonStyle.Primary).setEmoji('⌨️'),
                new ButtonBuilder().setCustomId(`wordle_forfeit_${user.id}`).setLabel('Forfeit').setStyle(ButtonStyle.Danger).setEmoji('🏳️')
            );
        } // V2: If NOT playing, public board closes entirely (no buttons).

        // 3. Update Private Response (Ephemeral)
        const personalAttachments = [];
        let privateContent = null;

        if (gameState.status !== 'PLAYING') {
            // V2: Protect the private attempt by removing the image entirely at game end.
            privateContent = `🏁 **Archive Synchronized.** Your decoding session for today has been successfully archived. You may now dismiss this console to protect your attempt data. ♡`;
        } else {
            const bufferPersonal = await wordleGenerator.generateBoard(gameState, { anonymize: false, user: userData });
            personalAttachments.push(new AttachmentBuilder(bufferPersonal, { name: 'wordle-personal.png' }));
        }
 
        const responseData = { 
            content: privateContent,
            components: [privateRow], 
            files: personalAttachments,
            flags: [MessageFlags.Ephemeral]
        };

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(responseData).catch(() => {});
        } else {
            await interaction.reply(responseData).catch(() => {});
        }

        // 4. Update Public Feed
        if (gameState.publicMessageId && gameState.publicChannelId) {
            const channel = await interaction.client.channels.fetch(gameState.publicChannelId).catch(() => null);
            if (channel) {
                // Fetch recent games for Minigrid
                const others = await wordleService.getRecentGames(user.id, 5);
                const otherGames = await Promise.all(others.map(async (g) => {
                    try {
                        let u = interaction.client.users.cache.get(g.userId);
                        if (!u) u = await interaction.client.users.fetch(g.userId).catch(() => null);
                        let dName = u?.username || 'Patron';
                        if (interaction.guild && u) {
                            const member = await interaction.guild.members.fetch(u.id).catch(() => null);
                            if (member) dName = member.displayName;
                        }
                        return { 
                            ...g, 
                            user: { 
                                username: u?.username || 'Patron',
                                displayName: dName,
                                avatarURL: u?.displayAvatarURL({ extension: 'png', size: 64 }) || null 
                            } 
                        };
                    } catch (e) {
                        return { ...g, user: { username: 'Patron', displayName: 'Patron', avatarURL: null } };
                    }
                }));

                const bufferAnon = await wordleGenerator.generateBoard(gameState, { 
                    anonymize: true, 
                    user: userData,
                    otherGames: otherGames
                });
                
                await channel.messages.edit(gameState.publicMessageId, {
                    files: [new AttachmentBuilder(bufferAnon, { name: `wordle-anon-${Date.now()}.png` })],
                    attachments: [],
                    components: publicRow ? [publicRow] : [] // V2: Remove buttons if publicRow is null
                }).catch(err => logger.warn(`[Wordle] Failed to edit public message ${gameState.publicMessageId}:`, err));

                // 5. Broadcast Public Receipt on Fresh Completion
                if (isFreshEnd && gameState.status !== 'PLAYING' && gameState.reward) {
                    const toastBuffer = await toastGenerator.generateSuccessSlip({
                        user: userData,
                        pointsEarned: gameState.reward.points,
                        streakBonus: gameState.reward.streakBonus,
                        totalPoints: gameState.reward.totalPoints,
                        streak: gameState.reward.streak,
                        gameName: 'Wordle',
                        attempts: gameState.guesses.length
                    });
                    
                    let celebration = '';
                    if (gameState.status === 'WON') {
                        celebration = `🎊 **Arcade Protocol Alert**: <@${user.id}> has successfully decrypted today's cipher! ♡`;
                    } else if (gameState.status === 'LOST') {
                        celebration = `💀 **Protocol Compromised**: <@${user.id}> has failed to decrypt today's cipher. The archival data has been locked. ♡`;
                    } else {
                        celebration = `🏁 **Arcade Protocol Alert**: <@${user.id}> has completed today's decryption protocol. ♡`;
                    }

                    // Send the Success/Failure Slip
                    await channel.send({
                        content: celebration,
                        files: [new AttachmentBuilder(toastBuffer, { name: 'success-slip-public.webp' })]
                    }).catch(err => logger.error('[Wordle] Failed to send public receipt:', err));

                    // V2: Bring the final state of the board to the bottom for visibility
                    await channel.send({
                        files: [new AttachmentBuilder(bufferAnon, { name: 'wordle-final-archive.png' })]
                    }).catch(() => {});

                    // 6. Send Ephemeral Insight to the user so they still get the definition privately
                    if (gameState.status === 'WON' && gameState.reward?.definition) {
                        await interaction.followUp({
                            content: `🔍 **Word Insight**: *${gameState.reward.definition}*`,
                            flags: [MessageFlags.Ephemeral]
                        }).catch(() => {});
                    }
                }
            }
        }
    } catch (err) {
        logger.error('[Wordle] Failed to update views:', err);
    }
};

module.exports = { 
    handleWordleInteraction, 
    handleWordleModals,
    routerConfig: {
        prefixes: ['wordle_', 'leaderboard_minigames'],
        handle: async (interaction) => {
            if (interaction.customId === 'leaderboard_minigames') {
                const leaderboardCommand = require('../../commands/social/leaderboard');
                
                // Mock the options to simulate `/leaderboard type: minigames`
                interaction.options = {
                    getString: (name) => {
                        if (name === 'type') return 'minigames';
                        return null;
                    }
                };
                
                return await leaderboardCommand.execute(interaction);
            }
            if (interaction.isModalSubmit()) return handleWordleModals(interaction);
            return handleWordleInteraction(interaction);
        }
    }
};
