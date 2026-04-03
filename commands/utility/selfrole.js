const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { upsertConfig } = require('../../utils/core/database');
const { renderBoutique } = require('../../utils/handlers/boutiqueHandler');

module.exports = {
    category: 'utility',
    dbRequired: false,
    data: new SlashCommandBuilder()
        .setName('selfrole')
        .setDescription('Manage the Master Role Boutique hub.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub =>
            sub.setName('initialize')
                .setDescription('Deploy the persistent Role Boutique embed to this channel.')
        )
        .addSubcommand(sub =>
            sub.setName('set')
                .setDescription('Configure the visual settings of the Self-Role Boutique.')
                .addStringOption(opt => opt.setName('thumbnail').setDescription('The URL for the boutique thumbnail.'))
                .addStringOption(opt => opt.setName('footer').setDescription('The text for the boutique footer.'))
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'initialize') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const guildId = interaction.guildId;
            const channelId = interaction.channelId;

            try {
                // Render the initial boutique view
                const payload = await renderBoutique(guildId, null, interaction.member);

                // Send the persistent message
                const boutiqueMessage = await interaction.channel.send(payload);

                // Update database with the persistence IDs
                await upsertConfig(guildId, {
                    boutique_channel_id: channelId,
                    boutique_message_id: boutiqueMessage.id
                });

                await interaction.editReply({ 
                    content: `✅ **Self-Role Hub Initialized!**\nPersistent Message ID: \`${boutiqueMessage.id}\`\nMembers can now select roles directly from the embed above.` 
                });

            } catch (error) {
                console.error('[Boutique Command] Error:', error);
                await interaction.editReply({ 
                    content: '❌ **Initialization Failed:** An error occurred while deploying the boutique. Check logs for details.' 
                });
            }
        } else if (subcommand === 'set') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const thumbnail = interaction.options.getString('thumbnail');
            const footer = interaction.options.getString('footer');

            const updates = {};
            if (thumbnail) updates.boutique_thumbnail = thumbnail;
            if (footer) updates.boutique_footer = footer;

            if (Object.keys(updates).length === 0) {
                return await interaction.editReply('❌ **Error**: Please provide at least one option to update.');
            }

            await upsertConfig(interaction.guildId, updates);
            await interaction.editReply(`✅ **Boutique Settings Updated!** ${thumbnail ? '\n◈ Thumbnail updated.' : ''} ${footer ? '\n◈ Footer updated.' : ''}`);
        }
    },
};
