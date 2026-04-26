const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, EmbedBuilder } = require('discord.js');
const { fetchConfig, upsertConfig } = require('../../utils/core/database');
const logger = require('../../utils/core/logger');

module.exports = {
    category: 'configuration',
    dbRequired: true,
    data: new SlashCommandBuilder()
        .setName('channel')
        .setDescription('Configure server channels for AniMuse features.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('assign')
                .setDescription('Assign a channel to a specific feature.')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('The feature type to assign.')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to assign.')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('overview')
                .setDescription('View the current channel configuration dashboard.')
        ),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const choices = [
            { name: '✨ Welcome Wing', value: 'welcome' },
            { name: '👋 Greeting Wing', value: 'greeting' },
            { name: '📸 Media Gallery', value: 'media' },
            { name: '🔔 Activity Feed', value: 'activity' },
            { name: '📢 Airing Tower', value: 'airing' },
            { name: '📋 Security Logs', value: 'logs' },
            { name: '🖼️ Identity Dump', value: 'dump' },
            { name: '🕹️ Arcade Protocol', value: 'arcade' },
            { name: '💡 Suggestions Box', value: 'suggestions' }
        ];

        const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue));
        await interaction.respond(filtered);
    },

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'assign') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const type = interaction.options.getString('type');
            const channel = interaction.options.getChannel('channel');
            const guildId = interaction.guild.id;

            try {
                // 0. Permission Verification
                const me = interaction.guild.members.me;
                const permissions = channel.permissionsFor(me);
                const required = ['ViewChannel', 'SendMessages', 'EmbedLinks'];
                const missing = required.filter(p => !permissions.has(p));

                if (missing.length > 0) {
                    return await interaction.editReply({
                        content: `❌ **Permission Denied**: I cannot be assigned to ${channel} because I am missing the following permissions there:\n${missing.map(p => `• \`${p}\``).join('\n')}\n\nPlease update my permissions for that channel and try again.`
                    });
                }

                // 1. Fetch current config
                const config = await fetchConfig(guildId);

                // 2. Handle Assignment Logic
                if (type === 'welcome') {
                    // Scalar assignment (Replace)
                    await upsertConfig(guildId, { welcome_channel_id: channel.id });

                    return await interaction.editReply({
                        content: `✅ **Configuration Updated**\nThis wing of the library (${channel}) has been officially designated as the **Welcome Hall**.`
                    });
                }
                else if (type === 'activity') {
                    // Scalar assignment
                    await upsertConfig(guildId, { activity_channel_id: channel.id });

                    return await interaction.editReply({
                        content: `✅ **Configuration Updated**\nThe AniList Activity Feed will now be broadcasted in ${channel}.`
                    });
                }
                else if (type === 'airing') {
                    // Scalar assignment
                    await upsertConfig(guildId, { airing_channel_id: channel.id });

                    return await interaction.editReply({
                        content: `✅ **Configuration Updated**\nThis wing (${channel}) is now the **Broadcast Tower** for anime airing notifications.`
                    });
                }
                else if (type === 'greeting') {
                    // Scalar assignment
                    await upsertConfig(guildId, { greeting_channel_id: channel.id });

                    return await interaction.editReply({
                        content: `✅ **Configuration Updated**\nVisitors will now be personally greeted in ${channel} upon arrival.`
                    });
                }
                else if (type === 'media') {
                    // Array assignment (Append Unique)
                    const currentGalleries = config.gallery_channel_ids || [];

                    if (currentGalleries.includes(channel.id)) {
                        return await interaction.editReply({
                            content: `⚠️ **Notice**: The wing ${channel} is already indexed in the Media Gallery network.`
                        });
                    }

                    const newGalleries = [...currentGalleries, channel.id];
                    await upsertConfig(guildId, { gallery_channel_ids: newGalleries });

                    return await interaction.editReply({
                        content: `✅ **Configuration Updated**\nAdded ${channel} to the **Media Gallery** network.\n(Total Galleries: ${newGalleries.length})`
                    });
                }
                else if (type === 'logs') {
                    await upsertConfig(guildId, { logs_channel_id: channel.id });

                    return await interaction.editReply({
                        content: `✅ **Configuration Updated**\nThis channel (${channel}) will now receive institutional reports and library incident alerts.`
                    });
                }
                else if (type === 'dump') {
                    await upsertConfig(guildId, { banner_dump_channel_id: channel.id });

                    return await interaction.editReply({
                        content: `✅ **Configuration Updated**\nThis channel (${channel}) is now the **Static Identity Archive**. All custom banners will be permanently stored here to prevent CDN invalidation.`
                    });
                }
                else if (type === 'arcade') {
                    await upsertConfig(guildId, { arcade_channel_id: channel.id });

                    return await interaction.editReply({
                        content: `✅ **Configuration Updated**\nThe **Arcade Protocol** has been localized to ${channel}. Minigames will now be strictly managed within this wing.`
                    });
                }
                else if (type === 'suggestions') {
                    await upsertConfig(guildId, { suggestions_channel_id: channel.id });

                    return await interaction.editReply({
                        content: `✅ **Configuration Updated**\nThe **Suggestions Box** has been installed in ${channel}. Members can now share their visions for the library's future here.`
                    });
                }

            } catch (error) {
                logger.error('Command Error: /channel assign', error, 'ChannelCommand');
                await interaction.editReply({ content: '❌ An internal error occurred while saving configuration.' });
            }
        }
        else if (subcommand === 'overview') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const guildId = interaction.guild.id;

            try {
                const config = await fetchConfig(guildId);

                // Helper to format channel
                const fmt = (id) => id ? `<#${id}>` : '`Not Set`';
                const fmtList = (ids) => (ids && ids.length) ? ids.map(id => `<#${id}>`).join(', ') : '`None`';

                const baseEmbed = require('../../utils/generators/baseEmbed');
                const embed = baseEmbed(`⚙️ Server Architecture: ${interaction.guild.name}`, 
                    'Current channel assignments for AniMuse library wings and features.', 
                    null
                )
                    .addFields(
                        { name: '👋 Welcome Wing', value: fmt(config?.welcome_channel_id), inline: true },
                        { name: '🎱 Bingo Hall', value: fmt(config?.bingo_channel_id), inline: true },
                        { name: '👋 Greeting Hall', value: fmt(config?.greeting_channel_id), inline: true },
                        { name: '📢 Airing Tower', value: fmt(config?.airing_channel_id), inline: true },
                        { name: '🔔 Activity Feed', value: fmt(config?.activity_channel_id), inline: true },
                        { name: '🕹️ Arcade Protocol', value: fmt(config?.arcade_channel_id), inline: true },
                        { name: '📜 Security Logs', value: fmt(config?.logs_channel_id), inline: true },
                        { name: '🖼️ Identity Dump', value: fmt(config?.banner_dump_channel_id), inline: true },
                        { name: '💡 Suggestions Box', value: fmt(config?.suggestions_channel_id), inline: true },
                        { name: '📸 Media Gallery', value: fmtList(config?.gallery_channel_ids), inline: false }
                    )
                    .setColor(0x3b82f6);

                await interaction.editReply({ embeds: [embed] });

            } catch (error) {
                logger.error('Command Error: /channel overview', error, 'ChannelCommand');
                await interaction.editReply({ content: '❌ An internal error occurred while fetching configuration.' });
            }
        }
    },
};
