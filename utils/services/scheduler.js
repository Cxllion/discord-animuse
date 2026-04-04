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

        // 2. Process in batches
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
    // 3. Query AniList
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

                // Update DB with fresh "Next Airing" time so Smart Polling works
                const nextAiringDate = nextEp
                    ? new Date(nextEp.airingAt * 1000).toISOString()
                    : null;

                // 1. If not airing soon, just update the timer and skip
                if (!nextEp || nextEp.timeUntilAiring > 1200) {
                    if (nextAiringDate) {
                        await updateTrackedAnimeState(media.id, knownLastEpisode, nextAiringDate);
                    } else if (media.status === 'FINISHED') {
                        // All episodes have aired and AniList marks it as Finished.
                        // We can stop observing and clear the archive records.
                        logger.info(`[Scheduler] ${media.id} has finished airing. Removing ${media.id} from all archives. ♡`, 'Scheduler');
                        await removeAllTrackersForAnime(media.id);
                    }
                    continue;
                }

                // 2. It's Airing Soon (<= 20 mins)
                if (nextEp.episode > knownLastEpisode) {
                    await sendNotifications(client, media, nextEp);
                    await updateTrackedAnimeState(media.id, nextEp.episode, nextAiringDate);
                }
            } catch (mediaError) {
                logger.error(`[Scheduler] Error processing media ${media.id}:`, mediaError, 'Scheduler');
                // Continue with next media in batch
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
    // 1. Get Subscribers
    let subscriptions = [];
    if (options.forceGuildId) {
        // Test Mode: Simulate a subscription for this guild
        subscriptions = [{ guild_id: options.forceGuildId, user_id: options.forceUserId || null }]; 
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
        const attachmentName = media.isAdult ? `SPOILER_airing-${media.id}.webp` : `airing-${media.id}.webp`;
        attachment = new AttachmentBuilder(buffer, { name: attachmentName });
    } catch (e) {
        logger.error('Failed to generate airing card:', e, 'Scheduler');
    }

    // 4. Send to each guild
    for (const [guildId, userIds] of Object.entries(entriesByGuild)) {
        try {
            const guild = await client.guilds.fetch(guildId).catch(() => null);
            if (!guild) continue;

            // Use forced channel for tests/diagnostics
            const config = await fetchConfig(guildId);
            const targetChannelId = options.forceChannelId || (config ? config.airing_channel_id : null);
            if (!targetChannelId) continue;

            const channel = await guild.channels.fetch(targetChannelId).catch(() => null);
            if (!channel) continue;

            // --- PERMISSION CHECK ---
            const me = guild.members.me;
            const permissions = channel.permissionsFor(me);
            
            if (!permissions || !permissions.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
                const missing = [];
                if (!permissions.has('ViewChannel')) missing.push('View Channel');
                if (!permissions.has('SendMessages')) missing.push('Send Messages');
                if (!permissions.has('EmbedLinks')) missing.push('Embed Links');
                
                logger.warn(`[Scheduler] Skipping guild ${guildId}: Bot lacks [${missing.join(', ')}] permissions in channel ${channel.id}`, 'Scheduler');
                
                if (options.forceGuildId) {
                    throw new Error(`Bot lacks permissions in <#${channel.id}>: ${missing.join(', ')}`);
                }
                continue;
            }

            // Construct Invisible Pings (Braille Space link + masked title)
            // Character within [] is U+2800 (Braille Blank)
            let content = ''; 
            if (userIds.length > 0) {
                const pings = userIds.map(uid => `<@${uid}>`).join(' ');
                content = `[⠀](https://discord.com "${pings}")`;
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
                    await i.deferReply({ flags: MessageFlags.Ephemeral });
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
            if (options.forceGuildId) throw err; // Re-throw for tests
        }
    }
};

/**
 * BROADCASTER: Fetches and posts activities for a single user in a guild.
 * @param {Client} client 
 * @param {string} guildId 
 * @param {object} userRow { user_id, anilist_username, last_activity_id }
 * @param {TextChannel} channel 
 */
// ── Two-Tier Persistent Post Cache ────────────────────────────────────────────
// Tier 1: Supabase `activity_posted` table (works on Render, survives restarts)
// Tier 2: Local JSON file fallback (works locally without the DB table)
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
        const cutoff = Math.floor(Date.now() / 1000) - 72 * 60 * 60; // 72h prune
        const pruned = {};
        for (const [id, ts] of Object.entries(cache)) {
            if (ts > cutoff) pruned[id] = ts;
        }
        fs.writeFileSync(CACHE_PATH, JSON.stringify(pruned), 'utf-8');
    } catch (e) {}
};

