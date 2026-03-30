const { handleProfileInteraction, handleProfileModals } = require('./profileHandlers');
const { handleSearchInteraction } = require('./searchHandlers');
const { handleTrackInteraction } = require('./trackHandlers');
const { handleBingoInteraction, handleBingoModals } = require('./bingoHandlers');
const { handleHelpInteraction } = require('./helpHandlers');
const { handleChannelDashboardInteraction } = require('./channelDashboard');
const { handleMuseBureauInteraction } = require('./museBureau');
const { handleBoutiqueInteraction } = require('./boutiqueHandler');
const { handleDashboardInteraction } = require('./roleDashboard');
const { handleArchiveInteraction } = require('./archiveHandler');
const logger = require('../core/logger');
const { MessageFlags, EmbedBuilder } = require('discord.js');

/**
 * Routes active components to their specific handlers.
 * @param {import('discord.js').Interaction} interaction 
 */
const routeInteraction = async (interaction) => {
    const { customId } = interaction;
    if (!customId) return false;

    try {
        // 1. Profile Dashboard
        if (customId.startsWith('profile_')) {
            if (interaction.isModalSubmit()) await handleProfileModals(interaction);
            else await handleProfileInteraction(interaction);
            return true;
        }

        if (customId.startsWith('track_')) {
            await handleTrackInteraction(interaction);
            return true;
        }

        if (customId === 'search_result_select') {
            await handleSearchInteraction(interaction);
            return true;
        }

        if (customId.startsWith('bingo_')) {
            if (interaction.isModalSubmit()) await handleBingoModals(interaction);
            else await handleBingoInteraction(interaction);
            return true;
        }

        // 4. Channel Architect Dashboard
        const channelPrefixes = ['channel_dash_', 'assign_'];
        const channelDirectIds = ['sorting_toggle', 'sorting_pin'];
        if (channelPrefixes.some(p => customId.startsWith(p)) || channelDirectIds.includes(customId)) {
            await handleChannelDashboardInteraction(interaction);
            return true;
        }

        // 5. Muse Bureau (Misc)
        if (customId.startsWith('muse_')) {
            await handleMuseBureauInteraction(interaction);
            return true;
        }

        // 6. Master Boutique
        if (customId.startsWith('boutique_')) {
            await handleBoutiqueInteraction(interaction);
            return true;
        }

        // 7. Role Architecture Dashboard
        const roleDashIds = ['role_dash_menu', 'dash_home', 'autorole_set_member', 'autorole_set_bot', 'autorole_set_booster', 'autorole_set_premium',
            'autorole_sync', 'cat_create', 'level_role_add', 'level_role_bind_select', 'level_deploy_standard',
            'purge_confirm', 'purge_dryrun', 'organize_confirm', 'color_deploy_basic', 'color_deploy_premium', 'role_dash_home'];
        const roleDashPrefixes = ['cat_del_', 'level_role_del_', 'cat_view_', 'cat_role_reg_', 'cat_role_unreg_', 'cat_role_create_', 'modal_cat_role_create_', 'color_page_'];

        if (roleDashIds.includes(customId) || roleDashPrefixes.some(p => customId.startsWith(p))) {
            await handleDashboardInteraction(interaction);
            return true;
        }

        // 8. Archive System
        if (customId.startsWith('archive_')) {
            await handleArchiveInteraction(interaction);
            return true;
        }

        // 9. Help Menu
        if (customId.startsWith('help_')) {
            await handleHelpInteraction(interaction);
            return true;
        }

        return false;
    } catch (error) {
        logger.error(`[Router] Error routing interaction ${customId}:`, error);
        
        // Final attempt at safety - Don't let a "reply to error" crash the process
        try {
            if (interaction.isRepliable()) {
                const payload = { 
                    content: '🛑 **Internal Error:** An issue occurred while processing this interaction.', 
                    flags: MessageFlags.Ephemeral 
                };
                
                if (interaction.replied || interaction.deferred) {
                    try { await interaction.followUp(payload); } catch(e) {}
                } else {
                    try { await interaction.reply(payload); } catch(e) {}
                }
            }
        } catch (secondaryError) {
            // Silence of the archives - nothing more can be done
        }
        return true;
    }
};

module.exports = { routeInteraction };
