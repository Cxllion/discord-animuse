const { SlashCommandBuilder, MessageFlags, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const wordleService = require('../../utils/services/wordleService');
const wordleGenerator = require('../../utils/generators/wordleGenerator');
const baseEmbed = require('../../utils/generators/baseEmbed');

/**
 * Wordle Command: Entry point for the Daily Wordle challenge.
 */
module.exports = {
    category: 'minigames',
    dbRequired: true,
    cooldown: 15, 
    data: new SlashCommandBuilder()
        .setName('wordle')
        .setDescription('Initialize the Daily Wordle decoding protocol.'),
    
    async execute(interaction) {
        // Initial reply is public (Patron's Private Board)
        await interaction.deferReply();
        
        try {
            const userId = interaction.user.id;
            const user = {
                username: interaction.user.username,
                avatarURL: interaction.user.displayAvatarURL({ extension: 'png', size: 128 })
            };
            
            // 1. Initialize Game State (Individual)
            const gameState = await wordleService.startNewGame(userId);
            
            // 2. Generate Anonymized Board Card (Public)
            const bufferAnon = await wordleGenerator.generateBoard(gameState, { 
                anonymize: true,
                user: user
            });
            const attachmentAnon = new AttachmentBuilder(bufferAnon, { name: 'wordle-archival.png' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`wordle_guess_${userId}`)
                    .setLabel('Submit Guess')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⌨️')
            );

            // Respond with the Image Card
            const publicMsg = await interaction.editReply({
                files: [attachmentAnon],
                components: [row]
            });

            // Store IDs for future background updates
            gameState.publicMessageId = publicMsg.id;
            gameState.publicChannelId = publicMsg.channelId;

        } catch (error) {
            logger.error('[Wordle] Command Execution Failed:', error);
            await interaction.editReply({ 
                content: `❌ **Protocol Failure:** ${error.message}`, 
                flags: [MessageFlags.Ephemeral] 
            });
        }
    }
};