const wasPosted = async (activityId) => {
    // Try DB first (Render-safe, persistent across deploys)
    const inDB = await wasPostedInDB(activityId);
    if (inDB) return true;
    // Fall back to local JSON file (no migration needed locally)
    return !!loadFileCache()[String(activityId)];
};

const markPosted = async (activityIds, meta = null) => {
    // Construct payload for DB: EVERY ID gets the metadata for consistent lookups
    const dbPayload = activityIds.map(id => ({ 
        id: String(id), 
        userId: String(meta.userId || ''),
        mediaId: String(meta.mediaId || ''),
        channelId: String(meta.channelId || ''),
        messageId: String(meta.messageId || ''),
        progress: String(meta.progress || ''),
        status: String(meta.status || '')
    }));

    // Try DB first
    const savedToDB = await markPostedInDB(dbPayload);
    if (!savedToDB) {
        // DB table doesn't exist yet — use local file fallback
        const cache = loadFileCache();
        const now = Math.floor(Date.now() / 1000);
        activityIds.forEach(id => { cache[String(id)] = now; });
        saveFileCache(cache);
    }
};

// 72-hour window (Unix timestamp)
const get24hCutoff = () => Math.floor(Date.now() / 1000) - 72 * 60 * 60;

/**
 * Burst Logic: Fetches AniList activities for a user, filters to 72h window,
 * groups sequential episodes into combined cards, skips already-posted IDs.
 */
