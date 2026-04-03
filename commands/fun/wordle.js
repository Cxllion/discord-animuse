const { SlashCommandBuilder, MessageFlags, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const wordleService = require('../../utils/services/wordleService');
const wordleGenerator = require('../../utils/generators/wordleGenerator');
const baseEmbed = require('../../utils/generators/baseEmbed');

/**
 * Wordle Command: Entry point for starting a Wordle game session.
 */
module.exports = {
    category: 'fun',
    dbRequired: true,
    cooldown: 15, // 15 seconds cooldown to prevent API spam
    data: new SlashCommandBuilder()
        .setName('wordle')
        .setDescription('Initialize a Wordle decoding protocol.'),
    
    async execute(interaction) {
        // Initial defer to allow API call to resolve
        await interaction.deferReply();
        
        try {
            const userId = interaction.user.id;
            
            // 1. Initialize Game State via Service (Calls Random Word API)
            const gameState = await wordleService.startNewGame(userId);
            
            // 2. Generate Initial Board (Canvas)
            const buffer = await wordleGenerator.generateBoard(gameState);
            const attachment = new AttachmentBuilder(buffer, { name: 'wordle.png' });
            
            // 3. Construct Thematic Response
            const embed = baseEmbed('Wordle Archives')
                .setDescription('A fresh 5-letter sequence has been materialized. Synchronize your biometrics and begin the decoding protocol.')
                .setImage('attachment://wordle.png');
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`wordle_guess_${userId}`)
                    .setLabel('Submit Guess')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⌨️')
            );
            
            await interaction.editReply({ 
                embeds: [embed], 
                components: [row], 
                files: [attachment] 
            });

        } catch (error) {
            await interaction.editReply({ 
                content: `❌ **Protocol Failure:** ${error.message}`, 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
};
