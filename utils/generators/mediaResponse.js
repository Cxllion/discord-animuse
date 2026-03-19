const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { getUserColor } = require('../core/database');
const { generateSearchCard } = require('./searchGenerator');
const { formatMediaTitle } = require('../services/anilistService');
const baseEmbed = require('./baseEmbed');
const { COLORS, FOOTERS } = require('../core/constants');
const logger = require('../core/logger');

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
        const row = new ActionRowBuilder();
        
        // Always add AniList Link first
        row.addComponents(
            new ButtonBuilder()
                .setLabel('AniList')
                .setStyle(ButtonStyle.Link)
                .setURL(media.siteUrl)
        );

        // Track Button (Only for ONGOING shows)
        if (media.status === 'RELEASING') {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`track_anime_${media.id}`)
                    .setLabel('Track Airing')
                    .setEmoji('🔔')
                    .setStyle(ButtonStyle.Primary)
            );
        }

        return {
            files: [attachment],
            components: row.components.length > 0 ? [row] : [],
            embeds: []
        };

    } catch (e) {
        logger.error('Search Image Gen Error:', e, 'MediaResponse');
        // FALLBACK: Old Embed Logic
        let description = media.description || 'No summary available.';
        description = description.replace(/<[^>]*>?/gm, '').trim();
        if (description.length > 300) description = description.substring(0, 300) + '...';

        const embed = baseEmbed()
            .setTitle(formatMediaTitle(media?.title))
            .setDescription(description)
            .setThumbnail(media?.coverImage?.large || null)
            .setColor(media?.coverImage?.color || COLORS.DEFAULT)
            .setFooter({ text: FOOTERS.ANILIST });

        return { embeds: [embed] };
    }
}

module.exports = { createMediaResponse };
