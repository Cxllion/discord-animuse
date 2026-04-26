const { 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder, 
    MessageFlags 
} = require('discord.js');
const suggestionService = require('../services/suggestionService');
const suggestionGenerator = require('../generators/suggestionGenerator');
const { fetchConfig } = require('../services/guildConfigService');
const logger = require('../core/logger');

/**
 * Suggestion Handler: The central intelligence for all suggestion interactions.
 */
const handleSuggestionInteraction = async (interaction) => {
    const { customId, guild, user, member, channel } = interaction;

    // --- 1. Open Modal ---
    if (customId === 'suggestion_open_modal') {
        const modal = new ModalBuilder()
            .setCustomId('suggestion_modal_submit')
            .setTitle('Submit a Suggestion');

        const titleInput = new TextInputBuilder()
            .setCustomId('title')
            .setLabel('Title (Brief summary)')
            .setPlaceholder('e.g., Add a music player')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(100);

        const contentInput = new TextInputBuilder()
            .setCustomId('content')
            .setLabel('Description (Details of your idea)')
            .setPlaceholder('Explain your suggestion in detail...')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(2000);

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(contentInput)
        );

        return await interaction.showModal(modal);
    }

    // --- 2. Handle Modal Submission ---
    if (interaction.isModalSubmit() && customId === 'suggestion_modal_submit') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const title = interaction.fields.getTextInputValue('title');
        const content = interaction.fields.getTextInputValue('content');

        // Fetch config to find where to post
        const config = await fetchConfig(guild.id);
        const targetChannelId = config?.suggestions_channel_id;

        if (!targetChannelId) {
            return await interaction.editReply('❌ **Configuration Error**: The suggestions channel has not been set up for this server. Please contact an administrator.');
        }

        const targetChannel = guild.channels.cache.get(targetChannelId);
        if (!targetChannel) {
            return await interaction.editReply('❌ **Error**: The designated suggestions channel no longer exists.');
        }

        try {
            // 1. Create in DB (Pending state)
            const { data: suggestion, error } = await suggestionService.createSuggestion({
                guildId: guild.id,
                userId: user.id,
                title: title,
                content: content,
                channelId: targetChannelId
            });

            if (error) throw new Error('DB Error');

            // 2. Generate and post embed
            const payload = suggestionGenerator.renderSuggestion(suggestion, user);
            const message = await targetChannel.send(payload);

            // 3. Create Thread
            const thread = await message.startThread({
                name: `Discussion: ${title.slice(0, 50)}`,
                autoArchiveDuration: 10080, // 1 week
                reason: 'Suggestion Discussion'
            });

            // 4. Update DB with message/thread IDs
            await suggestionService.updateSuggestion(suggestion.id, {
                message_id: message.id,
                thread_id: thread.id
            });

            await interaction.editReply(`✅ **Suggestion Submitted!** Your idea has been archived in <#${targetChannelId}>. Thank you for contributing to the library!`);
        } catch (err) {
            logger.error('Failed to process suggestion submission', err, 'SuggestionHandler');
            await interaction.editReply('❌ **Critical Error**: I was unable to process your suggestion. Please try again later.');
        }
    }

    // --- 3. Handle Voting ---
    if (customId.startsWith('suggestion_vote_')) {
        // IDs: suggestion_vote_up_ID or suggestion_vote_down_ID
        const parts = customId.split('_');
        const voteType = parts[2]; // 'up' or 'down'
        const suggestionId = parts[3];

        // Defer update to avoid "Interaction Failed"
        await interaction.deferUpdate().catch(() => null);

        try {
            // Update vote in DB
            const { data: updates, error } = await suggestionService.handleVote(suggestionId, user.id, voteType);
            if (error) return;

            // Fetch current suggestion state
            const suggestion = await suggestionService.getSuggestion(suggestionId);
            if (!suggestion) return;

            // Re-render embed
            const author = await guild.members.fetch(suggestion.user_id).catch(() => null);
            const payload = suggestionGenerator.renderSuggestion(suggestion, author?.user);

            // Update the message
            await interaction.editReply(payload);
        } catch (err) {
            logger.error(`Failed to handle vote for ${suggestionId}`, err, 'SuggestionHandler');
        }
    }
};

module.exports = {
    handleSuggestionInteraction,
    routerConfig: {
        prefixes: ['suggestion_'],
        handle: handleSuggestionInteraction
    }
};
