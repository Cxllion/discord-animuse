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

// V4.15: Public Profile Synchronization Map
const activeProfileMessages = new Map(); // userId -> { channelId, messageId }

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


const showProfileDashboard = async (interaction, isUpdate = false) => {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const member = interaction.member;

    const [dbColor, dbTitle, bannerConfig, ownedTitlesRaw, config, rankData, linkedUsername, avatarConfig] = await Promise.all([
        getUserColor(userId, guildId),
        getUserTitle(userId, guildId),
        getUserBannerConfig(userId, guildId),
        getOwnedTitles(userId),
        fetchConfig(guildId),
        getUserRank(userId, guildId),
        getLinkedAnilist(userId, guildId),
        getUserAvatarConfig(userId, guildId)
    ]);

    const color = dbColor || '#3B82F6';
    const title = dbTitle || 'Muse Reader';

    const ownedTitles = [...ownedTitlesRaw]; // Copy to avoid mutation issues if cached
    if (!ownedTitles.includes('Muse Reader')) ownedTitles.unshift('Muse Reader');

    // V4.12: Dynamic Identity Roles (Leveling & Special Titles)
    const { getLevelRoles } = require('../core/database');
    const levelRoles = await getLevelRoles(guildId);
    
    const xp = rankData ? parseInt(rankData.xp) : 0;
    const level = rankData ? parseInt(rankData.level) : 0;
    const progress = getLevelProgress(xp, level);

    // Filter earned roles and redact numbers
    const earnedLevelRoles = levelRoles.filter(lr => lr.level <= level);
    let knowledgeRank = 'Patron';
    let rankColor = color;

    for (const lr of earnedLevelRoles) {
        const role = member.guild.roles.cache.get(lr.role_id);
        if (role) {
            const redactedName = role.name.replace(/^\d+\s*\|\s*/, '');
            if (!ownedTitles.includes(redactedName)) ownedTitles.push(redactedName);
            knowledgeRank = redactedName;
            if (role.color) rankColor = `#${role.color.toString(16).padStart(6, '0')}`;
        }
    }

    // Special Designations
    const isPremium = hasPremium(member, config);
    const isBooster = !!member.premiumSince;

    if (isBooster) {
        if (!ownedTitles.includes('Server Booster')) ownedTitles.push('Server Booster');
        rankColor = '#A855F7';
    }
    if (isPremium) {
        if (!ownedTitles.includes('Seraphic Muse')) ownedTitles.push('Seraphic Muse');
        rankColor = '#F5D17E';
    }

    // AniList Data
    let anilistStats = { completed: 0, days: 0, meanScore: 0 };
    let favorites = [];
    if (linkedUsername) {
        try {
            const alRes = await getAniListProfile(linkedUsername);
            anilistStats = alRes.stats;
            favorites = alRes.favorites;
            if (avatarConfig && avatarConfig.source === 'ANILIST' && alRes.avatar) {
                avatarConfig.anilistAvatar = alRes.avatar;
            }
        } catch(e) {}
    }

    const userData = {
        xp, level, rank: rankData ? rankData.rank : '?',
        current: progress.current, required: progress.required, percent: progress.percent,
        joinedDate: member ? member.joinedAt.toLocaleDateString() : 'Unknown',
        messages: Math.floor(xp / 20), knowledgeRank,
        is_premium: isPremium, is_booster: isBooster,
        rankColor, anilist: anilistStats, avatarConfig,
        guildAvatarUrl: member ? member.displayAvatarURL({ extension: 'png' }) : interaction.user.displayAvatarURL({ extension: 'png' }),
        title: (title && !title.includes('Muse')) ? title : knowledgeRank.toUpperCase()
    };

    const bannerUrl = await resolveBannerUrl(interaction.user, member, bannerConfig);
    const buffer = await generateProfileCard(interaction.user, userData, favorites, bannerUrl, color, member.displayName);
    const attachment = new AttachmentBuilder(buffer, { name: 'dashboard-preview.webp' });

    const embed = baseEmbed(`Identity Dashboard: ${interaction.user.username}`, 
        'Manage your official Library Card appearance and details from the Great Archives.\n\n✅ **Live Preview**: This card reflects your current archival signature.',
        interaction.client.user.displayAvatarURL()
    )
        .setColor(color)
        .setImage('attachment://dashboard-preview.webp')
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

    const row1 = new ActionRowBuilder().addComponents(titleSelect);
    const row2 = new ActionRowBuilder().addComponents(btnColor, btnBanner, btnAvatar);

    const payload = {
        content: '',
        embeds: [embed],
        files: [attachment],
        components: [row1, row2],
        flags: MessageFlags.Ephemeral
    };

    await safeUpdate(interaction, payload);
};

