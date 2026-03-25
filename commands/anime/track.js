const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const { searchMedia, getMediaById } = require('../../utils/services/anilistService');
const { addTracker, removeTracker, getUserTrackedAnime } = require('../../utils/core/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('track')
        .setDescription('Manage your personal anime airing notifications.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Track an anime for airing alerts.')
                .addStringOption(option =>
                    option.setName('anime')
                        .setDescription('Search for an anime')
                        .setRequired(true)
                        .setAutocomplete(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Untrack an anime.')
                .addStringOption(option =>
                    option.setName('anime')
                        .setDescription('Search your tracking list')
                        .setRequired(true)
                        .setAutocomplete(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('View your currently tracked anime.')),

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        const query = focusedOption.value;
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'add') {
            if (!query || query.length < 2) return await interaction.respond([]);
            // Search AniList
            const results = await searchMedia(query, 'ANIME');
            if (interaction.responded) return;
            await interaction.respond(
                results.map(media => ({
                    name: (media.title.english || media.title.romaji).substring(0, 100),
                    value: media.id.toString()
                })).slice(0, 25)
            );
        } else if (subcommand === 'remove') {
            // Search local tracking
            const subs = await getUserTrackedAnime(interaction.guild.id, interaction.user.id);
            // Filter by query
            const filtered = subs.filter(s => s.anime_title.toLowerCase().includes(query.toLowerCase()));
            if (interaction.responded) return;
            await interaction.respond(
                filtered.map(s => ({
                    name: s.anime_title.substring(0, 100),
                    value: s.anilist_id.toString()
                })).slice(0, 25)
            );
        }
    },

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        if (subcommand === 'add') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const animeId = parseInt(interaction.options.getString('anime'));

            // Validate ID
            if (isNaN(animeId)) {
                return await interaction.editReply({ content: '❌ The text is illegible. Please select a valid entry from the index.' });
            }

            // Fetch details to confirm
            const media = await getMediaById(animeId);
            if (!media) {
                return await interaction.editReply({ content: '❌ A misplaced record. I could not retrieve the details for that series.' });
            }

            const title = media.title.english || media.title.romaji;
            const res = await addTracker(guildId, userId, animeId, title);

            if (res.error) {
                return await interaction.editReply({ content: '❌ Ink spill. I failed to inscribe this tracking request.' });
            }

            const embed = new EmbedBuilder()
                .setColor(media.coverImage?.color || '#FFACD1')
                .setTitle('Tracking Added')
                .setDescription(`You will now be notified when **${title}** airs new episodes.`)
                .setThumbnail(media.coverImage?.large);

            await interaction.editReply({ embeds: [embed] });

        } else if (subcommand === 'remove') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const animeId = parseInt(interaction.options.getString('anime'));

            if (isNaN(animeId)) {
                return await interaction.editReply({ content: '❌ Please select a valid item to remove from the archives.' });
            }

            await removeTracker(guildId, userId, animeId);
            await interaction.editReply({ content: `✅ As you wish. I have ceased observation of that series.` });

        } else if (subcommand === 'list') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const subs = await getUserTrackedAnime(guildId, userId);

            if (subs.length === 0) {
                return await interaction.editReply({
                    content: `🍂 **Your Tracking Scroll is Empty**\n\nThe archives show no records under your name yet. Use \`/track add\` to begin observing a series.`
                });
            }

            let currentPage = 0;
            const maxPerPage = 25;

            const generateUI = (page) => {
                const totalPages = Math.ceil(subs.length / maxPerPage);
                if (page >= totalPages && page > 0) page = totalPages - 1;
                currentPage = page; // update current page in state

                if (subs.length === 0) {
                    return { content: 'You are no longer tracking any anime.', embeds: [], components: [] };
                }

                const start = page * maxPerPage;
                const end = start + maxPerPage;
                const pageSubs = subs.slice(start, end);

                const desc = pageSubs.map(s => `• **${s.anime_title}**`).join('\n');
                const embed = new EmbedBuilder()
                    .setColor('#FFACD1')
                    .setTitle(`Your Track List (${subs.length})`)
                    .setDescription(desc.substring(0, 4000) || 'None left on this page.')
                    .setFooter({ text: `Page ${page + 1}/${totalPages} • Use the dropdown below to stop tracking.` });

                const options = pageSubs.map(s => ({
                    label: s.anime_title.substring(0, 100),
                    value: s.anilist_id.toString(),
                    description: `ID: ${s.anilist_id}`,
                    emoji: '🗑️'
                }));

                const row1 = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('untrack_select')
                        .setPlaceholder('Select to Untrack')
                        .addOptions(options)
                );

                if (totalPages > 1) {
                    const row2 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('prev_page')
                            .setLabel('Previous')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(page === 0),
                        new ButtonBuilder()
                            .setCustomId('next_page')
                            .setLabel('Next')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(page === totalPages - 1)
                    );
                    return { content: '', embeds: [embed], components: [row1, row2] };
                }
                return { content: '', embeds: [embed], components: [row1] };
            };

            const payload = generateUI(currentPage);
            const msg = await interaction.editReply(payload);

            const collector = msg.createMessageComponentCollector({ time: 60000 });

            collector.on('collect', async i => {
                if (i.customId === 'prev_page') {
                    await i.update(generateUI(currentPage - 1));
                } else if (i.customId === 'next_page') {
                    await i.update(generateUI(currentPage + 1));
                } else if (i.customId === 'untrack_select') {
                    const animeId = parseInt(i.values[0]);
                    const selected = subs.find(s => s.anilist_id === animeId);

                    if (selected) {
                        await removeTracker(guildId, userId, animeId);

                        // Update local list for UI refresh
                        const index = subs.findIndex(s => s.anilist_id === animeId);
                        if (index > -1) subs.splice(index, 1);

                        const responsePayload = generateUI(currentPage);
                        if (responsePayload.content === '') {
                             responsePayload.content = `✅ Untracked **${selected.anime_title}**`;
                        }
                        
                        await i.update(responsePayload);
                    } else {
                        await i.reply({ content: '❌ That record seems to have already vanished from the archives.', flags: MessageFlags.Ephemeral });
                    }
                }
            });

            collector.on('end', async () => {
                const freshMsg = await interaction.fetchReply().catch(() => null);
                if (freshMsg) {
                    await interaction.editReply({ components: [] });
                }
            });
        }
    },
};
