const fs = require('fs');
const path = require('path');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, AttachmentBuilder, ComponentType, MessageFlags } = require('discord.js');
const { updateUserColor, updateUserTitle, updateUserBackground, getOwnedTitles, getUserColor, getUserTitle, getUserBackground, getUserAvatarConfig, updateUserAvatarConfig, getLinkedAnilist } = require('../core/database');
const { generateProfileCard, getDominantColor } = require('../generators/profileGenerator');
const { getUserRank, getLevelProgress } = require('../services/leveling');
const { getAniListProfile } = require('../services/anilistService');

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

const hasPremium = (member) => {
    // Premium check logic
    return member.roles.cache.some(r => r.name.includes('Benefactor') || r.name.includes('Patron')) || member.permissions.has('Administrator');
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

const safeReply = async (interaction, payload) => {
    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(payload);
        } else {
            await interaction.reply(payload);
        }
    } catch (e) {
        if (e.code === 10062 || e.code === 40060) return;
        console.error('SafeReply Error:', e);
    }
};

// --- PREVIEW HELPER ---
const sendProfilePreview = async (interaction, titleOverride = null, colorOverride = null, bgOverride = undefined, avatarOverride = null) => {
    try {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;

        // Optimized Data Fetching (Parallel)
        const [
            dbColor,
            dbTitle,
            dbBg,
            dbAvatarConfig,
            rankData,
            linkedUsername
        ] = await Promise.all([
            colorOverride ? Promise.resolve(null) : getUserColor(userId, guildId),
            titleOverride ? Promise.resolve(null) : getUserTitle(userId, guildId),
            bgOverride !== undefined ? Promise.resolve(null) : getUserBackground(userId, guildId),
            getUserAvatarConfig(userId, guildId), // Always fetch base config to merge if needed
            getUserRank(userId, guildId),
            getLinkedAnilist(userId, guildId)
        ]);

        const color = colorOverride || dbColor || '#FFACD1';
        const title = titleOverride || dbTitle || 'Muse Reader';
        const bg = bgOverride !== undefined ? bgOverride : dbBg;
        let avatarConfig = dbAvatarConfig;
        if (avatarOverride) avatarConfig = { ...avatarConfig, ...avatarOverride };

        // Process Stats
        const xp = rankData ? parseInt(rankData.xp) : 0;
        const level = rankData ? parseInt(rankData.level) : 0;
        const progress = getLevelProgress(xp, level);

        let knowledgeRank = 'Novice';
        if (level >= 5) knowledgeRank = 'Apprentice';
        if (level >= 10) knowledgeRank = 'Scholar';
        if (level >= 20) knowledgeRank = 'Sage';
        if (level >= 30) knowledgeRank = 'Archivist';
        if (level >= 50) knowledgeRank = 'Muse';

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
            guildAvatarUrl: interaction.member.displayAvatarURL({ extension: 'png' })
        };

        const buffer = await generateProfileCard(interaction.user, userData, favorites, bg, color, interaction.member.displayName);
        const attachment = new AttachmentBuilder(buffer, { name: 'preview.png' });

        const msgs = [
            "✨ Looking sharp! Here is your updated design.",
            "🎨 A fresh coat of paint! How does it look?",
            "📄 Freshly printed from the archives!",
            "🧐 Your new identity card is ready for inspection.",
            "💫 Updates applied! Here is the result."
        ];

        await interaction.followUp({
            content: msgs[Math.floor(Math.random() * msgs.length)],
            files: [attachment],
            flags: 64
        });

    } catch (err) {
        if (err.code === 10062 || err.code === 40060) return;
        console.error('Preview Gen Error:', err);
    }
};

