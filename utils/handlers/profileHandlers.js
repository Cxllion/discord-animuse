const fs = require('fs');
const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, AttachmentBuilder, ComponentType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { updateUserColor, updateUserTitle, updateUserBannerConfig, clearUserBannerGlobally, getOwnedTitles, getUserColor, getUserTitle, getUserBannerConfig, getUserAvatarConfig, updateUserAvatarConfig, getLinkedAnilist, fetchConfig } = require('../core/database');
const { generateProfileCard, getDominantColor } = require('../generators/profileGenerator');
const { getUserRank, getLevelProgress } = require('../services/leveling');
const { getAniListProfile } = require('../services/anilistService');
const { normalizeColor, resolveBannerUrl } = require('../core/visualUtils');
const { handleInteractionError } = require('../core/errorHandler');
const logger = require('../core/logger');
const baseEmbed = require('../generators/baseEmbed');

const BASIC_COLORS = {
    'Pink': '#FFACD1',
    'Blue': '#3b82f6',
    'Green': '#22c55e',
    'Yellow': '#eab308',
    'Red': '#ef4444',
    'Purple': '#a855f7',
    'Cyan': '#06b6d4',
    'Orange': '#f97316'
};

const hasPremium = (member, config = null) => {
    // 1. Administrative Override
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    
    // 2. Official Archival Config Check (ID-based)
    if (config && config.premium_role_id && member.roles.cache.has(config.premium_role_id)) return true;
    
    // 3. Nomenclature Fallback (Name-based)
    const premiumIdentifiers = ['Benefactor', 'Patron', 'Seraphic Muse'];
    return member.roles.cache.some(r => premiumIdentifiers.some(id => r.name.includes(id)));
};

// --- SAFE INTERACTION HELPERS ---
const safeDefer = async (interaction) => {
    if (!interaction.deferred && !interaction.replied) {
        try {
            await interaction.deferUpdate();
        } catch (e) {
            // Ignore 'InteractionAlreadyReplied' or race conditions
        }
    }
};

const safeUpdate = async (interaction, payload) => {
    try {
        if (interaction.isMessageComponent()) {
            // Always try to update the existing bubble first
            await interaction.update(payload);
        } else if (interaction.deferred || interaction.replied) {
            await interaction.editReply(payload);
        } else {
            await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
        }
    } catch (e) {
        // Fallback for expired update tokens or modal-originated interactions
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => {});
        } else {
            await interaction.editReply(payload).catch(() => {});
        }
    }
};

// --- PREVIEW HELPER ---
const sendProfilePreview = async (interaction, titleOverride = null, colorOverride = null, bannerOverride = undefined, avatarOverride = null) => {
    try {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        
        const [
            dbColor,
            dbTitle,
            dbBannerConfig,
            dbAvatarConfig,
            rankData,
            linkedUsername
        ] = await Promise.all([
            colorOverride ? Promise.resolve(null) : getUserColor(userId, guildId),
            titleOverride ? Promise.resolve(null) : getUserTitle(userId, guildId),
            bannerOverride !== undefined ? Promise.resolve(null) : getUserBannerConfig(userId, guildId),
            getUserAvatarConfig(userId, guildId),
            getUserRank(userId, guildId),
            getLinkedAnilist(userId, guildId)
        ]);

        const color = colorOverride || dbColor || '#FFACD1';
        const title = titleOverride || dbTitle || 'Muse Reader';
        const bannerConfig = bannerOverride !== undefined ? bannerOverride : dbBannerConfig;
        let avatarConfig = dbAvatarConfig;
        if (avatarOverride) avatarConfig = { ...avatarConfig, ...avatarOverride };

        // Process Stats
        const xp = rankData ? parseInt(rankData.xp) : 0;
        const level = rankData ? parseInt(rankData.level) : 0;
        const progress = getLevelProgress(xp, level);

        // Calculate Muse Rank (Dynamic based on bound level roles)
        const { getLevelRoles } = require('../core/database');
        const levelRoles = await getLevelRoles(guildId);
        
        // Find highest earned role
        const earnedRoles = levelRoles.filter(lr => lr.level <= level);
        let knowledgeRank = 'Patron'; // Default
        
        if (earnedRoles.length > 0) {
            const highestRole = earnedRoles[earnedRoles.length - 1];
            const roleObj = interaction.guild.roles.cache.get(highestRole.role_id);
            let name = roleObj ? roleObj.name : `Level ${highestRole.level} Muse`;
            // Remove number prefix (e.g., "10 | Scribe Muse" -> "Scribe Muse")
            knowledgeRank = name.replace(/^\d+\s*\|\s*/, '');
        }

        // AniList Data (Only if needed)
        let anilistStats = { completed: 0, days: 0, meanScore: 0 };
        let anilistAvatar = null;
        let favorites = [];

        if (linkedUsername) {
            const { stats, avatar, favorites: favs } = await getAniListProfile(linkedUsername);
            if (stats) anilistStats = stats;
            if (avatar) anilistAvatar = avatar;
            if (favs) favorites = favs;
        }

        const userData = {
            xp, level,
            rank: rankData ? rankData.rank : '?',
            current: progress.current,
            required: progress.required,
            percent: progress.percent,
            title: title,
            joinedDate: interaction.member.joinedAt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
            messages: Math.floor(xp / 20),
            knowledgeRank,
            anilist_synced: !!linkedUsername,
            anilist: anilistStats,
            avatarConfig: { ...avatarConfig, anilistAvatar },
            bannerConfig: bannerConfig,
            guildAvatarUrl: interaction.member.displayAvatarURL({ extension: 'png' })
        };

        const LoadingManager = require('../ui/LoadingManager');
        const loader = new LoadingManager(interaction);
        await loader.startSteps([
            'Updating your archival record...',
            'Recalculating rank metadata...',
            'Materializing new profile design...',
            'Applying fresh ink to the canvas...'
        ], 1000);

        const bannerUrl = await resolveBannerUrl(interaction.user, interaction.member, bannerConfig);

        const buffer = await generateProfileCard(
            interaction.user, 
            userData, 
            favorites, 
            bannerUrl, 
            color, 
            interaction.member.displayName,
            async (failedUrl) => {
                logger.warn(`Archival Cleanup: Global neutralization of dead banner ${failedUrl} for user ${userId}.`, 'Profile');
                await clearUserBannerGlobally(userId);
            }
        );
        loader.stop();

        const attachment = new AttachmentBuilder(buffer, { name: 'preview.webp' });
        const msgs = [
            "✨ Your digital signature has been recalibrated.",
            "🎨 A fresh inscription for the archives! How does it look?",
            "📄 Freshly printed from the Great Library!",
            "🧐 Your new identity card is ready for inspection, Patron.",
            "💫 Updates applied! The archives have been updated."
        ];

        await interaction.followUp({
            content: msgs[Math.floor(Math.random() * msgs.length)],
            files: [attachment],
            flags: MessageFlags.Ephemeral
        });

    } catch (err) {
        if (err.code === 10062 || err.code === 40060) return;
        logger.error('Preview Gen Error:', err, 'ProfileHandlers');
    }
};

