const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const baseEmbed = require('../../utils/generators/baseEmbed');
const CONFIG = require('../../utils/config');
const { handleCommandError } = require('../../utils/core/errorHandler');
const { logAction } = require('../../utils/handlers/moderationLogger');

module.exports = {
    category: 'moderation',
    dbRequired: true,
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Bulk delete messages with advanced filtering.')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Number of messages to delete (default: 10, max: 100)')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(false))
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user whose messages should be cleared')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        try {
            // Defer reply for ephemeral response as fetching/deleting can take a moment
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const amount = interaction.options.getInteger('amount') || 10;
            const target = interaction.options.getUser('target');

            // Fetching messages with a loop to ensure we find enough if filtering by user/pins
            let messagesFound = [];
            let lastId = null;
            let totalFetched = 0;
            
            // Limit fetch attempt to 400 messages or until we have enough
            // This ensures we're snappy while being flexible
            while (messagesFound.length < amount && totalFetched < 400) {
                const fetchOptions = { limit: 100 };
                if (lastId) fetchOptions.before = lastId;

                const fetched = await interaction.channel.messages.fetch(fetchOptions);
                if (fetched.size === 0) break;

                totalFetched += fetched.size;
                lastId = fetched.last().id;

                // Filtering pinned and optionally user
                let filtered = fetched.filter(m => !m.pinned);
                if (target) {
                    filtered = filtered.filter(m => m.author.id === target.id);
                }

                messagesFound.push(...filtered.values());

                // If we aren't filtering by user, there's no need to fetch more than amount + some buffer
                if (!target && messagesFound.length >= amount) break;
            }

            // Slice to exact amount requested
            const messagesToDelete = messagesFound.slice(0, amount);

            if (messagesToDelete.length === 0) {
                return await interaction.editReply({ 
                    content: `No eligible messages found to clear${target ? ` from <@${target.id}>` : ''}. (Pinned messages are ignored)` 
                });
            }

            // Perform Bulk Delete
            // filterOld: true avoids error when messages are older than 14 days
            const deleted = await interaction.channel.bulkDelete(messagesToDelete, true);

            // Log the action to database/log-channel
            // Target is either the specified user or the interaction user (general purge)
            await logAction(
                interaction.guild, 
                target || interaction.user, 
                interaction.user, 
                'PURGE', 
                `Cleared ${deleted.size} messages${target ? ` from ${target.tag}` : ''} in #${interaction.channel.name}.`
            );

            // Response Embed
            const successEmbed = baseEmbed(`🧹 Archives Purged`, `${CONFIG.EMOJIS.SUCCESS || '✅'} Successfully cleared **${deleted.size}** messages${target ? ` sent by <@${target.id}>` : ''}.\n\n*Those records have been permanently shredded.*`, interaction.client.user.displayAvatarURL())
                .setColor(CONFIG.COLORS.INFO);

            await interaction.editReply({ embeds: [successEmbed] });

        } catch (error) {
            await handleCommandError(interaction, error, 'clear');
        }
    },
};
