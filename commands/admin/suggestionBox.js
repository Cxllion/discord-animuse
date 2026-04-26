const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { fetchConfig } = require('../../utils/services/guildConfigService');
const suggestionGenerator = require('../../utils/generators/suggestionGenerator');

module.exports = {
    category: 'admin',
    dbRequired: true,
    data: new SlashCommandBuilder()
        .setName('suggestion-box')
        .setDescription('Deploy the permanent Suggestions Box to the configured channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const config = await fetchConfig(interaction.guildId);
        const channelId = config?.suggestions_channel_id;

        if (!channelId) {
            return await interaction.editReply('❌ **Configuration Error**: No suggestions channel has been assigned. Use `/channel assign type:Suggestions Box` first.');
        }

        const channel = interaction.guild.channels.cache.get(channelId);
        if (!channel) {
            return await interaction.editReply('❌ **Error**: The configured suggestions channel no longer exists.');
        }

        try {
            const botAvatar = interaction.client.user.displayAvatarURL({ dynamic: true });
            const payload = suggestionGenerator.renderSuggestionsBox(botAvatar);
            await channel.send(payload);

            await interaction.editReply(`✅ **Success!** The Suggestions Box has been deployed to ${channel}.`);
        } catch (error) {
            console.error('[SuggestionBox Command] Error:', error);
            await interaction.editReply('❌ **Error**: Failed to send the Suggestions Box. Check my permissions in that channel.');
        }
    },
};
