const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getTopUsers, getUserRank, getLevelProgress } = require('../../utils/services/leveling');
const { generateLeaderboard } = require('../../utils/generators/leaderboardGenerator');
const { getUserBackground, getUserColor, getBulkUserAvatarConfig } = require('../../utils/core/database');
const { getAnilistUser } = require('../../utils/services/anilistService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the High Council of Scholars.'),

    async execute(interaction) {
        await interaction.deferReply();
        const guildId = interaction.guild.id;

        // 1. Fetch Top 10 Data
        const topRaw = await getTopUsers(guildId);

        // 2. Resolve User Objects for Top 10 (parallel)
        const topUsers = [];
        // Fetch all members in one go for efficiency
        const members = await interaction.guild.members.fetch({ user: topRaw.map(u => u.user_id) });

        for (const raw of topRaw) {
            const member = members.get(raw.user_id);
            if (member) {
                topUsers.push({
                    ...raw,
                    username: member.displayName, // Use priority nickname
                    avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256 }) // Default to GLOBAL Avatar (interconnected with Profile default)
                });
            } else {
                topUsers.push({
                    ...raw,
                    username: 'Unknown User',
                    avatarUrl: null // Generator handles null
                });
            }
        }

        // 2b. Resolve Custom Avatars (Bulk)
        const userIds = topUsers.map(u => u.user_id);
        const avatarConfigs = await getBulkUserAvatarConfig(guildId, userIds);

        // Identify AniList fetches needed
        const anilistFetches = [];
        const anilistMap = {}; // username -> avatarUrl

        for (const user of topUsers) {
            const member = members.get(user.user_id);
            const config = avatarConfigs[user.user_id];

            if (config) {
                if (config.source === 'CUSTOM' && config.customUrl) {
                    user.avatarUrl = config.customUrl;
                }
                else if (config.source === 'ANILIST' && config.anilistUsername) {
                    // Queue fetch
                    if (!anilistMap[config.anilistUsername]) { // Dedup
                        anilistFetches.push(getAnilistUser(config.anilistUsername).then(data => {
                            if (data && data.avatar) anilistMap[config.anilistUsername] = data.avatar.large;
                        }));
                    }
                }
                else if (config.source === 'DISCORD_GUILD' && member) {
                    user.avatarUrl = member.displayAvatarURL({ extension: 'png', size: 256 });
                }
            }
        }

        // Execute AniList Fetches
        if (anilistFetches.length > 0) {
            await Promise.all(anilistFetches);
            // Apply map
            for (const user of topUsers) {
                const config = avatarConfigs[user.user_id];
                if (config && config.source === 'ANILIST' && config.anilistUsername) {
                    if (anilistMap[config.anilistUsername]) {
                        user.avatarUrl = anilistMap[config.anilistUsername];
                    }
                }
            }
        }

        // 3. Executing User Data
        const [rankData, bgUrl, color, challengerConfig] = await Promise.all([
            getUserRank(interaction.user.id, guildId),
            getUserBackground(interaction.user.id, guildId),
            getUserColor(interaction.user.id, guildId),
            require('../../utils/core/database').getUserAvatarConfig(interaction.user.id, guildId) // Fetch config
        ]);

        const xp = rankData ? parseInt(rankData.xp) : 0;
        const level = rankData ? parseInt(rankData.level) : 0;
        const progress = getLevelProgress(xp, level);

        const challengerData = {
            rank: rankData ? rankData.rank : '?',
            level,
            xp,
            percent: progress.percent
        };

        // Resolve Challenger Avatar
        let challengerAvatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 512 }); // Default Global
        if (challengerConfig) {
            if (challengerConfig.source === 'CUSTOM' && challengerConfig.customUrl) {
                challengerAvatarUrl = challengerConfig.customUrl;
            } else if (challengerConfig.source === 'DISCORD_GUILD') {
                challengerAvatarUrl = interaction.member.displayAvatarURL({ extension: 'png', size: 512 });
            } else if (challengerConfig.source === 'ANILIST' && challengerConfig.anilistUsername) {
                const aniData = await getAnilistUser(challengerConfig.anilistUsername);
                if (aniData && aniData.avatar) challengerAvatarUrl = aniData.avatar.large;
            }
        }

        // 4. Generate
        let challengerName = interaction.member ? interaction.member.displayName : interaction.user.username;
        const buffer = await generateLeaderboard(interaction.user, challengerData, topUsers, bgUrl, color, challengerName, challengerAvatarUrl);
        const attachment = new AttachmentBuilder(buffer, { name: 'leaderboard.png' });

        await interaction.editReply({ files: [attachment] });
    },
};
