const fs = require('fs');
const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, AttachmentBuilder, ComponentType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { 
    updateUserColor, updateUserTitle, updateUserBannerConfig, clearUserBannerGlobally, 
    getUserBannerConfig, updateUserAvatarConfig, fetchConfig 
} = require('../core/database');
const { generateProfileCard, getDominantColor } = require('../generators/profileGenerator');
const { resolveBannerUrl, safeUpdate, safeDefer } = require('../core/visualUtils');
const { getProfileContext } = require('../core/profileContext');
const baseEmbed = require('../generators/baseEmbed');
const { uploadFromUrl, BUCKETS } = require('../services/storageService');
const logger = require('../core/logger');

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
    if (!member) return false;
    // 1. Administrative Override
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
    
    // 2. Official Archival Config Check (ID-based)
    if (config && config.premium_role_id && member.roles.cache.has(config.premium_role_id)) return true;
    
    // 3. Nomenclature Fallback (Name-based)
    const premiumIdentifiers = ['Benefactor', 'Patron', 'Seraphic Muse'];
    return member.roles.cache.some(r => premiumIdentifiers.some(id => r.name.includes(id)));
};

// --- PREVIEW HELPER ---

// --- PREVIEW HELPER ---


/**
 * V5.0: Unified Display Refresher
 * The core engine that synchronizes both the Ephemeral Dashboard and Public Card.
 * Generates the canvas ONCE to save CPU and ensure perfect visual parity.
 */
