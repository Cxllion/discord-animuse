const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const { searchMedia, getMediaById, getMediaByIds, getWatchingList } = require('../../utils/services/anilistService');
const { addTracker, removeTracker, getUserTrackedAnime, getLinkedAnilist } = require('../../utils/core/database');
const baseEmbed = require('../../utils/generators/baseEmbed');

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
                .setDescription('View your currently tracked anime.'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('sync')
                .setDescription('Automatically track everything currently on your AniList "Watching" list.'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('schedule')
                .setDescription('View an upcoming airing schedule for your tracked anime.')),

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        const query = focusedOption.value;
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'add') {
            if (!query || query.length < 3) return await interaction.respond([]);
            const { searchMediaAutocomplete } = require('../../utils/services/anilistService');
            
            const results = await searchMediaAutocomplete(query, 'ANIME');
            if (interaction.responded) return;

            await interaction.respond(results);
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

            if (isNaN(animeId)) {
                return await interaction.editReply({ content: '❌ Invalid Entry. Please select a valid anime from the autocomplete list.' });
            }

            const media = await getMediaById(animeId);
            if (!media) {
                return await interaction.editReply({ content: '❌ Record not found. I could not retrieve details for that ID.' });
            }

            const title = media.title.english || media.title.romaji;
            const res = await addTracker(guildId, userId, animeId, title);

            if (res.error) {
                return await interaction.editReply({ content: '❌ Database Error. I failed to save this track request.' });
            }

            const statusEmoji = {
                'RELEASING': '📡 Releasing',
                'NOT_YET_RELEASED': '🆕 Upcoming'
            }[media.status] || '❓ Unknown';

            const embed = baseEmbed()
                .setTitle(`Observation Initiated: ${title}`)
                .setDescription(`I have added **${title}** to your tracking archives. You will receive a notification in this server whenever a new episode airs.`)
                .addFields(
                    { name: 'Status', value: statusEmoji, inline: true },
                    { name: 'Score', value: `⭐ ${media.averageScore || 'N/A'}/100`, inline: true },
                    { name: 'Format', value: `📺 ${media.format || 'Unknown'}`, inline: true }
                )
                .setThumbnail(media.coverImage?.large)
                .setImage(media.bannerImage)
                .setColor(media.coverImage?.color || '#FFACD1');

            await interaction.editReply({ embeds: [embed] });

        } else if (subcommand === 'remove') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const animeId = parseInt(interaction.options.getString('anime'));

            if (isNaN(animeId)) {
                return await interaction.editReply({ content: '❌ Please select a valid item to remove.' });
            }

            await removeTracker(guildId, userId, animeId);
            await interaction.editReply({ content: `✅ As you wish. I have ceased observation of that series.` });

        } else if (subcommand === 'sync') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const linkedUsername = await getLinkedAnilist(userId, guildId);

            if (!linkedUsername) {
                return await interaction.editReply({
                    content: '❌ Your account is not currently bound to an AniList profile. Use `/link` first to enable synchronization.'
                });
            }

            const watchingList = await getWatchingList(linkedUsername);
            const filteredList = watchingList.filter(m => ['RELEASING', 'NOT_YET_RELEASED'].includes(m.status));

            if (filteredList.length === 0) {
                return await interaction.editReply({
                    content: `🍂 I searched your profile, but it seems you aren't currently "Watching" any ongoing or upcoming series on AniList.`
                });
            }

            let addedCount = 0;
            for (const anime of filteredList) {
                const animeTitle = anime.title.english || anime.title.romaji;
                const result = await addTracker(guildId, userId, anime.id, animeTitle);
                if (!result.error) addedCount++;
            }

            const embed = baseEmbed()
                .setTitle('AniList Synchronization Complete')
                .setThumbnail(interaction.user.displayAvatarURL())
                .setDescription(`Successfully synchronized with your archives for **${linkedUsername}**.\n\n✅ Added **${addedCount}** new anime to your observation list.\n\nOnly ongoing and upcoming series from your "Watching" list were added.`);

            await interaction.editReply({ embeds: [embed] });

        } else if (subcommand === 'schedule') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const subs = await getUserTrackedAnime(guildId, userId);

            if (subs.length === 0) {
                return await interaction.editReply({
                    embeds: [baseEmbed().setTitle('Schedule Empty').setDescription('You are not currently tracking any anime. Use `/track add` to begin.')]
                });
            }

            const mediaData = await getMediaByIds(subs.map(s => s.anilist_id));
            const ongoing = mediaData
                .filter(m => m.nextAiringEpisode)
                .sort((a, b) => a.nextAiringEpisode.airingAt - b.nextAiringEpisode.airingAt);

            if (ongoing.length === 0) {
                return await interaction.editReply({
                    embeds: [baseEmbed().setTitle('No Airing Information').setDescription('None of your tracked series have upcoming airing dates scheduled on AniList at the moment.')]
                });
            }

            const scheduleLines = ongoing.map(m => {
                const timeStr = `<t:${m.nextAiringEpisode.airingAt}:R>`;
                const title = m.title.english || m.title.romaji;
                return `• **${title}** (Ep ${m.nextAiringEpisode.episode}): ${timeStr}`;
            });

            const embed = baseEmbed()
                .setTitle('Observatory Schedule: Upcoming Airings')
                .setThumbnail(interaction.user.displayAvatarURL())
                .setDescription(`Here are the next episodes scheduled for your tracked collection:\n\n${scheduleLines.join('\n')}`)
                .setFooter({ text: 'All times are shown in your local time zone.' });

            await interaction.editReply({ embeds: [embed] });

        } else if (subcommand === 'list') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const { renderTrackList } = require('../../utils/handlers/trackHandlers');
            const payload = await renderTrackList(guildId, userId, 0);
            await interaction.editReply(payload);
        }
    },
};
