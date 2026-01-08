const { SlashCommandBuilder } = require('discord.js');
const baseEmbed = require('../../utils/generators/baseEmbed');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Checks Animuse\'s latency.'),
    async execute(interaction) {
        const sent = await interaction.reply({ content: 'Pinging...', withResponse: true });
        // Note: withResponse returns an object { resource: Message, ... } so we access resource.createdTimestamp
        const latency = sent.resource.createdTimestamp - interaction.createdTimestamp;

        const embed = baseEmbed()
            .setTitle('System Diagnostic Complete')
            .setDescription(`The Archives are online.\n\n**Response Time:** \`${latency}ms\`\n**Mainframe Latency:** \`${Math.round(interaction.client.ws.ping)}ms\``)
        // .setThumbnail(interaction.client.user.displayAvatarURL()) // Can uncomment if we want the thumbnail

        await interaction.editReply({ content: null, embeds: [embed] });
    },
};
