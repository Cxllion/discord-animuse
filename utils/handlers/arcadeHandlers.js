const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const arcadeGenerator = require('../generators/arcadeGenerator');
const minigameService = require('../services/minigameService');
const logger = require('../core/logger');

// Strict memory-based rate limiting to prevent canvas engine crashes from button spam
const rateLimitCache = new Set();

/**
 * Arcade Handlers: Manages paging and interactions for the Arcade Passport.
 */
const handleArcadeInteraction = async (interaction) => {
    const customId = interaction.customId;
    const parts = customId.split('_');
    const action = parts[1]; // 'page'
    const pageType = parts[2]; // 'summary', 'wordle', 'connect4'
    const targetUserId = parts[3];

    // Security: Only the person who ran the command (or the target if we want) can page?
    // Usually, anyone can browse a passport.
    
    // 1. Strict Rate Limiting (2 seconds)
    if (rateLimitCache.has(interaction.user.id)) {
        return interaction.reply({ content: '⏳ **System Processing:** Please wait a moment before switching pages again.', flags: [MessageFlags.Ephemeral] }).catch(() => {});
    }
    
    rateLimitCache.add(interaction.user.id);
    setTimeout(() => rateLimitCache.delete(interaction.user.id), 2000);

    try {
        await interaction.deferUpdate();

        const stats = await minigameService.getArcadeStats(targetUserId);
        const targetUser = await interaction.client.users.fetch(targetUserId);
        
        const userData = {
            username: targetUser.username,
            displayName: targetUser.username, // Simple for now, member fetch is expensive in handlers
            avatarURL: targetUser.displayAvatarURL({ extension: 'png', size: 256 })
        };

        const buffer = await arcadeGenerator.generatePage(pageType, stats, userData);
        const attachment = new AttachmentBuilder(buffer, { name: `arcade-${pageType}-${targetUserId}.webp` });

        const components = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`arcade_page_summary_${targetUserId}`)
                    .setLabel('Summary')
                    .setEmoji('📇')
                    .setStyle(pageType === 'summary' ? ButtonStyle.Primary : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`arcade_page_wordle_${targetUserId}`)
                    .setLabel('Wordle')
                    .setEmoji('🔠')
                    .setStyle(pageType === 'wordle' ? ButtonStyle.Primary : ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`arcade_page_connect4_${targetUserId}`)
                    .setLabel('Connect4')
                    .setEmoji('🔵')
                    .setStyle(pageType === 'connect4' ? ButtonStyle.Primary : ButtonStyle.Secondary)
            )
        ];

        await interaction.editReply({
            files: [attachment],
            attachments: [], 
            components: components
        });

    } catch (error) {
        logger.error('[ArcadeHandlers] Paging failure:', error);
    }
};

module.exports = {
    handleArcadeInteraction,
    routerConfig: {
        prefixes: ['arcade_page_'],
        handle: handleArcadeInteraction
    }
};
