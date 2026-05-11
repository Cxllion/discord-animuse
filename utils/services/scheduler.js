const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlags } = require('discord.js');
const { generateAiringCard } = require('../generators/airingGenerator');
const { watchInteraction } = require('../handlers/interactionManager');
const { queryAnilist, getUserActivity, getUserMediaScore } = require('./anilistService');
const {
    getAllTrackersForAnime,
    getTrackedAnimeState,
    updateTrackedAnimeState,
    removeAllTrackersForAnime,
    fetchConfig,
    addTracker,
    getAnimeDueForUpdate,
    getLinkedUsersForFeed,
    getUserColor,
    getUserAvatarConfig
} = require('../core/database');
const { generateActivityCard } = require('../generators/activityGenerator');
const { wasPostedInDB, markPostedInDB, findRecentActivityPostInDB, clearOldActivityPostsInDB } = require('./userService');
const logger = require('../core/logger');
const CONFIG = require('../config');
const minigameService = require('./minigameService');
const wordleService = require('./wordleService');
const connect4Service = require('./connect4Service');

// Batch size for AniList queries to avoid hitting complexity limits
const BATCH_SIZE = 50;

// Concurrency locks
let isAiringPolling = false;
let isActivityPolling = false;

// Telemetry
let lastAiringPulse = null;
let lastActivityPulse = null;
let lastWordleDate = null; 
let isWordleResetting = false;

/**
 * ─── AIRING ENGINE ────────────────────────────────────────────────────────
 */
const checkAiringAnime = async (client) => {
    if (isAiringPolling) return;
    isAiringPolling = true;

    try {
        const monitorIds = await getAnimeDueForUpdate();
        if (monitorIds.length === 0) return;

        for (let i = 0; i < monitorIds.length; i += BATCH_SIZE) {
            const batch = monitorIds.slice(i, i + BATCH_SIZE);
            await processBatch(client, batch);
        }
    } finally {
        isAiringPolling = false;
        lastAiringPulse = Date.now();
    }
};

const processBatch = async (client, ids) => {
    const query = `
    query ($ids: [Int]) {
        Page {
            media(id_in: $ids, type: ANIME) {
                id status title { romaji english } coverImage { extraLarge large color }
                bannerImage format genres studios { nodes { name } } siteUrl
                nextAiringEpisode { episode airingAt timeUntilAiring }
            }
        }
    }
    `;

    try {
        const data = await queryAnilist(query, { ids });
        if (!data?.Page?.media) return;

        for (const media of data.Page.media) {
            const nextEp = media.nextAiringEpisode;
            const trackedState = await getTrackedAnimeState(media.id);
            const knownLastEpisode = trackedState ? trackedState.last_episode : 0;
            const nextAiringDate = nextEp ? new Date(nextEp.airingAt * 1000).toISOString() : null;

            if (!nextEp || nextEp.timeUntilAiring > 1200) {
                if (nextAiringDate) await updateTrackedAnimeState(media.id, knownLastEpisode, nextAiringDate);
                else if (media.status === 'FINISHED') await removeAllTrackersForAnime(media.id);
                continue;
            }

            if (nextEp.episode > knownLastEpisode) {
                await sendNotifications(client, media, nextEp);
                await updateTrackedAnimeState(media.id, nextEp.episode, nextAiringDate);
            } else {
                await updateTrackedAnimeState(media.id, knownLastEpisode, nextAiringDate);
            }
        }
    } catch (e) {
        if (e.message !== 'AL_MAINTENANCE') logger.error('[Scheduler] Airing batch failed:', e, 'Scheduler');
    }
};

