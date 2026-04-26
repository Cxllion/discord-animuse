const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    category: 'general',
    dbRequired: true,
    data: new SlashCommandBuilder()
        .setName('suggest')
        .setDescription('Share your ideas and feedback with the Librarians.'),

    async execute(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('suggestion_modal_submit')
            .setTitle('Submit a Suggestion');

        const titleInput = new TextInputBuilder()
            .setCustomId('title')
            .setLabel('Title (Brief summary)')
            .setPlaceholder('e.g., Add a music player')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

        const contentInput = new TextInputBuilder()
            .setCustomId('content')
            .setLabel('Description (Details of your idea)')
            .setPlaceholder('Explain your suggestion in detail...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(2000);

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(contentInput)
        );

        await interaction.showModal(modal);
    },
};
