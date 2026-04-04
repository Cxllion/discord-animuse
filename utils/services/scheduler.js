const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder , MessageFlags } = require('discord.js');
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
    updateLastActivityId,
    getActivityCache,
    upsertActivityCache,
    clearActivityCache,
    getUserColor,
    getUserAvatarConfig,
    getUserTitle
} = require('../core/database');
const { generateActivityCard } = require('../generators/activityGenerator');
const logger = require('../core/logger');
const CONFIG = require('../config');

// Batch size for AniList queries to avoid hitting complexity limits
const BATCH_SIZE = 50;

// Concurrency locks to preven duplicate broadcasts
let isAiringPolling = false;
let isActivityPolling = false;

// Telemetry for watchdog diagnostics
let lastAiringPulse = null;
let lastActivityPulse = null;

/**
 * Checks for airing anime and sends notifications.
 * @param {Client} client - Discord Client
 */
const checkAiringAnime = async (client) => {
    if (isAiringPolling) return;
    isAiringPolling = true;

    try {
        logger.info('[Scheduler] Pulse: Airing Anime check started.', 'Scheduler');
        const monitorIds = await getAnimeDueForUpdate();
        if (monitorIds.length === 0) {
            logger.info('[Scheduler] No airing anime to monitor at this time.', 'Scheduler');
            return;
        }

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
                id
                status
                title { romaji english }
                coverImage { extraLarge large color }
                bannerImage
                format
                genres
                studios {
                    nodes { name }
                    edges { node { name } }
                }
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
        if (!data || !data.Page || !data.Page.media) {
            logger.warn(`[Scheduler] Batch query returned empty or invalid data. Skipping batch.`, 'Scheduler');
            return;
        }
        const mediaList = data.Page.media;

        for (const media of mediaList) {
            try {
                const nextEp = media.nextAiringEpisode;
                const trackedState = await getTrackedAnimeState(media.id);
                const knownLastEpisode = trackedState ? trackedState.last_episode : 0;

                const nextAiringDate = nextEp
                    ? new Date(nextEp.airingAt * 1000).toISOString()
                    : null;

                if (!nextEp || nextEp.timeUntilAiring > 1200) {
                    if (nextAiringDate) {
                        await updateTrackedAnimeState(media.id, knownLastEpisode, nextAiringDate);
                    } else if (media.status === 'FINISHED') {
                        logger.info(`[Scheduler] ${media.id} has finished airing. Removing ${media.id} from all archives. ♡`, 'Scheduler');
                        await removeAllTrackersForAnime(media.id);
                    }
                    continue;
                }

                if (nextEp.episode > knownLastEpisode) {
                    await sendNotifications(client, media, nextEp);
                    await updateTrackedAnimeState(media.id, nextEp.episode, nextAiringDate);
                }
            } catch (mediaError) {
                logger.error(`[Scheduler] Error processing media ${media.id}:`, mediaError, 'Scheduler');
            }
        }
    } catch (e) {
        if (e.message === 'AL_MAINTENANCE') {
            logger.info('[Scheduler] Skipping batch pulse: AniList API is in maintenance mode. ☕', 'Scheduler');
        } else {
            logger.error('[Scheduler] Error in batch processing:', e, 'Scheduler');
        }
    }
};

