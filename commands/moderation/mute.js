const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const baseEmbed = require('../../utils/generators/baseEmbed');
const CONFIG = require('../../utils/config');
const { handleCommandError } = require('../../utils/core/errorHandler');
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
    category: 'moderation',
    dbRequired: true,
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
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
            const successEmbed = baseEmbed(`🔇 Archival Silence: ${targetUser.tag}`, `${CONFIG.EMOJIS.SUCCESS} **${targetUser.tag}** has been placed in archival silence for **${durationStr}**.\n> ${reason}`, interaction.client.user.displayAvatarURL())
                .setColor(CONFIG.COLORS.WARNING);

            await interaction.editReply({ embeds: [successEmbed] });

            // DM Notif
            try {
                const dmEmbed = baseEmbed(`🔇 Muted in ${interaction.guild.name}`, `You have been placed in archival silence for **${durationStr}**.\n\nDuring this time, you will be unable to participate in the archives.`, interaction.client.user.displayAvatarURL())
                    .setColor(CONFIG.COLORS.WARNING)
                    .addFields({ name: 'Reason', value: reason });
                await targetUser.send({ embeds: [dmEmbed] });
            } catch (e) { }

        } catch (error) {
            await handleCommandError(interaction, error, 'mute');
        }
    },
};
