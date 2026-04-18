const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();
const logger = require('./utils/core/logger');
const { loadCustomFonts } = require('./utils/core/fonts');
const supabase = require('./utils/services/userService').supabase; // Accessing internal supabase if exposed, or requiring client
const userService = require('./utils/services/userService');

// Initialize Fonts
loadCustomFonts();

/**
 * Fetches a real Discord user from the API using the bot token.
 */
async function fetchRealDiscordUser(userId) {
    if (!userId) return null;
    try {
        const response = await axios.get(`https://discord.com/api/v10/users/${userId}`, {
            headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` }
        });
        const data = response.data;
        
        // Mock the User object structure expected by generators
        return {
            id: data.id,
            username: data.username,
            discriminator: data.discriminator,
            avatar: data.avatar,
            displayAvatarURL: ({ extension = 'webp', size = 1024 } = {}) => {
                if (!data.avatar) return 'https://cdn.discordapp.com/embed/avatars/0.png';
                return `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.${extension}?size=${size}`;
            }
        };
    } catch (error) {
        logger.error(`Discord API Fetch Failed for ${userId}:`, error.message, 'Preview');
        return null;
    }
}

/**
 * Fetches synced Anilist and metadata from Supabase.
 */
async function fetchRealUserData(userId) {
    if (!userId) return null;
    try {
        // Query the first guild we find for this user (since preview is agnostic)
        const anilistUsername = await userService.getLinkedAnilist(userId, null); // userService handles null/missing guild better usually, but lets be safe
        const title = await userService.getUserTitle(userId, null);
        const color = await userService.getUserColor(userId, null);
        const banner = await userService.getUserBannerConfig(userId, null);
        const avatarConfig = await userService.getUserAvatarConfig(userId, null);

        return {
            anilist_username: anilistUsername,
            title,
            color,
            banner,
            avatarConfig
        };
    } catch (error) {
        logger.error(`Supabase Fetch Failed for ${userId}:`, error.message, 'Preview');
        return null;
    }
}

const generators = {
    profile: async (userId = null, isBatch = false) => {
        const { generateProfileCard } = require('./utils/generators/profileGenerator');
        const { getAniListProfile } = require('./utils/services/anilistService');
        
        let discordUser = { id: '2829283727372', username: 'Librarian Cxllion', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' };
        let userData = { anilist_synced: true, current: 840, required: 1000, level: 25, title: 'CHART LIBRARIAN', is_booster: false, is_premium: false, anilist: { completed: 840, manga_completed: 120, days: 124.5 }, avatarConfig: { source: 'DISCORD_GLOBAL' } };
        let favorites = [];
        let banner = 'https://i.imgur.com/r9S6BfB.png';
        let themeColor = '#8B5CF6';

        if (userId) {
            const realUser = await fetchRealDiscordUser(userId);
            if (realUser) {
                discordUser = realUser;
                const dbData = await fetchRealUserData(userId);
                if (dbData) {
                    userData.title = dbData.title;
                    themeColor = dbData.color;
                    userData.avatarConfig = dbData.avatarConfig;
                    banner = dbData.banner;
                    if (dbData.anilist_username) {
                        const alRes = await getAniListProfile(dbData.anilist_username);
                        userData.anilist = alRes.stats;
                        favorites = alRes.favorites;
                        if (alRes.banner) banner = alRes.banner;
                        userData.anilist_synced = true;
                    } else {
                        userData.anilist_synced = false;
                    }
                }
            }
        }

        if (!isBatch) {
            return await generateProfileCard(discordUser, userData, favorites, banner, themeColor);
        }

        // Batch Mode: Scenario Matrix
        const scenarios = [
            { name: 'standard_linked', data: { ...userData, is_premium: false, is_booster: false, anilist_synced: true } },
            { name: 'premium_linked', data: { ...userData, is_premium: true, is_booster: false, anilist_synced: true } },
            { name: 'booster_linked', data: { ...userData, is_premium: false, is_booster: true, anilist_synced: true } },
            { name: 'standard_compact', data: { ...userData, is_premium: false, is_booster: false, anilist_synced: false } },
            { name: 'premium_compact', data: { ...userData, is_premium: true, is_booster: false, anilist_synced: false } },
            { name: 'booster_compact', data: { ...userData, is_premium: false, is_booster: true, anilist_synced: false } }
        ];

        const results = [];
        for (const s of scenarios) {
            const buffer = await generateProfileCard(discordUser, s.data, favorites, banner, themeColor);
            results.push({ name: s.name, buffer });
        }
        return results;
    },
    welcome: async () => {
        const { generateWelcomeCard } = require('./utils/generators/welcomeGenerator');
        const mockMember = {
            displayHexColor: '#8B5CF6',
            displayName: 'New Archivist',
            guild: { memberCount: 1234 },
            user: { 
                username: 'new_member',
                displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/1.png'
            }
        };
        return await generateWelcomeCard(mockMember);
    },
    activity: async (userId = null, isBatch = false) => {
        const { generateActivityCard } = require('./utils/generators/activityGenerator');
        const userMeta = {
            username: 'Cxllion',
            avatarUrl: 'https://cdn.discordapp.com/embed/avatars/2.png',
            themeColor: '#8B5CF6'
        };

        const baseActivity = {
            media: {
                title: { english: 'Code Geass: Lelouch of the Rebellion', romaji: 'Code Geass: Hangyaku de Lelouch' },
                coverImage: { extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1575-YI646R5i4dK9.png', color: '#8B5CF6' },
                bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/1575-S7X0mZfY7YIu.jpg',
                averageScore: 87,
                format: 'TV'
            },
            status: 'watching',
            progress: '12',
            score: 9.5,
            scoreFormat: 'POINT_10_DECIMAL',
            bingeMode: false
        };

        if (!isBatch) {
            return await generateActivityCard(userMeta, baseActivity);
        }

        const scenarios = [
            { name: 'watching', data: { ...baseActivity, status: 'watching', progress: '12' } },
            { name: 'completed', data: { ...baseActivity, status: 'completed', progress: '25' } },
            { name: 'binge', data: { ...baseActivity, status: 'watched episode', progress: '1-12', bingeMode: true } },
            { name: 'nsfw', data: { ...baseActivity, media: { ...baseActivity.media, isAdult: true } } },
            { name: 'manga', data: { ...baseActivity, status: 'read chapter', progress: '45', media: { ...baseActivity.media, type: 'MANGA', format: 'MANGA' } } }
        ];

        const results = [];
        for (const s of scenarios) {
            const buffer = await generateActivityCard(userMeta, s.data);
            results.push({ name: s.name, buffer });
        }
        return results;
    },
    airing: async () => {
        const { generateAiringCard } = require('./utils/generators/airingGenerator');
        const media = {
            title: { english: 'Oshino Ko Season 2', romaji: 'Oshino Ko 2' },
            coverImage: { extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx166258-m0f3V7z9j1pX.png', color: '#00E676' },
            bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/166258-9yR9A7p6x8G1.jpg',
            genres: ['Drama', 'Supernatural'],
            studios: { edges: [{ isMain: true, node: { name: 'Doga Kobo' } }] }
        };
        const episode = { episode: 1 };
        const trackers = [
            { username: 'Librarian', avatarURL: 'https://cdn.discordapp.com/embed/avatars/3.png' },
            { username: 'Assistant', avatarURL: 'https://cdn.discordapp.com/embed/avatars/4.png' }
        ];
        return await generateAiringCard(media, episode, trackers, '#00E676');
    },
    leaderboard: async () => {
        const { generateLeaderboard } = require('./utils/generators/leaderboardGenerator');
        const challenger = { 
            username: 'You', 
            displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' 
        };
        const challengerData = { rank: 4, level: 25, xp: 8400, percent: 0.7 };
        const topUsers = Array.from({ length: 10 }, (_, i) => ({
            username: `User ${i+1}`,
            level: 50 - i,
            avatarUrl: `https://cdn.discordapp.com/embed/avatars/${i % 5}.png`
        }));
        return await generateLeaderboard(challenger, challengerData, topUsers, null, '#8B5CF6');
    },
    search: async () => {
        const { generateSearchCard } = require('./utils/generators/searchGenerator');
        const media = {
            title: { english: 'Cyberpunk: Edgerunners', romaji: 'Cyberpunk: Edgerunners' },
            coverImage: { extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx120377-S7InT96Z0m8V.png', color: '#F1C40F' },
            bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/120377-atI6uS3o1U8U.jpg',
            description: 'In a dystopia riddled with corruption and cybernetic implants, a talented but reckless street kid strives to become an edgerunner: a mercenary outlaw also known as a cyberpunk.',
            format: 'ONA',
            seasonYear: 2022,
            status: 'FINISHED',
            averageScore: 86,
            genres: ['Action', 'Sci-Fi', 'Psychological'],
            studios: { edges: [{ isMain: true, node: { name: 'Trigger' } }] }
        };
        return await generateSearchCard(media, '#F1C40F');
    },
    bingo: async () => {
        const { generateBingoCard } = require('./utils/generators/bingoGenerator');
        const card = {
            title: 'Winter 2024 Bingo',
            size: 3,
            entries: Array.from({ length: 9 }, (_, i) => ({
                title: `Anime ${i+1}`,
                coverImage: `https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx${1500 + i}-yYI9A7p6x8G1.png`,
                status: i % 2 === 0 ? 'COMPLETED' : 'PLANNING'
            }))
        };
        const mockUser = { username: 'Tester' };
        return await generateBingoCard(card, mockUser, '#8B5CF6');
    },
    wordle: async () => {
        const wordleGenerator = require('./utils/generators/wordleGenerator');
        const gameState = {
            guesses: [
                { word: 'anime', result: [2, 0, 1, 0, 0] },
                { word: 'manga', result: [1, 2, 2, 0, 2] }
            ],
            status: 'PLAYING',
            targetWord: 'MAGIC'
        };
        return await wordleGenerator.generateBoard(gameState);
    },
    mafia_role: async (roleName = null, isBatch = false) => {
        const { generateRoleCard } = require('./utils/generators/mafia/roleGenerator');
        const { Archivist, Revision, TheConservator, TheShredder, TheIndexer, TheHeadCurator, TheGhostwriter, TheScribe, TheCensor, ThePlagiarist, TheCorruptor, TheAnomaly, TheCritic, TheBookburner } = require('./utils/mafia/MafiaRoles');
        
        const roleCatalog = [
            new Archivist(), new Revision(), new TheConservator(), new TheShredder(), 
            new TheIndexer(), new TheHeadCurator(), new TheGhostwriter(), new TheScribe(), 
            new TheCensor(), new ThePlagiarist(), new TheCorruptor(), new TheAnomaly(), 
            new TheCritic(), new TheBookburner()
        ];

        if (!isBatch) {
            const target = roleCatalog.find(r => r.name.toLowerCase().includes(roleName?.toLowerCase())) || roleCatalog[0];
            return await generateRoleCard(target, 'Subject_Cxllion', 'The Final Library');
        }

        const results = [];
        for (const role of roleCatalog) {
            const buffer = await generateRoleCard(role, 'TEST_SUBJECT', 'ARCHIVE_CORE');
            results.push({ name: role.name.replace(/\s+/g, '_').toLowerCase(), buffer });
        }
        return results;
    }
};

