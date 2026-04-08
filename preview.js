const fs = require('fs');
const path = require('path');
require('dotenv').config();
const logger = require('./utils/core/logger');
const { loadCustomFonts } = require('./utils/core/fonts');

// Initialize Fonts
loadCustomFonts();

const generators = {
    profile: async () => {
        const { generateProfileCard } = require('./utils/generators/profileGenerator');
        const { getAniListProfile } = require('./utils/services/anilistService');
        const alRes = await getAniListProfile("Cxllion");
        
        const mockDiscordUser = {
            id: '2829283727372',
            username: 'Librarian Cxllion',
            displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png'
        };

        const userData = {
            anilist_synced: true,
            current: 840,
            required: 1200,
            level: 25,
            title: 'CHART LIBRARIAN',
            is_booster: true,
            is_premium: false,
            anilist: alRes.stats,
            avatarConfig: { source: 'DISCORD_GLOBAL' }
        };

        return await generateProfileCard(mockDiscordUser, userData, alRes.favorites, alRes.banner || 'https://i.imgur.com/r9S6BfB.png', '#8B5CF6');
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
    activity: async () => {
        const { generateActivityCard } = require('./utils/generators/activityGenerator');
        const userMeta = {
            username: 'Cxllion',
            avatarUrl: 'https://cdn.discordapp.com/embed/avatars/2.png',
            themeColor: '#8B5CF6'
        };
        const activityData = {
            media: {
                title: { english: 'Code Geass: Lelouch of the Rebellion', romaji: 'Code Geass: Hangyaku no Lelouch' },
                coverImage: { extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1575-YI646R5i4dK9.png', color: '#8B5CF6' },
                bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/1575-S7X0mZfY7YIu.jpg',
                averageScore: 87,
                meanScore: 87,
                format: 'TV'
            },
            status: 'watching',
            progress: '12',
            score: 9.5,
            scoreFormat: 'POINT_10_DECIMAL',
            bingeMode: true
        };
        return await generateActivityCard(userMeta, activityData);
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
    }
};

async function runPreview() {
    const target = process.argv[2] || 'profile';
    if (!generators[target]) {
        console.log(`\n❌ Unknown generator: "${target}"`);
        console.log(`Available units: ${Object.keys(generators).join(', ')}\n`);
        process.exit(1);
    }

    logger.info(`Initiating Neural Preview for: [${target.toUpperCase()}]`, 'Preview');
    try {
        const buffer = await generators[target]();
        
        // Use webp for most since generators return webp now, profile returns png
        const ext = target === 'profile' ? 'png' : 'webp';
        const outputPath = path.join(__dirname, 'previews', `live_${target}.${ext}`);
        
        fs.writeFileSync(outputPath, buffer);
        logger.info(`✨ Pulse Success: ${outputPath}`, 'Preview');
    } catch (error) {
        logger.error(`Preview Reconstruction Failed:`, error, 'Preview');
    }
}

runPreview();
