const { Events } = require('discord.js');
const { fetchConfig } = require('../utils/core/database');
const { generateLogEmbed } = require('../utils/generators/logEmbed');

module.exports = {
    name: Events.ChannelDelete,
    async execute(channel) {
        if (!channel.guild) return;
        if (channel.client.isTestBot) return;

        const config = await fetchConfig(channel.guild.id);
        if (!config || !config.logs_channel_id) return;

        const logChannel = channel.guild.channels.cache.get(config.logs_channel_id);
        if (!logChannel) return;

        const typeNames = {
            0: 'Text Channel',
            2: 'Voice Channel',
            4: 'Category',
            5: 'Announcement Channel',
            13: 'Stage Channel',
            15: 'Forum Channel'
        };

        const embed = generateLogEmbed(
            'Library Reduction',
            `A structural wing, **#${channel.name}**, has been removed from the archives.`,
            'ALERT'
        )
        .addFields(
            { name: 'Name', value: `\`${channel.name}\``, inline: true },
            { name: 'Type', value: `\`${typeNames[channel.type] || 'Unknown'}\``, inline: true },
            { name: 'ID', value: `\`${channel.id}\``, inline: true }
        );

        await logChannel.send({ embeds: [embed] }).catch(() => {});
    },
};
