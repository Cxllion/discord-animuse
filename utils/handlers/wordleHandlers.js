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
            content: '🔒 **Terminal Locked.** This session is synchronized to another patron.', 
            flags: MessageFlags.Ephemeral 
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
            const buffer = await wordleGenerator.generateBoard(gameState);
            const attachment = new AttachmentBuilder(buffer, { name: 'wordle.png' });

            const embed = baseEmbed('Daily Wordle', 'A new 5-letter word has been materialized. Begin the decoding protocol.')
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
        return interaction.followUp({ content: `❌ **"${guess}"** is not a recognized word in our archives.`, flags: MessageFlags.Ephemeral });
    }

    // 3. Process Guess
    const gameState = await wordleService.submitGuess(user.id, guess);
    if (!gameState) return;

    // 4. Render Updates
    const buffer = await wordleGenerator.generateBoard(gameState);
    const attachment = new AttachmentBuilder(buffer, { name: 'wordle.png' });

    const embed = baseEmbed('Daily Wordle')
        .setImage('attachment://wordle.png');

    const row = new ActionRowBuilder();
    
    if (gameState.status === 'PLAYING') {
        embed.setDescription(`Guess **${gameState.guesses.length}/6** recorded. Keep going.`);
        row.addComponents(
            new ButtonBuilder().setCustomId(`wordle_guess_${user.id}`).setLabel('Submit Guess').setStyle(ButtonStyle.Primary).setEmoji('⌨️')
        );
    } else {
        const isWin = gameState.status === 'WON';
        const reward = gameState.reward || { points: 0, firstBlood: false };
        
        let title = isWin ? '🏆 Wordle Decoded' : '💀 Archive Lost';
        let desc = isWin 
            ? `Success! You identified the word **${gameState.targetWord}** in **${gameState.guesses.length}** attempts.`
            : `Protocol failed. The word was **${gameState.targetWord}**. The record has been redacted.`;

        if (isWin) {
            desc += `\n\n✨ **Points Earned:** +${reward.points} PTS`;
            if (reward.firstBlood) {
                desc += `\n🩸 **FIRST BLOOD!** Bonus awarded for being the first solver today.`;
                title = '🩸 First Blood: Archive Decoded';
            }
        } else {
            desc += `\n\nNo points were awarded for this solar cycle.`;
        }
        
        embed.setTitle(title).setDescription(desc).setColor(isWin ? '#22C55E' : '#EF4444');
        
        row.addComponents(
            new ButtonBuilder().setCustomId('leaderboard_minigames').setLabel('View Leaderboard').setStyle(ButtonStyle.Secondary).setEmoji('📊')
        );
        
        // Note: wordleService.endGame is handled internally by submitGuess for daily logic
    }

    await interaction.editReply({ embeds: [embed], components: [row], files: [attachment] });
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