async function runPreview() {
    const target = process.argv[2] || 'profile';
    const arg3 = process.argv[3];
    const arg4 = process.argv[4];

    let userId = null;
    let isBatch = false;

    if (arg3 === 'batch') {
        isBatch = true;
    } else if (arg3) {
        userId = arg3;
        if (arg4 === 'batch') isBatch = true;
    }

    if (!generators[target]) {
        console.log(`\n❌ Unknown generator: "${target}"`);
        console.log(`Available units: ${Object.keys(generators).join(', ')}\n`);
        process.exit(1);
    }

    const typeMsg = isBatch ? `[${target.toUpperCase()} BATCH]` : (userId ? `[${target.toUpperCase()}] for User ID: ${userId}` : `[${target.toUpperCase()}]`);
    logger.info(`Initiating Neural Preview for: ${typeMsg}`, 'Preview');
    try {
        const result = await generators[target](userId, isBatch);
        
        const ext = target === 'profile' ? 'png' : 'webp';

        if (Array.isArray(result)) {
            for (const item of result) {
                const outputPath = path.join(__dirname, 'previews', `live_${target}_${item.name}.${ext}`);
                fs.writeFileSync(outputPath, item.buffer);
                logger.info(`✨ Pulse Success: ${outputPath}`, 'Preview');
            }
        } else {
            const outputPath = path.join(__dirname, 'previews', `live_${target}.${ext}`);
            fs.writeFileSync(outputPath, result);
            logger.info(`✨ Pulse Success: ${outputPath}`, 'Preview');
        }
    } catch (error) {
        logger.error(`Preview Reconstruction Failed:`, error, 'Preview');
    }
}

runPreview();
