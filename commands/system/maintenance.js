const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');
const statusManager = require('../../utils/core/statusManager');
const logger = require('../../utils/core/logger');

module.exports = {
    category: 'system',
    dbRequired: true,
    data: new SlashCommandBuilder()
        .setName('maintenance')
        .setDescription('Toggle the Library Maintenance mode.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addBooleanOption(option =>
            option.setName('enabled')
                .setDescription('Whether to enable or disable maintenance mode.')
                .setRequired(true)),

    async execute(interaction) {
        const isOwner = interaction.client.application?.owner?.id === interaction.user.id;
        
        // Extra safety check for owner
        if (!isOwner && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return await interaction.reply({
                content: "Only the High Archivists (Administrators) can seal the Library's gates.",
                flags: MessageFlags.Ephemeral
            });
        }

        const enabled = interaction.options.getBoolean('enabled');
        statusManager.setMaintenance(enabled);

        const statusLabel = enabled ? "SEALED (Maintenance On)" : "OPEN (Maintenance Off)";
        const color = enabled ? 0xffaa00 : 0x00ffaa;

        const baseEmbed = require('../../utils/generators/baseEmbed');
        const embed = baseEmbed('Library Status Updated', 
            `The Library gates are now **${statusLabel}**.`, 
            null
        )
            .addFields(
                { name: 'Status', value: enabled ? '🚧 Restricted Access' : '📖 Public Access', inline: true },
                { name: 'Updated By', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setColor(color);

        logger.info(`Maintenance mode ${enabled ? 'ENABLED' : 'DISABLED'} by ${interaction.user.tag}`, 'System');

        await interaction.reply({
            embeds: [embed],
            flags: MessageFlags.Ephemeral
        });
    },
};