const showProfileDashboard = async (interaction, isUpdate = false) => {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const member = interaction.member;

    const [color, title, bg, ownedTitlesRaw] = await Promise.all([
        getUserColor(userId, guildId),
        getUserTitle(userId, guildId),
        getUserBackground(userId, guildId),
        getOwnedTitles(userId)
    ]);

    const ownedTitles = [...ownedTitlesRaw]; // Copy to avoid mutation issues if cached
    if (!ownedTitles.includes('Muse Reader')) ownedTitles.unshift('Muse Reader');

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`Identity Dashboard: ${interaction.user.username}`)
        .setDescription('Manage your official Library Card appearance and details.')
        .setImage('https://dummyimage.com/600x5/2f3136/2f3136.png') // Spacer
        .addFields(
            { name: '🎨 Theme Interface', value: `\`${color}\``, inline: true },
            { name: '🏷️ Active Title', value: `\`${title}\``, inline: true },
            { name: '🖼️ Background', value: bg ? '[Custom Overlay Active]' : 'Standard Blur', inline: true }
        )
        .setFooter({ text: 'AniMuse Library Systems', iconURL: interaction.client.user.displayAvatarURL() });

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
        .setPlaceholder('Select your Identity Title')
        .addOptions(titleOptions);

    // --- Buttons ---
    const btnColor = new ButtonBuilder()
        .setCustomId('profile_opt_color')
        .setLabel('Theme Color')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🎨');

    const btnBg = new ButtonBuilder()
        .setCustomId('profile_opt_bg')
        .setLabel('Custom Background')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🖼️');

    const btnAvatar = new ButtonBuilder()
        .setCustomId('profile_opt_avatar')
        .setLabel('Profile Picture')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('👤');

    if (!hasPremium(member)) {
        btnBg.setEmoji('🔒');
    }

    const row1 = new ActionRowBuilder().addComponents(titleSelect);
    const row2 = new ActionRowBuilder().addComponents(btnColor, btnBg, btnAvatar);

    const payload = {
        content: '',
        embeds: [embed],
        components: [row1, row2],
        flags: 64
    };

    await safeReply(interaction, payload);
};

// --- BACKGROUND MENU ---
const showBackgroundMenu = async (interaction) => {
    if (!hasPremium(interaction.member)) {
        return interaction.reply({ content: '🔒 **Premium Feature**\nCustom backgrounds are available to "Library Benefactors".', flags: 64 });
    }

    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const bgUrl = await getUserBackground(userId, guildId);

    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🖼️ Custom Background Controller')
        .setDescription('Upload a custom image or select a preset from the archives.')
        .setImage(bgUrl || 'https://dummyimage.com/930x350/101015/555555.png&text=No+Custom+Background+Active');

    const btnUpload = new ButtonBuilder()
        .setCustomId('profile_bg_upload')
        .setLabel('Upload Image')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📤');

    const btnRemove = new ButtonBuilder()
        .setCustomId('profile_bg_remove')
        .setLabel('Remove Background')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
        .setDisabled(!bgUrl);

    const btnBack = new ButtonBuilder()
        .setCustomId('profile_home')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary);

    const rowButtons = new ActionRowBuilder().addComponents(btnUpload, btnRemove, btnBack);

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
                .setCustomId('profile_bg_preset_select')
                .setPlaceholder('Select from Archival Presets')
                .addOptions(options);

            presetComponents.push(new ActionRowBuilder().addComponents(select));
        }
    }

    await safeReply(interaction, {
        embeds: [embed],
        components: [...presetComponents, rowButtons]
    });
};

