const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const baseEmbed = require('./baseEmbed');
const CONFIG = require('../config');

/**
 * Suggestion Generator: Crafts the visual identity of server ideas.
 */
class SuggestionGenerator {
    /**
     * Renders a suggestion embed based on its current state.
     */
    renderSuggestion(suggestion, author = null) {
        const statusColors = {
            'pending': CONFIG.COLORS.WARNING,
            'approved': CONFIG.COLORS.SUCCESS,
            'rejected': CONFIG.COLORS.ERROR,
            'implemented': CONFIG.COLORS.INFO,
            'in-progress': CONFIG.COLORS.SECONDARY
        };

        const statusLabels = {
            'pending': '⏳ Pending Review',
            'approved': '✅ Approved',
            'rejected': '❌ Rejected',
            'implemented': '🚀 Implemented',
            'in-progress': '⚙️ In Progress'
        };

        const embed = baseEmbed(suggestion.title, suggestion.content)
            .setColor(statusColors[suggestion.status] || CONFIG.COLORS.PRIMARY)
            .addFields(
                { name: 'Status', value: statusLabels[suggestion.status] || 'Unknown', inline: true },
                { name: 'Votes', value: `👍 ${suggestion.upvotes || 0} | 👎 ${suggestion.downvotes || 0}`, inline: true }
            );

        if (author) {
            embed.setAuthor({ 
                name: `Suggestion from ${author.username}`, 
                iconURL: author.displayAvatarURL({ dynamic: true }) 
            });
        }

        // Add ID in footer for admin reference
        embed.setFooter({ text: `${CONFIG.THEME.FOOTER} • ID: ${suggestion.id}` });

        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`suggestion_vote_up_${suggestion.id}`)
                .setLabel('Upvote')
                .setEmoji('👍')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`suggestion_vote_down_${suggestion.id}`)
                .setLabel('Downvote')
                .setEmoji('👎')
                .setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [buttons] };
    }

    /**
     * Renders the permanent "Suggestions Box" message.
     */
    renderSuggestionsBox(iconURL = null) {
        const embed = baseEmbed('💡 The Archive Think-Tank', 
            'Have a vision for the library? A new feature, a game idea, or a quality-of-life improvement?\n\n' +
            'Click the button below to submit your suggestion to the Librarians. Every idea helps us expand our horizons!\n\n' +
            '✦ **Guidelines**:\n' +
            '◈ Be descriptive and clear.\n' +
            '◈ Check if your idea was already suggested.\n' +
            '◈ Be respectful in the discussion threads.',
            iconURL
        );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('suggestion_open_modal')
                .setLabel('Submit Idea')
                .setEmoji('✍️')
                .setStyle(ButtonStyle.Primary)
        );

        return { embeds: [embed], components: [row] };
    }
}

module.exports = new SuggestionGenerator();
