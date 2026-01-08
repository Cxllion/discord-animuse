const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const baseEmbed = require('../../../generators/baseEmbed');

const generalView = async (interaction, guildId) => {
    const embed = baseEmbed()
        .setTitle('📖 General Settings')
        .setDescription('Basic library configuration.\n\n*Coming Soon: Language, Timezone, and Prefix settings.*');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('super_home')
            .setLabel('Back to Dashboard')
            .setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
};

module.exports = generalView;
