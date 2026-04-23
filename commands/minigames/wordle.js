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
        await interaction.deferReply();
        
        try {
            const userId = interaction.user.id;
            
            // 1. Initialize Game State (Daily Word)
            const gameState = await wordleService.startNewGame(userId);
            
            // 2. Generate Initial Board
            const buffer = await wordleGenerator.generateBoard(gameState);
            const attachment = new AttachmentBuilder(buffer, { name: 'wordle.png' });
            
            // 3. Construct Response
            const embed = baseEmbed('Daily Wordle')
                .setDescription('A fresh 5-letter word has been materialized. Synchronize your biometrics and begin the decoding protocol.\n\n🕒 **Reset:** 00:00 GMT')
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
