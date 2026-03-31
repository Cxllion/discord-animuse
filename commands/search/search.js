const { SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const baseEmbed = require('../../utils/generators/baseEmbed');
const { searchMedia, getMediaById, formatMediaTitle } = require('../../utils/services/anilistService');
const { createMediaResponse } = require('../../utils/generators/mediaResponse');
const logger = require('../../utils/core/logger');

module.exports = {
    cooldown: 8, // API calls
    data: new SlashCommandBuilder()
        .setName('search')
        .setDescription('Consult the Library for an Anime or Manga.')
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
                .setRequired(true)
                .setAutocomplete(true))
        .addBooleanOption(option =>
            option.setName('quick')
                .setDescription('Return the first result immediately without showing the dropdown menu')
                .setRequired(false)),

    async autocomplete(interaction) {
        const { searchMediaAutocomplete } = require('../../utils/services/anilistService');
        const focusedValue = interaction.options.getFocused();
        const type = interaction.options.getString('type') || 'ANIME';

        if (!focusedValue || focusedValue.length < 3) return await interaction.respond([]);

        const results = await searchMediaAutocomplete(focusedValue, type);
        await interaction.respond(results);
    },

    async execute(interaction) {
        await interaction.deferReply();

        const query = interaction.options.getString('query');
        const type = interaction.options.getString('type') || 'ANIME';
        const quick = interaction.options.getBoolean('quick') ?? false;

        // Start premium feedback early
        const LoadingManager = require('../../utils/ui/LoadingManager');
        const loader = new LoadingManager(interaction);
        await loader.startProgress('Searching the Archives...', 3); // 3s for snappier feel

        try {
            let results = [];
            
            // --- Intelligent ID / URL Resolution ---
            const idMatch = query.match(/anilist\.co\/anime\/(\d+)/i) || query.match(/anilist\.co\/manga\/(\d+)/i) || [null, query];
            const potentialId = parseInt(idMatch[1]);
            
            if (!isNaN(potentialId) && potentialId > 0) {
                // If it's a number, it's likely an ID
                const media = await getMediaById(potentialId);
                if (media) {
                    const response = await createMediaResponse(media, interaction.user.id, interaction.guildId);
                    return await loader.stop(response);
                }
            }

            // Standard Search if not a direct ID match
            results = await searchMedia(query, type);


            if (!results || results.length === 0) {
                const embed = baseEmbed()
                    .setDescription(`📖 **No Matches Found**\n\nI have searched the shelves thoroughly, but I cannot find a record for "**${query}**" in the ${type.toLowerCase()} section.`)
                    .setColor('#FF0000');
                
                return await loader.stop({ embeds: [embed] });
            }

            // Exactly one result or quick search mode: Show the first one immediately
            if (results.length === 1 || quick) {
                const media = await getMediaById(results[0].id);
                const response = await createMediaResponse(media, interaction.user.id, interaction.guildId);
                return await loader.stop(response);
            }

            // Multiple results: Show Select Menu
            const select = new StringSelectMenuBuilder()
                .setCustomId('search_result_select')
                .setPlaceholder('Select the correct record...')
                .addOptions(
                    results.slice(0, 10).map(media =>
                        new StringSelectMenuOptionBuilder()
                            .setLabel(formatMediaTitle(media.title).slice(0, 100))
                            .setDescription(`${media.format || 'Unknown'} • ${media.startDate?.year || '????'}`)
                            .setValue(media.id.toString())
                    )
                );

            const row = new ActionRowBuilder().addComponents(select);
            const embed = baseEmbed()
                .setTitle(`Search Results: "${query}"`)
                .setDescription('The index returned multiple matches. Which specific volume are you requesting?');

            return await loader.stop({ embeds: [embed], components: [row] });

        } catch (error) {
            logger.error(`Search Command Failure: query="${query}" type="${type}"`, error, 'SearchCommand');
            
            const embed = baseEmbed()
                .setDescription('Pardon the intrusion, but the archives seem temporarily inaccessible. Please try again shortly.')
                .setColor('#FF0000');
            
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
            } else {
                await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        }
    },
};




