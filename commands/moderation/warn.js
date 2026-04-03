const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const baseEmbed = require('../../utils/generators/baseEmbed');
const CONFIG = require('../../utils/config');
const { handleCommandError } = require('../../utils/core/errorHandler');
const { logAction } = require('../../utils/handlers/moderationLogger');

module.exports = {
    category: 'moderation',
    dbRequired: true,
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Issue a formal warning to a user.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to warn')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the warning')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');

            if (targetUser.id === interaction.user.id) {
                return await interaction.editReply({ content: 'You cannot warn yourself.' });
            }

            if (targetUser.bot) {
                return await interaction.editReply({ content: 'You cannot warn a bot.' });
            }

            // DM the user
            try {
                const dmEmbed = baseEmbed(`⚠️ Warning Received`, `An entry has been recorded in your archival record for **${interaction.guild.name}**.`, interaction.client.user.displayAvatarURL())
                    .setColor(CONFIG.COLORS.WARNING)
                    .addFields({ name: 'Reason', value: reason });
                await targetUser.send({ embeds: [dmEmbed] });
            } catch (e) {
                // Ignore DM failure
            }

            // Log
            await logAction(interaction.guild, targetUser, interaction.user, 'WARN', reason);

            // Reply
            const successEmbed = baseEmbed(null, `${CONFIG.EMOJIS.SUCCESS} **${targetUser.tag}**'s record has been updated with a warning.\n> ${reason}`, interaction.client.user.displayAvatarURL())
                .setColor(CONFIG.COLORS.SUCCESS);

            await interaction.editReply({ embeds: [successEmbed] });

        } catch (error) {
            await handleCommandError(interaction, error, 'warn');
        }
    },
};
