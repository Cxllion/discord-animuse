const { EmbedBuilder, MessageFlags } = require('discord.js');
const CONFIG = require('../config');

/**
 * Standardized Error Handler for Interactions
 * @param {import('discord.js').ChatInputCommandInteraction} interaction 
 * @param {Error} error 
 * @param {string} customMessage Optional custom message to show user
 */
const handleError = async (interaction, error, customMessage = null) => {
    console.error(`[Command Error] ${interaction.commandName}:`, error);

    const embed = new EmbedBuilder()
        .setColor(CONFIG.COLORS.ERROR)
        .setTitle(`${CONFIG.EMOJIS.ERROR} System Error`)
        .setDescription(customMessage || CONFIG.MESSAGES.ERRORS.GENERIC)
        .setFooter({ text: 'The incident has been logged for review.' });

    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    } catch (e) {
        console.error('Failed to send error message to user:', e);
    }
};

/**
 * Create a simple specific error embed
 * @param {string} title 
 * @param {string} description 
 * @returns {EmbedBuilder}
 */
const createErrorEmbed = (description, title = 'Error') => {
    return new EmbedBuilder()
        .setColor(CONFIG.COLORS.ERROR)
        .setTitle(`${CONFIG.EMOJIS.ERROR} ${title}`)
        .setDescription(description);
};

module.exports = {
    handleError,
    createErrorEmbed
};
