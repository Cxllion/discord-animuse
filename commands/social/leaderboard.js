const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { getTopUsers, getUserRank, getLevelProgress } = require('../../utils/services/leveling');
const { generateLeaderboard } = require('../../utils/generators/leaderboardGenerator');
const { generateMinigameLeaderboard } = require('../../utils/generators/minigameLeaderboardGenerator');
const { getUserBannerConfig, getUserColor, getBulkUserAvatarConfig, minigameService } = require('../../utils/core/database');
const { getAnilistUser } = require('../../utils/services/anilistService');
const { getResolvableName } = require('../../utils/core/visualUtils');

module.exports = {
    category: 'social',
    dbRequired: true,
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the High Council of Scholars or Minigame Champions.')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('The archive to view.')
                .setRequired(false)
                .addChoices(
                    { name: '✨ Experience', value: 'exp' },
                    { name: '🎯 Minigames', value: 'minigames' }
                )),

    async execute(interaction) {
        await interaction.deferReply();
        const type = interaction.options.getString('type') || 'exp';
        
        const LoadingManager = require('../../utils/ui/LoadingManager');
        const loader = new LoadingManager(interaction);
        const loadingMsg = type === 'exp' ? 'Ranking High Council...' : 'Synchronizing Minigame Archives...';
        loader.startProgress(loadingMsg, 5);

        const guildId = interaction.guild.id;

        if (type === 'minigames') {
            // --- MINIGAMES LEADERBOARD LOGIC ---
            try {
                const [topPlayers, challengerStats, color] = await Promise.all([
                    minigameService.getTopPlayers(10),
                    minigameService.getUserStats(interaction.user.id),
                    getUserColor(interaction.user.id, guildId)
                ]);

                // Resolve Usernames for top players (best effort)
                const topWithNames = [];
                const members = await interaction.guild.members.fetch({ user: topPlayers.map(u => u.user_id) }).catch(() => new Map());

                for (const player of topPlayers) {
                    const member = members.get(player.user_id);
                    topWithNames.push({
                        ...player,
                        username: member ? getResolvableName(member) : 'Unknown Archivist'
                    });
                }

                const buffer = await generateMinigameLeaderboard(interaction.user, challengerStats, topWithNames, color);
                const attachment = new AttachmentBuilder(buffer, { name: 'leaderboard_minigames.webp' });

                return await loader.stop({ files: [attachment] });
            } catch (error) {
                const logger = require('../../utils/core/logger');
                logger.error('Minigame Leaderboard Failed:', error);
                return await loader.stop({ content: '❌ **Protocol Failure:** Could not materialize the minigame archives.' });
            }
        }

        // --- EXP LEADERBOARD LOGIC (Original) ---
        // 1. Fetch Top 10 Data
        const topRaw = await getTopUsers(guildId);

        // 2. Resolve User Objects for Top 10 (parallel)
        const topUsers = [];
        const members = await interaction.guild.members.fetch({ user: topRaw.map(u => u.user_id) }).catch(() => new Map());

        for (const raw of topRaw) {
            const member = members.get(raw.user_id);
            if (member) {
                topUsers.push({
                    ...raw,
                    username: getResolvableName(member),
                    avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256 })
                });
            } else {
                topUsers.push({
                    ...raw,
                    username: 'Unknown User',
                    avatarUrl: null
                });
            }
        }

        const userIds = topUsers.map(u => u.user_id);
        const avatarConfigs = await getBulkUserAvatarConfig(guildId, userIds);

        const anilistFetches = [];
        const anilistMap = {};

        for (const user of topUsers) {
            const member = members.get(user.user_id);
            const config = avatarConfigs[user.user_id];

            if (config) {
                if (config.source === 'CUSTOM' && config.customUrl) {
                    user.avatarUrl = config.customUrl;
                }
                else if (config.source === 'ANILIST' && config.anilistUsername) {
                    if (!anilistMap[config.anilistUsername]) {
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

        if (anilistFetches.length > 0) {
            await Promise.all(anilistFetches);
            for (const user of topUsers) {
                const config = avatarConfigs[user.user_id];
                if (config && config.source === 'ANILIST' && config.anilistUsername) {
                    if (anilistMap[config.anilistUsername]) {
                        user.avatarUrl = anilistMap[config.anilistUsername];
                    }
                }
            }
        }

        const [rankData, bgUrl, color, challengerConfig] = await Promise.all([
            getUserRank(interaction.user.id, guildId),
            getUserBannerConfig(interaction.user.id, guildId),
            getUserColor(interaction.user.id, guildId),
            require('../../utils/core/database').getUserAvatarConfig(interaction.user.id, guildId)
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

        let challengerAvatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 512 });
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

        let challengerName = getResolvableName(interaction.member);
        const buffer = await generateLeaderboard(interaction.user, challengerData, topUsers, bgUrl, color, challengerName, challengerAvatarUrl);
        const attachment = new AttachmentBuilder(buffer, { name: 'leaderboard.webp' });

        await loader.stop({ files: [attachment] });
    },
};
