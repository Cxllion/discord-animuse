const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const suggestionService = require('../../utils/services/suggestionService');
const suggestionGenerator = require('../../utils/generators/suggestionGenerator');
const logger = require('../../utils/core/logger');

module.exports = {
    category: 'admin',
    dbRequired: true,
    data: new SlashCommandBuilder()
        .setName('suggestion')
        .setDescription('Manage server suggestions.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub =>
            sub.setName('status')
                .setDescription('Update the status of a suggestion.')
                .addIntegerOption(opt => opt.setName('id').setDescription('The ID of the suggestion.').setRequired(true))
                .addStringOption(opt => 
                    opt.setName('status')
                        .setDescription('The new status.')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Approved', value: 'approved' },
                            { name: 'Rejected', value: 'rejected' },
                            { name: 'In Progress', value: 'in-progress' },
                            { name: 'Implemented', value: 'implemented' }
                        )
                )
                .addStringOption(opt => opt.setName('reason').setDescription('The reason for this status change.'))
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'status') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const id = interaction.options.getInteger('id');
            const status = interaction.options.getString('status');
            const reason = interaction.options.getString('reason');

            try {
                const suggestion = await suggestionService.getSuggestion(id);
                if (!suggestion) {
                    return await interaction.editReply(`❌ **Error**: Could not find a suggestion with ID \`${id}\`.`);
                }

                // Update DB
                await suggestionService.updateSuggestion(id, { status: status });

                // Update the original message if it exists
                const channel = interaction.guild.channels.cache.get(suggestion.channel_id);
                if (channel) {
                    const message = await channel.messages.fetch(suggestion.message_id).catch(() => null);
                    if (message) {
                        const author = await interaction.guild.members.fetch(suggestion.user_id).catch(() => null);
                        const payload = suggestionGenerator.renderSuggestion({ ...suggestion, status: status }, author?.user);
                        
                        // If reason is provided, we could add it to the embed, but for now let's just update the status
                        await message.edit(payload);
                    }

                    // Post update to thread if it exists
                    if (suggestion.thread_id) {
                        const thread = channel.threads.cache.get(suggestion.thread_id) || await channel.threads.fetch(suggestion.thread_id).catch(() => null);
                        if (thread) {
                            await thread.send({
                                content: `📢 **Status Update**: This suggestion has been marked as **${status.toUpperCase()}** by <@${interaction.user.id}>.${reason ? `\n**Reason**: ${reason}` : ''}`
                            });
                        }
                    }
                }

                await interaction.editReply(`✅ **Success!** Suggestion \`${id}\` has been updated to **${status}**.`);
            } catch (err) {
                logger.error(`Failed to update suggestion status for ID ${id}`, err, 'SuggestionCommand');
                await interaction.editReply('❌ **Error**: An internal error occurred while updating the suggestion.');
            }
        }
    },
};
