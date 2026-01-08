const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const CONFIG = require('../../utils/config');
const { handleError } = require('../../utils/handlers/errorHandler');
const { logAction } = require('../../utils/handlers/moderationLogger');

// Simple time parser since 'ms' might not be in package.json (I checked earlier, it wasn't explicitly listed but moment was)
// Actually package.json didn't show 'ms'. I should use a simple regex helper to be safe or install it.
// I'll write a simple parser here to avoid dependency hell for now.
const parseTime = (str) => {
    if (!str) return null;
    const match = str.match(/^(\d+)(s|m|h|d|w)?$/);
    if (!match) return null;
    const val = parseInt(match[1]);
    const unit = match[2] || 'm';
    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
        w: 7 * 24 * 60 * 60 * 1000
    };
    return val * multipliers[unit];
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Timeout a user for a specified duration.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to mute')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('Duration (e.g., 10m, 1h, 1d)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for the mute')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const targetUser = interaction.options.getUser('user');
            const durationStr = interaction.options.getString('duration');
            const reason = interaction.options.getString('reason') || 'No reason provided';

            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!member) {
                return await interaction.editReply({ content: 'User not found in this server.' });
            }

            if (!member.moderatable) {
                return await interaction.editReply({ content: 'I cannot mute this user (permissions check).' });
            }

            const durationMs = parseTime(durationStr);
            if (!durationMs || durationMs > 28 * 24 * 60 * 60 * 1000) { // Discord Limit: 28 days
                return await interaction.editReply({ content: 'Invalid duration. Format: 10m, 1h. Max: 28 days.' });
            }

            // Apply Timeout
            await member.timeout(durationMs, reason);

            // Log
            await logAction(interaction.guild, targetUser, interaction.user, 'MUTE', `${reason} (${durationStr})`);

            // Reply
            const successEmbed = new EmbedBuilder()
                .setColor(CONFIG.COLORS.WARNING)
                .setDescription(`${CONFIG.EMOJIS.SUCCESS} **${targetUser.tag}** has been timed out for **${durationStr}**.\n> ${reason}`);

            await interaction.editReply({ embeds: [successEmbed] });

            // DM Notif
            try {
                await targetUser.send(`You have been muted in **${interaction.guild.name}** for **${durationStr}**.\nReason: ${reason}`);
            } catch (e) { }

        } catch (error) {
            await handleError(interaction, error);
        }
    },
};
