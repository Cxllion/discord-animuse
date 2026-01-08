const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const CONFIG = require('../../utils/config');
const { handleError } = require('../../utils/handlers/errorHandler');
const { logAction } = require('../../utils/handlers/moderationLogger');

module.exports = {
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
            await interaction.deferReply({ ephemeral: true });

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
                const dmEmbed = new EmbedBuilder()
                    .setColor(CONFIG.COLORS.ERROR)
                    .setTitle(`You have been kicked from ${interaction.guild.name}`)
                    .setDescription(`**Reason:** ${reason}`);
                await targetUser.send({ embeds: [dmEmbed] });
            } catch (e) { }

            // Kick
            await member.kick(reason);

            // Log
            await logAction(interaction.guild, targetUser, interaction.user, 'KICK', reason);

            // Reply
            const successEmbed = new EmbedBuilder()
                .setColor(CONFIG.COLORS.ERROR)
                .setDescription(`${CONFIG.EMOJIS.SUCCESS} **${targetUser.tag}** has been kicked.\n> ${reason}`);

            await interaction.editReply({ embeds: [successEmbed] });

        } catch (error) {
            await handleError(interaction, error);
        }
    },
};
