const { Events } = require('discord.js');
const { fetchConfig } = require('../utils/core/database');
const { generateLogEmbed } = require('../utils/generators/logEmbed');

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        if (newMessage.author?.bot) return;
        if (!newMessage.guild) return;
        if (newMessage.client.isTestBot) return;

        // Ignore if content didn't change (e.g., embed additions)
        if (oldMessage.content === newMessage.content) return;

        const config = await fetchConfig(newMessage.guild.id);
        if (!config || !config.logs_channel_id) return;

        const logChannel = newMessage.guild.channels.cache.get(config.logs_channel_id);
        if (!logChannel) return;

        const embed = generateLogEmbed(
            'Message Modification',
            `An archival record was revised in <#${newMessage.channel.id}>.`,
            'ACTION',
            { name: newMessage.author.tag, iconURL: newMessage.author.displayAvatarURL() }
        )
        .addFields(
            { name: 'Channel', value: `<#${newMessage.channel.id}>`, inline: true },
            { name: 'Jump to Record', value: `[Go to Message](${newMessage.url})`, inline: true },
            { name: 'Original Text', value: oldMessage.content?.substring(0, 1024) || '*No text content*' },
            { name: 'Revised Text', value: newMessage.content?.substring(0, 1024) || '*No text content*' }
        );

        await logChannel.send({ embeds: [embed] }).catch(() => {});
    },
};
