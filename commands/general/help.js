const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('View the archives of available commands and features.'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('📖 The Grand Library Archives')
            .setDescription(
                'Welcome to the **AniMuse Library**. I am your automated archivist.\n\n' +
                'Every command is a volume in our collection. Select a **Wing** of the archives from the menu below to discover the services available to you.'
            )
            .addFields(
                { name: '📚 General Wing', value: 'Basic utilities, bot status, and info.', inline: true },
                { name: '🛡️ Council Wing', value: 'Moderation, politics, and architecture.', inline: true },
                { name: '🎨 Aesthetic Wing', value: 'Profiles, personalizations, and self-roles.', inline: true },
                { name: '🅰️ Media Wing', value: 'Anime tracking, Bingo cards, and Search.', inline: true }
            )
            .setColor('#A78BFA')
            .setThumbnail(interaction.client.user.displayAvatarURL())
            .setFooter({ text: '✦ Archives of AniMuse • Navigation Unit' })
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`help_wing_selector_${interaction.user.id}`)
                .setPlaceholder('Choose a Wing to explore...')
                .addOptions([
                    { label: 'General Wing', value: 'help_general', emoji: '📚', description: 'Utilities, help, and ping.' },
                    { label: 'Council Wing', value: 'help_admin', emoji: '🛡️', description: 'Moderation and Configuration.' },
                    { label: 'Aesthetic Wing', value: 'help_social', emoji: '🎨', description: 'Profiles and social settings.' },
                    { label: 'Media Wing', value: 'help_media', emoji: '🅰️', description: 'Anime Tracking and Bingo.' }
                ])
        );

        await interaction.reply({ 
            embeds: [embed], 
            components: [row]
        });
    }
};
