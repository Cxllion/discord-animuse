const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const CONFIG = require('../../utils/config');
const { handleError } = require('../../utils/handlers/errorHandler');
const { logAction } = require('../../utils/handlers/moderationLogger');

module.exports = {
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
            await interaction.deferReply({ ephemeral: true });

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
                const dmEmbed = new EmbedBuilder()
                    .setColor(CONFIG.COLORS.WARNING)
                    .setTitle(`⚠️ Warning Received in ${interaction.guild.name}`)
                    .setDescription(`**Reason:** ${reason}`)
                    .setTimestamp();
                await targetUser.send({ embeds: [dmEmbed] });
            } catch (e) {
                // Ignore DM failure
            }

            // Log
            await logAction(interaction.guild, targetUser, interaction.user, 'WARN', reason);

            // Reply
            const successEmbed = new EmbedBuilder()
                .setColor(CONFIG.COLORS.SUCCESS)
                .setDescription(`${CONFIG.EMOJIS.SUCCESS} **${targetUser.tag}** has been warned.\n> ${reason}`);

            await interaction.editReply({ embeds: [successEmbed] });

        } catch (error) {
            await handleError(interaction, error);
        }
    },
};
