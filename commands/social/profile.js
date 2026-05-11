const { SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getProfileContext } = require('../../utils/core/profileContext');
const { generateProfileCard } = require('../../utils/generators/profileGenerator');
const logger = require('../../utils/core/logger');

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

        // --- V5.0: UNIFIED DATA ACQUISITION ---
        const context = await getProfileContext(targetUser.id, guildId, interaction.client);
        const { user, member, settings, stats, anilist, visuals } = context;

        // Visual Instrumentation (Loader)
        const LoadingManager = require('../../utils/ui/LoadingManager');
        const loader = new LoadingManager(interaction);
        loader.startProgress('Materializing Profile Card...', 5);

        // --- RENDER CORE ---
        const userData = {
            ...stats,
            ...stats.progress,
            anilist_synced: anilist.synced,
            anilist_maintenance: anilist.maintenance,
            knowledgeRank: settings.knowledgeRank,
            is_premium: settings.isPremium,
            is_booster: settings.isBooster,
            rankColor: settings.rankColor,
            anilist: anilist.stats,
            avatarConfig: settings.avatarConfig,
            guildAvatarUrl: visuals.guildAvatarUrl,
            discordBannerUrl: visuals.discordBannerUrl,
            title: settings.title
        };

        const buffer = await generateProfileCard(
            user, 
            userData, 
            anilist.favorites, 
            visuals.bannerUrl, 
            settings.color, 
            member ? member.displayName : user.username
        );
        const attachment = new AttachmentBuilder(buffer, { name: 'profile-card.webp' });

        const CONFIG = require('../../utils/config');
        const dashboardBtn = new ButtonBuilder()
            .setCustomId(`profile_dash_open_${user.id}`)
            .setEmoji(CONFIG.EMOJIS.SEARCH)
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(dashboardBtn);

        await loader.stop({ files: [attachment], components: [row] });
    },
};
