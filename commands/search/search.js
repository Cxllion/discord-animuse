const { SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const baseEmbed = require('../../utils/generators/baseEmbed');
const { searchMedia, getMediaById } = require('../../utils/services/anilistService');
const { createMediaResponse } = require('../../utils/generators/mediaResponse');
const logger = require('../../utils/core/logger');

module.exports = {
    cooldown: 8, // API calls
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Consult the archives for an Anime or Manga.')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Media type')
                .setRequired(true)
                .addChoices(
                    { name: 'Anime', value: 'ANIME' },
                    { name: 'Manga', value: 'MANGA' }
                ))
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The name to search for')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('quick')
                .setDescription('Return the first result immediately without showing the dropdown menu')
                .setRequired(false)),
    async execute(interaction) {
        await interaction.deferReply();

        const query = interaction.options.getString('query');
        const type = interaction.options.getString('type') || 'ANIME';
        const quick = interaction.options.getBoolean('quick') ?? false;

        try {
            const results = await searchMedia(query, type);

            if (!results || results.length === 0) {
                const embed = baseEmbed()
                    .setDescription(`📖 **No Matches Found**\n\nI have searched the shelves thoroughly, but I cannot find a record for "**${query}**" in the ${type.toLowerCase()} section.`)
                    .setColor('#FF0000'); // Red for error/missing
                return await interaction.editReply({ embeds: [embed] });
            }

            // Exactly one result or quick search mode: Show the first one immediately
            if (results.length === 1 || quick) {
                const media = await getMediaById(results[0].id);

                // UX: Immediate Feedback
                await interaction.editReply({
                    content: `🔍 Found **${media.title.english || media.title.romaji}**. Materializing record...`,
                    embeds: [],
                    components: []
                });

                // Wait for async response
                const response = await createMediaResponse(media, interaction.user.id, interaction.guildId);
                // EditReply handles files/components automatically if object structure matches
                return await interaction.editReply({ content: '', ...response }); // Clear content
            }

            // Multiple results: Show Select Menu
            const select = new StringSelectMenuBuilder()
                .setCustomId('search_result_select')
                .setPlaceholder('Select the correct record...')
                .addOptions(
                    results.slice(0, 10).map(media =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel((media.title.english || media.title.romaji).slice(0, 100))
                            .setDescription(`${media.format || 'Unknown'} • ${media.startDate?.year || '????'}`)
                            .setValue(media.id.toString())
                    )
                );

            const row = new ActionRowBuilder().addComponents(select);
            const embed = baseEmbed()
                .setTitle(`Search Results: "${query}"`)
                .setDescription('The index returned multiple matches. Which specific volume are you requesting?');

            await interaction.editReply({ embeds: [embed], components: [row] });

        } catch (error) {
            logger.error('Search Command Error:', error, 'SearchCommand');
            const embed = baseEmbed()
                .setDescription('Pardon the intrusion, but the archives seem temporarily inaccessible. Please try again shortly.')
                .setColor('#FF0000');
            await interaction.editReply({ embeds: [embed] });
        }
    },
};




