const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const { searchMedia, getMediaById, getMediaByIds, getWatchingList } = require('../../utils/services/anilistService');
const { addTracker, removeTracker, getUserTrackedAnime, getLinkedAnilist } = require('../../utils/core/database');
const baseEmbed = require('../../utils/generators/baseEmbed');
const CONFIG = require('../../utils/config');

module.exports = {
    category: 'anime',
    dbRequired: true,
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
                .setDescription('View an upcoming airing schedule for your tracked anime.'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('Moderator only: View all tracking users in the server.')),

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
            // #17: Empty query intentionally returns all subscriptions for quick selection.
            // This differs from 'add' (which requires 3 chars) since local data is cheap to return in full.
            const subs = await getUserTrackedAnime(interaction.guild.id, interaction.user.id);
            const filtered = query
                ? subs.filter(s => s.anime_title.toLowerCase().includes(query.toLowerCase()))
                : subs;
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
                return await interaction.editReply({ 
                    content: '❌ **Archival Error**: Invalid Entry. Please select a valid anime from the autocomplete list.' 
                });
            }

            const media = await getMediaById(animeId);
            if (!media) {
                return await interaction.editReply({ 
                    content: '❌ **Archival Error**: Record not found. I could not retrieve details for that ID from the AniList archives.' 
                });
            }

            // #4: Block tracking of series that will never receive new episodes
            if (['FINISHED', 'CANCELLED'].includes(media.status)) {
                const label = media.status === 'FINISHED' ? 'finished airing' : 'cancelled';
                return await interaction.editReply({
                    content: `❌ **Archival Error**: **${media.title.english || media.title.romaji}** has already ${label} and will never produce new episodes. Only airing or upcoming series can be tracked.`
                });
            }

            const title = media.title.english || media.title.romaji;
            const res = await addTracker(guildId, userId, animeId, title);

            if (res.error) {
                return await interaction.editReply({ 
                    content: '❌ **Database Error**: I failed to save this track request to our local records.' 
                });
            }

            const statusEmoji = {
                'RELEASING': '📡 Releasing',
                'NOT_YET_RELEASED': '🆕 Upcoming',
                'HIATUS': '⏸️ On Hiatus (no new episodes scheduled currently)',
            }[media.status] || '❓ Unknown';

            const embed = baseEmbed(`Observation Initiated: ${title}`, 
                `I have added **${title}** to your tracking archives. You will receive a notification in this server whenever a new episode airs.`, 
                interaction.client.user.displayAvatarURL())
                .addFields(
                    { name: 'Status', value: statusEmoji, inline: true },
                    { name: 'Score', value: `⭐ ${media.averageScore || 'N/A'}/100`, inline: true },
                    { name: 'Format', value: `📺 ${media.format || 'Unknown'}`, inline: true }
                )
                .setThumbnail(media.coverImage?.large)
                .setImage(media.bannerImage)
                .setColor(media.coverImage?.color || CONFIG.COLORS.PRIMARY);

            await interaction.editReply({ embeds: [embed] });

        } else if (subcommand === 'remove') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const animeId = parseInt(interaction.options.getString('anime'));

            if (isNaN(animeId)) {
                return await interaction.editReply({ content: '❌ **Archival Error**: Please select a valid item to remove from your observation records.' });
            }

            // #13: Show a confirmation step — removal is irreversible
            const subs = await getUserTrackedAnime(guildId, userId);
            const target = subs.find(s => s.anilist_id === animeId);
            const displayTitle = target?.anime_title || `Series #${animeId}`;

            const { ActionRowBuilder: ARB, ButtonBuilder: BB, ButtonStyle: BS } = require('discord.js');
            const confirmRow = new ARB().addComponents(
                new BB().setCustomId(`track_confirm_remove_${userId}_${animeId}`).setLabel('Confirm Remove').setStyle(BS.Danger),
                new BB().setCustomId(`track_cancel_remove_${userId}`).setLabel('Cancel').setStyle(BS.Secondary)
            );

            await interaction.editReply({
                content: `⚠️ **Remove Confirmation**\n\nAre you sure you want to stop tracking **${displayTitle}**? This action cannot be undone.`,
                components: [confirmRow]
            });

        } else if (subcommand === 'sync') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const linkedUsername = await getLinkedAnilist(userId, guildId);

            if (!linkedUsername) {
                return await interaction.editReply({
                    content: '❌ **Archival Access Denied**: Your account is not currently bound to an AniList profile. Use `/link` first to enable synchronization.'
                });
            }

            const watchingList = await getWatchingList(linkedUsername);
            const filteredList = watchingList.filter(m => ['RELEASING', 'NOT_YET_RELEASED'].includes(m.status));

            if (filteredList.length === 0) {
                return await interaction.editReply({
                    content: `🍂 **Archive Search Result**: I searched your profile, but it seems you aren't currently "Watching" any ongoing or upcoming series on AniList.`
                });
            }

            let addedCount = 0;
            for (const anime of filteredList) {
                const animeTitle = anime.title.english || anime.title.romaji;
                const result = await addTracker(guildId, userId, anime.id, animeTitle);
                if (!result.error) addedCount++;
            }

            // Enable persistent Auto-Sync for this user 
            const { toggleTrackSync } = require('../../utils/services/userService');
            await toggleTrackSync(userId, guildId, true);

            // #10: Distinguish between "nothing new" and actual new additions
            const alreadyTracked = filteredList.length - addedCount;
            const addedLine = addedCount > 0
                ? `✅ Added **${addedCount}** new anime to your observation list.`
                : `📋 All **${filteredList.length}** series were already in your list — nothing new to add.`;
            const alreadyLine = addedCount > 0 && alreadyTracked > 0
                ? `\n📋 **${alreadyTracked}** series were already tracked (titles refreshed).`
                : '';

            const embed = baseEmbed('AniList Synchronization Complete', null, interaction.client.user.displayAvatarURL())
                .setThumbnail(interaction.user.displayAvatarURL())
                .setDescription(`Successfully synchronized with your archives for **${linkedUsername}**.\n\n${addedLine}${alreadyLine}\n\n🛡️ **Auto-Sync Enabled**: I will now automatically add any new ongoing shows you start watching on AniList to your tracking list.`);

            await interaction.editReply({ embeds: [embed] });

        } else if (subcommand === 'schedule') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const subs = await getUserTrackedAnime(guildId, userId);

            if (subs.length === 0) {
                return await interaction.editReply({
                    embeds: [baseEmbed('Schedule Empty', 'You are not currently tracking any anime. Use `/track add` to begin.', interaction.client.user.displayAvatarURL())]
                });
            }

            const mediaData = await getMediaByIds(subs.map(s => s.anilist_id));
            const ongoing = mediaData
                .filter(m => m.nextAiringEpisode)
                .sort((a, b) => a.nextAiringEpisode.airingAt - b.nextAiringEpisode.airingAt);

            // #15: Count series with no upcoming schedule for the footer note
            const noScheduleCount = subs.length - ongoing.length;

            if (ongoing.length === 0) {
                const noScheduleEmbed = baseEmbed('No Airing Information', 
                    `None of your tracked series have upcoming airing dates scheduled on AniList at the moment.\n\nYou are tracking **${subs.length}** series total.`,
                    interaction.client.user.displayAvatarURL());
                return await interaction.editReply({ embeds: [noScheduleEmbed] });
            }

            const scheduleLines = ongoing.map(m => {
                const timeStr = `<t:${m.nextAiringEpisode.airingAt}:R>`;
                const title = m.title.english || m.title.romaji;
                return `• **${title}** (Ep ${m.nextAiringEpisode.episode}): ${timeStr}`;
            });

            const embed = baseEmbed('Observatory Schedule', `Here are the next episodes scheduled for your tracked collection:\n\n${scheduleLines.join('\n')}`, interaction.client.user.displayAvatarURL())
                .setThumbnail(interaction.user.displayAvatarURL());

            // #15: Surface the count of finished/no-schedule series so users know data isn't missing
            if (noScheduleCount > 0) {
                embed.addFields({ name: '📋 Other Tracked Series', value: `**${noScheduleCount}** series in your list have no upcoming episodes (finished, on hiatus, or schedule unavailable).`, inline: false });
            }

            await interaction.editReply({ embeds: [embed] });

        } else if (subcommand === 'list') {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const { renderTrackList } = require('../../utils/handlers/trackHandlers');
            const payload = await renderTrackList(guildId, userId, 0);
            await interaction.editReply(payload);
        } else if (subcommand === 'view') {
            const { PermissionFlagsBits } = require('discord.js');
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return await interaction.reply({ 
                    content: '❌ **Access Denied**: You lack the clearance to peer into others\' archives. This wing is reserved for server administrators.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const { renderGuildTrackView } = require('../../utils/handlers/trackHandlers');
            const payload = await renderGuildTrackView(interaction.guild, userId, 0);
            await interaction.editReply(payload);
        }
    },
};