const sendNotifications = async (client, media, episode, options = {}) => {
    const subscriptions = options.forceGuildId 
        ? [{ guild_id: options.forceGuildId, user_id: options.forceUserId || null }]
        : await getAllTrackersForAnime(media.id);

    if (!subscriptions.length) return;

    const entriesByGuild = {};
    for (const sub of subscriptions) {
        if (!entriesByGuild[sub.guild_id]) entriesByGuild[sub.guild_id] = [];
        if (sub.user_id) entriesByGuild[sub.guild_id].push(sub.user_id);
    }

    let attachment = null;
    try {
        const buffer = await generateAiringCard(media, episode);
        attachment = new AttachmentBuilder(buffer, { name: media.isAdult ? `SPOILER_airing-${media.id}.webp` : `airing-${media.id}.webp` });
    } catch (e) {
        logger.error('Failed to generate airing card:', e, 'Scheduler');
    }

    for (const [guildId, userIds] of Object.entries(entriesByGuild)) {
        try {
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) continue;

            const config = await fetchConfig(guildId);
            const channel = await guild.channels.fetch(options.forceChannelId || config?.airing_channel_id).catch(() => null);
            if (!channel) continue;

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('View on AniList').setStyle(ButtonStyle.Link).setURL(media.siteUrl || `https://anilist.co/anime/${media.id}`),
                new ButtonBuilder().setCustomId(`track_add_${media.id}`).setLabel('Track +').setStyle(ButtonStyle.Primary)
            );

            const msg = await channel.send({
                content: userIds.length > 0 ? userIds.map(uid => `<@${uid}>`).join(' ') : '',
                files: attachment ? [attachment] : [],
                components: [row]
            });

            watchInteraction(msg, 600000, async (i) => {
                if (i.customId === `track_add_${media.id}`) {
                    await i.deferReply({ flags: MessageFlags.Ephemeral });
                    const res = await addTracker(guildId, i.user.id, media.id, media.title.english || media.title.romaji);
                    await i.editReply(res.error ? '❌ Failed to start tracking.' : '✅ You are now tracking this series!');
                }
            }, [`track_add_${media.id}`]);
        } catch (err) {
            logger.error(`Failed to notify guild ${guildId}:`, err, 'Scheduler');
        }
    }
};

/**
 * ─── ACTIVITY ENGINE ──────────────────────────────────────────────────────
 */
const wasPosted = async (activityId) => await wasPostedInDB(activityId);

const markPosted = async (activityIds, meta = null) => {
    const dbPayload = activityIds.map(id => ({ 
        id: String(id), userId: String(meta.userId || ''), mediaId: String(meta.mediaId || ''),
        channelId: String(meta.channelId || ''), messageId: String(meta.messageId || ''),
        progress: String(meta.progress || ''), status: String(meta.status || '')
    }));
    await markPostedInDB(dbPayload);
};

const fetchAndGroupUserActivities = async (userRow) => {
    try {
        const activities = await getUserActivity(userRow.anilist_username);
        if (!activities?.length) return [];

        const cutoff = Math.floor(Date.now() / 1000) - 259200; // 72h
        const groups = new Map();

        for (const act of activities) {
            if (act.createdAt < cutoff || !act.media || await wasPosted(act.id)) continue;

            const groupKey = `${act.media.id}`;
            if (!groups.has(groupKey)) {
                groups.set(groupKey, { media: act.media, status: act.status, user: act.user, ids: [], progress: [], earliestCreatedAt: act.createdAt });
            }
            const g = groups.get(groupKey);
            g.ids.push(act.id);
            if (act.status?.toLowerCase() === 'completed') g.status = 'completed';
            if (act.progress) g.progress.push(act.progress);
        }
        return Array.from(groups.values());
    } catch (e) { return []; }
};

const postGroupedActivity = async (client, guildId, userRow, channel, g) => {
    try {
        let displayProgress = '';
        if (g.progress.length > 0) {
            const nums = g.progress.map(p => parseInt(p)).filter(n => !isNaN(n)).sort((a,b) => a-b);
            displayProgress = nums.length > 1 ? `${nums[0]}-${nums[nums.length-1]}` : (nums[0]?.toString() || '');
        }

        const recentPost = await findRecentActivityPostInDB(userRow.user_id, g.media.id, channel.id);
        let finalProgress = displayProgress;
        
        if (recentPost?.message_id) {
            const oldMsg = await channel.messages.fetch(recentPost.message_id).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => null);
        }

        const [userColor, userAvatar, scoreData] = await Promise.all([
            getUserColor(userRow.user_id, guildId),
            getUserAvatarConfig(userRow.user_id, guildId),
            getUserMediaScore(g.user.id, g.media.id)
        ]);

        const guild = client.guilds.cache.get(guildId);
        const member = guild ? await guild.members.fetch(userRow.user_id).catch(() => null) : null;
        const displayName = member?.displayName || g.user.name;

        const userMeta = {
            username: displayName.toUpperCase(),
            themeColor: userColor,
            avatarUrl: [userAvatar.customUrl, member?.user?.displayAvatarURL({ extension: 'png' })].filter(u => u)
        };

        const binge = g.progress.length >= 5;
        const lStatus = g.status.toLowerCase();
        const isManga = g.media.type === 'MANGA';
        let verb = lStatus.includes('completed') ? 'FINISHED' : (binge ? 'BINGED' : 'WATCHED');
        if (finalProgress) verb += ` ${isManga ? 'CH' : 'EP'} ${finalProgress}`;

        const buffer = await generateActivityCard(userMeta, { ...g, progress: finalProgress, score: scoreData?.score || 0, scoreFormat: scoreData?.format || 'POINT_10_DECIMAL', bingeMode: binge, displayVerb: verb });
        const attach = new AttachmentBuilder(buffer, { name: g.media.isAdult ? `SPOILER_act-${g.media.id}.webp` : `act-${g.media.id}.webp` });
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('View on AniList').setStyle(ButtonStyle.Link).setURL(g.media.siteUrl || `https://anilist.co/anime/${g.media.id}`)
        );

        const newMsg = await channel.send({ files: [attach], components: [row] });
        if (!client.isTestBot) {
            await markPosted(g.ids, { userId: userRow.user_id, mediaId: g.media.id, channelId: channel.id, messageId: newMsg.id, progress: finalProgress, status: g.status });
        }
    } catch (e) { logger.error(`[Activity Feed] Card failed for ${userRow.anilist_username}:`, e, 'Scheduler'); }
};

