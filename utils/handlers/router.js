const { handleProfileInteraction, handleProfileModals } = require('../handlers/profileHandlers');
const { handleSearchInteraction } = require('../handlers/searchHandlers');
const { updateMediaSettings } = require('../handlers/configHandlers');
const registry = require('../handlers/super/registry');
const mediaView = require('../handlers/super/views/media');
const dashboardView = require('../handlers/super/views/dashboard');

/**
 * Routes interactive components to their specific handlers.
 * @param {Interaction} interaction 
 */
const routeInteraction = async (interaction) => {
    // 1. Profile Dashboard
    if (interaction.customId.startsWith('profile_')) {
        if (interaction.isModalSubmit()) {
            await handleProfileModals(interaction);
        } else {
            await handleProfileInteraction(interaction);
        }
        return true;
    }

    // 2. Search Logic
    if (interaction.customId === 'search_result_select') {
        await handleSearchInteraction(interaction);
        return true;
    }

    // 3. Super Dashboard Routing
    // Category Select
    if (interaction.customId === 'super_category_select') {
        await interaction.deferUpdate();
        const categoryKey = interaction.values[0];
        const category = registry.getCategory(categoryKey);

        if (category && category.handler) {
            const payload = await category.handler(interaction, interaction.guild.id);
            await interaction.editReply(payload);
        } else {
            await interaction.followUp({ content: `The **${category?.label || 'Unknown'}** wing is currently under renovation.`, ephemeral: true });
        }
        return true;
    }

    // Media Select
    if (interaction.customId === 'super_media_select') {
        const resultEmbed = await updateMediaSettings(interaction.guildId, interaction.values);
        const payload = await mediaView(interaction, interaction.guildId);
        const combinedEmbeds = [resultEmbed, ...payload.embeds];
        await interaction.update({ embeds: combinedEmbeds, components: payload.components });
        return true;
    }

    // Home Button
    if (interaction.customId === 'super_home') {
        const payload = await dashboardView(interaction, interaction.guild.id);
        await interaction.update(payload);
        return true;
    }

    return false;
};

module.exports = { routeInteraction };
