const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder , MessageFlags } = require('discord.js');
const { generateAiringCard } = require('../generators/airingGenerator');
const { watchInteraction } = require('../handlers/interactionManager');
const { queryAnilist, getUserActivity, getUserMediaScore } = require('./anilistService');
const {
    getAllTrackersForAnime,
    getTrackedAnimeState,
    updateTrackedAnimeState,
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
        logger.error('[Scheduler] Error in batch processing:', e, 'Scheduler');
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
        attachment = new AttachmentBuilder(buffer, { name: `airing-${media.id}.webp` });
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
const { wasPostedInDB, markPostedInDB } = require('./userService');
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
        const weekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
        const pruned = {};
        for (const [id, ts] of Object.entries(cache)) {
            if (ts > weekAgo) pruned[id] = ts;
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

const markPosted = async (activityIds) => {
    // Try DB first
    const savedToDB = await markPostedInDB(activityIds);
    if (!savedToDB) {
        // DB table doesn't exist yet — use local file fallback
        const cache = loadFileCache();
        const now = Math.floor(Date.now() / 1000);
        activityIds.forEach(id => { cache[String(id)] = now; });
        saveFileCache(cache);
    }
};

// 24-hour window (Unix timestamp)
const get24hCutoff = () => Math.floor(Date.now() / 1000) - 24 * 60 * 60;

/**
 * Burst Logic: Fetches AniList activities for a user, filters to 24h window,
 * groups sequential episodes into combined cards, skips already-posted IDs.
 */
const checkAndBroadcastUserActivity = async (client, guildId, userRow, channel) => {
    try {
        const activities = await getUserActivity(userRow.anilist_username);
        if (!activities || activities.length === 0) return;

        const cutoff = get24hCutoff();

        // Grouping logic: find unique media pieces being updated
        const groups = new Map();

        for (const act of activities) {
            // Skip if older than 24 hours
            if (act.createdAt && act.createdAt < cutoff) continue;
            // Skip if already posted (persistent dedup via file/DB cache)
            if (await wasPosted(act.id)) continue;
            // Skip non-media activities (e.g. text status posts)
            if (!act.media) continue;
            
            const mediaId = act.media.id;
            const status = (act.status || '').toLowerCase();
            const groupKey = `${mediaId}_${status}`;
            
            if (!groups.has(groupKey)) {
                groups.set(groupKey, { 
                    media: act.media, 
                    status: act.status, 
                    user: act.user, 
                    ids: [], 
                    progress: [] 
                });
            }
            const g = groups.get(groupKey);
            g.ids.push(act.id);
            if (act.progress) g.progress.push(parseInt(act.progress) || act.progress);
        }

        if (groups.size === 0) {
            logger.info(`[Activity Feed] No new activities to post for ${userRow.anilist_username} (all within 24h window were already posted or empty).`, 'Scheduler');
            return;
        }

        logger.info(`[Activity Feed] Burst Mode: Processed ${activities.length} total, creating ${groups.size} distinct cards. (User: ${userRow.anilist_username})`, 'Scheduler');

        // Process each Group
        for (const [key, g] of groups) {
            try {
                // Determine Range (e.g. 1-5 or just 5)
                let displayProgress = '';
                if (g.progress.length > 0) {
                    const nums = g.progress.filter(p => typeof p === 'number').sort((a,b) => a - b);
                    if (nums.length > 1) {
                        displayProgress = `${nums[0]}-${nums[nums.length-1]}`;
                    } else {
                        displayProgress = g.progress[0];
                    }
                }

                // Render Card
                const userColor = await getUserColor(userRow.user_id, guildId);
                const userAvatar = await getUserAvatarConfig(userRow.user_id, guildId);

                const score = await getUserMediaScore(g.user.id, g.media.id);

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
                    progress: displayProgress, 
                    score: score 
                });

                const attachment = new AttachmentBuilder(buffer, { name: `burst-${g.media.id}.webp` });
                await channel.send({ files: [attachment] });

                // Persistently mark all IDs in this group so they're never re-posted
                await markPosted(g.ids);

            } catch (err) {
                logger.error(`[Activity Feed] Generation Error:`, err, 'Scheduler');
            }
        }

    } catch (error) {
        logger.error(`[Activity Feed] Burst Polling failure:`, error, 'Scheduler');
    }
};

/**
 * Checks for recent AniList activity updates and broadcasts to configured channels.
 * @param {Client} client - Discord Client
 */
const checkUserActivity = async (client) => {
    const guilds = Array.from(client.guilds.cache.values());
    
    for (const guild of guilds) {
        try {
            const config = await fetchConfig(guild.id);
            if (!config || !config.activity_channel_id) continue;

            const channel = await guild.channels.fetch(config.activity_channel_id).catch(() => null);
            if (!channel) continue;

            const linkedUsers = await getLinkedUsersForFeed(guild.id);
            if (linkedUsers.length === 0) continue;

            for (const userRow of linkedUsers) {
                // Rate limit padding
                await new Promise(r => setTimeout(r, 600));
                await checkAndBroadcastUserActivity(client, guild.id, userRow, channel);
            }
        } catch (guildError) {
            logger.error(`[Scheduler] Guild Polling Error (${guild.id}):`, guildError, 'Scheduler');
        }
    }
};

module.exports = { checkAiringAnime, checkUserActivity, checkAndBroadcastUserActivity, sendNotifications };
