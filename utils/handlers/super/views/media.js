const { ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType, ButtonBuilder, ButtonStyle } = require('discord.js');
const baseEmbed = require('../../../generators/baseEmbed');
const { fetchConfig } = require('../../../core/database');

const mediaView = async (interaction, guildId) => {
    const config = await fetchConfig(guildId);
    const channels = config ? (config.gallery_channel_ids || []) : [];

    const embed = baseEmbed()
        .setTitle('📸 Media & Gallery')
        .setDescription(`**Active Gallery Channels:**\n${channels.length > 0 ? channels.map(id => `<#${id}>`).join(', ') : 'None'}\n\nImages posted in these channels will automatically create a discussion thread.`)
        .setColor('#3498DB');

    const row = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('super_media_select')
            .setPlaceholder('Select channels for Gallery Mode...')
            .setChannelTypes(ChannelType.GuildText)
            .setMinValues(0)
            .setMaxValues(10)
    );

    const homeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('super_home')
            .setLabel('Back to Dashboard')
            .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row, homeRow] };
};

module.exports = mediaView;
