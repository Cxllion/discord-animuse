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
                'Select a "Wing" of the archives from the menu below to discover the commands and services available to you.'
            )
            .addFields(
                { name: '📚 General Wing', value: 'Basic bot info, status, and utility.', inline: true },
                { name: '🛡️ Council Wing', value: 'Moderation and server architecture (Admin).', inline: true },
                { name: '🎨 Aesthetic Wing', value: 'Profile personalization and boutique.', inline: true },
                { name: '🅰️ Media Wing', value: 'Anime tracking and Bingo systems.', inline: true }
            )
            .setColor('#A78BFA')
            .setFooter({ text: '✦ Archives of AniMuse' });

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('help_category_select')
                .setPlaceholder('Choose a Wing to explore...')
                .addOptions([
                    { label: 'General Wing', value: 'help_general', emoji: '📚', description: 'Basic utilities and info.' },
                    { label: 'Council Wing', value: 'help_admin', emoji: '🛡️', description: 'Moderation and management.' },
                    { label: 'Aesthetic Wing', value: 'help_social', emoji: '🎨', description: 'Profiles and roles.' },
                    { label: 'Media Wing', value: 'help_media', emoji: '🅰️', description: 'Anime and Bingo.' }
                ])
        );

        await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    }
};
