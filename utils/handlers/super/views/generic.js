const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const baseEmbed = require('../../../generators/baseEmbed');
const { FOOTERS, COLORS } = require('../../../core/constants');

/**
 * Generic "Under Construction" or "Informational" View for Dashboard categories
 */
const genericView = async (interaction, categoryKey) => {
    const { getAllCategories } = require('../registry');
    const category = getAllCategories()[categoryKey];

    const embed = baseEmbed()
        .setTitle(`🛠️ ${category?.label || 'Management Wing'}`)
        .setDescription(
            `You have accessed the **${category?.label || categoryKey}** section of the AniMuse Library.\n\n` +
            `> This interface is currently being indexed by the Librarians. Detailed management tools for this wing will be available in a future update.\n\n` +
            `◈ **Current Status**: *Restricted Access*\n` +
            `◈ **Assigned Archive**: *Digital Archives / ${categoryKey.toUpperCase()}*`
        )
        .setColor(COLORS.DEFAULT)
        .setFooter({ text: FOOTERS.DEFAULT });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('super_dashboard')
            .setLabel('Back to Dashboard')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🏠')
    );

    return {
        embeds: [embed],
        components: [row]
    };
};

module.exports = genericView;
