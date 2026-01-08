const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const CONFIG = require('../../utils/config');
const { handleError } = require('../../utils/handlers/errorHandler');
const { logAction } = require('../../utils/handlers/moderationLogger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user from the server.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to ban')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the ban')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('purge')
                .setDescription('Delete messages from the last 7 days? (Default: No)'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';
            const purge = interaction.options.getBoolean('purge') || false;

            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (member && !member.bannable) {
                return await interaction.editReply({ content: 'I cannot ban this user (permissions check).' });
            }

            // DM Notif
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor(CONFIG.COLORS.ERROR)
                    .setTitle(`You have been banned from ${interaction.guild.name}`)
                    .setDescription(`**Reason:** ${reason}`);
                await targetUser.send({ embeds: [dmEmbed] });
            } catch (e) { }

            // Ban
            await interaction.guild.members.ban(targetUser, {
                section: purge ? 604800 : 0, // 7 days in seconds if true, else 0
                reason: reason
            });

            // Log
            await logAction(interaction.guild, targetUser, interaction.user, 'BAN', reason);

            // Reply
            const successEmbed = new EmbedBuilder()
                .setColor(CONFIG.COLORS.ERROR)
                .setDescription(`${CONFIG.EMOJIS.SUCCESS} **${targetUser.tag}** has been banned.\n> ${reason}`);

            await interaction.editReply({ embeds: [successEmbed] });

        } catch (error) {
            await handleError(interaction, error);
        }
    },
};
