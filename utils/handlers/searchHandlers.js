const { MessageFlags } = require('discord.js');
const { getMediaById } = require('../services/anilistService');
const { addTracker } = require('../core/database');
const { createMediaResponse } = require('../generators/mediaResponse');
const logger = require('../core/logger');

/**
 * Handles the selection of a media item from the "search_result_select" dropdown.
 */
const handleSearchInteraction = async (interaction) => {
    if (interaction.customId !== 'search_result_select') return;

    // UX: Defer immediately to stop the "thinking" state
    try {
        if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
    } catch (e) {
        logger.warn('Search interaction acknowledgment failed (likely expired).', 'SearchHandlers');
        return;
    }

    const mediaId = interaction.values[0];

    try {
        // 1. Fetch full media details
        const media = await getMediaById(mediaId);
        if (!media) {
            return await interaction.followUp({ content: '❌ **Error**: Could not retrieve record details.', flags: MessageFlags.Ephemeral });
        }

        // 2. Immediate Feedback & Clear Dropdown
        await interaction.editReply({
            content: `🔍 Found **${media.title.english || media.title.romaji}**. Materializing record...`,
            embeds: [],
            components: []
        });

        // 3. Generate Card & Components
        const response = await createMediaResponse(media, interaction.user.id, interaction.guildId);

        // 4. Update the message
        await interaction.editReply({
            content: '', 
            embeds: response.embeds || [],
            components: response.components || [],
            files: response.files || []
        });

    } catch (error) {
        logger.error('SearchHandler Error:', error, 'SearchHandlers');
        try {
            const payload = { content: '❌ An error occurred while fetching the record.', flags: MessageFlags.Ephemeral };
            if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
            else await interaction.reply(payload);
        } catch (e) {}
    }
};

/**
 * Handles the "Track Anime" button from a search result.
 */
const handleTrackInteraction = async (interaction) => {
    // UX: Defer immediately
    try {
        if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
    } catch (e) { return; }

    const animeId = parseInt(interaction.customId.replace('track_anime_', ''));
    if (isNaN(animeId)) return;

    try {
        const media = await getMediaById(animeId);
        if (!media) {
            return await interaction.followUp({ content: '❌ Misplaced Record: I could not retrieve details for this series.', flags: MessageFlags.Ephemeral });
        }

        const title = media.title.english || media.title.romaji;
        const res = await addTracker(interaction.guildId, interaction.user.id, animeId, title);

        if (res.error) {
            return await interaction.followUp({ content: '❌ Ink Spill: I failed to inscribe this tracking request.', flags: MessageFlags.Ephemeral });
        }

        await interaction.followUp({ 
            content: `📖 **Observation Logged**\n\nI shall now monitor the airwaves for **${title}** and notify you immediately upon any new transmissions.`, 
            flags: MessageFlags.Ephemeral 
        });

    } catch (e) {
        logger.error('Track Interaction Error:', e, 'SearchHandlers');
        try {
            await interaction.followUp({ content: '❌ A structural fault occurred while updating the archives.', flags: MessageFlags.Ephemeral });
        } catch (err) {}
    }
};

module.exports = { handleSearchInteraction, handleTrackInteraction };