const showProfileDashboard = async (interaction, isUpdate = false) => {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const member = interaction.member;

    const [color, title, bannerConfig, ownedTitlesRaw, config] = await Promise.all([
        getUserColor(userId, guildId),
        getUserTitle(userId, guildId),
        getUserBannerConfig(userId, guildId),
        getOwnedTitles(userId),
        fetchConfig(guildId)
    ]);

    const ownedTitles = [...ownedTitlesRaw]; // Copy to avoid mutation issues if cached
    if (!ownedTitles.includes('Muse Reader')) ownedTitles.unshift('Muse Reader');

    // V4.12: Dynamic Identity Roles (Leveling & Special Titles)
    const { getLevelRoles } = require('../core/database');
    const levelRoles = await getLevelRoles(guildId);
    const userLevel = (await getUserRank(userId, guildId))?.level || 0;

    // Filter earned roles and redact numbers
    const earnedLevelRoles = levelRoles.filter(lr => lr.level <= userLevel);
    for (const lr of earnedLevelRoles) {
        const role = member.guild.roles.cache.get(lr.role_id);
        if (role) {
            const redactedName = role.name.replace(/^\d+\s*\|\s*/, '');
            if (!ownedTitles.includes(redactedName)) ownedTitles.push(redactedName);
        }
    }

    // Special Designations
    if (member.premiumSince) {
        if (!ownedTitles.includes('Server Booster')) ownedTitles.push('Server Booster');
    }
    if (hasPremium(member, config)) {
        if (!ownedTitles.includes('Seraphic Muse')) ownedTitles.push('Seraphic Muse');
    }

    const embed = baseEmbed(`Identity Dashboard: ${interaction.user.username}`, 
        'Manage your official Library Card appearance and details from the Great Archives.',
        interaction.client.user.displayAvatarURL()
    )
        .setColor(color)
        .setImage('https://dummyimage.com/600x5/2f3136/2f3136.png') // Spacer
        .addFields(
            { name: '🎨 Theme Interface', value: `\`${color}\``, inline: true },
            { name: '🏷️ Active Title', value: `\`${title}\``, inline: true },
            { name: '🖼️ Banner HUD', value: bannerConfig.source !== 'PRESET' || bannerConfig.customUrl ? '[Archived]' : 'Standard', inline: true }
        );

    // --- Title Select ---
    const titleOptions = ownedTitles.slice(0, 25).map(t => new StringSelectMenuOptionBuilder()
        .setLabel(t)
        .setValue(t)
        .setDescription(t === 'Muse Reader' ? 'Dynamic Level Title' : 'Special Title')
        .setDefault(t === title)
        .setEmoji('🏷️')
    );

    const titleSelect = new StringSelectMenuBuilder()
        .setCustomId('profile_title_select')
        .setPlaceholder('Select your Archival Title')
        .addOptions(titleOptions);

    // --- Buttons ---
    const btnColor = new ButtonBuilder()
        .setCustomId('profile_opt_color')
        .setLabel('Theme Color')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎨');

    const btnBanner = new ButtonBuilder()
        .setCustomId('profile_opt_banner')
        .setLabel('Banner HUD')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🖼️');

    const btnAvatar = new ButtonBuilder()
        .setCustomId('profile_opt_avatar')
        .setLabel('Profile Picture')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('👤');

    if (!hasPremium(member, config)) {
        btnBg.setEmoji('🔒');
    }

    const row1 = new ActionRowBuilder().addComponents(titleSelect);
    const row2 = new ActionRowBuilder().addComponents(btnColor, btnBanner, btnAvatar);

    const payload = {
        content: '',
        embeds: [embed],
        components: [row1, row2],
        flags: MessageFlags.Ephemeral
    };

    await safeUpdate(interaction, payload);
};

