const { getUserRank, getLevelProgress } = require('../services/leveling');
const { getAniListProfile } = require('../services/anilistService');
const { 
    getUserColor, 
    getUserTitle, 
    getUserBannerConfig, 
    getUserAvatarConfig, 
    getLinkedAnilist, 
    fetchConfig,
    getOwnedTitles,
    getLevelRoles
} = require('./database');
const { resolveBannerUrl } = require('./visualUtils');
const logger = require('./logger');

// Session-based AniList Cache (TTL: 60s)
const anilistCache = new Map();

/**
 * Gathers a complete, unified snapshot of a user's profile context.
 * Optimized for high-frequency dashboard interactions.
 */
const getProfileContext = async (userId, guildId, client, forceAniList = false) => {
    try {
        // 1. Parallel Archival Fetch (Core DB Data)
        const [
            dbColor, 
            dbTitle, 
            bannerConfig, 
            ownedTitlesRaw, 
            config, 
            rankData, 
            linkedUsername, 
            avatarConfig,
            levelRoles
        ] = await Promise.all([
            getUserColor(userId, guildId),
            getUserTitle(userId, guildId),
            getUserBannerConfig(userId, guildId),
            getOwnedTitles(userId),
            fetchConfig(guildId),
            getUserRank(userId, guildId),
            getLinkedAnilist(userId, guildId),
            getUserAvatarConfig(userId, guildId),
            getLevelRoles(guildId)
        ]);

        // 2. Member Reconstruction
        let member = null;
        try {
            const guild = await client.guilds.fetch(guildId);
            member = await guild.members.fetch(userId);
        } catch (e) {
            // Member might not be in the guild, fallback to user object later
        }

        const user = member ? member.user : await client.users.fetch(userId);

        // 3. Leveling & Identity Meta
        const xp = rankData ? parseInt(rankData.xp) : 0;
        const level = rankData ? parseInt(rankData.level) : 0;
        const progress = getLevelProgress(xp, level);

        const earnedLevelRoles = levelRoles.filter(lr => lr.level <= level);
        let knowledgeRank = 'Muse Reader';
        let rankColor = dbColor || '#FFACD1';

        // Integrate earned titles into the owned list
        const ownedTitles = [...ownedTitlesRaw];
        if (!ownedTitles.includes('Muse Reader')) ownedTitles.unshift('Muse Reader');

        for (const lr of earnedLevelRoles) {
            try {
                const guild = await client.guilds.fetch(guildId);
                const role = guild.roles.cache.get(lr.role_id);
                if (role) {
                    const redactedName = role.name.replace(/^\d+\s*\|\s*/, '');
                    if (!ownedTitles.includes(redactedName)) ownedTitles.push(redactedName);
                    knowledgeRank = redactedName;
                    if (role.color) rankColor = `#${role.color.toString(16).padStart(6, '0')}`;
                }
            } catch (e) {
                // Guild or role fetch failed
            }
        }

        // Special Status Logic (Premium/Booster titles are typically 'topmost')
        const isBooster = member ? !!member.premiumSince : false;
        const isPremium = member ? (
            member.permissions.has('Administrator') || 
            (config.premium_role_id && member.roles.cache.has(config.premium_role_id)) ||
            member.roles.cache.some(r => ['Benefactor', 'Patron', 'Seraphic Muse'].some(id => r.name.includes(id)))
        ) : false;

        if (isBooster) {
            if (!ownedTitles.includes('Server Booster')) ownedTitles.push('Server Booster');
            knowledgeRank = 'Server Booster'; // Promote to topmost
        }
        if (isPremium) {
            if (!ownedTitles.includes('Seraphic Muse')) ownedTitles.push('Seraphic Muse');
            knowledgeRank = 'Seraphic Muse'; // Highest priority
        }

        // Final Title Resolution: Custom > Topmost Earned
        const finalTitle = dbTitle || knowledgeRank;

        // 4. Force Fetch for Banner Data (Discord cache doesn't always have .banner)
        if (!user.banner) {
            try { await user.fetch(true); } catch (e) { /* ignore */ }
        }

        // 5. AniList Telemetry (With Session Caching)
        let anilistStats = { completed: 0, days: 0, meanScore: 0 };
        let favorites = [];
        let anilistAvatar = null;

        if (linkedUsername) {
            const cacheKey = `${userId}:${linkedUsername}`;
            let alRes = anilistCache.get(cacheKey);
            
            if (!alRes || forceAniList || (Date.now() - alRes.timestamp > 60000)) {
                try {
                    alRes = await getAniListProfile(linkedUsername);
                    alRes.timestamp = Date.now();
                    anilistCache.set(cacheKey, alRes);
                } catch (e) {
                    logger.warn(`AniList Sync Interrupted for ${linkedUsername}. Using baseline telemetry.`, 'ProfileContext');
                    alRes = alRes || { stats: anilistStats, favorites, avatar: null };
                }
            }

            anilistStats = alRes.stats || anilistStats;
            favorites = alRes.favorites || favorites;
            anilistAvatar = alRes.avatar;
            
            if (avatarConfig && avatarConfig.source === 'ANILIST') {
                avatarConfig.anilistAvatar = anilistAvatar;
            }
        }

        // 5. Visual Resolution
        const bannerUrl = await resolveBannerUrl(user, member, bannerConfig);

        return {
            user,
            member,
            guildId,
            settings: {
                color: dbColor || '#FFACD1',
                title: finalTitle,
                bannerConfig,
                avatarConfig,
                rankColor,
                knowledgeRank,
                isPremium,
                isBooster,
                ownedTitles
            },
            stats: {
                xp,
                level,
                rank: rankData ? rankData.rank : '?',
                progress,
                messages: Math.floor(xp / 20),
                joinedDate: member ? member.joinedAt.toLocaleDateString() : 'Unknown'
            },
            anilist: {
                synced: !!linkedUsername,
                stats: anilistStats,
                favorites,
                maintenance: !!(anilistCache.get(`${userId}:${linkedUsername}`)?.maintenance)
            },
            visuals: {
                bannerUrl,
                discordBannerUrl: user.bannerURL({ size: 1024, extension: 'png' }) || (member ? member.displayAvatarURL({ extension: 'png' }) : null), // Fallback to avatar-based colors if no banner
                guildAvatarUrl: member ? member.displayAvatarURL({ extension: 'png' }) : user.displayAvatarURL({ extension: 'png' })
            }
        };

    } catch (err) {
        logger.error('Critical Profile Context Collapse:', err, 'ProfileContext');
        throw err;
    }
};

module.exports = { getProfileContext };
