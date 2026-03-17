const { getMediaById } = require('../services/anilistService');
// Import helper from the shared generator to reuse logic
const { createMediaResponse } = require('../generators/mediaResponse');
const logger = require('../core/logger');

/**
 * Handles the selection of a media item from the "search_result_select" dropdown.
 * @param {import('discord.js').StringSelectMenuInteraction} interaction 
 */
const handleSearchInteraction = async (interaction) => {
    if (interaction.customId === 'search_result_select') {
        const mediaId = interaction.values[0];

        // UX: Defer update to acknowledge click immediately
        await interaction.deferUpdate();

        try {
            // 1. Fetch full media details
            const media = await getMediaById(mediaId);

            if (!media) {
                return await interaction.followUp({ content: '❌ **Error**: Could not retrieve record details.', flags: MessageFlags.Ephemeral });
            }

            // 2. Immediate Feedback & Clear Dropdown
            // This mirrors the behavior of a single-result search for consistency
            await interaction.editReply({
                content: `🔍 Found **${media.title.english || media.title.romaji}**. Materializing record...`,
                embeds: [],
                components: []
            });

            // 3. Generate Card & Components
            const response = await createMediaResponse(media, interaction.user.id, interaction.guildId);

            // 4. Update the message (removing the dropdown and replacing embeds/files)
            await interaction.editReply({
                content: '', // Clear any previous "Found..." text
                embeds: response.embeds || [],
                components: response.components || [],
                files: response.files || []
            });

        } catch (error) {
            logger.error('SearchHandler Error:', error, 'SearchHandlers');
            await interaction.followUp({ content: '❌ An error occurred while fetching the record.', flags: MessageFlags.Ephemeral });
        }
    }
};

module.exports = { handleSearchInteraction };
