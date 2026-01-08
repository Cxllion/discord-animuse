const { EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');

/**
 * Creates a standardized EmbedBuilder with the Animuse theme.
 * @returns {EmbedBuilder}
 */
const baseEmbed = () => {
  return new EmbedBuilder()
    .setColor(CONFIG.COLORS.PRIMARY)
    .setFooter({ text: 'Animuse System' });
};

module.exports = baseEmbed;
