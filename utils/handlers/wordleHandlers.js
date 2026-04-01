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

    // Security Check: Only the game owner can interact
    if (user.id !== targetUserId) {
        return interaction.reply({ 
            content: '🔒 **Terminal Locked.** This archive session is synchronized to another patron.', 
            flags: MessageFlags.Ephemeral 
        });
    }

    if (action === 'guess') {
        const modal = new ModalBuilder()
            .setCustomId(`wordle_modal_guess_${user.id}`)
            .setTitle('Decode Archive');

        const input = new TextInputBuilder()
            .setCustomId('guess_input')
            .setLabel('5-Letter Sequence')
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
            const buffer = await wordleGenerator.generateBoard(gameState);
            const attachment = new AttachmentBuilder(buffer, { name: 'wordle.png' });

            const embed = baseEmbed('Wordle Archives', 'A new 5-letter sequence has been materialized. Begin decoding protocol.')
                .setImage('attachment://wordle.png');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`wordle_guess_${user.id}`).setLabel('Submit Guess').setStyle(ButtonStyle.Primary).setEmoji('⌨️')
            );

            await interaction.editReply({ embeds: [embed], components: [row], files: [attachment] });
        } catch (error) {
            logger.error('[Wordle] Failed to start new game:', error);
            await interaction.followUp({ content: `❌ **Protocol Failure:** ${error.message}`, flags: MessageFlags.Ephemeral });
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

    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();

    // 1. Retrieve Active Game
    const game = wordleService.getGame(user.id);
    if (!game) {
        return interaction.followUp({ content: '❌ **Session Expired.** Please start a new game.', flags: MessageFlags.Ephemeral });
    }

    // 2. Validate Word (External API)
    const isValid = await wordleService.isValidWord(guess);
    if (!isValid) {
        return interaction.followUp({ content: `❌ **"${guess}"** is not recognized in the standard English archives.`, flags: MessageFlags.Ephemeral });
    }

    // 3. Process Guess
    const gameState = wordleService.submitGuess(user.id, guess);
    if (!gameState) return;

    // 4. Render Updates
    const buffer = await wordleGenerator.generateBoard(gameState);
    const attachment = new AttachmentBuilder(buffer, { name: 'wordle.png' });

    const embed = baseEmbed('Wordle Archives')
        .setImage('attachment://wordle.png');

    const row = new ActionRowBuilder();
    
    if (gameState.status === 'PLAYING') {
        embed.setDescription(`Sequence **${gameState.guesses.length}/6** recorded. Continue the search.`);
        row.addComponents(
            new ButtonBuilder().setCustomId(`wordle_guess_${user.id}`).setLabel('Submit Guess').setStyle(ButtonStyle.Primary).setEmoji('⌨️')
        );
    } else {
        const isWin = gameState.status === 'WON';
        const title = isWin ? '🏆 Archive Decoded' : '💀 Archive Lost';
        const desc = isWin 
            ? `Success! You identified the sequence **${gameState.targetWord}** in **${gameState.guesses.length}** attempts.`
            : `Protocol failed. The sequence was **${gameState.targetWord}**. The archive has been redacted.`;
        
        embed.setTitle(title).setDescription(desc).setColor(isWin ? '#22C55E' : '#EF4444');
        
        row.addComponents(
            new ButtonBuilder().setCustomId(`wordle_new_${user.id}`).setLabel('Try Again').setStyle(ButtonStyle.Success).setEmoji('🔄')
        );
        wordleService.endGame(user.id);
    }

    await interaction.editReply({ embeds: [embed], components: [row], files: [attachment] });
};

module.exports = { handleWordleInteraction, handleWordleModals };
