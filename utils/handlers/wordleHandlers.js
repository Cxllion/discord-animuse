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
const logger = require('../core/logger');

/**
 * Wordle Handlers: Manages interactions and modal submissions for the Wordle game.
 */

const handleWordleInteraction = async (interaction) => {
    const { customId, user } = interaction;
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

    if (action === 'new') {
        try {
            if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
            
            const gameState = await wordleService.startNewGame(user.id);
            
            // 1. Generate Anonymized (Public)
            const bufferAnon = await wordleGenerator.generateBoard(gameState, { anonymize: true });
            const attachmentAnon = new AttachmentBuilder(bufferAnon, { name: 'wordle-anon.png' });

            const nextReset = new Date();
            nextReset.setUTCHours(24, 0, 0, 0);
            const resetTs = Math.floor(nextReset.getTime() / 1000);

            const embedAnon = baseEmbed('Daily Archive Decoding', `The current 5-letter cipher has been materialized. The archive will synchronize <t:${resetTs}:R>.`)
                .setImage('attachment://wordle-anon.png');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`wordle_guess_${user.id}`).setLabel('Submit Guess').setStyle(ButtonStyle.Primary).setEmoji('⌨️')
            );

            // Update Public Message
            await interaction.editReply({ embeds: [embedAnon], components: [row], files: [attachmentAnon] });

            // 2. Generate Personalized (Private Ephemeral)
            const bufferPersonal = await wordleGenerator.generateBoard(gameState, { anonymize: false });
            const attachmentPersonal = new AttachmentBuilder(bufferPersonal, { name: 'wordle-personal.png' });

            const embedPersonal = baseEmbed('Daily Wordle (Personal Console)')
                .setDescription('Your private decoding terminal is active. Submit your guesses via the public button.')
                .setImage('attachment://wordle-personal.png');

            await interaction.followUp({ 
                files: [attachmentPersonal], 
                flags: [MessageFlags.Ephemeral] 
            });

        } catch (error) {
            logger.error('[Wordle] Failed to start new game:', error);
            await interaction.followUp({ content: `❌ **Protocol Failure:** ${error.message}`, flags: [MessageFlags.Ephemeral] });
        }
    }
};

const handleWordleModals = async (interaction) => {
    const { customId, user, fields } = interaction;
    const guess = fields.getTextInputValue('guess_input').toUpperCase();

    // Basic Validation
    if (!/^[A-Z]{5}$/.test(guess)) {
        return interaction.reply({ content: '❌ **Invalid Input.** Please enter exactly 5 letters (A-Z).', flags: MessageFlags.Ephemeral });
    }

    // 1. Retrieve Private Game
    const game = wordleService.getGame(user.id);
    if (!game) {
        return interaction.reply({ 
            content: '❌ **Session Expired.** Please use `/wordle` to initialize a new decoding session.', 
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

    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();

    // 2. Validate Word (External API)
    const isValid = await wordleService.isValidWord(guess);
    if (!isValid) {
        return interaction.followUp({ content: `❌ **"${guess}"** is not a recognized word in our archives.`, flags: MessageFlags.Ephemeral });
    }

    // 3. Process Guess
    const gameState = await wordleService.submitGuess(user.id, guess);
    if (!gameState) return;

    const userData = {
        username: user.username,
        avatarURL: user.displayAvatarURL({ extension: 'png', size: 128 })
    };

    // NEW: Gather Social Feed Data (Extended for 5 slots)
    const others = await wordleService.getRecentGames(user.id, 5);
    const otherGames = await Promise.all(others.map(async (g) => {
        try {
            const u = await interaction.client.users.fetch(g.userId);
            return {
                ...g,
                user: {
                    username: u.username,
                    avatarURL: u.displayAvatarURL({ extension: 'png', size: 64 })
                }
            };
        } catch (e) {
            return { ...g, user: { username: 'Patron', avatarURL: null } };
        }
    }));

    // 4. Render Updates (Full Content Cards)
    const bufferAnon = await wordleGenerator.generateBoard(gameState, { 
        anonymize: true, 
        user: userData,
        otherGames: otherGames
    });
    const bufferPersonal = await wordleGenerator.generateBoard(gameState, { 
        anonymize: false, 
        user: userData 
    });
    
    const attachmentAnon = new AttachmentBuilder(bufferAnon, { name: 'wordle-anon.png' });
    const attachmentPersonal = new AttachmentBuilder(bufferPersonal, { name: 'wordle-personal.png' });
    const personalAttachments = [attachmentPersonal];

    // NEW: Generate Success Slip if game ended
    if (gameState.status !== 'PLAYING' && gameState.reward) {
        const toastBuffer = await toastGenerator.generateSuccessSlip({
            user: { username: interaction.user.username, avatarURL: user.displayAvatarURL({ extension: 'png', size: 128 }) },
            pointsEarned: gameState.reward.points,
            streakBonus: gameState.reward.streakBonus,
            totalPoints: gameState.reward.totalPoints,
            streak: gameState.reward.streak,
            gameName: 'Wordle',
            extraLine: gameState.reward.definition
        });
        personalAttachments.push(new AttachmentBuilder(toastBuffer, { name: 'success-slip.png' }));
    }

    // 5. Update BOTH views
    try {
        const row = new ActionRowBuilder();
        
        if (gameState.status === 'PLAYING') {
            row.addComponents(
                new ButtonBuilder().setCustomId(`wordle_guess_${user.id}`).setLabel('Submit Guess').setStyle(ButtonStyle.Primary).setEmoji('⌨️')
            );
        } else {
            row.addComponents(
                new ButtonBuilder().setCustomId('leaderboard_minigames').setLabel('View Leaderboard').setStyle(ButtonStyle.Secondary).setEmoji('📊')
            );
        }

        const responseData = {
            content: gameState.status !== 'PLAYING' 
                ? `🏮 **TERMINAL DEACTIVATED**\nResults have been archived. Use \`/leaderboard: minigames\` to check global standings.` 
                : null,
            components: [row], 
            files: personalAttachments
        };

        if (interaction.message.flags.has(MessageFlags.Ephemeral)) {
            await interaction.editReply(responseData);
        } else {
            await interaction.followUp({ ...responseData, flags: [MessageFlags.Ephemeral] });
        }

        // B. Update Public Feed (In background)
        if (gameState.publicMessageId && gameState.publicChannelId) {
            const channel = await interaction.client.channels.fetch(gameState.publicChannelId);
            if (channel) {
                await channel.messages.edit(gameState.publicMessageId, {
                    files: [attachmentAnon],
                    components: [row] 
                });
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
        prefixes: ['wordle_'],
        handle: async (interaction) => {
            if (interaction.isModalSubmit()) return handleWordleModals(interaction);
            return handleWordleInteraction(interaction);
        }
    }
};
