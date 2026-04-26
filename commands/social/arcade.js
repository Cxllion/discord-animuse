const { SlashCommandBuilder, AttachmentBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const minigameService = require('../../utils/services/minigameService');
const arcadeGenerator = require('../../utils/generators/arcadeGenerator');
const logger = require('../../utils/core/logger');

/**
 * Arcade Command: Access your premium minigame passport and stats.
 */
module.exports = {
    category: 'social',
    dbRequired: true,
    data: new SlashCommandBuilder()
        .setName('arcade')
        .setDescription('Access the Arcade Protocol terminal and view your minigame passport.')
        .addUserOption(option => 
            option.setName('target')
            .setDescription('View another patron\'s passport.')
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const targetUser = interaction.options.getUser('target') || interaction.user;
        const targetMember = interaction.guild ? await interaction.guild.members.fetch(targetUser.id).catch(() => null) : null;

        try {
            // 1. Fetch Stats
            const stats = await minigameService.getArcadeStats(targetUser.id);
            if (!stats) {
                return await interaction.editReply({ 
                    content: `❌ **Archive Error:** No data found for <@${targetUser.id}> in the Arcade Protocol records.`
                });
            }

            // 2. Prepare User Data for Visuals
            const userData = {
                username: targetUser.username,
                displayName: targetMember?.displayName || targetUser.username,
                avatarURL: targetUser.displayAvatarURL({ extension: 'png', size: 256 })
            };

            // 3. Generate Initial Page (Summary)
            const buffer = await arcadeGenerator.generatePage('summary', stats, userData);
            const attachment = new AttachmentBuilder(buffer, { name: `arcade-passport-${targetUser.id}.webp` });

            // 4. Navigation Components
            const components = [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`arcade_page_summary_${targetUser.id}`).setLabel('Summary').setEmoji('📇').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`arcade_page_wordle_${targetUser.id}`).setLabel('Wordle').setEmoji('🔠').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`arcade_page_connect4_${targetUser.id}`).setLabel('Connect4').setEmoji('🔵').setStyle(ButtonStyle.Secondary)
                )
            ];

            // 5. Send the Passport
            await interaction.editReply({
                files: [attachment],
                components: components
            });

        } catch (error) {
            logger.error('[ArcadeCommand] Failed to execute:', error);
            await interaction.editReply({
                content: `❌ **Protocol Failure:** Unable to synchronize with the Arcade archives.`,
                flags: [MessageFlags.Ephemeral]
            });
        }
    }
};
