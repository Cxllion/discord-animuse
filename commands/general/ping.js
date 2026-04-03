const { SlashCommandBuilder } = require('discord.js');
const baseEmbed = require('../../utils/generators/baseEmbed');

module.exports = {
    category: 'general',
    dbRequired: false,
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Checks Animuse\'s latency.'),
    dbRequired: false,
    async execute(interaction) {
        const { getPulseStatus } = require('../../utils/services/scheduler');
        const sent = await interaction.reply({ content: 'Pinging...', withResponse: true });
        // Note: withResponse returns an object { resource: Message, ... } so we access resource.createdTimestamp
        const latency = sent.resource.createdTimestamp - interaction.createdTimestamp;

        const pulse = getPulseStatus();
        const dbStatus = interaction.client.isOfflineMode ? '⚠️ **OFFLINE** (Heartbeat Active)' : '✅ **ONLINE**';
        const pulseTime = pulse.airing ? `<t:${Math.floor(pulse.airing / 1000)}:R>` : '*Never*';

        const embed = baseEmbed()
            .setTitle('📖 Archival Diagnostic Complete')
            .setDescription('The Archives are currently reachable and responsive, Reader! ♡')
            .addFields(
                { name: '🛰️ Handshake', value: `\`${latency}ms\``, inline: true },
                { name: '💻 Mainframe', value: `\`${Math.round(interaction.client.ws.ping)}ms\``, inline: true },
                { name: '🗄️ Database', value: dbStatus, inline: true },
                { name: '📡 Last Pulse', value: pulseTime, inline: true }
            );

        await interaction.editReply({ content: null, embeds: [embed] });
    },

};
