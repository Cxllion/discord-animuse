const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('🔗 Get the bot invite link and support server'),
    cooldown: 5,
    botPermissions: ['SendMessages', 'EmbedLinks'],

    async execute(interaction) {
        // Generate bot invite URL
        const clientId = interaction.client.user.id;
        const permissions = '8'; // Administrator (you can customize this)
        const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`;

        const embed = new EmbedBuilder()
            .setColor('#FFACD1')
            .setAuthor({
                name: 'AniMuse Bot',
                iconURL: interaction.client.user.displayAvatarURL()
            })
            .setTitle('📚 Invite AniMuse to Your Server!')
            .setDescription(
                'Add AniMuse to bring anime tracking, beautiful profiles, bingo cards, ' +
                'and interactive features to your community.\n\n' +
                '**Features Include:**\n' +
                '• 🎬 Anime episode notifications\n' +
                '• 🎮 Interactive bingo cards\n' +
                '• 👤 Custom profile system\n' +
                '• 🏆 XP & leaderboards\n' +
                '• 🛡️ Moderation tools'
            )
            .setFooter({ text: 'Made with ❤️ for anime communities' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Add to Server')
                .setStyle(ButtonStyle.Link)
                .setURL(inviteUrl)
                .setEmoji('➕'),
            new ButtonBuilder()
                .setLabel('Support Server')
                .setStyle(ButtonStyle.Link)
                .setURL('https://discord.gg/your-support-server') // Update this!
                .setEmoji('💬'),
            new ButtonBuilder()
                .setLabel('GitHub')
                .setStyle(ButtonStyle.Link)
                .setURL('https://github.com/Cxllion/discord-animuse')
                .setEmoji('🔗')
        );

        await interaction.reply({ embeds: [embed], components: [row] });
    }
};