const sendNotifications = async (client, media, episode, options = {}) => {
    let subscriptions = [];
    if (options.forceGuildId) {
        subscriptions = [{ guild_id: options.forceGuildId, user_id: options.forceUserId || null }]; 
    } else {
        subscriptions = await getAllTrackersForAnime(media.id);
    }

    if (!subscriptions.length) return;

    const entriesByGuild = {};
    for (const sub of subscriptions) {
        if (!entriesByGuild[sub.guild_id]) entriesByGuild[sub.guild_id] = [];
        if (sub.user_id) entriesByGuild[sub.guild_id].push(sub.user_id);
    }

    let attachment = null;
    try {
        const buffer = await generateAiringCard(media, episode);
        const attachmentName = media.isAdult ? `SPOILER_airing-${media.id}.webp` : `airing-${media.id}.webp`;
        attachment = new AttachmentBuilder(buffer, { name: attachmentName });
    } catch (e) {
        logger.error('Failed to generate airing card:', e, 'Scheduler');
    }

    for (const [guildId, userIds] of Object.entries(entriesByGuild)) {
        try {
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) continue;

            const config = await fetchConfig(guildId);
            const targetChannelId = options.forceChannelId || (config ? config.airing_channel_id : null);
            if (!targetChannelId) continue;

            const channel = await guild.channels.fetch(targetChannelId).catch(() => null);
            if (!channel) continue;

            const me = guild.members.me;
            const permissions = channel.permissionsFor(me);
            
            if (!permissions || !permissions.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
                continue;
            }

            let content = ''; 
            if (userIds.length > 0) {
                const pings = userIds.map(uid => `<@${uid}>`).join(' ');
                content = `[⠀](https://discord.com "${pings}")`;
            }

            const title = media.title.english || media.title.romaji;
            const subButtonId = `track_add_${media.id}`;

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('View on AniList')
                    .setStyle(ButtonStyle.Link)
                    .setURL(media.siteUrl || `https://anilist.co/anime/${media.id}`),
                new ButtonBuilder()
                    .setCustomId(subButtonId)
                    .setLabel('Track +')
                    .setStyle(ButtonStyle.Primary)
            );

            const msg = await channel.send({
                content: content,
                files: attachment ? [attachment] : [],
                components: [row]
            });

            const TIMEOUT_MS = 10 * 60 * 1000;
            watchInteraction(msg, TIMEOUT_MS, async (i) => {
                if (i.customId === subButtonId) {
                    await i.deferReply({ flags: MessageFlags.Ephemeral });
                    const res = await addTracker(guildId, i.user.id, media.id, title);
                    if (res.error) await i.editReply('❌ Failed to start tracking.');
                    else await i.editReply(`✅ You are now tracking **${title}**!`);
                }
            }, [subButtonId]);

        } catch (err) {
            logger.error(`Failed to notify guild ${guildId}:`, err, 'Scheduler');
        }
    }
};

const { wasPostedInDB, markPostedInDB, findRecentActivityPostInDB, clearOldActivityPostsInDB } = require('./userService');
const fs = require('fs');
const path = require('path');
const CACHE_PATH = path.join(__dirname, '../../.activity_posted_cache.json');

const loadFileCache = () => {
    try {
        if (fs.existsSync(CACHE_PATH)) return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    } catch (e) {}
    return {};
};

const saveFileCache = (cache) => {
    try {
        const cutoff = Math.floor(Date.now() / 1000) - 72 * 60 * 60;
        const pruned = {};
        for (const [id, ts] of Object.entries(cache)) {
            if (ts > cutoff) pruned[id] = ts;
        }
        fs.writeFileSync(CACHE_PATH, JSON.stringify(pruned), 'utf-8');
    } catch (e) {}
};

const wasPosted = async (activityId) => {
    const inDB = await wasPostedInDB(activityId);
    if (inDB) return true;
    return !!loadFileCache()[String(activityId)];
};

const markPosted = async (activityIds, meta = null) => {
    const dbPayload = activityIds.map(id => ({ 
        id: String(id), 
        userId: String(meta.userId || ''),
        mediaId: String(meta.mediaId || ''),
        channelId: String(meta.channelId || ''),
        messageId: String(meta.messageId || ''),
        progress: String(meta.progress || ''),
        status: String(meta.status || '')
    }));

    const savedToDB = await markPostedInDB(dbPayload);
    if (!savedToDB) {
        const cache = loadFileCache();
        const now = Math.floor(Date.now() / 1000);
        activityIds.forEach(id => { cache[String(id)] = now; });
        saveFileCache(cache);
    }
};

const get24hCutoff = () => Math.floor(Date.now() / 1000) - 72 * 60 * 60;

/**
 * ─── ACTIVITY POLLING REFACTORED ──────────────────────────────────────────
 * Implements guild-wide chronological sorting and status-dedup.
 */