const refreshProfileDisplays = async (interaction, context, options = {}) => {
    const { showDashboard = true, syncPublic = true } = options;
    const { user, member, settings, visuals, anilist, stats, guildId } = context;
    const userId = user.id;

    try {
        // 1. Materialize the Unified Identity Card
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
        const attachment = new AttachmentBuilder(buffer, { name: 'profile-identity.webp' });

        // 2. Ephemeral Dashboard Update (Remote Controller Mode)
        if (showDashboard) {
            const sourceMsgId = options.sourceMsgId || (interaction.customId?.includes('|M:') ? interaction.customId.split('|M:')[1] : null);
            const suffix = sourceMsgId ? `|M:${sourceMsgId}` : '';

            const embed = baseEmbed(`Identity Dashboard: ${user.username}`, 
                '📡 **Remote Uplink Established**: Your identity records are being projected onto your public profile card.\n\n*This dashboard is private; changes are reflected instantly on your active card.*',
                interaction.client.user.displayAvatarURL()
            )
                .setColor(settings.color)
                .addFields(
                    { name: '🎨 Theme', value: `\`${settings.color}\``, inline: true },
                    { name: '🏷️ Title', value: `\`${settings.title}\``, inline: true },
                    { name: '🖼️ Background', value: settings.bannerConfig.source !== 'PRESET' || settings.bannerConfig.customUrl ? '[Custom Uplink]' : 'Standard', inline: true }
                );

            // Row 1: Title Select
            const titleOptions = settings.ownedTitles.slice(0, 25).map(t => new StringSelectMenuOptionBuilder()
                .setLabel(t).setValue(t).setDefault(t === settings.title).setEmoji('🏷️')
            );
            const titleSelect = new StringSelectMenuBuilder().setCustomId(`profile_title_select${suffix}`).setPlaceholder('Archival Title Select').addOptions(titleOptions);

            // Row 2: Controls
            const btnColor = new ButtonBuilder().setCustomId(`profile_opt_color${suffix}`).setLabel('Theme').setStyle(ButtonStyle.Primary).setEmoji('🎨');
            const btnBanner = new ButtonBuilder().setCustomId(`profile_opt_banner${suffix}`).setLabel('Banner').setStyle(ButtonStyle.Secondary).setEmoji('🖼️');
            const btnAvatar = new ButtonBuilder().setCustomId(`profile_opt_avatar${suffix}`).setLabel('Avatar').setStyle(ButtonStyle.Secondary).setEmoji('👤');

            const row1 = new ActionRowBuilder().addComponents(titleSelect);
            const row2 = new ActionRowBuilder().addComponents(btnColor, btnBanner, btnAvatar);

            await safeUpdate(interaction, {
                embeds: [embed],
                files: [], // Clear ephemeral files
                components: [row1, row2]
            });

            // 3. Public Synchronization (The Real Magic)
            if (syncPublic && sourceMsgId) {
                try {
                    const publicMsg = await interaction.channel.messages.fetch(sourceMsgId);
                    if (publicMsg && publicMsg.editable) {
                        await publicMsg.edit({ 
                            files: [attachment],
                            components: publicMsg.components // Maintain existing HUD buttons
                        });
                    }
                } catch (err) {
                    logger.warn('Public Profile Sync Interrupted:', err, 'ProfileHandlers');
                }
            }
        }

    } catch (err) {
        logger.error('Unified Display Refresh Failure:', err, 'ProfileHandlers');
        await interaction.followUp({ content: '❌ **Archival Rendering Error**: Systems collapsed during identity materialization. Please try again.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
};

const showProfileDashboard = async (interaction, targetId, sourceMsgId = null) => {
    // Determine if we need a new ephemeral reply or a surgical update to an existing dashboard
    const isNewSession = interaction.customId?.startsWith('profile_dash_open_') || interaction.customId?.startsWith('profile_dashboard_open_');
    
    if (isNewSession) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
    } else {
        await interaction.deferUpdate().catch(() => {});
    }

    const context = await getProfileContext(interaction.user.id, interaction.guild.id, interaction.client);
    return refreshProfileDisplays(interaction, context, { syncPublic: !!sourceMsgId, sourceMsgId }); 
};

// V5.0: The legacy updatePublicProfile has been merged into refreshProfileDisplays for atomic updates.


// --- V4.3: ENHANCED PROFILE HUD MENU (EPHEMERAL) ---
const showProfileHUDMenu = async (interaction, targetId) => {
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        }

        const context = await getProfileContext(targetId, interaction.guild.id, interaction.client);
        const { user, member, settings, visuals, anilist, stats } = context;

        // V5.0: Re-use common data context
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
            title: settings.title
        };

        const buffer = await generateProfileCard(user, userData, anilist.favorites, visuals.bannerUrl, settings.color, member ? member.displayName : user.username);
        const attachment = new AttachmentBuilder(buffer, { name: 'profile-hud.webp' });

        const embed = baseEmbed(`Identity HUD: ${user.username}`, null, null).setColor(settings.color).setImage('attachment://profile-hud.webp');

        const sourceMsgId = interaction.message?.id;
        const suffix = sourceMsgId ? `|M:${sourceMsgId}` : '';

        const select = new StringSelectMenuBuilder()
            .setCustomId(`profile_hud_nav_${targetId}${suffix}`)
            .setPlaceholder('Select Telemetry Stream (Records)')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('Anime Statistics').setValue('anime').setEmoji('📺'),
                new StringSelectMenuOptionBuilder().setLabel('Manga Archives').setValue('manga').setEmoji('📚'),
                new StringSelectMenuOptionBuilder().setLabel('Social History').setValue('social').setEmoji('💬')
            );

        const btnMoreInfo = new ButtonBuilder().setCustomId(`profile_more_info_${targetId}${suffix}`).setLabel('Detailed Records').setStyle(ButtonStyle.Primary).setEmoji('🗃️');
        const row1 = new ActionRowBuilder().addComponents(select);
        const row2 = new ActionRowBuilder().addComponents(btnMoreInfo);

        if (interaction.user.id === targetId) {
            row2.addComponents(new ButtonBuilder().setCustomId(`profile_dash_open_${targetId}${suffix}`).setLabel('Customize').setStyle(ButtonStyle.Secondary).setEmoji('🎨'));
        }

        await interaction.editReply({ embeds: [embed], files: [attachment], components: [row1, row2] });
    } catch (err) {
        logger.error('HUD Menu Final Failure:', err, 'ProfileHandlers');
    }
};


