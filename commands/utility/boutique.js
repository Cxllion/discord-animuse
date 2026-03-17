const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { upsertConfig } = require('../../utils/core/database');
const { renderBoutique } = require('../../utils/handlers/boutiqueHandler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('boutique')
        .setDescription('Manage the Master Role Boutique hub.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub =>
            sub.setName('initialize')
                .setDescription('Deploy the persistent Boutique embed to this channel.')
        ),

    async execute(interaction) {
        if (interaction.options.getSubcommand() === 'initialize') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const guildId = interaction.guildId;
            const channelId = interaction.channelId;

            try {
                // Render the initial boutique view
                const payload = await renderBoutique(guildId);

                // Send the persistent message
                const boutiqueMessage = await interaction.channel.send(payload);

                // Update database with the persistence IDs
                await upsertConfig(guildId, {
                    boutique_channel_id: channelId,
                    boutique_message_id: boutiqueMessage.id
                });

                await interaction.editReply({ 
                    content: `✅ **Boutique Initialized!**\nPersistent Message ID: \`${boutiqueMessage.id}\`\nMembers can now select roles directly from the embed above.` 
                });

            } catch (error) {
                console.error('[Boutique Command] Error:', error);
                await interaction.editReply({ 
                    content: '❌ **Initialization Failed:** An error occurred while deploying the boutique. Check logs for details.' 
                });
            }
        }
    },
};
