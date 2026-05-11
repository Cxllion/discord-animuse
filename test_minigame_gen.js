const fs = require('fs');
const { generateMinigameLeaderboard } = require('./utils/generators/minigameLeaderboardGenerator');

async function test() {
    const challenger = { username: 'Arquib', displayAvatarURL: () => null };
    const challengerData = {
        rank: 12,
        level: 12,
        xp: 1500,
        current: 1500,
        required: 10000,
        percent: 15,
        title: 'Cyber Ninja',
        bannerUrl: null,
        isBooster: true,
        isPremium: false
    };
    const topUsers = [
        { username: 'Player1', total_points: 10000, rank: 1, isPremium: true },
        { username: 'Player2', total_points: 8000, rank: 2 },
        { username: 'Player3', total_points: 7500, rank: 3, isBooster: true },
        { username: 'Player4', total_points: 5000, rank: 4 },
        { username: 'Player5', total_points: 4000, rank: 5 },
        { username: 'Player6', total_points: 3000, rank: 6 },
        { username: 'Player7', total_points: 2000, rank: 7 },
        { username: 'Player8', total_points: 1000, rank: 8 },
        { username: 'Player9', total_points: 500, rank: 9 },
        { username: 'Player10', total_points: 100, rank: 10 }
    ];

    try {
        const buffer = await generateMinigameLeaderboard(challenger, challengerData, topUsers, null, '#00F0FF', 'Arquib', null, 1);
        fs.writeFileSync('test_minigames.webp', buffer);
        console.log('Successfully generated test_minigames.webp');
    } catch (e) {
        console.error(e);
    }
}

test();