const fetchAndGroupUserActivities = async (userRow) => {
    try {
        const activities = await getUserActivity(userRow.anilist_username);
        if (!activities || activities.length === 0) return [];

        const cutoff = get24hCutoff();
        activities.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

        const groups = new Map();
        for (const act of activities) {
            if (act.createdAt && act.createdAt < cutoff) continue;
            if (await wasPosted(act.id)) continue;
            if (!act.media) continue;

            const mediaId = act.media.id;
            const groupKey = `${mediaId}`; // Status-agnostic key for deduplication
            
            if (!groups.get(groupKey)) {
                groups.set(groupKey, { 
                    media: act.media, 
                    status: act.status, 
                    user: act.user, 
                    ids: [], 
                    progress: [],
                    earliestCreatedAt: act.createdAt || 0
                });
            }
            const g = groups.get(groupKey);
            g.ids.push(act.id);
            
            if ((act.status || '').toLowerCase() === 'completed') g.status = 'completed';
            if (act.progress) {
                const progStr = String(act.progress);
                if (progStr.match(/[-–—/]/)) g.progress.push(progStr);
                else g.progress.push(parseInt(progStr) || progStr);
            }
        }
        return Array.from(groups.values());
    } catch (e) {
        logger.error(`[Activity Feed] Fetch error for ${userRow.anilist_username}:`, e, 'Scheduler');
        return [];
    }
};

const postGroupedActivity = async (client, guildId, userRow, channel, g) => {
    try {
        let displayProgress = '';
        if (g.progress.length > 0) {
            const allNums = [];
            g.progress.forEach(p => {
                if (typeof p === 'number') allNums.push(p);
                else {
                    const rangeNums = p.split(/[-–—/]/).map(n => parseInt(n.trim())).filter(n => !isNaN(n));
                    allNums.push(...rangeNums);
                }
            });
            const sorted = [...new Set(allNums)].sort((a,b) => a - b);
            if (sorted.length > 1) displayProgress = `${sorted[0]}-${sorted[sorted.length-1]}`;
            else if (sorted.length === 1) displayProgress = sorted[0].toString();
        }

        const recentPost = await findRecentActivityPostInDB(userRow.user_id, g.media.id, channel.id);
        let finalProgress = displayProgress;
        
        if (recentPost && recentPost.message_id && g.status.toLowerCase() === (recentPost.status || '').toLowerCase()) {
            const oldNums = (recentPost.progress || '').split(/[-–—/]/).map(n => parseInt(n.trim())).filter(n => !isNaN(n));
            const newNums = displayProgress.split(/[-–—/]/).map(n => parseInt(n.trim())).filter(n => !isNaN(n));
            if (oldNums.length > 0 && newNums.length > 0) {
                const combined = [...oldNums, ...newNums].sort((a,b) => a - b);
                finalProgress = combined[0] === combined[combined.length-1] ? `${combined[0]}` : `${combined[0]}-${combined[combined.length-1]}`;
                const oldMsg = await channel.messages.fetch(recentPost.message_id).catch(() => null);
                if (oldMsg) await oldMsg.delete().catch(() => null);
            }
        }

        const userColor = await getUserColor(userRow.user_id, guildId);
        const userAvatar = await getUserAvatarConfig(userRow.user_id, guildId);
        const scoreData = await getUserMediaScore(g.user.id, g.media.id);
        const score = scoreData?.score || 0;
        const scoreFormat = scoreData?.format || 'POINT_10_DECIMAL';
        
        const guild = client.guilds.cache.get(guildId);
        const member = guild ? await guild.members.fetch(userRow.user_id).catch(() => null) : null;
        
        let displayName = member ? member.displayName : g.user.name;
        if (/[^\x20-\x7E]/.test(displayName) && member?.user?.username) {
            displayName = member.user.username;
        }

        const userMeta = {
            username: displayName.toUpperCase(),
            themeColor: userColor,
            avatarUrl: userAvatar.customUrl || (member ? member.user.displayAvatarURL({ extension: 'png' }) : null)
        };

        const prog = String(finalProgress || '');
        const rNums = prog.split(/[-–—/]/).map(n => parseInt(n.trim())).filter(n => !isNaN(n));
        const binge = rNums.length >= 2 && (Math.max(...rNums) - Math.min(...rNums) + 1) >= 5;
        const isManga = g.media.type === 'MANGA' || (g.status || '').toLowerCase().includes('read');
        let verb = binge ? (isManga ? 'BINGE READ' : 'BINGED') : (isManga ? 'READ' : 'WATCHED');
        
        // --- 💎 Restore Count & Progress ---
        if (finalProgress) {
            verb += ` ${isManga ? 'CH' : 'EP'} ${finalProgress}`;
        }

        if (g.status.toLowerCase() === 'completed') {
            if (finalProgress) verb += ' AND FINISHED';
            else verb = isManga ? 'FINISHED READING' : 'FINISHED WATCHING';
        }

        const buffer = await generateActivityCard(userMeta, { ...g, progress: finalProgress, score, scoreFormat, bingeMode: binge, displayVerb: verb });
        const name = g.media.isAdult ? `SPOILER_act-${g.media.id}.webp` : `act-${g.media.id}.webp`;
        const attach = new AttachmentBuilder(buffer, { name });
        
        logger.info(`[Activity Broadcast] 🚀 Sending ${verb} card for ${userRow.anilist_username}`, 'Scheduler');
        const newMsg = await channel.send({ files: [attach] });

        if (!client.isTestBot) {
            await markPosted(g.ids, { userId: userRow.user_id, mediaId: g.media.id, channelId: channel.id, messageId: newMsg.id, progress: finalProgress, status: g.status });
        }
    } catch (e) {
        logger.error(`[Activity Feed] Card generation failed for ${userRow.anilist_username}:`, e, 'Scheduler');
    }
};

