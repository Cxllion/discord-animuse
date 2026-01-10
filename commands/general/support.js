const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('support')
        .setDescription('💬 Get help and join our support server'),
    cooldown: 5,
    botPermissions: ['SendMessages', 'EmbedLinks'],

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor('#FFACD1')
            .setAuthor({
                name: 'AniMuse Support',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTitle('💬 Need Help?')
            .setDescription(
                'Join our support server for assistance with:\n\n' +
                '• ⚙️ **Setup & Configuration**\n' +
                '• 🐛 **Bug Reports**\n' +
                '• 💡 **Feature Suggestions**\n' +
                '• ❓ **General Questions**\n' +
                '• 🎉 **Community Events**\n\n' +
                'Our friendly staff and community are ready to help!'
            )
            .addFields(
                {
                    name: '📖 Quick Links',
                    value: '• [Documentation](https://github.com/Cxllion/discord-animuse#readme)\n' +
                        '• [GitHub Issues](https://github.com/Cxllion/discord-animuse/issues)\n' +
                        '• [Privacy Policy](https://github.com/Cxllion/discord-animuse#privacy)'
                }
            )
            .setFooter({ text: 'We typically respond within a few hours' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Join Support Server')
                .setStyle(ButtonStyle.Link)
                .setURL('https://discord.gg/your-support-server') // Update this!
                .setEmoji('🆘'),
            new ButtonBuilder()
                .setLabel('View Documentation')
                .setStyle(ButtonStyle.Link)
                .setURL('https://github.com/Cxllion/discord-animuse#readme')
                .setEmoji('📚')
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }
};
