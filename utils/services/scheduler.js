const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { generateAiringCard } = require('../generators/airingGenerator');
const { watchInteraction } = require('../handlers/interactionManager');
const { queryAnilist } = require('./anilistService');
const {
    getAllTrackersForAnime,
    getTrackedAnimeState,
    updateTrackedAnimeState,
    fetchConfig,
    addTracker,
    getAnimeDueForUpdate
} = require('../core/database');
const logger = require('../core/logger');

// Batch size for AniList queries to avoid hitting complexity limits
const BATCH_SIZE = 50;

/**
 * Checks for airing anime and sends notifications.
 * @param {Client} client - Discord Client
 */
const checkAiringAnime = async (client) => {
    // 1. Get IDs due for update (Smart Polling)
    const monitorIds = await getAnimeDueForUpdate();
    if (monitorIds.length === 0) return;

    // 2. Process in batches
    for (let i = 0; i < monitorIds.length; i += BATCH_SIZE) {
        const batch = monitorIds.slice(i, i + BATCH_SIZE);
        await processBatch(client, batch);
    }
};

const processBatch = async (client, ids) => {
    // 3. Query AniList
    const query = `
    query ($ids: [Int]) {
        Page {
            media(id_in: $ids, type: ANIME) {
                id
                title { romaji english }
                coverImage { extraLarge large color }
                bannerImage
                format
                genres
                studios(isMain: true) { nodes { name } }
                siteUrl
                nextAiringEpisode {
                    episode
                    airingAt
                    timeUntilAiring
                }
            }
        }
    }
    `;

    try {
        const data = await queryAnilist(query, { ids });
        const mediaList = data.Page.media;

        for (const media of mediaList) {
            const nextEp = media.nextAiringEpisode;
            const trackedState = await getTrackedAnimeState(media.id);
            const knownLastEpisode = trackedState ? trackedState.last_episode : 0;

            // Update DB with fresh "Next Airing" time so Smart Polling works
            const nextAiringDate = nextEp
                ? new Date(nextEp.airingAt * 1000).toISOString()
                : null; // If null, it means no next episode (finished?) or unknown.

            // 1. If not airing soon, just update the timer and skip
            if (!nextEp || nextEp.timeUntilAiring > 1200) {
                // Optimization: Update state so we don't query this again until needed
                if (nextAiringDate) {
                    await updateTrackedAnimeState(media.id, knownLastEpisode, nextAiringDate);
                }
                continue;
            }

            // 2. It's Airing Soon (<= 20 mins)
            if (nextEp.episode > knownLastEpisode) {
                // IT IS TIME
                await sendNotifications(client, media, nextEp);
                await updateTrackedAnimeState(media.id, nextEp.episode, nextAiringDate);
            }
        }

    } catch (e) {
        logger.error('[Scheduler] Error checking airing:', e, 'Scheduler');
    }
};

const sendNotifications = async (client, media, episode, options = {}) => {
    // 1. Get Subscribers
    let subscriptions = [];
    if (options.forceGuildId) {
        // Test Mode: Simulate a subscription for this guild
        subscriptions = [{ guild_id: options.forceGuildId, user_id: null }]; // user_id null = no ping
    } else {
        subscriptions = await getAllTrackersForAnime(media.id);
    }

    if (!subscriptions.length) return;

    // 2. Group by Guild
    const entriesByGuild = {};
    for (const sub of subscriptions) {
        if (!entriesByGuild[sub.guild_id]) entriesByGuild[sub.guild_id] = [];
        if (sub.user_id) entriesByGuild[sub.guild_id].push(sub.user_id);
    }

    // 3. Generate Card (Once)
    let attachment = null;
    try {
        const buffer = await generateAiringCard(media, episode);
        attachment = new AttachmentBuilder(buffer, { name: `airing-${media.id}.png` });
    } catch (e) {
        logger.error('Failed to generate airing card:', e, 'Scheduler');
    }

    // 4. Send to each guild
    for (const [guildId, userIds] of Object.entries(entriesByGuild)) {
        try {
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) continue;

            const config = await fetchConfig(guildId);
            if (!config || !config.airing_channel_id) continue;

            const channel = await guild.channels.fetch(config.airing_channel_id).catch(() => null);
            if (!channel) continue;

            // Construct Pings
            let content = '';
            if (userIds.length > 0) {
                const pings = userIds.map(uid => `<@${uid}>`).join(' ');
                content = `🔔 **New Episode detected!** ${pings}`;
            } else {
                content = `🔔 **New Episode detected!**`; // No pings (Test Mode or empty subs)
            }

            const title = media.title.english || media.title.romaji;
            const subButtonId = `track_add_${media.id}`; // Renamed from sub_add

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('View on AniList')
                    .setStyle(ButtonStyle.Link)
                    .setURL(media.siteUrl || `https://anilist.co/anime/${media.id}`),
                new ButtonBuilder()
                    .setCustomId(subButtonId)
                    .setLabel('Track +') // Renamed from Subscribe +
                    .setStyle(ButtonStyle.Primary)
            );

            const msg = await channel.send({
                content: content,
                files: attachment ? [attachment] : [],
                components: [row]
            });

            // 5. Watch for Interactive Button (Track)
            const TIMEOUT_MS = 10 * 60 * 1000;

            watchInteraction(msg, TIMEOUT_MS, async (i) => {
                if (i.customId === subButtonId) {
                    await i.deferReply({ ephemeral: true });
                    const res = await addTracker(guildId, i.user.id, media.id, title);
                    if (res.error) {
                        await i.editReply('❌ Failed to start tracking.');
                    } else {
                        await i.editReply(`✅ You are now tracking **${title}**!`);
                    }
                }
            }, [subButtonId]);

        } catch (err) {
            logger.error(`Failed to notify guild ${guildId}:`, err, 'Scheduler');
        }
    }
};

module.exports = { checkAiringAnime, sendNotifications };
