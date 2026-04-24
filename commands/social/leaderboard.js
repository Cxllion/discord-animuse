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

                // 1. Resolve Avatars & Names for top players
                const topWithDetails = [];
                const members = await interaction.guild.members.fetch({ user: topPlayers.map(u => u.user_id) }).catch(() => new Map());
                const avatarConfigs = await getBulkUserAvatarConfig(guildId, topPlayers.map(u => u.user_id));

                // 2. Fetch AniList Avatars if needed
                const anilistMap = {};
                const anilistToFetch = [...new Set(Object.values(avatarConfigs).filter(c => c.source === 'ANILIST' && c.anilistUsername).map(c => c.anilistUsername))];
                if (anilistToFetch.length > 0) {
                    await Promise.all(anilistToFetch.map(username => getAnilistUser(username).then(data => {
                        if (data && data.avatar) anilistMap[username] = data.avatar.large;
                    })));
                }

                for (const player of topPlayers) {
                    const member = members.get(player.user_id);
                    const config = avatarConfigs[player.user_id];
                    let avatarUrl = member ? member.user.displayAvatarURL({ extension: 'png', size: 256 }) : null;

                    if (config) {
                        if (config.source === 'CUSTOM' && config.customUrl) avatarUrl = config.customUrl;
                        else if (config.source === 'ANILIST' && anilistMap[config.anilistUsername]) avatarUrl = anilistMap[config.anilistUsername];
                        else if (config.source === 'DISCORD_GUILD' && member) avatarUrl = member.displayAvatarURL({ extension: 'png', size: 256 });
                    }

                    topWithDetails.push({
                        ...player,
                        username: member ? getResolvableName(member) : 'Unknown Archivist',
                        avatarUrl
                    });
                }

                const buffer = await generateMinigameLeaderboard(interaction.user, challengerStats, topWithDetails, color);
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

        // 2. Resolve Avatars & Details
        const topUsers = [];
        const members = await interaction.guild.members.fetch({ user: [...topRaw.map(u => u.user_id), interaction.user.id] }).catch(() => new Map());
        const avatarConfigs = await getBulkUserAvatarConfig(guildId, [...topRaw.map(u => u.user_id), interaction.user.id]);

        // 3. Bulk Fetch AniList
        const anilistMap = {};
        const anilistToFetch = [...new Set(Object.values(avatarConfigs).filter(c => c.source === 'ANILIST' && c.anilistUsername).map(c => c.anilistUsername))];
        if (anilistToFetch.length > 0) {
            await Promise.all(anilistToFetch.map(username => getAnilistUser(username).then(data => {
                if (data && data.avatar) anilistMap[username] = data.avatar.large;
            })));
        }

        const resolveAvatar = (userId, member) => {
            const config = avatarConfigs[userId];
            let url = member ? member.user.displayAvatarURL({ extension: 'png', size: 512 }) : null;
            if (config) {
                if (config.source === 'CUSTOM' && config.customUrl) url = config.customUrl;
                else if (config.source === 'ANILIST' && anilistMap[config.anilistUsername]) url = anilistMap[config.anilistUsername];
                else if (config.source === 'DISCORD_GUILD' && member) url = member.displayAvatarURL({ extension: 'png', size: 512 });
            }
            return url;
        };

        for (const raw of topRaw) {
            const member = members.get(raw.user_id);
            topUsers.push({
                ...raw,
                username: member ? getResolvableName(member) : 'Unknown User',
                avatarUrl: resolveAvatar(raw.user_id, member)
            });
        }

        const [rankData, bgUrl, color] = await Promise.all([
            getUserRank(interaction.user.id, guildId),
            getUserBannerConfig(interaction.user.id, guildId),
            getUserColor(interaction.user.id, guildId)
        ]);

        const xp = rankData ? parseInt(rankData.xp) : 0;
        const level = rankData ? parseInt(rankData.level) : 0;
        const progress = getLevelProgress(xp, level);

        const challengerData = {
            rank: rankData ? rankData.rank : '?',
            level,
            xp,
            current: progress.current,
            required: progress.required,
            percent: progress.percent
        };

        const challengerAvatarUrl = resolveAvatar(interaction.user.id, interaction.member);

        let challengerName = getResolvableName(interaction.member);
        const buffer = await generateLeaderboard(interaction.user, challengerData, topUsers, bgUrl, color, challengerName, challengerAvatarUrl);
        const attachment = new AttachmentBuilder(buffer, { name: 'leaderboard.webp' });

        await loader.stop({ files: [attachment] });
    },
};
