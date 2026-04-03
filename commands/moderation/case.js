const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const CONFIG = require('../../utils/config');
const { handleCommandError } = require('../../utils/core/errorHandler');
const baseEmbed = require('../../utils/generators/baseEmbed');
const { getModerationLogs } = require('../../utils/core/database');
const moment = require('moment');

module.exports = {
    category: 'moderation',
    dbRequired: true,
    data: new SlashCommandBuilder()
        .setName('case')
        .setDescription('View moderation history for a user.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to investigate')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const targetUser = interaction.options.getUser('user');
            const logs = await getModerationLogs(interaction.guild.id, targetUser.id);

            if (logs.length === 0) {
                return await interaction.editReply({
                    embeds: [
                        baseEmbed('Archival Record', `✅ **${targetUser.tag}** has a clean record.`, interaction.client.user.displayAvatarURL())
                            .setColor(CONFIG.COLORS.SUCCESS)
                    ]
                });
            }

            // Pagination could be added, but for now take last 10
            const recentLogs = logs.slice(0, 10);

            const embed = baseEmbed(`Archival Record: ${targetUser.tag}`, null, targetUser.displayAvatarURL())
                .setColor(CONFIG.COLORS.WARNING);

            const fields = await Promise.all(recentLogs.map(async (log) => {
                const modUser = await interaction.client.users.fetch(log.moderator_id).catch(() => ({ tag: 'Unknown' }));
                const date = moment(log.created_at).format('MMM Do, h:mma');
                return {
                    name: `${log.action} | ${date}`,
                    value: `**Mod:** ${modUser.tag}\n**Reason:** ${log.reason}`,
                    inline: false
                };
            }));

            embed.addFields(fields);

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await handleCommandError(interaction, error, 'case');
        }
    },
};
