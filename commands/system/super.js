const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const registry = require('../../utils/handlers/super/registry');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('super')
        .setDescription('Master configuration system for Animuse.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('category')
                .setDescription('Jump directly to a specific category')
                .setAutocomplete(true)),

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const choices = Object.entries(registry.getAllCategories())
            .filter(([key]) => key !== 'dashboard') // Hide dashboard from direct search
            .map(([key, data]) => ({ name: data.label, value: key }));

        const filtered = choices.filter(choice =>
            choice.name.toLowerCase().includes(focusedValue.toLowerCase())
        );

        // Max 25 choices for Discord Autocomplete
        await interaction.respond(filtered.slice(0, 25));
    },

    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const categoryKey = interaction.options.getString('category');
        const guildId = interaction.guild.id;

        // If category provided and exists in registry
        if (categoryKey) {
            const category = registry.getCategory(categoryKey);
            if (category && category.handler) {
                // Execute specific handler
                const payload = await category.handler(interaction, guildId);
                return await interaction.editReply(payload);
            } else if (category) {
                return await interaction.editReply({ content: `The **${category.label}** wing is currently under renovation.` });
            }
        }

        // Default to Dashboard
        const payload = await registry.getCategory('dashboard').handler(interaction, guildId);
        await interaction.editReply(payload);
    },
};
