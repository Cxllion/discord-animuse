const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const baseEmbed = require('../../utils/generators/baseEmbed');
const CONFIG = require('../../utils/config');
const { handleCommandError } = require('../../utils/core/errorHandler');
const { logAction } = require('../../utils/handlers/moderationLogger');

module.exports = {
    category: 'moderation',
    dbRequired: true,
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user from the server.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to kick')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the kick')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const targetUser = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'No reason provided';

            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!member) {
                return await interaction.editReply({ content: 'User not found in this server.' });
            }

            if (!member.kickable) {
                return await interaction.editReply({ content: 'I cannot kick this user (permissions check).' });
            }

            // DM Notif
            try {
                const dmEmbed = baseEmbed(`👢 Kicked from ${interaction.guild.name}`, `You have been removed from the archives.`, interaction.client.user.displayAvatarURL())
                    .setColor(CONFIG.COLORS.ERROR)
                    .addFields({ name: 'Reason', value: reason });
                await targetUser.send({ embeds: [dmEmbed] });
            } catch (e) { }

            // Kick
            await member.kick(reason);

            // Log
            await logAction(interaction.guild, targetUser, interaction.user, 'KICK', reason);

            // Reply
            const successEmbed = baseEmbed(null, `${CONFIG.EMOJIS.SUCCESS} **${targetUser.tag}** has been removed from the collection.\n> ${reason}`, interaction.client.user.displayAvatarURL())
                .setColor(CONFIG.COLORS.ERROR);

            await interaction.editReply({ embeds: [successEmbed] });

        } catch (error) {
            await handleCommandError(interaction, error, 'kick');
        }
    },
};
