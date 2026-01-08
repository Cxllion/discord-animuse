const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const CONFIG = require('../../utils/config');
const { handleError } = require('../../utils/handlers/errorHandler');
const { logAction } = require('../../utils/handlers/moderationLogger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Bulk delete messages.')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to delete (1-100)')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const amount = interaction.options.getInteger('amount');

            // Delete
            const deleted = await interaction.channel.bulkDelete(amount, true); // true = filterOld (older than 14 days)

            // Log
            await logAction(interaction.guild, interaction.user, interaction.user, 'PURGE', `Cleared ${deleted.size} messages in #${interaction.channel.name}`);

            // Reply
            const successEmbed = new EmbedBuilder()
                .setColor(CONFIG.COLORS.INFO)
                .setDescription(`${CONFIG.EMOJIS.SUCCESS} Successfully cleared **${deleted.size}** messages.`);

            await interaction.editReply({ embeds: [successEmbed] });

        } catch (error) {
            await handleError(interaction, error);
        }
    },
};
