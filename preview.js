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
        
        let discordUser = { 
            id: '2829283727372', 
            username: 'Librarian Cxllion', 
            displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
            bannerURL: () => 'https://cdn.discordapp.com/attachments/1389956408145084537/1501265930582495232/1d15f13ca41fbd506b98a7ea0cd0cbe1.jpg' // A known valid banner for preview
        };
        let userData = { 
            anilist_synced: true, 
            current: 840, 
            required: 1000, 
            level: 25, 
            title: 'CHART LIBRARIAN', 
            is_booster: false, 
            is_premium: false, 
            anilist: { completed: 840, manga_completed: 120, days: 124.5 }, 
            avatarConfig: { source: 'DISCORD_GLOBAL' },
            discordBannerUrl: 'https://cdn.discordapp.com/attachments/1389956408145084537/1501265930582495232/1d15f13ca41fbd506b98a7ea0cd0cbe1.jpg'
        };
        let favorites = [];
        let banner = path.join(__dirname, 'utils', 'generators', 'images', 'profile_background_default.png');
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
                        if (alRes.avatar) userData.anilistAvatar = alRes.avatar;
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

        // Batch Mode: Scenario Matrix with varying Theme Colors
        const scenarios = [
            { name: 'standard_linked', color: '#3B82F6', data: { ...userData, is_premium: false, is_booster: false, anilist_synced: true } },
            { name: 'standard_nobanner', color: '#3B82F6', data: { ...userData, is_premium: false, is_booster: false, anilist_synced: true, discordBannerUrl: null }, banner: null },
            { name: 'standard_compact_nobanner', color: '#10b981', data: { ...userData, is_premium: false, is_booster: false, anilist_synced: false, discordBannerUrl: null }, banner: null },
            { name: 'white_linked', color: '#FFFFFF', data: { ...userData, is_premium: false, is_booster: false, anilist_synced: true } },
            { name: 'premium_linked', color: '#3B82F6', data: { ...userData, is_premium: true, is_booster: false, anilist_synced: true } },
            { name: 'booster_linked', color: '#3B82F6', data: { ...userData, is_premium: false, is_booster: true, anilist_synced: true } },
            { name: 'standard_compact', color: '#10b981', data: { ...userData, is_premium: false, is_booster: false, anilist_synced: false } },
            { name: 'premium_compact', color: '#06b6d4', data: { ...userData, is_premium: true, is_booster: false, anilist_synced: false } },
            { name: 'booster_compact', color: '#f43f5e', data: { ...userData, is_premium: false, is_booster: true, anilist_synced: false } }
        ];
 
        const results = [];
        for (const s of scenarios) {
            const currentBanner = s.hasOwnProperty('banner') ? s.banner : banner;
            const buffer = await generateProfileCard(discordUser, s.data, favorites, currentBanner, s.color);
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
                title: { english: 'Cowboy Bebop', romaji: 'Cowboy Bebop' },
                coverImage: { extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1-995662.jpg', color: '#8B5CF6' },
                bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/1-979z79.jpg',
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
    leaderboard: async (userId = null, isBatch = false) => {
        const { generateLeaderboard } = require('./utils/generators/leaderboardGenerator');
        const { generateMinigameLeaderboard } = require('./utils/generators/minigameLeaderboardGenerator');
        
        const challenger = { 
            username: 'Tester', 
            displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' 
        };
        const challengerData = { 
            rank: 4, level: 25, xp: 8400, current: 840, required: 1200, percent: 70,
            bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/166258-9yR9A7p6x8G1.jpg'
        };
        const topUsers = Array.from({ length: 10 }, (_, i) => ({
            username: `User ${i+1}`,
            level: 50 - i,
            avatarUrl: `https://cdn.discordapp.com/embed/avatars/${i % 5}.png`,
            isBooster: i === 4 || i === 8,
            isPremium: i === 5 || i === 7
        }));

        // EXP Variants
        const bufferExpRegular = await generateLeaderboard(challenger, { ...challengerData, isPremium: false, isBooster: false }, topUsers, null, '#8B5CF6', challenger.username, challenger.displayAvatarURL());
        const bufferExpPremium = await generateLeaderboard(challenger, { ...challengerData, isPremium: true, isBooster: false }, topUsers, null, '#D4AF37', challenger.username, challenger.displayAvatarURL());
        const bufferExpBooster = await generateLeaderboard(challenger, { ...challengerData, isPremium: false, isBooster: true }, topUsers, null, '#FFACD1', challenger.username, challenger.displayAvatarURL());
        const bufferExpWhite   = await generateLeaderboard(challenger, { ...challengerData, isPremium: false, isBooster: false }, topUsers, null, '#FFFFFF', challenger.username, challenger.displayAvatarURL());

        const miniStats = { rank: 12, total_points: 4500 };
        const topMini = Array.from({ length: 10 }, (_, i) => ({
            username: `Pro ${i+1}`,
            total_points: 10000 - (i * 500)
        }));
        const miniChallenger = {
            username: challenger.username,
            avatarUrl: challenger.displayAvatarURL(),
            stats: miniStats
        };
        const miniChallengerData = {
            rank: 12, level: 12, xp: 4500, current: 4500, required: 10000, percent: 45,
            bannerUrl: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/166258-9yR9A7p6x8G1.jpg'
        };
        const bufferMini = await generateMinigameLeaderboard(miniChallenger, miniChallengerData, topMini, null, '#3B82F6', miniChallenger.username, miniChallenger.avatarUrl);

        return [
            { name: 'exp_regular', buffer: bufferExpRegular },
            { name: 'exp_premium', buffer: bufferExpPremium },
            { name: 'exp_booster', buffer: bufferExpBooster },
            { name: 'exp_white', buffer: bufferExpWhite },
            { name: 'arcade', buffer: bufferMini }
        ];
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
                { word: 'ANIME', result: [2, 0, 1, 0, 0] },
                { word: 'MANGA', result: [1, 2, 2, 0, 2] }
            ],
            status: 'PLAYING',
            targetWord: 'MAGIC'
        };

        const mockOtherGames = [
            { 
                userId: '123', 
                guesses: [{ word: 'GHOST', result: [2, 0, 0, 1, 0] }], 
                user: { username: 'Gold', avatarURL: 'https://cdn.discordapp.com/embed/avatars/0.png' },
                status: 'WON',
                solvedOrder: 1
            },
            { 
                userId: '456', 
                guesses: [{ word: 'PLANE', result: [0, 1, 2, 0, 0] }, { word: 'MUSIC', result: [1, 0, 0, 0, 2] }], 
                user: { username: 'Silver', avatarURL: 'https://cdn.discordapp.com/embed/avatars/1.png' },
                status: 'WON',
                solvedOrder: 2
            },
            {
                userId: '789',
                guesses: [{ word: 'TESTA', result: [0,0,0,0,0] }],
                user: { username: 'Bronze', avatarURL: 'https://cdn.discordapp.com/embed/avatars/2.png' },
                status: 'WON',
                solvedOrder: 3
            },
            {
                userId: '101',
                guesses: [{ word: 'TESTB', result: [1,1,1,1,1] }],
                user: { username: 'Green', avatarURL: 'https://cdn.discordapp.com/embed/avatars/3.png' },
                status: 'WON',
                solvedOrder: 4
            },
            {
                userId: '102',
                guesses: [{ word: 'TESTC', result: [2,2,2,2,0] }],
                user: { username: 'Red', avatarURL: 'https://cdn.discordapp.com/embed/avatars/4.png' },
                status: 'LOST',
                solvedOrder: null
            }
        ];

        const user = { username: 'Librarian Cxllion', avatarURL: 'https://cdn.discordapp.com/embed/avatars/0.png' };

        const bufferPrivate = await wordleGenerator.generateBoard(gameState, { anonymize: false, user });
        const bufferPublic = await wordleGenerator.generateBoard(gameState, { anonymize: true, user, otherGames: mockOtherGames });

        return [
            { name: 'private', buffer: bufferPrivate },
            { name: 'public', buffer: bufferPublic }
        ];
    },
    connect4: async () => {
        const connect4Generator = require('./utils/generators/connect4Generator');
        const connect4Engine = require('./utils/core/connect4Engine');
        
        const options = {
            p1Data: { username: 'Librarian', displayName: 'Librarian Cxllion', avatarURL: 'https://cdn.discordapp.com/embed/avatars/0.png' },
            p2Data: { username: 'Drone', displayName: 'Rogue Drone', avatarURL: 'https://cdn.discordapp.com/embed/avatars/1.png' }
        };

        const scenarios = [];

        // 1. Player 1 Turn
        const board1 = connect4Engine.createBoard();
        board1[5][3] = 2; // P2 moved
        scenarios.push({
            name: 'p1_turn',
            buffer: await connect4Generator.generateBoard({
                id: 'c4_p1_turn', board: board1, player1: '111', player2: '222', currentTurn: '111', status: 'PLAYING'
            }, options)
        });

        // 2. Player 2 Turn
        const board2 = connect4Engine.createBoard();
        board2[5][3] = 1; // P1 moved
        scenarios.push({
            name: 'p2_turn',
            buffer: await connect4Generator.generateBoard({
                id: 'c4_p2_turn', board: board2, player1: '111', player2: '222', currentTurn: '222', status: 'PLAYING'
            }, options)
        });

        // 3. Player 1 Win
        const board3 = connect4Engine.createBoard();
        for(let i=0; i<4; i++) board3[5-i][0] = 1;
        board3[5][1] = 2; board3[4][1] = 2; board3[3][1] = 2;
        scenarios.push({
            name: 'p1_win',
            buffer: await connect4Generator.generateBoard({
                id: 'c4_p1_win', board: board3, player1: '111', player2: '222', currentTurn: '222', 
                status: 'WON', winner: '111', winningTiles: [{r:5,c:0},{r:4,c:0},{r:3,c:0},{r:2,c:0}]
            }, options)
        });

        // 4. Player 2 Win
        const board4 = connect4Engine.createBoard();
        for(let i=0; i<4; i++) board4[5][i+2] = 2;
        board4[5][0] = 1; board4[4][0] = 1; board4[3][0] = 1;
        scenarios.push({
            name: 'p2_win',
            buffer: await connect4Generator.generateBoard({
                id: 'c4_p2_win', board: board4, player1: '111', player2: '222', currentTurn: '111', 
                status: 'WON', winner: '222', winningTiles: [{r:5,c:2},{r:5,c:3},{r:5,c:4},{r:5,c:5}]
            }, options)
        });

        return scenarios;
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
    },
    wordle_toast: async () => {
        const toastGenerator = require('./utils/generators/toastGenerator');
        
        const baseOptions = {
            user: { username: 'Librarian Cxllion', avatarURL: 'https://cdn.discordapp.com/embed/avatars/0.png' },
            pointsEarned: 12,
            streakBonus: 2,
            totalPoints: 1450,
            streak: 5,
            gameName: 'Wordle',
            extraLine: 'A highly confidential decryption key.'
        };

        const flawlessBuffer = await toastGenerator.generateSuccessSlip({ ...baseOptions, attempts: 1 });
        const precisionBuffer = await toastGenerator.generateSuccessSlip({ ...baseOptions, attempts: 2 });
        const standardBuffer = await toastGenerator.generateSuccessSlip({ ...baseOptions, attempts: 4 });

        return [
            { name: 'flawless_1st_try', buffer: flawlessBuffer },
            { name: 'precision_2nd_try', buffer: precisionBuffer },
            { name: 'standard_4th_try', buffer: standardBuffer }
        ];
    },
    arcade: async () => {
        const arcadeGenerator = require('./utils/generators/arcadeGenerator');
        const stats = {
            rank: 5,
            points: 1250,
            wordle: { streak: 12, totalSolved: 45, totalPlays: 50, lastPlayed: new Date() },
            connect4: { wins: 82, total: 123, lastPlayed: new Date() }
        };
        const user = { displayName: 'Librarian Cxllion', avatarURL: 'https://cdn.discordapp.com/embed/avatars/0.png' };
        
        const summary = await arcadeGenerator.generatePage('summary', stats, user);
        const wordle = await arcadeGenerator.generatePage('wordle', stats, user);
        const c4 = await arcadeGenerator.generatePage('connect4', stats, user);

        return [
            { name: 'summary', buffer: summary },
            { name: 'wordle', buffer: wordle },
            { name: 'connect4', buffer: c4 }
        ];
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
