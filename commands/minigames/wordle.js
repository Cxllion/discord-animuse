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
            
            const nextReset = new Date();
            nextReset.setUTCHours(24, 0, 0, 0);
            const resetTs = Math.floor(nextReset.getTime() / 1000);

            // 2. Generate Anonymized Board (Public)
            const bufferAnon = await wordleGenerator.generateBoard(gameState, { anonymize: true });
            const attachmentAnon = new AttachmentBuilder(bufferAnon, { name: 'wordle-anon.png' });
            
            // 3. Construct Public Response
            const embedAnon = baseEmbed('Daily Archive Decoding', `The current 5-letter cipher has been materialized. The archive will synchronize <t:${resetTs}:R>.`)
                .setImage('attachment://wordle-anon.png');
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`wordle_guess_${userId}`)
                    .setLabel('Submit Guess')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⌨️')
            );
            
            await interaction.editReply({ 
                embeds: [embedAnon], 
                components: [row], 
                files: [attachmentAnon] 
            });

            // 4. Generate Personalized Board (Private Ephemeral)
            const bufferPersonal = await wordleGenerator.generateBoard(gameState, { anonymize: false });
            const attachmentPersonal = new AttachmentBuilder(bufferPersonal, { name: 'wordle-personal.png' });

            const embedPersonal = baseEmbed('Daily Wordle (Personal Console)')
                .setDescription('Your private decoding terminal is active. Submit your guesses via the public button.')
                .setImage('attachment://wordle-personal.png');

            await interaction.followUp({
                embeds: [embedPersonal],
                files: [attachmentPersonal],
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            await interaction.editReply({ 
                content: `❌ **Protocol Failure:** ${error.message}`, 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
};
