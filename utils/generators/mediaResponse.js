const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { getUserColor } = require('../core/database');
const { generateSearchCard } = require('./searchGenerator');
const baseEmbed = require('./baseEmbed');
const { COLORS, FOOTERS } = require('../core/constants');

/**
 * Creates a detailed response object (Attachment + Components) for a media item.
 * @param {object} media 
 * @param {string} userId (To fetch theme color)
 * @param {string} guildId
 * @returns {Promise<object>} { files: [], components: [], embeds: [] }
 */
async function createMediaResponse(media, userId, guildId) {
    try {
        // 1. Theme
        const userColor = await getUserColor(userId, guildId);

        // 2. Generate Image
        const buffer = await generateSearchCard(media, userColor);
        const attachment = new AttachmentBuilder(buffer, { name: `search-${media.id}.png` });

        // 3. Components
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('View on AniList')
                .setStyle(ButtonStyle.Link)
                .setURL(media.siteUrl)
        );

        return {
            files: [attachment],
            components: [row],
            embeds: []
        };

    } catch (e) {
        console.error('Search Image Gen Error:', e);
        // FALLBACK: Old Embed Logic
        let description = media.description || 'No summary available.';
        description = description.replace(/<[^>]*>?/gm, '').trim();
        if (description.length > 300) description = description.substring(0, 300) + '...';

        const embed = baseEmbed()
            .setTitle(media.title.english || media.title.romaji)
            .setDescription(description)
            .setThumbnail(media.coverImage.large)
            .setColor(media.coverImage.color || COLORS.DEFAULT)
            .setFooter({ text: FOOTERS.ANILIST });

        return { embeds: [embed] };
    }
}

module.exports = { createMediaResponse };
