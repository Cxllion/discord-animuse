const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, MessageFlags, EmbedBuilder } = require('discord.js');
const { fetchConfig, upsertConfig } = require('../../utils/core/database');

module.exports = {
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
                        .addChoices(
                            { name: '✨ Welcome', value: 'welcome' },
                            { name: '👋 Greeting', value: 'greeting' },
                            { name: '📸 Media', value: 'media' },
                            { name: '📢 Airing', value: 'airing' }
                        ))
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

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'assign') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const type = interaction.options.getString('type');
            const channel = interaction.options.getChannel('channel');
            const guildId = interaction.guild.id;

            try {
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

            } catch (error) {
                console.error('[Command Error] /channel assign', error);
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

                const embed = new EmbedBuilder()
                    .setTitle(`⚙️ Server Configuration: ${interaction.guild.name}`)
                    .setDescription('Current channel assignments for AniMuse features.')
                    .addFields(
                        { name: '👋 Welcome', value: fmt(config?.welcome_channel_id), inline: true },
                        { name: '🎱 Bingo', value: fmt(config?.bingo_channel_id), inline: true },
                        { name: '👋 Greeting', value: fmt(config?.greeting_channel_id), inline: true },
                        { name: '📢 Airing', value: fmt(config?.airing_channel_id), inline: true },
                        { name: '📸 Gallery', value: fmtList(config?.gallery_channel_ids), inline: false }
                    )
                    .setColor(0x3b82f6) // Blue
                    .setFooter({ text: 'Use /channel assign to modify these settings.' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });

            } catch (error) {
                console.error('[Command Error] /channel overview', error);
                await interaction.editReply({ content: '❌ An internal error occurred while fetching configuration.' });
            }
        }
    },
};