// --- V4.15: PUBLIC PROFILE SYNCHRONIZATION ---
const updatePublicProfile = async (interaction) => {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const session = activeProfileMessages.get(userId);
    
    logger.info(`[SYNC_DEBUG] Sync triggered for ${userId}. Session: ${session ? 'EXISTS' : 'MISSING'}`, 'ProfileHandlers');
    if (!session) return;

    try {
        const channel = await interaction.client.channels.fetch(session.channelId).catch(e => {
            logger.error(`[SYNC_DEBUG] Channel fetch failed: ${e.message}`, 'ProfileHandlers');
            return null;
        });
        if (!channel) return;

        const message = await channel.messages.fetch(session.messageId).catch(e => {
            logger.error(`[SYNC_DEBUG] Message fetch failed: ${e.message} (ID: ${session.messageId})`, 'ProfileHandlers');
            return null;
        });
        if (!message) return;

        logger.info(`[SYNC_DEBUG] Found target message ${message.id} in channel ${channel.id}. Editable: ${message.editable}`, 'ProfileHandlers');

        // Data Fetching (Mirror of profile.js)
        const [rankData, linkedUsername, bannerConfig, title, color, avatarConfig] = await Promise.all([
            getUserRank(userId, guildId),
            getLinkedAnilist(userId, guildId),
            getUserBannerConfig(userId, guildId),
            getUserTitle(userId, guildId),
            getUserColor(userId, guildId),
            getUserAvatarConfig(userId, guildId)
        ]);

        let member;
        try { member = await interaction.guild.members.fetch(userId); } catch (e) { member = null; }

        const xp = rankData ? parseInt(rankData.xp) : 0;
        const level = rankData ? parseInt(rankData.level) : 0;
        const progress = getLevelProgress(xp, level);

        const { fetchConfig, getLevelRoles } = require('../core/database');
        const [config, levelRoles] = await Promise.all([
            fetchConfig(guildId),
            getLevelRoles(guildId)
        ]);

        const isPremium = member ? member.roles.cache.has(config.premium_role_id) : false;
        const isBooster = member ? member.roles.cache.has(config.booster_role_id) : false;

        const earnedRoles = levelRoles.filter(lr => lr.level <= level);
        let knowledgeRank = 'Muse Reader';
        let rankColor = color || '#3B82F6';

        if (earnedRoles.length > 0) {
            const highestRole = earnedRoles[earnedRoles.length - 1];
            const roleObj = interaction.guild.roles.cache.get(highestRole.role_id);
            if (roleObj) {
                knowledgeRank = roleObj.name.replace(/^\d+\s*[|-]\s*/, '').trim();
                if (roleObj.color) rankColor = `#${roleObj.color.toString(16).padStart(6, '0')}`;
            }
        }

        if (isBooster) rankColor = '#A855F7';
        else if (isPremium) rankColor = '#F5D17E';

        let anilistStats = { completed: 0, days: 0, meanScore: 0 };
        let favorites = [];
        if (linkedUsername) {
            const alRes = await getAniListProfile(linkedUsername);
            anilistStats = alRes.stats;
            favorites = alRes.favorites;
            if (avatarConfig && avatarConfig.source === 'ANILIST') avatarConfig.anilistAvatar = alRes.avatar;
        }

        const userData = {
            xp, level, rank: rankData ? rankData.rank : '?',
            current: progress.current, required: progress.required, percent: progress.percent,
            joinedDate: member ? member.joinedAt.toLocaleDateString() : 'Unknown',
            messages: Math.floor(xp / 20), knowledgeRank,
            is_premium: isPremium, is_booster: isBooster,
            rankColor, anilist: anilistStats, avatarConfig,
            guildAvatarUrl: member ? member.displayAvatarURL({ extension: 'png' }) : interaction.user.displayAvatarURL({ extension: 'png' })
        };

        userData.anilist_synced = !!linkedUsername;
        userData.title = (title && !title.includes('Muse')) ? title : knowledgeRank.toUpperCase();

        const bannerUrl = await resolveBannerUrl(interaction.user, member, bannerConfig);
        const buffer = await generateProfileCard(interaction.user, userData, favorites, bannerUrl, color, member.displayName);
        const attachment = new AttachmentBuilder(buffer, { name: 'profile-card.webp' });

        // V4.15: Preserve the Dashboard Button on the public message
        const dashboardBtn = new ButtonBuilder()
            .setCustomId(`profile_dashboard_open_${userId}`)
            .setEmoji('🔍')
            .setStyle(ButtonStyle.Secondary);
        const row = new ActionRowBuilder().addComponents(dashboardBtn);

        // Update the public message
        await message.edit({ 
            content: '', // Explicitly clear any leftover text
            files: [attachment],
            components: [row]
        })
        .then(() => logger.info(`[SYNC_DEBUG] SUCCESSFULLY EDITED public message ${message.id}`, 'ProfileHandlers'))
        .catch(err => logger.error(`[SYNC_DEBUG] FAILED TO EDIT public message: ${err.message}`, 'ProfileHandlers'));
        
    } catch (err) {
        logger.error('[SYNC_DEBUG] Unexpected sync error:', err, 'ProfileHandlers');
    }
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
const showAvatarMenu = async (interaction, avatarConfigOverride = null) => {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const member = interaction.member;

    const [dbAvatarConfig, dbBannerConfig, dbColor, dbTitle, rankData, linkedUsername, guildConfig] = await Promise.all([
        getUserAvatarConfig(userId, guildId),
        getUserBannerConfig(userId, guildId),
        getUserColor(userId, guildId),
        getUserTitle(userId, guildId),
        getUserRank(userId, guildId),
        getLinkedAnilist(userId, guildId),
        fetchConfig(guildId)
    ]);

    const activeAvatarConfig = avatarConfigOverride || dbAvatarConfig;
    const color = dbColor || '#3B82F6';

    // Generate Verification Card
    const bannerUrl = await resolveBannerUrl(interaction.user, member, dbBannerConfig);
    const xp = rankData ? parseInt(rankData.xp) : 0;
    const level = rankData ? parseInt(rankData.level) : 0;
    const progress = getLevelProgress(xp, level);
    
    let favorites = [];
    if (linkedUsername) {
        try {
            const alRes = await getAniListProfile(linkedUsername);
            if (alRes.favorites) favorites = alRes.favorites;
            if (activeAvatarConfig.source === 'ANILIST' && alRes.avatar) {
                activeAvatarConfig.anilistAvatar = alRes.avatar;
            }
        } catch(e) {}
    }

    const userData = {
        xp, level, rank: rankData ? rankData.rank : '?',
        current: progress.current, required: progress.required, percent: progress.percent,
        title: dbTitle || 'Patron',
        joinedDate: member ? member.joinedAt.toLocaleDateString() : 'Unknown',
        messages: Math.floor(xp / 20),
        anilist_synced: !!linkedUsername,
        avatarConfig: activeAvatarConfig,
        guildAvatarUrl: member ? member.displayAvatarURL({ extension: 'png' }) : interaction.user.displayAvatarURL({ extension: 'png' })
    };

    const buffer = await generateProfileCard(interaction.user, userData, favorites, bannerUrl, color, member.displayName);
    const attachment = new AttachmentBuilder(buffer, { name: 'avatar-preview.webp' });

    const embed = baseEmbed('👤 Profile Picture Configuration', 
        `Select your digital signature source.\nCurrent Source: **${activeAvatarConfig.source.replace('_', ' ')}**`, 
        null
    )
        .setColor(color)
        .setImage('attachment://avatar-preview.webp');

    const btnDefault = new ButtonBuilder()
        .setCustomId('profile_pfp_default')
        .setLabel('Default (Global)')
        .setStyle(activeAvatarConfig.source === 'DISCORD_GLOBAL' ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji('🌐');

    const btnServer = new ButtonBuilder()
        .setCustomId('profile_pfp_server')
        .setLabel('Server Profile')
        .setStyle(activeAvatarConfig.source === 'DISCORD_GUILD' ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji('🏰');

    const btnAniList = new ButtonBuilder()
        .setCustomId('profile_pfp_anilist')
        .setLabel('AniList Avatar')
        .setStyle(activeAvatarConfig.source === 'ANILIST' ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji('🅰️');

    const btnUpload = new ButtonBuilder()
        .setCustomId('profile_pfp_upload')
        .setLabel('Send in Chat')
        .setStyle(activeAvatarConfig.source === 'CUSTOM' && !activeAvatarConfig.customUrl?.startsWith('http') ? ButtonStyle.Success : ButtonStyle.Primary)
        .setEmoji(hasPremium(interaction.member, guildConfig) ? '📥' : '🔒');

    const btnUrl = new ButtonBuilder()
        .setCustomId('profile_pfp_custom')
        .setLabel('URL Upload')
        .setStyle(activeAvatarConfig.source === 'CUSTOM' && activeAvatarConfig.customUrl?.startsWith('http') ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji(hasPremium(interaction.member, guildConfig) ? '🔗' : '🔒');

    const btnBack = new ButtonBuilder()
        .setCustomId('profile_home')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(btnDefault, btnServer, btnAniList);
    const row2 = new ActionRowBuilder().addComponents(btnUpload, btnUrl, btnBack);

    await safeUpdate(interaction, { 
        embeds: [embed], 
        files: [attachment],
        components: [row1, row2] 
    });
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
        
        // V4.15: Track the public profile message for live synchronization
        if (userId === targetId && interaction.message) {
            activeProfileMessages.set(userId, {
                channelId: interaction.channelId,
                messageId: interaction.message.id
            });
            logger.info(`Tracking public profile message for user ${userId}: Msg ${interaction.message.id} in Chan ${interaction.channelId}`, 'ProfileHandlers');
        }

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

    // --- MODAL TRIGGERS (Must be handled BEFORE safeDefer) ---
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
        return showAvatarMenu(interaction, { source });
    }



    if (id === 'profile_pfp_upload') {
        const guildConfig = await fetchConfig(guildId);
        const filter = m => m.author.id === userId && m.attachments.size > 0;
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
            
            await interaction.followUp({ content: '✅ **Identity Secured**: Your new digital signature has been successfully archived.', flags: MessageFlags.Ephemeral });
            
            return showAvatarMenu(interaction, { source: 'CUSTOM', customUrl: finalUrl });
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
        
        updatePublicProfile(interaction);
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
            updatePublicProfile(interaction);
            return showBannerMenu(interaction);
        }

        await updateUserBannerConfig(userId, guildId, source);
        updatePublicProfile(interaction);
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
            updatePublicProfile(interaction);
            await interaction.followUp({ content: '✅ **Archival Transmission Logged**: Your identity background has been secured. Check your public profile for the updated view! ♡', flags: MessageFlags.Ephemeral });
            
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
            updatePublicProfile(interaction);
            return showBannerMenu(interaction);
        }
    }

    // Color Options
    if (id === 'profile_color_basic') return showBasicColorSelect(interaction);

    if (id === 'profile_select_basic_color') {
        await safeDefer(interaction);
        const hex = interaction.values[0];
        await updateUserColor(userId, guildId, hex);
        updatePublicProfile(interaction);
        return showProfileDashboard(interaction, true);
    }

    if (id === 'profile_color_sync') {
        const roleColor = interaction.member.displayHexColor;
        if (roleColor === '#000000') {
            return interaction.reply({ content: '⚠️ Your role has no color set.', flags: MessageFlags.Ephemeral });
        }
        await safeDefer(interaction);
        await updateUserColor(userId, guildId, roleColor);
        updatePublicProfile(interaction);
        return showProfileDashboard(interaction, true);
    }



    if (id === 'profile_color_auto') {
        await safeDefer(interaction);
        const bannerConfig = await getUserBannerConfig(userId, guildId);
        const bannerUrl = await resolveBannerUrl(interaction.user, interaction.member, bannerConfig);
        if (bannerUrl) {
            const autoColor = await getDominantColor(bannerUrl);
            await updateUserColor(userId, guildId, autoColor);
            updatePublicProfile(interaction);
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
            updatePublicProfile(interaction);
            await showProfileDashboard(interaction, true);
            return;
        }

        if (interaction.customId === 'profile_modal_bg') {
            const url = interaction.fields.getTextInputValue('url');
            if (!url.startsWith('http')) return interaction.reply({ content: '❌ Invalid URL.', flags: MessageFlags.Ephemeral });

            await updateUserBackground(interaction.user.id, interaction.guild.id, url);

            await safeDefer(interaction);
            updatePublicProfile(interaction);
            await showProfileDashboard(interaction, true); // Or showBackgroundMenu? User likely wants to go back to dashboard.
            return;
        }
        if (interaction.customId === 'profile_modal_pfp') {
            const url = interaction.fields.getTextInputValue('url');
            if (!url.startsWith('http')) return interaction.reply({ content: '❌ **Transmission Error**: The provided archival URL is invalid.', flags: MessageFlags.Ephemeral });

            await updateUserAvatarConfig(interaction.user.id, interaction.guild.id, 'CUSTOM', url);

            await safeDefer(interaction);
            updatePublicProfile(interaction);
            return showAvatarMenu(interaction, { source: 'CUSTOM', customUrl: url });
        }
    } catch (err) {
        if (err.code === 10062 || err.code === 40060) return;
        logger.error('Profile Modal Error:', err, 'ProfileHandlers');
    }
};

module.exports = { 
    showProfileDashboard, 
    handleProfileInteraction, 
    handleProfileModals,
    routerConfig: {
        prefixes: ['profile_', 'archive_access_'],
        handle: async (interaction) => {
            if (interaction.isModalSubmit()) return handleProfileModals(interaction);
            return handleProfileInteraction(interaction);
        }
    }
};