// --- BANNER MENU ---
const showBannerMenu = async (interaction) => {
    const context = await getProfileContext(interaction.user.id, interaction.guild.id, interaction.client);
    const { settings } = context;

    if (!settings.isPremium) {
        return interaction.reply({ content: '🔒 **Archival Restriction**: Customized Banners are reserved for patrons.', flags: MessageFlags.Ephemeral });
    }

    const sourceMsgId = interaction.customId?.includes('|M:') ? interaction.customId.split('|M:')[1] : null;
    const suffix = sourceMsgId ? `|M:${sourceMsgId}` : '';

    const embed = baseEmbed('🖼️ Identity Banner Controller', '📡 **Remote Uplink Established**: Your banner selection will be projected onto your public profile card.\n\n*Select a source to synchronize.*')
        .setColor(settings.color)
        .addFields({ name: 'Current Source', value: `\`${settings.bannerConfig.source.replace('_', ' ')}\`` });

    const btnUser = new ButtonBuilder().setCustomId(`profile_banner_sync_user${suffix}`).setLabel('User').setStyle(settings.bannerConfig.source === 'DISCORD_USER' ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji('👤');
    const btnGuild = new ButtonBuilder().setCustomId(`profile_banner_sync_guild${suffix}`).setLabel('Guild').setStyle(settings.bannerConfig.source === 'DISCORD_GUILD' ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji('🏰');
    const btnAniList = new ButtonBuilder().setCustomId(`profile_banner_sync_anilist${suffix}`).setLabel('AniList').setStyle(settings.bannerConfig.source === 'ANILIST' ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji('🅰️');
    const btnUpload = new ButtonBuilder().setCustomId(`profile_banner_upload${suffix}`).setLabel('Upload').setStyle(ButtonStyle.Primary).setEmoji('📥');
    const btnRemove = new ButtonBuilder().setCustomId(`profile_banner_reset${suffix}`).setLabel('Reset').setStyle(ButtonStyle.Danger).setEmoji('🗑️');
    const btnBack = new ButtonBuilder().setCustomId(`profile_home${suffix}`).setLabel('Back').setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(btnUser, btnGuild, btnAniList, btnUpload);
    const row2 = new ActionRowBuilder().addComponents(btnRemove, btnBack);

    await safeUpdate(interaction, { embeds: [embed], files: [], components: [row1, row2] });
};

const showColorMenu = async (interaction) => {
    const context = await getProfileContext(interaction.user.id, interaction.guild.id, interaction.client);
    const { settings } = context;

    const sourceMsgId = interaction.customId?.includes('|M:') ? interaction.customId.split('|M:')[1] : null;
    const suffix = sourceMsgId ? `|M:${sourceMsgId}` : '';

    const embed = baseEmbed('🎨 Pigment Calibration', 'Configure your identity\'s primary archival color. Standardized pigments are available for all, while custom Hex entries require Seraphic Muse status.')
        .setColor(settings.color)
        .addFields({ name: 'Current Archival Color', value: `\`${settings.color}\`` });

    const btnBasic = new ButtonBuilder().setCustomId(`profile_color_basic${suffix}`).setLabel('Basic').setStyle(ButtonStyle.Secondary).setEmoji('🖌️');
    const btnSync = new ButtonBuilder().setCustomId(`profile_color_sync${suffix}`).setLabel('Role Sync').setStyle(ButtonStyle.Success).setEmoji('🔄');
    const btnHex = new ButtonBuilder().setCustomId(`profile_color_hex${suffix}`).setLabel('Hex Code').setStyle(ButtonStyle.Danger).setEmoji('✨');

    if (!settings.isPremium) btnHex.setLabel('Hex (Premium)').setDisabled(true);

    const row1 = new ActionRowBuilder().addComponents(btnBasic, btnSync, btnHex);

    if (settings.bannerConfig.customUrl && settings.isPremium) {
        row1.addComponents(new ButtonBuilder().setCustomId(`profile_color_auto${suffix}`).setLabel('Auto').setStyle(ButtonStyle.Primary).setEmoji('🪄'));
    }

    const btnBack = new ButtonBuilder().setCustomId(`profile_home${suffix}`).setLabel('Back').setStyle(ButtonStyle.Secondary);
    const row2 = new ActionRowBuilder().addComponents(btnBack);

    await safeUpdate(interaction, { embeds: [embed], components: [row1, row2] });
};

const showBasicColorSelect = async (interaction) => {
    const sourceMsgId = interaction.customId?.includes('|M:') ? interaction.customId.split('|M:')[1] : null;
    const suffix = sourceMsgId ? `|M:${sourceMsgId}` : '';

    const options = Object.entries(BASIC_COLORS).map(([name, hex]) =>
        new StringSelectMenuOptionBuilder().setLabel(name).setValue(hex).setDescription(hex)
    );

    const select = new StringSelectMenuBuilder().setCustomId(`profile_select_basic_color${suffix}`).setPlaceholder('Choose a standardized pigment').addOptions(options);
    const btnBack = new ButtonBuilder().setCustomId(`profile_opt_color${suffix}`).setLabel('Back').setStyle(ButtonStyle.Secondary);

    await safeUpdate(interaction, {
        content: '📡 **Calibrating Pigment Spectrum...**',
        embeds: [],
        components: [new ActionRowBuilder().addComponents(select), new ActionRowBuilder().addComponents(btnBack)]
    });
};

// --- AVATAR MENU ---
const showAvatarMenu = async (interaction) => {
    const context = await getProfileContext(interaction.user.id, interaction.guild.id, interaction.client);
    const { settings } = context;

    const sourceMsgId = interaction.customId?.includes('|M:') ? interaction.customId.split('|M:')[1] : null;
    const suffix = sourceMsgId ? `|M:${sourceMsgId}` : '';

    const embed = baseEmbed('👤 Profile Picture Configuration', `Select your digital signature source.\nCurrent Source: **${settings.avatarConfig.source.replace('_', ' ')}**`).setColor(settings.color);

    const btnDefault = new ButtonBuilder().setCustomId(`profile_pfp_default${suffix}`).setLabel('Global').setStyle(settings.avatarConfig.source === 'DISCORD_GLOBAL' ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji('🌐');
    const btnServer = new ButtonBuilder().setCustomId(`profile_pfp_server${suffix}`).setLabel('Server').setStyle(settings.avatarConfig.source === 'DISCORD_GUILD' ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji('🏰');
    const btnAniList = new ButtonBuilder().setCustomId(`profile_pfp_anilist${suffix}`).setLabel('AniList').setStyle(settings.avatarConfig.source === 'ANILIST' ? ButtonStyle.Success : ButtonStyle.Secondary).setEmoji('🅰️');
    const btnUpload = new ButtonBuilder().setCustomId(`profile_pfp_upload${suffix}`).setLabel('Upload').setStyle(ButtonStyle.Primary).setEmoji('📥');
    if (!settings.isPremium) btnUpload.setEmoji('🔒').setDisabled(true);

    const btnBack = new ButtonBuilder().setCustomId(`profile_home${suffix}`).setLabel('Back').setStyle(ButtonStyle.Secondary);

    const row1 = new ActionRowBuilder().addComponents(btnDefault, btnServer, btnAniList);
    const row2 = new ActionRowBuilder().addComponents(btnUpload, btnBack);

    await safeUpdate(interaction, { embeds: [embed], files: [], components: [row1, row2] });
};

// --- HANDLERS ---

const handleProfileInteraction = async (interaction) => {
    try {
        const fullId = interaction.customId;
        const [id, sourceMsgId] = fullId.split('|M:');
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        // 1. NAVIGATION & INITIALIZATION
        if (id === 'profile_home' || id.startsWith('profile_dash_open_') || id.startsWith('profile_custom_dashboard_')) {
            return showProfileDashboard(interaction, userId, sourceMsgId);
        }

        if (id.startsWith('profile_dashboard_open_')) {
            // This comes from the public profile mag glass
            return showProfileDashboard(interaction, userId, interaction.message.id);
        }

        if (id.startsWith('profile_more_info_')) {
            const targetId = id.split('_')[3];
            return showProfileHUDMenu(interaction, targetId);
        }

        // 2. SUB-MENUS
        if (id === 'profile_opt_color' || id === 'profile_opt_banner' || id === 'profile_opt_avatar' || id === 'profile_color_basic') {
            await interaction.deferUpdate().catch(() => {});
            if (id === 'profile_opt_color') return showColorMenu(interaction);
            if (id === 'profile_opt_banner') return showBannerMenu(interaction);
            if (id === 'profile_opt_avatar') return showAvatarMenu(interaction);
            if (id === 'profile_color_basic') return showBasicColorSelect(interaction);
        }

        // 3. ATOMIC UPDATES
        const atomicActions = [
            'profile_title_select', 'profile_select_basic_color', 'profile_color_sync', 
            'profile_color_auto', 'profile_banner_sync_', 'profile_banner_reset',
            'profile_pfp_default', 'profile_pfp_server', 'profile_pfp_anilist'
        ];

        if (atomicActions.some(action => id.startsWith(action))) {
            await safeDefer(interaction);
            
            if (id === 'profile_title_select') await updateUserTitle(userId, guildId, interaction.values[0]);
            else if (id === 'profile_select_basic_color') await updateUserColor(userId, guildId, interaction.values[0]);
            else if (id === 'profile_color_sync') {
                const roleColor = interaction.member.displayHexColor;
                if (roleColor !== '#000000') await updateUserColor(userId, guildId, roleColor);
            }
            else if (id === 'profile_color_auto') {
                const bannerConfig = await getUserBannerConfig(userId, guildId);
                const bannerUrl = await resolveBannerUrl(interaction.user, interaction.member, bannerConfig);
                if (bannerUrl) {
                    const dominant = await getDominantColor(bannerUrl);
                    await updateUserColor(userId, guildId, dominant);
                }
            }
            else if (id.startsWith('profile_banner_sync_')) {
                const source = id.split('_').pop().toUpperCase();
                await updateUserBannerConfig(userId, guildId, source);
            }
            else if (id === 'profile_banner_reset') {
                await updateUserBannerConfig(userId, guildId, 'PRESET', null);
                await updateUserColor(userId, guildId, '#FFACD1'); 
            }
            else if (id === 'profile_pfp_default') await updateUserAvatarConfig(userId, guildId, 'DISCORD_GLOBAL');
            else if (id === 'profile_pfp_server') await updateUserAvatarConfig(userId, guildId, 'DISCORD_GUILD');
            else if (id === 'profile_pfp_anilist') await updateUserAvatarConfig(userId, guildId, 'ANILIST');

            const context = await getProfileContext(userId, guildId, interaction.client);
            return refreshProfileDisplays(interaction, context);
        }

        // 4. MODAL TRIGGERS
        if (id === 'profile_color_hex') {
            const suffix = sourceMsgId ? `|M:${sourceMsgId}` : '';
            const modal = new ModalBuilder().setCustomId(`profile_modal_hex${suffix}`).setTitle('Custom Pigment Entry');
            const input = new TextInputBuilder().setCustomId('hex').setLabel('Hex Code').setPlaceholder('#FF0099').setStyle(TextInputStyle.Short).setMinLength(4).setMaxLength(7);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        // 5. ASSET UPLOADS
        if (id === 'profile_banner_upload' || id === 'profile_pfp_upload') {
            const type = id.includes('banner') ? 'Banner' : 'Avatar';
            await interaction.reply({ 
                content: `📤 **${type} Uplink Initiated**: Please upload your image.`, 
                flags: MessageFlags.Ephemeral 
            });

            const filter = m => m.author.id === userId && m.attachments.size > 0;
            const collector = interaction.channel.createMessageCollector({ filter, time: 45000, max: 1 });

            collector.on('collect', async m => {
                try {
                    const attachment = m.attachments.first();
                    const url = attachment.url;
                    const fileName = `${userId}_${Date.now()}.${attachment.name.split('.').pop()}`;
                    const bucket = type === 'Banner' ? BUCKETS.BANNERS : BUCKETS.AVATARS;

                    const permanentUrl = await uploadFromUrl(url, bucket, fileName);
                    if (permanentUrl) {
                        if (type === 'Banner') await updateUserBannerConfig(userId, guildId, 'CUSTOM', permanentUrl);
                        else await updateUserAvatarConfig(userId, guildId, 'CUSTOM', permanentUrl);
                        if (m.deletable) m.delete().catch(() => {});
                        
                        const context = await getProfileContext(userId, guildId, interaction.client);
                        await refreshProfileDisplays(interaction, context);
                    }
                } catch (e) {
                    logger.error(`Upload Error: ${e.message}`, 'ProfileHandlers');
                }
            });
        }
    } catch (err) {
        logger.error('V5 Profile Router Crash:', err, 'ProfileHandlers');
    }
};

// --- MODAL HANDLERS ---
const handleProfileModals = async (interaction) => {
    try {
        const fullId = interaction.customId;
        const [id, sourceMsgId] = fullId.split('|M:');
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        if (id === 'profile_modal_hex') {
            let hex = interaction.fields.getTextInputValue('hex');
            if (!hex.startsWith('#')) hex = '#' + hex;
            if (!/^#([0-9a-f]{3}){1,2}$/i.test(hex)) {
                return interaction.reply({ content: '❌ **Archival Error**: Invalid Hex sequence detected.', flags: MessageFlags.Ephemeral });
            }

            await updateUserColor(userId, guildId, hex.toUpperCase());
            await interaction.deferUpdate();
            
            const context = await getProfileContext(userId, guildId, interaction.client);
            return refreshProfileDisplays(interaction, context);
        }
    } catch (err) {
        logger.error('Profile Modal Failure:', err, 'ProfileHandlers');
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
