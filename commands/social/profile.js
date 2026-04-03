const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, MessageFlags } = require('discord.js');
const { getUserRank, getLevelProgress } = require('../../utils/services/leveling');
const { extractAnilistId, getLinkedAnilist, getAniListProfile } = require('../../utils/services/anilistService');
const {
    getLinkedAnilist: retrieveLinkedUser,
    getUserBannerConfig: retrieveBannerConfig,
    updateUserBannerConfig: retrieveUpdateBanner,
    getUserTitle: retrieveTitle,
    getUserColor: retrieveColor,
    getUserAvatarConfig: retrieveAvatarConfig,
    updateUserColor,
    clearUserBannerGlobally
} = require('../../utils/core/database');
const logger = require('../../utils/core/logger');
const { generateProfileCard } = require('../../utils/generators/profileGenerator');
const { getDynamicUserTitle } = require('../../utils/core/userMeta');
const { resolveBannerUrl } = require('../../utils/core/visualUtils');

module.exports = {
    category: 'social',
    dbRequired: true,
    cooldown: 10, // Canvas generation
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Inspect a Patron\'s Identity Card within the Library.')
        .addUserOption(option => option.setName('user').setDescription('The Patron to investigate')),

    async execute(interaction) {
        await interaction.deferReply();
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const guildId = interaction.guild.id;

        // OFFLINE MODE CHECK
        if (interaction.client.isOfflineMode) {
            return await interaction.followUp({
                content: '⚠️ **The Archives are currently sealed.** (Database Offline)\nProfiles cannot be generated at this time. Please try again later.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Fetch Member & Data
        let member;
        try {
            member = await interaction.guild.members.fetch(targetUser.id);
        } catch (e) {
            member = null;
        }

        const [rankData, linkedUsername, bannerConfig, title, color, avatarConfig] = await Promise.all([
            getUserRank(targetUser.id, guildId),
            retrieveLinkedUser(targetUser.id, guildId),
            retrieveBannerConfig(targetUser.id, guildId),
            retrieveTitle(targetUser.id, guildId),
            retrieveColor(targetUser.id, guildId),
            retrieveAvatarConfig(targetUser.id, guildId)
        ]);

        const xp = rankData ? parseInt(rankData.xp) : 0;
        const level = rankData ? parseInt(rankData.level) : 0;
        const progress = getLevelProgress(xp, level);

        // --- IDENTITY & STATUS AUDIT ---
        const { fetchConfig, getLevelRoles } = require('../../utils/core/database');
        const [config, levelRoles] = await Promise.all([
            fetchConfig(guildId),
            getLevelRoles(guildId)
        ]);

        const isPremium = member ? member.roles.cache.has(config.premium_role_id) : false;
        const isBooster = member ? member.roles.cache.has(config.booster_role_id) : false;

        // Muse Rank / Title Calculation
        const earnedRoles = levelRoles.filter(lr => lr.level <= level);
        let knowledgeRank = 'Muse Reader';
        let rankColor = color || '#3B82F6';

        if (earnedRoles.length > 0) {
            const highestRole = earnedRoles[earnedRoles.length - 1];
            const roleObj = interaction.guild.roles.cache.get(highestRole.role_id);
            if (roleObj) {
                knowledgeRank = roleObj.name.replace(/^\d+\s*[|-]\s*/, '').trim();
                // Dynamically tint the profile dots by the rank color
                if (roleObj.color) rankColor = `#${roleObj.color.toString(16).padStart(6, '0')}`;
            }
        }

        // Booster/Premium overrides for the rank badge color
        if (isBooster) rankColor = '#A855F7';
        else if (isPremium) rankColor = '#F5D17E';

        const joinedDate = member ? member.joinedAt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Unknown';
        const messages = Math.floor(xp / 20);

        // --- INITIALIZE USER DATA ---
        let anilistStats = { completed: 0, days: 0, meanScore: 0 };
        let favorites = [];
        let alMaintenance = false;

        const userData = {
            xp, level, rank: rankData ? rankData.rank : '?',
            current: progress.current, required: progress.required, percent: progress.percent,
            joinedDate, messages, knowledgeRank,
            is_premium: isPremium, is_booster: isBooster,
            rankColor,
            anilist_maintenance: alMaintenance,
            anilist: anilistStats,
            avatarConfig: avatarConfig,
            guildAvatarUrl: member ? member.displayAvatarURL({ extension: 'png' }) : targetUser.displayAvatarURL({ extension: 'png' })
        };

        // --- FETCH ANILIST DATA ---
        if (linkedUsername) {
            const alRes = await getAniListProfile(linkedUsername);
            userData.anilist = alRes.stats;
            favorites = alRes.favorites;
            userData.anilist_maintenance = !!alRes.maintenance;
            if (avatarConfig && avatarConfig.source === 'ANILIST') avatarConfig.anilistAvatar = alRes.avatar;
        }

        userData.anilist_synced = !!linkedUsername && !userData.anilist_maintenance;
        userData.title = (title && !title.includes('Muse')) ? title : knowledgeRank.toUpperCase();
        userData.titleVal = member ? await getDynamicUserTitle(member) : 'Reader';

        const displayName = member ? member.displayName : targetUser.username;

        // Provide immediate feedback with a beautiful animated progress bar
        const LoadingManager = require('../../utils/ui/LoadingManager');
        const loader = new LoadingManager(interaction);
        loader.startProgress('Materializing Profile...', 6); // No await: allow Canvas to start immediately

        const bannerUrl = await resolveBannerUrl(targetUser, member, bannerConfig);
        const buffer = await generateProfileCard(
            targetUser, 
            userData, 
            favorites, 
            bannerUrl, 
            color, 
            displayName,
            async (failedUrl) => {
                logger.warn(`Archival Cleanup: Global neutralization of dead banner ${failedUrl} for user ${targetUser.id}.`, 'Profile');
                await clearUserBannerGlobally(targetUser.id);
            }
        );
        const attachment = new AttachmentBuilder(buffer, { name: 'profile-card.webp' });

        // Interactive Button: Routed through Global Router
        const dashboardBtn = new ButtonBuilder()
            .setCustomId(`profile_dashboard_open_${targetUser.id}`) // Encode owner ID
            .setEmoji('🔍')
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(dashboardBtn);

        // MERGED DELIVERY: 100% + Card in one call
        await loader.stop({ files: [attachment], components: [row] });
    },
};
