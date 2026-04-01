const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('support')
        .setDescription('💬 Get help and join our support server'),
    cooldown: 5,
    botPermissions: ['SendMessages', 'EmbedLinks'],

    async execute(interaction) {
        const baseEmbed = require('../../utils/generators/baseEmbed');
        const embed = baseEmbed('💬 Need Help?', 
            'Join our support server for assistance with archival protocols, reporting viral rot (bugs), or architectural suggestions.', 
            interaction.client.user.displayAvatarURL()
        )
            .setColor('#FFACD1')
            .addFields(
                {
                    name: '🗂️ Support Categories',
                    value: '• ⚙️ **Setup & Configuration**\n' +
                           '• 🐛 **Bug Reports (Viral Rot)**\n' +
                           '• 💡 **Feature Suggestions**\n' +
                           '• ❓ **General Inquiries**',
                    inline: false
                },
                {
                    name: '📖 Quick Links',
                    value: '• [Documentation](https://github.com/Cxllion/discord-animuse#readme)\n' +
                        '• [GitHub Issues](https://github.com/Cxllion/discord-animuse/issues)\n' +
                        '• [Privacy Policy](https://github.com/Cxllion/discord-animuse#privacy)',
                    inline: false
                }
            );

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