const processGuildActivity = async (client, guild) => {
    try {
        const config = await fetchConfig(guild.id);
        if (!config?.activity_channel_id) return;

        const linkedUsers = await getLinkedUsersForFeed(guild.id);
        if (!linkedUsers.length) return;

        const channel = await guild.channels.fetch(config.activity_channel_id).catch(() => null);
        if (!channel) return;

        const userResults = await Promise.allSettled(linkedUsers.map(user => fetchAndGroupUserActivities(user)));
        const guildWorkload = [];
        
        userResults.forEach((res, idx) => {
            if (res.status === 'fulfilled') res.value.forEach(g => guildWorkload.push({ group: g, userRow: linkedUsers[idx] }));
        });

        guildWorkload.sort((a, b) => a.group.earliestCreatedAt - b.group.earliestCreatedAt);

        for (const item of guildWorkload) {
            await postGroupedActivity(client, guild.id, item.userRow, channel, item.group);
        }
    } catch (err) { logger.error(`[Scheduler] Guild ${guild.id} failed:`, err, 'Scheduler'); }
};

const checkUserActivity = async (client) => {
    if (isActivityPolling) return;
    isActivityPolling = true;

    try {
        clearOldActivityPostsInDB().catch(() => null);
        const guilds = Array.from(client.guilds.cache.values());
        const CONCURRENCY = 3;
        for (let i = 0; i < guilds.length; i += CONCURRENCY) {
            await Promise.allSettled(guilds.slice(i, i + CONCURRENCY).map(g => processGuildActivity(client, g)));
        }
    } finally {
        isActivityPolling = false;
        lastActivityPulse = Date.now();
    }
};

/**
 * ─── UTILITY & HOUSEKEEPING ───────────────────────────────────────────────
 */
const pulseUserActivity = async (client, guildId, userRow, channel) => {
    try {
        const groups = await fetchAndGroupUserActivities(userRow);
        if (!groups.length) return;
        const latest = groups.sort((a,b) => b.earliestCreatedAt - a.earliestCreatedAt)[0];
        await postGroupedActivity(client, guildId, userRow, channel, latest);
    } catch (e) {}
};

const syncAllUserTrackers = async (client) => {
    const { getAutoSyncUsers } = require('./userService');
    const { getWatchingList } = require('./anilistService');
    try {
        const users = await getAutoSyncUsers();
        for (const user of users) {
            try {
                const list = await getWatchingList(user.anilist_username);
                for (const anime of list.filter(m => ['RELEASING', 'NOT_YET_RELEASED'].includes(m.status))) {
                    await addTracker(user.guild_id, user.user_id, anime.id, anime.title.english || anime.title.romaji);
                }
            } catch (err) {}
        }
    } catch (e) {}
};

const checkWordleReset = async (client) => {
    try {
        const today = minigameService.getWordleDate();
        if (!lastWordleDate) {
            if (await minigameService.isSyncRequired()) {
                isWordleResetting = true;
                await wordleService.forceReset(client).finally(() => isWordleResetting = false);
            }
            lastWordleDate = today;
            return;
        }
        if (today !== lastWordleDate && !isWordleResetting) {
            isWordleResetting = true;
            await wordleService.forceReset(client).then(() => { lastWordleDate = today; }).finally(() => isWordleResetting = false);
        }
    } catch (e) {}
};

const checkWordleHousekeeping = async () => { try { await wordleService.cleanupStaleSessions(); } catch (e) {} };
const checkConnect4Housekeeping = async (client) => { try { await connect4Service.cleanupStaleSessions(client); } catch (e) {} };

const getPulseStatus = () => ({ airing: lastAiringPulse, activity: lastActivityPulse, isAiringBusy: isAiringPolling, isActivityBusy: isActivityPolling });

module.exports = { 
    checkAiringAnime, checkUserActivity, pulseUserActivity, sendNotifications, 
    getPulseStatus, syncAllUserTrackers, checkWordleReset, checkWordleHousekeeping, checkConnect4Housekeeping 
};