// --- V4.3: ENHANCED PROFILE HUD MENU (EPHEMERAL) ---
const showProfileHUDMenu = async (interaction, targetId) => {
    try {
        // 1. Production-Grade Ephemeral Deferral
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        } else if (interaction.deferred && interaction.isMessageComponent() && !interaction.ephemeral) {
            // CRITICAL: If we deferred an update on a public message, we MUST use followUp for a new ephemeral window.
            // But it's better to NOT defer update if we want a new window.
            // We'll handle this in the router/handler level.
        }

        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const isOwner = userId === targetId;
        
        // 2. Fetch Target Data (Parallel Archives)
        let targetUser;
        try { 
            targetUser = await interaction.client.users.fetch(targetId); 
        } catch (e) { 
            if (interaction.isRepliable()) {
                await interaction.editReply({ content: '❌ **Archival Error**: Could not retrieve digital signature for this patron.' }).catch(() => {});
            }
            return;
        }
        
        const [dbColor, dbTitle, dbBg, dbAvatarConfig, rankData, linkedUsername] = await Promise.all([
            getUserColor(targetId, guildId).catch(() => null),
            getUserTitle(targetId, guildId).catch(() => null),
            getUserBannerConfig(targetId, guildId).catch(() => null),
            getUserAvatarConfig(targetId, guildId).catch(() => ({ source: 'DISCORD_GLOBAL' })),
            getUserRank(targetId, guildId).catch(() => null),
            getLinkedAnilist(targetId, guildId).catch(() => null)
        ]);

        let member;
        try { member = await interaction.guild.members.fetch(targetId); } catch (e) { member = null; }

        const color = dbColor || '#3B82F6';
        const title = dbTitle || 'Patron';
        let avatarConfig = dbAvatarConfig || { source: 'DISCORD_GLOBAL' };

        // 3. Stats & Progress Calculation
        const xp = rankData ? parseInt(rankData.xp) : 0;
        const level = rankData ? parseInt(rankData.level) : 0;
        const progress = getLevelProgress(xp, level);

        // 4. AniList Telemetry (Optional)
        let anilistStats = { completed: 0, days: 0, meanScore: 0 };
        let anilistAvatar = null;
        let favorites = [];
        if (linkedUsername) {
            try {
                const alRes = await getAniListProfile(linkedUsername);
                if (alRes.stats) anilistStats = alRes.stats;
                if (alRes.avatar) anilistAvatar = alRes.avatar;
                if (alRes.favorites) favorites = alRes.favorites;
            } catch (alErr) {
                logger.warn(`AniList Sync Interrupted for ${linkedUsername}. Using baseline telemetry.`, 'Profile');
            }
        }

        const userData = {
            xp, level, rank: rankData ? rankData.rank : '?',
            current: progress.current, required: progress.required, percent: progress.percent,
            title, joinedDate: member ? member.joinedAt.toLocaleDateString() : 'Unknown',
            messages: Math.floor(xp / 20),
            anilist_synced: !!linkedUsername,
            anilist: anilistStats,
            avatarConfig: { ...avatarConfig, anilistAvatar },
            guildAvatarUrl: member ? member.displayAvatarURL({ extension: 'png' }) : targetUser.displayAvatarURL({ extension: 'png' })
        };

        // 5. Canvas Generation (Heavy Operation)
        const targetBannerConfig = await getUserBannerConfig(targetId, guildId);
        const resolvedBannerUrl = await resolveBannerUrl(targetUser, member, targetBannerConfig);

        const buffer = await generateProfileCard(
            targetUser, 
            userData, 
            favorites, 
            resolvedBannerUrl, 
            color, 
            member ? member.displayName : targetUser.username
        );
        const attachment = new AttachmentBuilder(buffer, { name: 'profile-hud.webp' });

        const embed = baseEmbed(`Identity HUD: ${targetUser.username}`, null, null)
            .setColor(color)
            .setImage('attachment://profile-hud.webp');

        // 6. Component Architecture
        const select = new StringSelectMenuBuilder()
            .setCustomId(`profile_hud_nav_${targetId}`)
            .setPlaceholder('Select Telemetry Stream (Records)')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('Anime Statistics').setValue('anime').setEmoji('📺').setDescription('Detailed watch-time breakdown from AniList'),
                new StringSelectMenuOptionBuilder().setLabel('Manga Archives').setValue('manga').setEmoji('📚').setDescription('Chapter and volume telemetry'),
                new StringSelectMenuOptionBuilder().setLabel('Social History').setValue('social').setEmoji('💬').setDescription('Communication and activity logs')
            );

        const btnMoreInfo = new ButtonBuilder()
            .setCustomId(`profile_more_info_${targetId}`)
            .setLabel('Detailed Records')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🗃️');

        const row1 = new ActionRowBuilder().addComponents(select);
        const row2 = new ActionRowBuilder().addComponents(btnMoreInfo);

        if (isOwner) {
            const btnDashboard = new ButtonBuilder()
                .setCustomId(`profile_custom_dashboard_${targetId}`)
                .setLabel('Customize')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🎨');
            row2.addComponents(btnDashboard);
        }

        // 7. Final Safe Reply
        if (interaction.isRepliable()) {
            await interaction.editReply({
                embeds: [embed],
                files: [attachment],
                components: [row1, row2]
            }).catch(e => {
                if (e.code === 10062) logger.error('HUD Menu Error: Interaction expired during generation.', null, 'ProfileHandlers');
                else throw e;
            });
        }

    } catch (err) {
        if (err.code === 10062) return; // Silent discard for known race conditions
        logger.error('HUD Menu Final Failure:', err, 'ProfileHandlers');
    }
};