const checkUserActivity = async (client) => {
    if (isActivityPolling) return;
    isActivityPolling = true;

    try {
        clearOldActivityPostsInDB().catch(() => null);
        logger.info('[Scheduler] Pulse: Global Activity Feed check starting...', 'Scheduler');

        const guilds = Array.from(client.guilds.cache.values());
        for (const guild of guilds) {
            try {
                const config = await fetchConfig(guild.id);
                if (!config || !config.activity_channel_id) continue;

                const linkedUsers = await getLinkedUsersForFeed(guild.id);
                if (linkedUsers.length === 0) continue;

                const channel = await guild.channels.fetch(config.activity_channel_id).catch(() => null);
                if (!channel) continue;

                const guildWorkload = [];
                for (const userRow of linkedUsers) {
                    await new Promise(r => setTimeout(r, 700)); 
                    const groups = await fetchAndGroupUserActivities(userRow);
                    groups.forEach(g => guildWorkload.push({ group: g, userRow }));
                }

                if (guildWorkload.length === 0) continue;

                guildWorkload.sort((a, b) => a.group.earliestCreatedAt - b.group.earliestCreatedAt);

                logger.info(`[Scheduler] Guild ${guild.id}: Processing ${guildWorkload.length} update(s) in server-wide chronological order.`, 'Scheduler');

                for (const item of guildWorkload) {
                    await postGroupedActivity(client, guild.id, item.userRow, channel, item.group);
                    await new Promise(r => setTimeout(r, 1000));
                }

            } catch (guildError) {
                logger.error(`[Scheduler] Guild Polling Error (${guild.id}):`, guildError, 'Scheduler');
            }
        }
    } catch (error) {
        logger.error(`[Scheduler] Activity Polling failure:`, error, 'Scheduler');
    } finally {
        isActivityPolling = false;
        lastActivityPulse = Date.now();
    }
};

/**
 * Triggered by messageCreate pulses (Manual User Scan)
 */
const pulseUserActivity = async (client, guildId, userRow, channel) => {
    try {
        const groups = await fetchAndGroupUserActivities(userRow);
        if (groups.length === 0) return;

        // Take latest group first for manual pulse context
        const latest = groups.sort((a,b) => b.earliestCreatedAt - a.earliestCreatedAt)[0];
        await postGroupedActivity(client, guildId, userRow, channel, latest);
    } catch (e) {
        logger.error(`[Activity Pulse] Failed for ${userRow.anilist_username}:`, e, 'Scheduler');
    }
};

const getPulseStatus = () => ({
    airing: lastAiringPulse,
    activity: lastActivityPulse,
    isAiringBusy: isAiringPolling,
    isActivityBusy: isActivityPolling
});

module.exports = { checkAiringAnime, checkUserActivity, pulseUserActivity, sendNotifications, getPulseStatus };
