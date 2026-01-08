const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const CONFIG = require('../../utils/config');
const { handleError } = require('../../utils/handlers/errorHandler');
const moment = require('moment');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Displays technical data for a specific user.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to investigate')
                .setRequired(false)),

    async execute(interaction) {
        try {
            const targetUser = interaction.options.getUser('user') || interaction.user;
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!member) {
                return await handleError(interaction, new Error('Member not found'), CONFIG.MESSAGES.ERRORS.USER_NOT_FOUND);
            }

            // Dates
            const joinedAt = moment(member.joinedAt).format('MMMM Do YYYY, h:mm a');
            const joinedAgo = moment(member.joinedAt).fromNow();
            const createdAt = moment(targetUser.createdAt).format('MMMM Do YYYY, h:mm a');
            const createdAgo = moment(targetUser.createdAt).fromNow();

            // Roles (Exclude @everyone)
            const roles = member.roles.cache
                .filter(r => r.id !== interaction.guild.id)
                .sort((a, b) => b.position - a.position)
                .map(r => r.toString())
                .slice(0, 10); // Max 10 to prevent overflow

            const roleDisplay = roles.length > 0 ? roles.join(', ') + (member.roles.cache.size > 11 ? ` ...and ${member.roles.cache.size - 11} more` : '') : 'None';

            // Key Permissions
            const keyPermissions = [];
            if (member.permissions.has(PermissionsBitField.Flags.Administrator)) keyPermissions.push('Administrator');
            if (member.permissions.has(PermissionsBitField.Flags.ManageGuild)) keyPermissions.push('Manage Server');
            if (member.permissions.has(PermissionsBitField.Flags.ManageMessages)) keyPermissions.push('Manage Messages');
            if (member.permissions.has(PermissionsBitField.Flags.KickMembers)) keyPermissions.push('Kick Members');
            if (member.permissions.has(PermissionsBitField.Flags.BanMembers)) keyPermissions.push('Ban Members');

            const embed = new EmbedBuilder()
                .setColor(member.displayHexColor === '#000000' ? CONFIG.COLORS.PRIMARY : member.displayHexColor)
                .setAuthor({ name: targetUser.tag, iconURL: targetUser.displayAvatarURL() })
                .setThumbnail(member.displayAvatarURL({ dynamic: true, size: 512 }))
                .addFields(
                    {
                        name: '👤 Identity',
                        value: `**ID:** ${targetUser.id}\n**Mention:** ${targetUser}\n**Nickname:** ${member.nickname || 'None'}`,
                        inline: false
                    },
                    {
                        name: '📆 Dates',
                        value: `**Joined Server:** ${joinedAt}\n(${joinedAgo})\n\n**Registered:** ${createdAt}\n(${createdAgo})`,
                        inline: false
                    },
                    {
                        name: `🎭 Roles (${member.roles.cache.size - 1})`,
                        value: roleDisplay,
                        inline: false
                    }
                )
                .setFooter({ text: 'Animuse Citizen Registry' });

            if (keyPermissions.length > 0) {
                embed.addFields({ name: '🔑 Key Permissions', value: keyPermissions.join(', '), inline: false });
            }

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            await handleError(interaction, error);
        }
    },
};