const showColorMenu = async (interaction) => {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const bgUrl = await getUserBackground(userId, guildId);

    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('🎨 Theme Color Configuration')
        .setDescription('Select a color source for your profile elements.');

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

    if (!hasPremium(interaction.member)) {
        btnHex.setLabel('Custom Hex (Premium)').setDisabled(true);
    }

    const components = [btnBasic, btnSync, btnHex];

    // AUTO COLOR BUTTON
    if (bgUrl && hasPremium(interaction.member)) {
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

    await safeReply(interaction, { embeds: [embed], components: [row1] });
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

    await safeReply(interaction, {
        content: '**Basic Pigments**',
        embeds: [],
        components: [row1, row2]
    });
};

// --- AVATAR MENU ---
const showAvatarMenu = async (interaction) => {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const config = await getUserAvatarConfig(userId, guildId);

    const embed = new EmbedBuilder()
        .setColor('#2b2d31')
        .setTitle('👤 Profile Picture Configuration')
        .setDescription(`Current Source: **${config.source.replace('_', ' ')}**`);

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

    const btnCustom = new ButtonBuilder()
        .setCustomId('profile_pfp_custom')
        .setLabel('Custom Upload')
        .setStyle(config.source === 'CUSTOM' ? ButtonStyle.Success : ButtonStyle.Primary)
        .setEmoji(hasPremium(interaction.member) ? '📤' : '🔒');

    const btnBack = new ButtonBuilder()
        .setCustomId('profile_home')
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(btnDefault, btnServer, btnAniList, btnCustom, btnBack);

    await safeReply(interaction, { embeds: [embed], components: [row] });
};

// --- HANDLERS ---

const handleProfileInteraction = async (interaction) => {
    const id = interaction.customId;
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    if (id === 'profile_home') return showProfileDashboard(interaction, true);

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
                return interaction.followUp({ content: '❌ You must link an AniList account first.', ephemeral: true });
            }
            source = 'ANILIST';
        }

        await updateUserAvatarConfig(userId, guildId, source);
        await sendProfilePreview(interaction, undefined, undefined, undefined, { source });
        return showAvatarMenu(interaction); // Refresh buttons
    }

    if (id === 'profile_pfp_custom') {
        if (!hasPremium(interaction.member)) {
            return interaction.reply({ content: '🔒 Custom Avatars are a premium feature.', ephemeral: true });
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

    if (id === 'profile_opt_bg') return showBackgroundMenu(interaction);

    // Background Actions
    if (id === 'profile_bg_remove') {
        await safeDefer(interaction);
        await updateUserBackground(userId, guildId, null);
        await sendProfilePreview(interaction, undefined, undefined, null); // Force null bg
        return showBackgroundMenu(interaction); // Refresh menu logic
    }

    if (id === 'profile_bg_upload') {
        const modal = new ModalBuilder().setCustomId('profile_modal_bg').setTitle('Custom Background Overlay');
        const input = new TextInputBuilder()
            .setCustomId('url')
            .setLabel('Image URL (Direct Link)')
            .setPlaceholder('https://example.com/image.png')
            .setStyle(TextInputStyle.Short);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    if (id === 'profile_bg_preset_select') {
        const selection = interaction.values[0];
        if (selection.startsWith('PRESET:')) {
            const filename = selection.split('PRESET:')[1];
            // Resolve absolute path
            const absPath = path.join(__dirname, 'images', 'profile-presets', filename);
            await safeDefer(interaction);
            await updateUserBackground(userId, guildId, absPath);
            await sendProfilePreview(interaction, undefined, undefined, absPath);
            return showBackgroundMenu(interaction);
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
            return interaction.reply({ content: '⚠️ Your role has no color set.', ephemeral: true });
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
        const bgUrl = await getUserBackground(userId, guildId);
        if (bgUrl) {
            const autoColor = await getDominantColor(bgUrl);
            await updateUserColor(userId, guildId, autoColor);
            await sendProfilePreview(interaction, undefined, autoColor);
        }
        return showProfileDashboard(interaction, true);
    }
};

// --- MODAL HANDLERS ---
const handleProfileModals = async (interaction) => {
    try {
        if (interaction.customId === 'profile_modal_hex') {
            const hex = interaction.fields.getTextInputValue('hex');
            if (!/^#[0-9A-F]{6}$/i.test(hex) && !/^#[0-9A-F]{3}$/i.test(hex)) {
                return interaction.reply({ content: '❌ Invalid Hex Code.', ephemeral: true });
            }
            await updateUserColor(interaction.user.id, interaction.guild.id, hex);

            await safeDefer(interaction);
            await sendProfilePreview(interaction, undefined, hex);
            await showProfileDashboard(interaction, true);
            return;
        }

        if (interaction.customId === 'profile_modal_bg') {
            const url = interaction.fields.getTextInputValue('url');
            if (!url.startsWith('http')) return interaction.reply({ content: '❌ Invalid URL.', ephemeral: true });

            await updateUserBackground(interaction.user.id, interaction.guild.id, url);

            await safeDefer(interaction);
            await sendProfilePreview(interaction, undefined, undefined, url);
            await showProfileDashboard(interaction, true); // Or showBackgroundMenu? User likely wants to go back to dashboard.
            return;
        }
        if (interaction.customId === 'profile_modal_pfp') {
            const url = interaction.fields.getTextInputValue('url');
            if (!url.startsWith('http')) return interaction.reply({ content: '❌ Invalid URL.', ephemeral: true });

            await updateUserAvatarConfig(interaction.user.id, interaction.guild.id, 'CUSTOM', url);

            await safeDefer(interaction);
            await sendProfilePreview(interaction, undefined, undefined, undefined, { source: 'CUSTOM', customUrl: url });
            await showAvatarMenu(interaction);
            return;
        }
    } catch (err) {
        if (err.code === 10062 || err.code === 40060) return;
        console.error('Profile Modal Error:', err);
    }
};

module.exports = { showProfileDashboard, handleProfileInteraction, handleProfileModals };
