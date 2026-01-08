const { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const baseEmbed = require('../../../generators/baseEmbed');
const { FOOTERS, COLORS } = require('../../../core/constants');

const dashboardView = async (interaction) => {
    const registry = require('../registry').getAllCategories();

    const embed = baseEmbed()
        .setTitle('Animuse Master Archive')
        .setDescription('Welcome, Manager. Access the library wings below to audit or configure your server.\n\n**Available Categories:**')
        .setColor(COLORS.DEFAULT)
        .setFooter({ text: FOOTERS.DEFAULT });

    // Build Select Menu options from Registry
    const options = [];
    let desc = '';

    for (const [key, data] of Object.entries(registry)) {
        if (key === 'dashboard') continue; // Don't list dashboard itself

        // Add to description
        desc += `**${data.emoji} ${data.label.replace(data.emoji, '').trim()}**\n`;

        options.push(
            new StringSelectMenuOptionBuilder()
                .setLabel(data.label.replace(data.emoji, '').trim()) // Label without emoji for clean look in dropdown? Or with?
                // Actually Discord allows emoji set separately.
                .setLabel(data.label.replace(data.emoji, '').trim())
                .setValue(key)
                .setEmoji(data.emoji)
                .setDescription(`Manage ${key} settings.`)
        );
    }

    embed.setDescription(desc || 'No categories available.');

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('super_category_select')
            .setPlaceholder('Select a category to inspect...')
            .addOptions(options)
    );

    // If this is called from interaction reply vs edit, we return payload
    // To be flexible, we return the object { embeds, components }
    return {
        embeds: [embed],
        components: [row]
    };
};

module.exports = dashboardView;