const checkAndBroadcastUserActivity = async (client, guildId, userRow, channel) => {
    try {
        const activities = await getUserActivity(userRow.anilist_username);
        if (!activities || activities.length === 0) return;

        const cutoff = get24hCutoff();

        // ── Sort activities OLDEST FIRST before grouping ──────────────────────
        // AniList returns ID_DESC (newest first). We must reverse so that:
        //   1. Groups are created in chronological insertion order (Map preserves insertion)
        //   2. The Discord feed reads oldest → newest top to bottom
        activities.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

        // Grouping logic: find unique media pieces being updated
        const groups = new Map();

        for (const act of activities) {
            // Debug: Let's see what we found
            logger.info(`[Activity Discovery] Found ID: ${act.id} | Status: ${act.status} | Progress: ${act.progress} | ${act.media?.title?.english || act.media?.title?.romaji}`, 'Scheduler');

            // Skip if older than 72 hours
            if (act.createdAt && act.createdAt < cutoff) {
                logger.debug(`[Activity Skip] ID ${act.id} is too old. Created at ${act.createdAt}, cutoff ${cutoff}`, 'Scheduler');
                continue;
            }
            // Skip if already posted (persistent dedup via file/DB cache)
            if (await wasPosted(act.id)) {
                logger.debug(`[Activity Skip] ID ${act.id} was already posted according to cache.`, 'Scheduler');
                continue;
            }
            // Skip non-media activities (e.g. text status posts)
            if (!act.media) {
                logger.debug(`[Activity Skip] ID ${act.id} has no attached media data.`, 'Scheduler');
                continue;
            }
            
            const mediaId = act.media.id;
            const status = (act.status || '').toLowerCase();
            const groupKey = `${mediaId}_${status}`;
            
            if (!groups.get(groupKey)) {
                groups.set(groupKey, { 
                    media: act.media, 
                    status: act.status, 
                    user: act.user, 
                    ids: [], 
                    progress: [],
                    earliestCreatedAt: act.createdAt || 0 // Track oldest activity in group for sort
                });
            }
            const g = groups.get(groupKey);
            g.ids.push(act.id);
            if (act.progress) {
                // If the progress is already a range (e.g. "1-12"), treat it as a string
                // Otherwise try to convert to number for sorting/merging
                const progStr = String(act.progress);
                if (progStr.match(/[-–—/]/)) g.progress.push(progStr);
                else g.progress.push(parseInt(progStr) || progStr);
            }
        }

        if (groups.size === 0) {
            logger.info(`[Activity Feed] No new activities to post for ${userRow.anilist_username} (all within 72h window were already posted or empty).`, 'Scheduler');
            return;
        }

        logger.info(`[Activity Feed] Burst Mode: Processed ${activities.length} total, creating ${groups.size} distinct cards. (User: ${userRow.anilist_username})`, 'Scheduler');

        // ── Sort groups by earliestCreatedAt ascending (chronological post order) ──
        const sortedGroups = [...groups.values()].sort((a, b) => a.earliestCreatedAt - b.earliestCreatedAt);

        // Process each Group in chronological order
        for (const g of sortedGroups) {
            try {
                // 1. Determine local range for THIS poll (e.g. 1-2)
                let displayProgress = '';
                let nums = [];
                if (g.progress.length > 0) {
                    const allNums = [];
                    g.progress.forEach(p => {
                        if (typeof p === 'number') allNums.push(p);
                        else {
                            const rangeNums = p.split(/[-–—/]/).map(n => parseInt(n.trim())).filter(n => !isNaN(n));
                            allNums.push(...rangeNums);
                        }
                    });
                    
                    const nums = [...new Set(allNums)].sort((a,b) => a - b);
                    if (nums.length > 1) {
                        displayProgress = `${nums[0]}-${nums[nums.length-1]}`;
                    } else if (nums.length === 1) {
                        displayProgress = nums[0].toString();
                    } else if (g.progress.length > 0) {
                        displayProgress = g.progress[0].toString();
                    }
                }

                // 2. CHECK FOR MERGE (Binge Compression across polls)
                const recentPost = await findRecentActivityPostInDB(userRow.user_id, g.media.id, channel.id);
                let finalProgress = displayProgress;
                
                if (recentPost && recentPost.message_id && g.status.toLowerCase() === (recentPost.status || '').toLowerCase()) {
                    // Try to merge progress strings (e.g. "1-2" + "3" -> "1-3")
                    const oldProg = recentPost.progress || '';
                    const oldNums = oldProg.split(/[-–—/]/).map(n => parseInt(n.trim())).filter(n => !isNaN(n));
                    const newNums = displayProgress.split(/[-–—/]/).map(n => parseInt(n.trim())).filter(n => !isNaN(n));
                    
                    if (oldNums.length > 0 && newNums.length > 0) {
                        const allCombined = [...oldNums, ...newNums].sort((a,b) => a - b);
                        const min = allCombined[0];
                        const max = allCombined[allCombined.length - 1];
                        if (min === max) finalProgress = String(min);
                        else finalProgress = `${min}-${max}`;

                        // Delete the old message to "replace" it (binging UX)
                        try {
                            const oldMsg = await channel.messages.fetch(recentPost.message_id).catch(() => null);
                            if (oldMsg) await oldMsg.delete().catch(() => null);
                        } catch (e) {
                            logger.warn(`[Activity Feed] Cleanup failed for old post ${recentPost.message_id}: ${e.message}`, 'Scheduler');
                        }
                    }
                }

                // 3. Render and Post New Card
                const userColor = await getUserColor(userRow.user_id, guildId);
                const userAvatar = await getUserAvatarConfig(userRow.user_id, guildId);
                const score = await getUserMediaScore(g.user.id, g.media.id);
                
                logger.info(`[Activity Feed] Fetched Rating for ${userRow.anilist_username} (AL ID: ${g.user.id}): ${score || 'None found'}`, 'Scheduler');
                const guild = client.guilds.cache.get(guildId);
                const member = guild ? await guild.members.fetch(userRow.user_id).catch(() => null) : null;
                const username = member ? member.displayName : g.user.name;

                const userMeta = {
                    username: username.toUpperCase(),
                    themeColor: userColor,
                    avatarUrl: userAvatar.customUrl || (member ? member.user.displayAvatarURL({ extension: 'png' }) : null)
                };

                const buffer = await generateActivityCard(userMeta, { 
                    ...g, 
                    progress: finalProgress, 
                    score: score 
                });
                
                const attachmentName = g.media.isAdult ? `SPOILER_activity-${g.media.id}.webp` : `activity-${g.media.id}.webp`;
                const attachment = new AttachmentBuilder(buffer, { name: attachmentName });
                
                // Calculate binge status for logging
                const finalProgStr = String(finalProgress || '');
                const rangeNums = finalProgStr.split(/[-–—/]/).map(n => parseInt(n.trim())).filter(n => !isNaN(n));
                const bingeMode = rangeNums.length >= 2 && (Math.max(...rangeNums) - Math.min(...rangeNums) + 1) > 5;
                const isManga = g.media.type === 'MANGA' || (g.status || '').toLowerCase().includes('read');
                const verb = bingeMode ? (isManga ? 'BINGE READ' : 'BINGED') : (isManga ? 'READ' : 'WATCHED');

                logger.info(`[Activity Broadcast] 🚀 Sending ${verb} card for ${userRow.anilist_username} to ${channel.name} (${channel.id})`, 'Scheduler');
                const newMsg = await channel.send({ files: [attachment] });

                // 4. Mark AS POSTED with session metadata for future merges (Skip in development for repeated testing)
                if (!client.isTestBot) {
                    await markPosted(g.ids, {
                        userId: userRow.user_id,
                        mediaId: g.media.id,
                        channelId: channel.id,
                        messageId: newMsg.id, // Fixed typo: was message_id, DB uses messageId in the mapper
                        progress: finalProgress,
                        status: g.status
                    });
                } else {
                    logger.info(`[Activity Feed] Post NOT marked as posted (Test Bot Mode).`, 'Scheduler');
                }

            } catch (err) {
                logger.error(`[Activity Feed] Generation Error:`, err, 'Scheduler');
            }
        }

    } catch (error) {
        if (error.message === 'AL_MAINTENANCE') {
            logger.info(`[Activity Feed] Skipping ${userRow.anilist_username}: AniList is in maintenance mode.`, 'Scheduler');
        } else {
            logger.error(`[Activity Feed] Burst Polling failure:`, error, 'Scheduler');
        }
    }
};

