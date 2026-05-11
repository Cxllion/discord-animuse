const { EmbedBuilder } = require('discord.js');
const CONFIG = require('../config');

/**
 * 📚 [Animuse Base Embed Generator]
 * Creates a standardized EmbedBuilder with the Animuse Librarian theme.
 * Pre-configured with:
 * - Brand Color (Soft Pink)
 * - Librarian Author (Animuse Librarian)
 * - Thematic Footer (Animuse Archives)
 * - Timestamp
 * 
 * @param {string} title - Optional title to set
 * @param {string} description - Optional description to set
 * @param {string} iconURL - Optional icon URL for the author
 * @returns {EmbedBuilder}
 */
const baseEmbed = (title = null, description = null, iconURL = null) => {
    // Signature Librarian Icon (Premium Book Asset)
    const LIBRARIAN_ICON = 'https://cdn.discordapp.com/emojis/1109015024765636668.webp';

    const embed = new EmbedBuilder()
        .setColor(CONFIG.THEME.EMBED_SIDE_COLOR || CONFIG.COLORS.PRIMARY)
        .setAuthor({ 
            name: CONFIG.THEME.AUTHOR, 
            iconURL: iconURL || LIBRARIAN_ICON
        })
        .setFooter({ 
            text: `━━━━━━━━━━━━━━━━━━━━\n${CONFIG.THEME.FOOTER}`,
            iconURL: LIBRARIAN_ICON
        })
        .setTimestamp();

    if (title) embed.setTitle(`${title}`);
    if (description) embed.setDescription(description);

    return embed;
};

module.exports = baseEmbed;
