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

            // 1. Build Options for Select Menu
            // Select Menu Limit is 25 options. If user has more, we might need pages (future scope) or just show top 25.
            const options = subs.slice(0, 25).map(s => ({
                label: s.anime_title.substring(0, 100),
                value: s.anilist_id.toString(),
                description: `ID: ${s.anilist_id}`,
                emoji: '🗑️' // Trash icon for untracking
            }));

            // 2. Build Component
            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('untrack_select')
                        .setPlaceholder('Select to Untrack')
                        .addOptions(options)
                );

            // 3. Build Embed
            const desc = subs.map(s => `• **${s.anime_title}**`).join('\n');
            const embed = new EmbedBuilder()
                .setColor('#FFACD1')
                .setTitle(`Your Track List (${subs.length})`)
                .setDescription(desc.substring(0, 4000))
                .setFooter({ text: 'Use the dropdown below to stop tracking an anime.' });

            const msg = await interaction.editReply({ embeds: [embed], components: [row] });

            // 4. Collector for Untracking
            const collector = msg.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });

            collector.on('collect', async i => {
                if (i.customId === 'untrack_select') {
                    const animeId = parseInt(i.values[0]);
                    const selected = subs.find(s => s.anilist_id === animeId);

                    if (selected) {
                        await removeTracker(guildId, userId, animeId);

                        // Update local list for UI refresh
                        const index = subs.findIndex(s => s.anilist_id === animeId);
                        if (index > -1) subs.splice(index, 1);

                        // Rebuild UI
                        if (subs.length === 0) {
                            await i.update({ content: 'You are no longer tracking any anime.', embeds: [], components: [] });
                            return;
                        }

                        const newDesc = subs.map(s => `• **${s.anime_title}**`).join('\n');
                        const newEmbed = new EmbedBuilder()
                            .setColor('#FFACD1')
                            .setTitle(`Your Track List (${subs.length})`)
                            .setDescription(newDesc.substring(0, 4000))
                            .setFooter({ text: 'Use the dropdown below to stop tracking an anime.' });

                        const newOptions = subs.slice(0, 25).map(s => ({
                            label: s.anime_title.substring(0, 100),
                            value: s.anilist_id.toString(),
                            description: `ID: ${s.anilist_id}`,
                            emoji: '🗑️'
                        }));

                        const newRow = new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId('untrack_select')
                                .setPlaceholder('Select to Untrack')
                                .addOptions(newOptions)
                        );

                        await i.update({ content: `✅ Untracked **${selected.anime_title}**`, embeds: [newEmbed], components: [newRow] });
                    } else {
                        await i.reply({ content: '❌ That record seems to have already vanished from the archives.', flags: MessageFlags.Ephemeral });
                    }
                }
            });

            collector.on('end', async () => {
                // Remove components on timeout
                const freshMsg = await interaction.fetchReply().catch(() => null);
                if (freshMsg) {
                    await interaction.editReply({ components: [] });
                }
            });
        }
    },
};