// --- BANNER MENU ---
const showBannerMenu = async (interaction, bannerConfig = null) => {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const config = await fetchConfig(guildId);
    
    if (!hasPremium(interaction.member, config)) {
        return interaction.reply({ 
            content: '🔒 **Archival Restriction**\nCustomized Banners are reserved for "Seraphic Muse" patrons.', 
            flags: MessageFlags.Ephemeral 
        });
    }

    const [dbBannerConfig, dbColor, dbTitle, dbAvatarConfig, rankData, linkedUsername] = await Promise.all([
        getUserBannerConfig(userId, guildId),
        getUserColor(userId, guildId),
        getUserTitle(userId, guildId),
        getUserAvatarConfig(userId, guildId),
        getUserRank(userId, guildId),
        getLinkedAnilist(userId, guildId)
    ]);

    const activeBannerConfig = bannerConfig || dbBannerConfig;
    const color = dbColor || '#3B82F6';
    const member = interaction.member;

    // Generate Verification Card
    const bannerUrl = await resolveBannerUrl(interaction.user, member, activeBannerConfig);
    const xp = rankData ? parseInt(rankData.xp) : 0;
    const level = rankData ? parseInt(rankData.level) : 0;
    const progress = getLevelProgress(xp, level);
    
    let favorites = [];
    if (linkedUsername) {
        try {
            const alRes = await getAniListProfile(linkedUsername);
            if (alRes.favorites) favorites = alRes.favorites;
        } catch(e) {}
    }

    const userData = {
        xp, level, rank: rankData ? rankData.rank : '?',
        current: progress.current, required: progress.required, percent: progress.percent,
        title: dbTitle || 'Patron',
        joinedDate: member ? member.joinedAt.toLocaleDateString() : 'Unknown',
        messages: Math.floor(xp / 20),
        anilist_synced: !!linkedUsername,
        avatarConfig: dbAvatarConfig || { source: 'DISCORD_GLOBAL' },
        guildAvatarUrl: member ? member.displayAvatarURL({ extension: 'png' }) : interaction.user.displayAvatarURL({ extension: 'png' })
    };

    const buffer = await generateProfileCard(interaction.user, userData, favorites, bannerUrl, color, member.displayName);
    const attachment = new AttachmentBuilder(buffer, { name: 'banner-preview.webp' });

    const embed = baseEmbed('🖼️ Identity Banner Controller', 
        '📡 **Transmission Status**: Archival synchronization active.\nSelect a source or transmit a custom image for your record.', 
        null
    )
        .setColor(color)
        .setImage('attachment://banner-preview.webp')
        .addFields({ name: 'Current Source', value: `\`${activeBannerConfig.source.replace('_', ' ')}\``, inline: true });

    const btnUpload = new ButtonBuilder()
        .setCustomId('profile_banner_upload')
        .setLabel('Send in Chat')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📥');

    const btnUser = new ButtonBuilder()
        .setCustomId('profile_banner_sync_user')
        .setLabel('Sync Profile')
        .setStyle(activeBannerConfig.source === 'DISCORD_USER' ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji('👤');

    const btnGuild = new ButtonBuilder()
        .setCustomId('profile_banner_sync_guild')
        .setLabel('Sync Server')
        .setStyle(activeBannerConfig.source === 'DISCORD_GUILD' ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji('🏰');

    const btnAniList = new ButtonBuilder()
        .setCustomId('profile_banner_sync_anilist')
        .setLabel('Sync AniList')
        .setStyle(activeBannerConfig.source === 'ANILIST' ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji('📚');

    const btnRemove = new ButtonBuilder()
        .setCustomId('profile_banner_reset')
        .setLabel('Reset')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️');

    const btnBack = new ButtonBuilder()
        .setCustomId('profile_home')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(btnUser, btnGuild, btnAniList, btnUpload);
    const row2 = new ActionRowBuilder().addComponents(btnRemove, btnBack);

    // Presets
    const presetsDir = path.join(__dirname, 'images', 'profile-presets');
    let presetComponents = [];

    if (fs.existsSync(presetsDir)) {
        const files = fs.readdirSync(presetsDir).filter(f => f.match(/\.(png|jpg|jpeg|gif)$/i));
        if (files.length > 0) {
            const options = files.slice(0, 25).map(f => {
                const name = path.parse(f).name.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                return new StringSelectMenuOptionBuilder()
                    .setLabel(name)
                    .setValue(`PRESET:${f}`)
                    .setEmoji('📂');
            });

            const select = new StringSelectMenuBuilder()
                .setCustomId('profile_banner_preset_select')
                .setPlaceholder('Archival Presets')
                .addOptions(options);

            presetComponents.push(new ActionRowBuilder().addComponents(select));
        }
    }

    await safeUpdate(interaction, {
        embeds: [embed],
        files: [attachment],
        components: [...presetComponents, row1, row2]
    });
};

const showColorMenu = async (interaction) => {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const [bgUrl, config] = await Promise.all([
        getUserBannerConfig(userId, guildId),
        fetchConfig(guildId)
    ]);

    const embed = baseEmbed('🎨 Theme Color Configuration', 
        'Select a pigment source for your profile elements from the Great Palette.', 
        null
    ).setColor('#2b2d31');

    const btnBasic = new ButtonBuilder()
        .setCustomId('profile_color_basic')
        .setLabel('Basic Colors')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🖌️');

    const btnSync = new ButtonBuilder()
        .setCustomId('profile_color_sync')
        .setLabel('Sync Role Color')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🔄');

    const btnHex = new ButtonBuilder()
        .setCustomId('profile_color_hex')
        .setLabel('Custom Hex')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('✨');

    if (!hasPremium(interaction.member, config)) {
        btnHex.setLabel('Custom Hex (Premium)').setDisabled(true);
    }

    const components = [btnBasic, btnSync, btnHex];

    // AUTO COLOR BUTTON
    if (bgUrl && hasPremium(interaction.member, config)) {
        const btnAuto = new ButtonBuilder()
            .setCustomId('profile_color_auto')
            .setLabel('Auto (From BG)')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('🪄');
        components.push(btnAuto);
    }

    const btnBack = new ButtonBuilder()
        .setCustomId('profile_home')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary);

    components.push(btnBack);

    // Split into rows
    const row1 = new ActionRowBuilder().addComponents(components.slice(0, 5));

    await safeUpdate(interaction, { embeds: [embed], components: [row1] });
};

const showBasicColorSelect = async (interaction) => {
    const options = Object.entries(BASIC_COLORS).map(([name, hex]) =>
        new StringSelectMenuOptionBuilder().setLabel(name).setValue(hex).setDescription(hex)
    );

    const select = new StringSelectMenuBuilder()
        .setCustomId('profile_select_basic_color')
        .setPlaceholder('Choose a standardized pigment')
        .addOptions(options);

    const btnBack = new ButtonBuilder()
        .setCustomId('profile_opt_color')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(select);
    const row2 = new ActionRowBuilder().addComponents(btnBack);

    await safeUpdate(interaction, {
        content: '**Basic Pigments**',
        embeds: [],
        components: [row1, row2]
    });
};

// --- AVATAR MENU ---
const showAvatarMenu = async (interaction) => {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const [config, guildConfig] = await Promise.all([
        getUserAvatarConfig(userId, guildId),
        fetchConfig(guildId)
    ]);

    const embed = baseEmbed('👤 Profile Picture Configuration', 
        `Select your digital signature source.\nCurrent Source: **${config.source.replace('_', ' ')}**`, 
        null
    ).setColor('#2b2d31');

    const btnDefault = new ButtonBuilder()
        .setCustomId('profile_pfp_default')
        .setLabel('Default (Global)')
        .setStyle(config.source === 'DISCORD_GLOBAL' ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji('🌐');

    const btnServer = new ButtonBuilder()
        .setCustomId('profile_pfp_server')
        .setLabel('Server Profile')
        .setStyle(config.source === 'DISCORD_GUILD' ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji('🏰');

    const btnAniList = new ButtonBuilder()
        .setCustomId('profile_pfp_anilist')
        .setLabel('AniList Avatar')
        .setStyle(config.source === 'ANILIST' ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji('🅰️');

    const btnUpload = new ButtonBuilder()
        .setCustomId('profile_pfp_upload')
        .setLabel('Send in Chat')
        .setStyle(config.source === 'CUSTOM' && !config.customUrl?.startsWith('http') ? ButtonStyle.Success : ButtonStyle.Primary)
        .setEmoji(hasPremium(interaction.member, guildConfig) ? '📥' : '🔒');

    const btnUrl = new ButtonBuilder()
        .setCustomId('profile_pfp_custom')
        .setLabel('URL Upload')
        .setStyle(config.source === 'CUSTOM' && config.customUrl?.startsWith('http') ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji(hasPremium(interaction.member, guildConfig) ? '🔗' : '🔒');

    const btnBack = new ButtonBuilder()
        .setCustomId('profile_home')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(btnDefault, btnServer, btnAniList);
    const row2 = new ActionRowBuilder().addComponents(btnUpload, btnUrl, btnBack);

    await safeUpdate(interaction, { embeds: [embed], components: [row1, row2] });
};

// --- HANDLERS ---

const handleProfileInteraction = async (interaction) => {
    try {
        const id = interaction.customId;
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

    if (id === 'profile_home') return showProfileDashboard(interaction);

    // Profile Dashboard Open (from /profile command) - V4.3: Now opens the HUD Menu
    if (id.startsWith('profile_dashboard_open_')) {
        const targetId = id.split('_').pop();
        // ENSURE NEW EPHEMERAL WINDOW
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }
        return showProfileHUDMenu(interaction, targetId);
    }

    if (id.startsWith('archive_access_')) {
        // ENSURE NEW EPHEMERAL WINDOW
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }
        return showProfileHUDMenu(interaction, id.split('_').pop());
    }

    // ALL OTHER ACTIONS (Updates)
    await safeDefer(interaction);

    // V4.3: Custom Dashboard from HUD
    if (id.startsWith('profile_custom_dashboard_')) {
        return showProfileDashboard(interaction);
    }

    // V4.3: More Info Placeholder
    // V4.4: HUD Navigation (Telemetry Streams) Placeholder
    if (id.startsWith('profile_hud_nav_')) {
        const type = interaction.values[0];
        const typeNames = { anime: 'Anime Statistics', manga: 'Manga Archives', social: 'Social History' };
        return interaction.reply({ 
            content: `📡 **Telemetry Stream: ${typeNames[type] || 'Data'}**\nOur scribes are currently calibrating this data-view in the Great Library archives. Detailed insights will be accessible soon! ♡`, 
            flags: MessageFlags.Ephemeral 
        });
    }

    // V4.3: More Info Placeholder
    if (id.startsWith('profile_more_info_')) {
        return interaction.reply({ 
            content: '📑 **Archival Record Expansion Underway**\nDetailed telemetry for this patron is currently being decrypted. Our librarians are working hard to finalize these records. Check back soon! ♡', 
            flags: MessageFlags.Ephemeral 
        });
    }
    

    // AVATAR MENU
    if (id === 'profile_opt_avatar') return showAvatarMenu(interaction);

    // Avatar Actions
    if (['profile_pfp_default', 'profile_pfp_server', 'profile_pfp_anilist'].includes(id)) {
        await safeDefer(interaction);

        let source = 'DISCORD_GLOBAL';
        if (id === 'profile_pfp_server') source = 'DISCORD_GUILD';
        if (id === 'profile_pfp_anilist') {
            const linked = await getLinkedAnilist(userId, guildId);
            if (!linked) {
                return interaction.followUp({ content: '❌ You must link an AniList account first.', flags: MessageFlags.Ephemeral });
            }
            source = 'ANILIST';
        }

        await updateUserAvatarConfig(userId, guildId, source);
        await sendProfilePreview(interaction, undefined, undefined, undefined, { source });
        return showAvatarMenu(interaction); // Refresh buttons
    }

    if (id === 'profile_pfp_custom') {
        const guildConfig = await fetchConfig(guildId);
        if (!hasPremium(interaction.member, guildConfig)) {
            return interaction.reply({ content: '🔒 Custom Avatars are a premium feature.', flags: MessageFlags.Ephemeral });
        }

        const modal = new ModalBuilder().setCustomId('profile_modal_pfp').setTitle('Custom Avatar Upload');
        const input = new TextInputBuilder()
            .setCustomId('url')
            .setLabel('Image URL')
            .setPlaceholder('https://example.com/avatar.png')
            .setStyle(TextInputStyle.Short);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    if (id === 'profile_pfp_upload') {
        const guildConfig = await fetchConfig(guildId);
        await interaction.editReply({ 
            content: '📡 **Profile Picture Uplink Initiated**\nPlease upload your new digital signature (PFP) in this channel. I will capture its essence and secure it within the Great Library archives. ♡\n*Window expires in 60 seconds.*', 
            embeds: [],
            components: []
        });

        const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

        collector.on('collect', async m => {
            const attachment = m.attachments.first();
            let finalUrl = attachment.url;

            // Archival Redundant Backup (Dump Channel)
            if (guildConfig && guildConfig.banner_dump_channel_id) {
                try {
                    const dumpChannel = await interaction.client.channels.fetch(guildConfig.banner_dump_channel_id).catch(() => null);
                    if (dumpChannel) {
                        const dumpMsg = await dumpChannel.send({
                            content: `👤 **Avatar Archive**: <@${userId}> (${userId})`,
                            files: [attachment]
                        });
                        const dumpAttachment = dumpMsg.attachments.first();
                        if (dumpAttachment) finalUrl = dumpAttachment.url;
                    }
                } catch (dumpErr) {
                    logger.warn(`Archival Dump Failed: ${dumpErr.message}. Falling back to ephemeral CDN link.`, 'Profile');
                }
            }

            try { await m.delete().catch(() => {}); } catch(e) {} 

            if (!attachment) {
                return interaction.followUp({ content: '❌ **Transmission Error**: No archival data-stream detected.', flags: MessageFlags.Ephemeral });
            }

            await updateUserAvatarConfig(userId, guildId, 'CUSTOM', finalUrl);
            
            // Re-materialize preview
            await sendProfilePreview(interaction, undefined, undefined, undefined, { source: 'CUSTOM', customUrl: finalUrl });
            await interaction.followUp({ content: '✅ **Identity Secured**: Your new digital signature has been successfully archived.', flags: MessageFlags.Ephemeral });
            
            return showAvatarMenu(interaction);
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                interaction.followUp({ content: '⚠️ **Uplink Terminated**: No archival transmission detected within the 60-second window.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        });
        return;
    }

    // Title Selection
    if (id === 'profile_title_select') {
        await safeDefer(interaction);
        const selected = interaction.values[0];
        await updateUserTitle(userId, guildId, selected);
        // Preview
        await sendProfilePreview(interaction, selected);
        return showProfileDashboard(interaction, true);
    }

    // Main Menus
    if (id === 'profile_opt_color') return showColorMenu(interaction);

    if (id === 'profile_opt_banner') return showBannerMenu(interaction);

    // Banner Actions
    if (['profile_banner_sync_user', 'profile_banner_sync_guild', 'profile_banner_sync_anilist', 'profile_banner_reset'].includes(id)) {
        await safeDefer(interaction);

        let source = 'PRESET'; // Default reset
        if (id === 'profile_banner_sync_user') source = 'DISCORD_USER';
        if (id === 'profile_banner_sync_guild') source = 'DISCORD_GUILD';
        if (id === 'profile_banner_sync_anilist') {
            const linked = await getLinkedAnilist(userId, guildId);
            if (!linked) {
                return interaction.followUp({ content: '❌ **Archival Error**: No AniList account linked to this identity signal.', flags: MessageFlags.Ephemeral });
            }
            source = 'ANILIST';
        }
        if (id === 'profile_banner_reset') {
            await updateUserBannerConfig(userId, guildId, 'PRESET', null);
            await sendProfilePreview(interaction, undefined, undefined, { source: 'PRESET', customUrl: null });
            return showBannerMenu(interaction);
        }

        await updateUserBannerConfig(userId, guildId, source);
        await sendProfilePreview(interaction, undefined, undefined, { source });
        return showBannerMenu(interaction);
    }

    if (id === 'profile_banner_upload') {
        const guildConfig = await fetchConfig(guildId);

        const filter = m => m.author.id === userId && m.attachments.size > 0;
        await interaction.editReply({ 
            content: '📡 **Banner HUD Uplink Initiated**\nPlease upload your new archival background in this channel. I will capture its beauty and secure it within your server\'s identity vault. ♡\n*Window expires in 60 seconds.*', 
            embeds: [],
            components: []
        });

        const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

        collector.on('collect', async m => {
            const attachment = m.attachments.first();
            let finalUrl = attachment.url;

            // Archival Redundant Backup (Dump Channel)
            if (guildConfig && guildConfig.banner_dump_channel_id) {
                try {
                    const dumpChannel = await interaction.client.channels.fetch(guildConfig.banner_dump_channel_id).catch(() => null);
                    if (dumpChannel) {
                        const dumpMsg = await dumpChannel.send({
                            content: `📸 **Identity Archive**: <@${userId}> (${userId})`,
                            files: [attachment]
                        });
                        const dumpAttachment = dumpMsg.attachments.first();
                        if (dumpAttachment) finalUrl = dumpAttachment.url;
                    }
                } catch (dumpErr) {
                    logger.warn(`Archival Dump Failed: ${dumpErr.message}. Falling back to ephemeral CDN link.`, 'Profile');
                }
            }

            try { await m.delete().catch(() => {}); } catch(e) {} 

            if (!attachment) {
                return interaction.followUp({ content: '❌ **Transmission Error**: No file-stream detected.', flags: MessageFlags.Ephemeral });
            }

            await updateUserBannerConfig(userId, guildId, 'CUSTOM', finalUrl);
            
            // Re-materialize the preview card with the new transmission
            const bannerConfig = await getUserBannerConfig(userId, guildId);
            await interaction.followUp({ content: '✅ **Archival Transmission Logged**: Your identity background has been secured in the archives.', flags: MessageFlags.Ephemeral });
            
            // Refresh the HUD Control Menu
            return showBannerMenu(interaction, bannerConfig);
        });

        collector.on('end', collected => {
            if (collected.size === 0) {
                interaction.followUp({ content: '⚠️ **Uplink Terminated**: No banner transmission detected within the 60-second window.', flags: MessageFlags.Ephemeral }).catch(() => {});
            }
        });
        return;
    }

    if (id === 'profile_banner_preset_select') {
        const selection = interaction.values[0];
        if (selection.startsWith('PRESET:')) {
            const filename = selection.split('PRESET:')[1];
            const absPath = path.join(__dirname, 'images', 'profile-presets', filename);
            await safeDefer(interaction);
            await updateUserBannerConfig(userId, guildId, 'PRESET', absPath);
            await sendProfilePreview(interaction, undefined, undefined, { source: 'PRESET', customUrl: absPath });
            return showBannerMenu(interaction);
        }
    }

    // Color Options
    if (id === 'profile_color_basic') return showBasicColorSelect(interaction);

    if (id === 'profile_select_basic_color') {
        await safeDefer(interaction);
        const hex = interaction.values[0];
        await updateUserColor(userId, guildId, hex);
        await sendProfilePreview(interaction, undefined, hex);
        return showProfileDashboard(interaction, true);
    }

    if (id === 'profile_color_sync') {
        const roleColor = interaction.member.displayHexColor;
        if (roleColor === '#000000') {
            return interaction.reply({ content: '⚠️ Your role has no color set.', flags: MessageFlags.Ephemeral });
        }
        await safeDefer(interaction);
        await updateUserColor(userId, guildId, roleColor);
        await sendProfilePreview(interaction, undefined, roleColor);
        return showProfileDashboard(interaction, true);
    }

    if (id === 'profile_color_hex') {
        const modal = new ModalBuilder().setCustomId('profile_modal_hex').setTitle('Custom Theme Encoding');
        const input = new TextInputBuilder()
            .setCustomId('hex')
            .setLabel('Hex Code')
            .setPlaceholder('#FF0099')
            .setStyle(TextInputStyle.Short)
            .setMinLength(4)
            .setMaxLength(7);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    if (id === 'profile_color_auto') {
        await safeDefer(interaction);
        const bannerConfig = await getUserBannerConfig(userId, guildId);
        const bannerUrl = await resolveBannerUrl(interaction.user, interaction.member, bannerConfig);
        if (bannerUrl) {
            const autoColor = await getDominantColor(bannerUrl);
            await updateUserColor(userId, guildId, autoColor);
            await sendProfilePreview(interaction, undefined, autoColor);
        }
        return showProfileDashboard(interaction, true);
    }
    } catch (error) {
        await handleInteractionError(interaction, error);
    }
};

// --- MODAL HANDLERS ---
const handleProfileModals = async (interaction) => {
    try {
        if (interaction.customId === 'profile_modal_hex') {
            let hex = interaction.fields.getTextInputValue('hex');
            if (!hex.startsWith('#')) hex = '#' + hex;
            if (!/^#[0-9A-F]{6}$/i.test(hex) && !/^#[0-9A-F]{3}$/i.test(hex)) {
                return interaction.reply({ content: '❌ Invalid Hex Code.', flags: MessageFlags.Ephemeral });
            }
            
            const finalColor = normalizeColor(hex);
            await updateUserColor(interaction.user.id, interaction.guild.id, finalColor);

            await safeDefer(interaction);
            await sendProfilePreview(interaction, undefined, finalColor);
            await showProfileDashboard(interaction, true);
            return;
        }

        if (interaction.customId === 'profile_modal_bg') {
            const url = interaction.fields.getTextInputValue('url');
            if (!url.startsWith('http')) return interaction.reply({ content: '❌ Invalid URL.', flags: MessageFlags.Ephemeral });

            await updateUserBackground(interaction.user.id, interaction.guild.id, url);

            await safeDefer(interaction);
            await sendProfilePreview(interaction, undefined, undefined, url);
            await showProfileDashboard(interaction, true); // Or showBackgroundMenu? User likely wants to go back to dashboard.
            return;
        }
        if (interaction.customId === 'profile_modal_pfp') {
            const url = interaction.fields.getTextInputValue('url');
            if (!url.startsWith('http')) return interaction.reply({ content: '❌ **Transmission Error**: The provided archival URL is invalid.', flags: MessageFlags.Ephemeral });

            await updateUserAvatarConfig(interaction.user.id, interaction.guild.id, 'CUSTOM', url);

            await safeDefer(interaction);
            await sendProfilePreview(interaction, undefined, undefined, undefined, { source: 'CUSTOM', customUrl: url });
            await showAvatarMenu(interaction);
            return;
        }
    } catch (err) {
        if (err.code === 10062 || err.code === 40060) return;
        logger.error('Profile Modal Error:', err, 'ProfileHandlers');
    }
};

module.exports = { showProfileDashboard, handleProfileInteraction, handleProfileModals };
