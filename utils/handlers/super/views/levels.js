const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const baseEmbed = require('../../../generators/baseEmbed');
const { fetchConfig } = require('../../../core/database');

const levelsView = async (interaction, guildId) => {
    const config = await fetchConfig(guildId);
    const enabled = config ? config.xp_enabled : false;

    const embed = baseEmbed()
        .setTitle('📈 Experience Tracking')
        .setDescription(`Current Status: **${enabled ? 'ENABLED' : 'DISABLED'}**\n\nWhen enabled, members earn Experience Points (XP) for chatting. They can check their progress with \`/rank\`.`)
        .setColor(enabled ? '#57F287' : '#ED4245');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`super_toggle_xp_${enabled ? 'off' : 'on'}`)
            .setLabel(enabled ? 'Disable XP' : 'Enable XP')
            .setStyle(enabled ? ButtonStyle.Danger : ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('super_home')
            .setLabel('Back to Dashboard')
            .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
};

module.exports = levelsView;
