const { handleProfileInteraction, handleProfileModals } = require('./profileHandlers');
const { handleSearchInteraction } = require('./searchHandlers');
const { updateMediaSettings } = require('./configHandlers');
const registry = require('./super/registry');
const mediaView = require('./super/views/media');
const dashboardView = require('./super/views/dashboard');
const { handleChannelDashboardInteraction } = require('./channelDashboard');
const { handleMuseBureauInteraction } = require('./museBureau');
const { handleBoutiqueInteraction } = require('./boutiqueHandler');
const { handleDashboardInteraction } = require('./roleDashboard');
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

        // 2. Search & Media
        if (customId === 'search_result_select') {
            await handleSearchInteraction(interaction);
            return true;
        }

        // 3. Super Dashboard (Core Configurations)
        if (customId.startsWith('super_')) {
            if (customId === 'super_category_select') {
                await interaction.deferUpdate();
                const categoryKey = interaction.values[0];
                const category = registry.getCategory(categoryKey);

                if (category?.handler) {
                    const payload = await category.handler(interaction, interaction.guild.id);
                    await interaction.editReply(payload);
                } else {
                    await interaction.followUp({ 
                        content: `The **${category?.label || 'Unknown'}** wing is currently under renovation.`, 
                        flags: MessageFlags.Ephemeral 
                    });
                }
            } else if (customId === 'super_media_select') {
                const resultEmbed = await updateMediaSettings(interaction.guildId, interaction.values);
                const payload = await mediaView(interaction, interaction.guildId);
                await interaction.update({ 
                    embeds: [resultEmbed, ...payload.embeds], 
                    components: payload.components 
                });
            } else if (customId === 'super_home') {
                const payload = await dashboardView(interaction, interaction.guild.id);
                await interaction.update(payload);
            }
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

        // 8. Help Menu
        if (customId === 'help_category_select') {
            const choice = interaction.values[0];
            const helpEmbed = new EmbedBuilder().setColor('#A78BFA');

            if (choice === 'help_general') {
                helpEmbed.setTitle('📚 General Wing')
                    .setDescription(
                        '◈ **/help**: View this archive.\n' +
                        '◈ **/ping**: Check the library latency.\n' +
                        '◈ **/info**: Detailed bot credentials.\n' +
                        '◈ **/serverinfo**: Overview of this guild.\n' +
                        '◈ **/userinfo**: Inspect a member\'s record.'
                    );
            } else if (choice === 'help_admin') {
                helpEmbed.setTitle('🛡️ Council Wing')
                    .setDescription(
                        '◈ **/dashboard**: Primary management hub.\n' +
                        '◈ **/role**: Specialized role operations.\n' +
                        '◈ **/purge**: (In Dashboard) Cleanup ghost roles.\n' +
                        '◈ **/ban / /kick / /mute**: Traditional enforcement.\n' +
                        '◈ **/case**: View moderation history.'
                    );
            } else if (choice === 'help_social') {
                helpEmbed.setTitle('🎨 Aesthetic Wing')
                    .setDescription(
                        '◈ **/profile**: View/Edit your Identity Card.\n' +
                        '◈ **/boutique**: Browse the role collections.\n' +
                        '◈ **/leaderboard**: View the top Readers.'
                    );
            } else if (choice === 'help_media') {
                helpEmbed.setTitle('🅰️ Media Wing')
                    .setDescription(
                        '◈ **/track**: Monitor anime airings.\n' +
                        '◈ **/bingo**: Manage your anime bingo cards.\n' +
                        '◈ **/search**: Query the AniList global database.'
                    );
            }

            await interaction.update({ embeds: [helpEmbed] });
            return true;
        }

        return false;
    } catch (error) {
        logger.error(`[Router] Error routing interaction ${customId}:`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ 
                content: '🛑 **Internal Error:** An issue occurred while processing this interaction.', 
                flags: MessageFlags.Ephemeral 
            }).catch(() => null);
        }
        return true;
    }
};

module.exports = { routeInteraction };
