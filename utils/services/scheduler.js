const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { generateAiringCard } = require('../generators/airingGenerator');
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
// NOTE: minigameService, wordleService, connect4Service are lazy-required inside their functions (#19)

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

    // #1: Track whether any real work was done so telemetry isn't misleadingly stamped on idle polls
    let didWork = false;
    try {
        const monitorIds = await getAnimeDueForUpdate();
        if (monitorIds.length === 0) return;

        didWork = true;
        for (let i = 0; i < monitorIds.length; i += BATCH_SIZE) {
            const batch = monitorIds.slice(i, i + BATCH_SIZE);
            await processBatch(client, batch);
        }
    } finally {
        isAiringPolling = false;
        if (didWork) lastAiringPulse = Date.now(); // #1: Only stamp when work was done
    }
};

const processBatch = async (client, ids) => {
    // #12: Use edges (not nodes) so airingGenerator can access isMain + node.name
    const query = `
    query ($ids: [Int]) {
        Page {
            media(id_in: $ids, type: ANIME) {
                id status episodes title { romaji english } coverImage { extraLarge large color }
                bannerImage format genres studios { edges { isMain node { name } } } siteUrl
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

            // #5: Guard threshold raised to 1800s (30 min) to match the query window
            if (!nextEp || nextEp.timeUntilAiring > 1800) {
                if (nextAiringDate) {
                    await updateTrackedAnimeState(media.id, knownLastEpisode, nextAiringDate);
                } else if (media.status === 'FINISHED') {
                    // #3: Only clean up if total episodes are known AND the finale was already notified
                    if (media.episodes && knownLastEpisode >= media.episodes) {
                        await removeAllTrackersForAnime(media.id);
                    } else {
                        // Unknown episode count or finale not yet sent — preserve state, do not delete
                        await updateTrackedAnimeState(media.id, knownLastEpisode, null);
                    }
                }
                continue;
            }

            if (nextEp.episode > knownLastEpisode) {
                // #2: Update state FIRST to prevent duplicate notifications from concurrent polls
                await updateTrackedAnimeState(media.id, nextEp.episode, nextAiringDate);
                await sendNotifications(client, media, nextEp);
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

    for (const [guildId, userIds] of Object.entries(entriesByGuild)) {
        try {
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) continue;

            const config = await fetchConfig(guildId);
            const channelId = options.forceChannelId || config?.airing_channel_id;

            // #6: Log when a guild has no airing channel configured instead of silently skipping
            if (!channelId) {
                logger.warn(`[Scheduler] Guild ${guildId} (${guild.name}) has no airing_channel_id configured — notification skipped.`, 'Scheduler');
                continue;
            }

            const channel = await guild.channels.fetch(channelId).catch(() => null);
            if (!channel) {
                logger.warn(`[Scheduler] Could not fetch airing channel ${channelId} in guild ${guildId} (${guild.name}) — notification skipped.`, 'Scheduler');
                continue;
            }

            // #16: Build per-guild tracker HUD data (capped at first 5 subscribers)
            let trackerData = [];
            try {
                trackerData = (await Promise.all(
                    userIds.slice(0, 5).map(async (uid) => {
                        const member = await guild.members.fetch(uid).catch(() => null);
                        return member ? {
                            avatarURL: member.user.displayAvatarURL({ extension: 'png', size: 64 }),
                            displayName: member.displayName,
                            level: 0
                        } : null;
                    })
                )).filter(Boolean);
            } catch (e) {
                logger.warn(`[Scheduler] Tracker HUD fetch failed for guild ${guildId}: ${e.message}`, 'Scheduler');
            }

            // Generate airing card with per-guild tracker avatars
            let attachment = null;
            try {
                const buffer = await generateAiringCard(media, episode, trackerData);
                attachment = new AttachmentBuilder(buffer, { name: media.isAdult ? `SPOILER_airing-${media.id}.webp` : `airing-${media.id}.webp` });
            } catch (e) {
                logger.error('Failed to generate airing card:', e, 'Scheduler');
            }

            // #18: track_add_ is now handled persistently by the router in trackHandlers.js
            // — no watchInteraction needed; the button works indefinitely
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('View on AniList').setStyle(ButtonStyle.Link).setURL(media.siteUrl || `https://anilist.co/anime/${media.id}`),
                new ButtonBuilder().setCustomId(`track_add_${media.id}`).setLabel('Track +').setStyle(ButtonStyle.Primary)
            );

            await channel.send({
                content: userIds.length > 0 ? userIds.map(uid => `<@${uid}>`).join(' ') : '',
                files: attachment ? [attachment] : [],
                components: [row]
            });
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

            const groupKey = String(act.media.id);
            if (!groups.has(groupKey)) {
                groups.set(groupKey, { media: act.media, status: act.status, user: act.user, ids: [], progress: [], earliestCreatedAt: act.createdAt });
            }
            const g = groups.get(groupKey);
            
            // Only push IDs and progress if we haven't seen this specific activity ID in the group yet
            if (!g.ids.includes(act.id)) {
                g.ids.push(act.id);
                if (act.progress) g.progress.push(act.progress);
            }

            const lowerStatus = (act.status || '').toLowerCase();
            // Prioritize definitive statuses over generic watch/read progress
            if (lowerStatus.includes('completed') || lowerStatus.includes('dropped') || lowerStatus.includes('paused') || lowerStatus.includes('plans to') || lowerStatus.includes('repeating')) {
                g.status = act.status;
            }
        }
        return Array.from(groups.values());
    } catch (e) {
        logger.error(`[Activity Feed] Fetch failed for ${userRow.anilist_username}:`, e, 'Scheduler');
        return [];
    }
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

        let guild = client.guilds.cache.get(guildId);
        if (!guild) {
            guild = await client.guilds.fetch(guildId).catch(() => null);
        }
        if (!guild) {
            logger.debug(`[Activity Feed] Guild ${guildId} not found/cached, skipping card for ${userRow.anilist_username}.`, 'Scheduler');
            return;
        }
        const member = guild ? await guild.members.fetch(userRow.user_id).catch(() => null) : null;
        const displayName = member?.displayName || g.user.name;

        const userMeta = {
            username: displayName.toUpperCase(),
            themeColor: userColor,
            avatarUrl: [userAvatar.customUrl, member?.user?.displayAvatarURL({ extension: 'png' })].filter(u => u)
        };

        const binge = g.progress.length >= 3; // Lowered to 3 for better binge detection
        const lStatus = (g.status || '').toLowerCase();
        const isManga = g.media.type === 'MANGA';
        
        let verb = isManga ? 'READ' : 'WATCHED';
        if (lStatus.includes('completed')) {
            if (g.progress.length > 1) {
                verb = binge ? (isManga ? 'BINGE READ AND FINISHED' : 'BINGED AND FINISHED') : (isManga ? 'READ AND FINISHED' : 'WATCHED AND FINISHED');
            } else {
                verb = 'FINISHED';
            }
        } else if (lStatus.includes('dropped')) {
            verb = 'DROPPED';
        } else if (lStatus.includes('paused')) {
            verb = 'PAUSED';
        } else if (lStatus.includes('plans to')) {
            verb = isManga ? 'PLANS TO READ' : 'PLANS TO WATCH';
        } else if (lStatus.includes('repeating')) {
            verb = isManga ? 'REREADING' : 'REWATCHING';
        } else if (binge) {
            verb = isManga ? 'BINGE READ' : 'BINGED';
        }

        // Only append EP/CH numbers if it's a progress update, binge, or completion (not paused/planning/dropped)
        if (finalProgress && !lStatus.includes('dropped') && !lStatus.includes('paused') && !lStatus.includes('plans to')) {
            verb += ` ${isManga ? 'CH' : 'EP'} ${finalProgress}`;
        }

        const buffer = await generateActivityCard(userMeta, { ...g, progress: finalProgress, score: scoreData?.score || 0, scoreFormat: scoreData?.format || 'POINT_10_DECIMAL', bingeMode: binge, displayVerb: verb });
        const attach = new AttachmentBuilder(buffer, { name: g.media.isAdult ? `SPOILER_act-${g.media.id}.webp` : `act-${g.media.id}.webp` });
        
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('View on AniList').setStyle(ButtonStyle.Link).setURL(g.media.siteUrl || `https://anilist.co/anime/${g.media.id}`)
        );

        const newMsg = await channel.send({ files: [attach], components: [row] });
        await markPosted(g.ids, { userId: userRow.user_id, mediaId: g.media.id, channelId: channel.id, messageId: newMsg.id, progress: finalProgress, status: g.status });
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
        clearOldActivityPostsInDB().catch(e => logger.debug('[Activity] Cleanup error:', e, 'Scheduler'));
        const guilds = Array.from(client.guilds.cache.values());
        
        // Option B, 1: Add debug log for missed guilds
        const allConfigs = await require('../core/database').getAllGuildConfigs?.() || [];
        for (const conf of allConfigs) {
            if (conf.activity_channel_id && !client.guilds.cache.has(conf.guild_id)) {
                logger.debug(`[Activity Feed] Guild ${conf.guild_id} has activity feed enabled but is NOT in cache. Skipping poll.`, 'Scheduler');
            }
        }

        const CONCURRENCY = CONFIG.ACTIVITY_CONCURRENCY || 3;
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
    } catch (e) {
        // #20: Log errors instead of silently swallowing them
        logger.error(`[pulseUserActivity] Failed for user ${userRow?.user_id} (${userRow?.anilist_username}): ${e.message}`, e, 'Scheduler');
    }
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
            } catch (err) {
                // #9: Log per-user sync failures for observability
                logger.warn(`[AutoSync] Failed to sync user ${user.user_id} (${user.anilist_username}): ${err.message}`, 'Scheduler');
            }
        }
    } catch (e) {
        logger.error('[AutoSync] Fatal error in syncAllUserTrackers:', e, 'Scheduler');
    }
};

const checkWordleReset = async (client) => {
    // #19: Lazy-require minigame modules — not loaded at startup in core bot mode
    const minigameService = require('./minigameService');
    const wordleService = require('./wordleService');
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

// #19: Lazy-require wordleService and connect4Service inside their functions
const checkWordleHousekeeping = async () => { try { await require('./wordleService').cleanupStaleSessions(); } catch (e) {} };
const checkConnect4Housekeeping = async (client) => { try { await require('./connect4Service').cleanupStaleSessions(client); } catch (e) {} };

const getPulseStatus = () => ({ airing: lastAiringPulse, activity: lastActivityPulse, isAiringBusy: isAiringPolling, isActivityBusy: isActivityPolling });

module.exports = { 
    checkAiringAnime, checkUserActivity, pulseUserActivity, sendNotifications, 
    getPulseStatus, syncAllUserTrackers, checkWordleReset, checkWordleHousekeeping, checkConnect4Housekeeping 
};
