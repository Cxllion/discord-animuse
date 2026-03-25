const { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const baseEmbed = require('../../../generators/baseEmbed');
const { FOOTERS, COLORS } = require('../../../core/constants');

const dashboardView = async (interaction) => {
    const registry = require('../registry').getAllCategories();

    const embed = baseEmbed()
        .setTitle('AniMuse Library Dashboard')
        .setDescription('Welcome, Manager. Access the library wings below to audit or configure your server.\n\n**Available Categories:**')
        .setColor(COLORS.DEFAULT)
        .setFooter({ text: FOOTERS.DEFAULT });

    // Build Select Menu options from Registry
    const options = [];
    const categoryGroups = {
        'Bot Config': ['general', 'levels'],
        'Management': ['members', 'roles', 'emojis', 'bans', 'invites'],
        'Infrastructure': ['channels', 'security', 'audit', 'server']
    };

    let desc = 'Welcome, Manager. Access the library wings below to audit or configure your server.\n\n';

    for (const [group, keys] of Object.entries(categoryGroups)) {
        desc += `## ◈ ${group}\n`;
        for (const key of keys) {
            const data = registry[key];
            if (!data) continue;
            
            const cleanLabel = data.label.replace(data.emoji, '').trim();
            desc += `${data.emoji} **\`${cleanLabel}\`**\n`;

            options.push(
                new StringSelectMenuOptionBuilder()
                    .setLabel(cleanLabel)
                    .setValue(key)
                    .setEmoji(data.emoji)
                    .setDescription(`Manage ${cleanLabel} settings.`)
            );
        }
        desc += '\n';
    }

    embed.setDescription(desc);

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