/**
 * Checks for recent AniList activity updates and broadcasts to configured channels.
 * @param {Client} client - Discord Client
 */
const checkUserActivity = async (client) => {
    if (isActivityPolling) return;
    isActivityPolling = true;

    try {
        // --- 🧹 Cleanup legacy records (72h TTL) ---
        clearOldActivityPostsInDB().catch(() => null);

        logger.info('[Scheduler] Pulse: Activity Feed checks across all guilds starting...', 'Scheduler');
        const guilds = Array.from(client.guilds.cache.values());
        if (guilds.length === 0) {
            logger.info('[Scheduler] Pulse: No guilds to check for activity.', 'Scheduler');
            return;
        }
        
        for (const guild of guilds) {
            try {
                logger.info(`[Scheduler] Fetching config for Guild: ${guild.id}`, 'Scheduler');
                const config = await fetchConfig(guild.id);
                logger.debug(`[Scheduler] Config found for ${guild.id}: ${!!config}`, 'Scheduler');
                
                if (!config || !config.activity_channel_id) {
                    logger.info(`[Scheduler] Skipping guild ${guild.id}: No activity channel.`, 'Scheduler');
                    continue;
                }

                logger.info(`[Scheduler] Fetching linked users for Guild: ${guild.id}`, 'Scheduler');
                const linkedUsers = await getLinkedUsersForFeed(guild.id);
                logger.info(`[Scheduler] Found ${linkedUsers.length} linked user(s) in guild ${guild.id}`, 'Scheduler');
                if (linkedUsers.length === 0) continue;

                const channel = await guild.channels.fetch(config.activity_channel_id).catch(() => null);
                if (!channel) {
                    logger.warn(`[Scheduler] Could not fetch channel ${config.activity_channel_id} in guild ${guild.id}`, 'Scheduler');
                    continue;
                }

                for (const userRow of linkedUsers) {
                    logger.info(`[Scheduler] Processing activity for user: ${userRow.anilist_username}`, 'Scheduler');
                    // Rate limit padding
                    await new Promise(r => setTimeout(r, 600));

                    // --- 🏁 Safety Race: Timeout protection per user scan ---
                    const scanTimeout = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('USER_SCAN_TIMEOUT')), 30000)
                    );

                    try {
                        await Promise.race([
                            checkAndBroadcastUserActivity(client, guild.id, userRow, channel),
                            scanTimeout
                        ]);
                    } catch (err) {
                        if (err.message === 'USER_SCAN_TIMEOUT') {
                            logger.warn(`[Scheduler] ⚠️ Scan for ${userRow.anilist_username} timed out (30s). Skipping to protect pulse health.`, 'Scheduler');
                        } else {
                            throw err; // Re-throw other errors to the guild boundary
                        }
                    }
                }
            } catch (guildError) {
                logger.error(`[Scheduler] Guild Polling Error (${guild.id}):`, guildError, 'Scheduler');
            }
        }
    } finally {
        isActivityPolling = false;
        lastActivityPulse = Date.now();
    }
};

/**
 * Technical Diagnostics for Watchdog
 */
const getPulseStatus = () => ({
    airing: lastAiringPulse,
    activity: lastActivityPulse,
    isAiringBusy: isAiringPolling,
    isActivityBusy: isActivityPolling
});

module.exports = { checkAiringAnime, checkUserActivity, checkAndBroadcastUserActivity, sendNotifications, getPulseStatus };
