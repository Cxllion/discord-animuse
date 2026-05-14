const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, RoleSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const { fetchConfig, upsertConfig, getRoleCategories, createRoleCategory, deleteRoleCategory, seedRoleCategories, getServerRoles, registerServerRole, registerServerRoles, unregisterServerRole, getLevelRoles, setLevelRole, removeLevelRole } = require('../core/database');
const CONFIG = require('../config');
const baseEmbed = require('../generators/baseEmbed');
const { EMOJIS } = require('../config/emojiConfig');
const { COLOR_FAMILIES, BASIC_COLORS } = require('../config/colorConfig');
const { ROLE_DASHBOARD } = require('../config/constants');

// Utility for robust async operations with built-in timeouts
const withTimeout = (promise, ms, timeoutResult = null) => {
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(() => resolve(timeoutResult), ms))
    ]);
};

// Unified Progress Bar Helper (Premium Material Alignment)
const renderProgressBar = (progress, total) => {
    const percent = Math.min(Math.round((progress / total) * 100), 100);
    const size = 12; // Shorter bars often look better in Discord
    const filled = Math.min(Math.max(Math.round((percent / 100) * size), 0), size);
    const bar = '▰'.repeat(filled) + '▱'.repeat(size - filled);
    
    // Dynamic Frame based on current time
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const frame = frames[Math.floor(Date.now() / 800) % 10];
    
    return `${frame} \`${bar}\` **${percent}%** (\`${progress}/${total}\`)`;
};

// Constants injected from ROLE_DASHBOARD

// Standardized Execution Handler for long-running tasks
const runSafeTask = async (i, title, taskFn) => {
    let statusMsg;
    try {
        statusMsg = await i.channel.send(`⏳ **[${title}]** Initializing task...`);
        await taskFn(statusMsg);
    } catch (err) {
        console.error(`[${title}] Fatal Error:`, err);
        const errorMsg = `❌ **[${title}] Failed:** ${err.message || 'Unknown error'}`;
        if (statusMsg) await statusMsg.edit(errorMsg).catch(() => null);
        else await i.followUp({ content: errorMsg, flags: MessageFlags.Ephemeral }).catch(() => null);
    }
};

// Helper to manage interactions safely across multiple handlers
const safeUpdate = async (i, options) => {
    try {
        if (i.isModalSubmit() && !i.deferred && !i.replied) {
            return await i.update(options);
        }
        if (i.deferred || i.replied) {
            return await i.editReply(options);
        }
        if (i.update) {
            return await i.update(options);
        }
        return await i.reply(options);
    } catch (err) {
        if (err.code === 10062 || err.code === 40060) return;
        console.error('[RoleDashboard] safeUpdate Error:', err);
    }
};

const applyLibrarianBranding = (embed, i) => {
    return embed
        .setAuthor({ 
            name: `Librarian: ${i.user.tag}`, 
            iconURL: i.user.displayAvatarURL({ extension: 'png' }) 
        })
        .setThumbnail(i.guild.iconURL({ extension: 'png' }))
        .setFooter({ text: `AniMuse Hub • ${i.guild.name}` })
        .setTimestamp();
};

const getNavigationRow = (i, current = null) => {
    const options = [
        { label: 'Library Home', description: 'Return to the main management hub.', value: 'opt_refresh', emoji: EMOJIS.DASHBOARD },
        { label: 'Auto-Roles', description: 'Member, Bot, and status roles.', value: 'opt_autoroles', emoji: '🤖' },
        { label: 'Category Manager', description: 'Organize roles into group folders.', value: 'opt_categories', emoji: '🗂️' },
        { label: 'Levelling & Rank', description: 'Manage experience, archives, and rewards.', value: 'opt_levels', emoji: '📈' },
        { label: 'Color Catalog', description: 'Deploy curated premium color shades.', value: 'opt_colors', emoji: '🎨' },
        { label: 'Channel Architect', description: 'Zone management and feature binding.', value: 'opt_channels', emoji: '🏗️' },
        { label: 'Media & Airing', description: 'Airing alerts and gallery settings.', value: 'opt_media', emoji: EMOJIS.MEDIA },
        { label: 'Administrative Wing', description: 'Bans, Invites, and Server oversight.', value: 'opt_admin', emoji: EMOJIS.ADMIN },
        { label: 'Bot Insight', description: 'System health and performance metrics.', value: 'opt_insight', emoji: '📊' },
        { label: 'Server Purge', description: 'Clean up undocumented ghost roles.', value: 'opt_purge', emoji: '🧹' },
        { label: 'Role Organizing', description: 'Re-sort the library hierarchy.', value: 'opt_organize', emoji: '📏' },
        { label: 'Welcome Wing', description: 'Arrival protocols and orientations.', value: 'opt_welcome', emoji: '🚪' },
        { label: 'Muse Bureau', description: 'Auxiliary flavor and extra settings.', value: 'opt_muses', emoji: '🎭' }
    ];

    if (current) {
        options.forEach(o => o.default = (o.value === current));
    }

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('role_dash_menu')
            .setPlaceholder('Explore another wing of the Library...')
            .addOptions(options)
    );
};

const getBackRow = (customId = 'dash_home', label = 'Back to Hub') => {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(customId)
            .setLabel(label)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(EMOJIS.BACK)
    );
};

const displayRoleDashboard = async (interaction, isUpdate = false) => {
    const guild = interaction.guild;
    const roles = guild.roles.cache.size;
    const members = guild.memberCount;
    const categories = (await getRoleCategories(guild.id)).length;
    const latency = interaction.client.ws.ping;

    const embed = applyLibrarianBranding(baseEmbed(), interaction)
        .setTitle('AniMuse Library Dashboard')
        .setDescription('Welcome, Librarian. Manage the server architecture and bot configurations from this central hub.')
        .addFields(
            { name: '🏛️ Library Overview', value: `> 👥 Members: **${members}**\n> 🎭 Roles: **${roles}**\n> 🗂️ Categories: **${categories}**`, inline: false },
            { name: '🛰️ System Health', value: `> 📡 Pulse (Ping): **${latency}ms**\n> 🟢 Status: **Online**`, inline: true }
        );

    const navRow = getNavigationRow(interaction);
    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('opt_refresh').setLabel('Refresh Hub').setStyle(ButtonStyle.Secondary).setEmoji('🔄'),
        new ButtonBuilder().setCustomId('organize_perform').setLabel('Quick Organize').setStyle(ButtonStyle.Success).setEmoji('📐'),
        new ButtonBuilder().setCustomId('opt_insight').setLabel('System Pulse').setStyle(ButtonStyle.Primary).setEmoji('📊')
    );

    if (isUpdate) {
        await safeUpdate(interaction, { embeds: [embed], components: [navRow, actionRow] });
    } else {
        await interaction.reply({ embeds: [embed], components: [navRow, actionRow], flags: MessageFlags.Ephemeral });
    }
};

const handleChannelSelectInteractions = async (i) => {
    if (i.customId === 'level_channel_select') {
        const channelId = i.values[0];
        await upsertConfig(i.guild.id, { level_up_channel_id: channelId });
        return handleLevelSettings(i);
    }
    if (i.customId === 'level_filter_channels') {
        await upsertConfig(i.guild.id, { leveling_channels: i.values });
        return handleLevelSettings(i);
    }
};

const handleDashboardInteraction = async (i) => {
    // Proactively acknowledge to avoid 3s timeouts during DB fetches
    await i.deferUpdate().catch(() => null);

    try {
        // --- Navigation & Wing Routing ---
        const choice = (i.isStringSelectMenu() && i.customId === 'role_dash_menu') ? i.values[0] : i.customId;

        if (i.isChannelSelectMenu()) return await handleChannelSelectInteractions(i);

        if (choice === 'opt_refresh' || i.customId === 'role_dash_home' || i.customId === 'dash_home') {
            return await displayRoleDashboard(i, true);
        }
        if (choice === 'opt_flush_cache') {
            const { clearConfigCache } = require('../services/guildConfigService');
            clearConfigCache();
            return await handleBotInsight(i);
        }
        if (choice === 'opt_autoroles' || choice === 'opt_roles') return handleAutoRoles(i);
        if (choice === 'opt_categories') return handleCategories(i);
        if (choice === 'opt_levels') return handleLevels(i);
        if (choice === 'opt_colors') return handleColorRoles(i);
        if (choice === 'opt_purge') return handlePurge(i);
        if (choice === 'opt_organize') return handleOrganizeMenu(i);
        if (choice === 'opt_insight') return handleBotInsight(i);
        if (choice === 'opt_admin') return handleAdminWing(i);
        if (choice === 'opt_media') return handleMediaAiring(i);
        if (choice === 'opt_channels') {
            const { displayChannelDashboard } = require('./channelDashboard');
            return displayChannelDashboard(i, true);
        }
        if (choice === 'opt_welcome') {
            const { displayWelcomeDashboard } = require('./welcomeDashboard');
            return displayWelcomeDashboard(i, true);
        }
        if (choice === 'opt_muses') {
            const { displayMuseBureau } = require('./museBureau');
            return displayMuseBureau(i, true);
        }

        // --- Select Menu Logic ---
        if (i.isStringSelectMenu()) {
            if (i.customId.startsWith('cat_view_')) {
                return handleCategoryRoles(i, i.values[0]);
            }
        }
        
        if (i.isRoleSelectMenu()) {
            if (i.customId === 'autorole_set_premium') {
                await upsertConfig(i.guild.id, { premium_role_id: i.values[0] });
                return handleAutoRoles(i);
            }
            if (i.customId === 'autorole_set_member') {
                await upsertConfig(i.guild.id, { member_role_id: i.values[0] });
                return handleAutoRoles(i);
            }
            if (i.customId === 'autorole_set_bot') {
                await upsertConfig(i.guild.id, { bot_role_id: i.values[0] });
                return handleAutoRoles(i);
            }
            if (i.customId === 'autorole_set_booster') {
                await upsertConfig(i.guild.id, { booster_role_id: i.values[0] });
                return handleAutoRoles(i);
            }
            if (i.customId === 'level_role_bind_select') {
                const level = global.tempRoleDashStore?.[i.user.id]?.pendingLevel;
                if (!level) return i.reply({ content: 'Session expired. Try binding again.', flags: MessageFlags.Ephemeral }).catch(() => null);
                
                await setLevelRole(i.guild.id, level, i.values[0]);
                delete global.tempRoleDashStore[i.user.id];
                return handleLevels(i);
            }
            if (i.customId.startsWith('cat_role_reg_')) {
                const catId = i.customId.split('_').pop();
                await registerServerRole(i.guild.id, i.values[0], catId);
                return handleCategoryRoles(i, catId);
            }
            if (i.customId.startsWith('cat_role_unreg_')) {
                const catId = i.customId.split('_').pop();
                await unregisterServerRole(i.values[0]);
                return handleCategoryRoles(i, catId);
            }
        }

        if (i.isButton()) {
            if (i.customId === 'autorole_sync') return runRetroactiveAssignment(i);
            if (i.customId === 'level_deploy_standard') return executeLevelDeployment(i);
            if (i.customId === 'level_toggle') {
                const config = await fetchConfig(i.guild.id);
                await upsertConfig(i.guild.id, { leveling_enabled: config.leveling_enabled === false });
                return handleLevels(i);
            }
            if (i.customId === 'level_wing_settings') return handleLevelSettings(i);
            if (i.customId === 'level_wing_milestones') return handleLevelMilestones(i);
            if (i.customId === 'level_wing_analytics') return handleLevelAnalytics(i);
            if (i.customId === 'level_mode_toggle') {
                const config = await fetchConfig(i.guild.id);
                const newMode = (config.leveling_mode || 'BLACKLIST') === 'BLACKLIST' ? 'WHITELIST' : 'BLACKLIST';
                await upsertConfig(i.guild.id, { leveling_mode: newMode });
                return handleLevelSettings(i);
            }
            if (i.customId === 'level_msg_modal') {
                const config = await fetchConfig(i.guild.id);
                const modal = new ModalBuilder().setCustomId('modal_level_msg').setTitle('Level Up Message');
                const msgInput = new TextInputBuilder()
                    .setCustomId('level_msg')
                    .setLabel("Message ({user}, {level}, {tier}, {title})")
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Enter your custom ascension message...')
                    .setValue(config.xp_level_up_message || '')
                    .setRequired(false);
                modal.addComponents(new ActionRowBuilder().addComponents(msgInput));
                return i.showModal(modal);
            }
            if (i.customId === 'level_emoji_modal') {
                const config = await fetchConfig(i.guild.id);
                const modal = new ModalBuilder().setCustomId('modal_level_emoji').setTitle('Level Up Emoji');
                const emojiInput = new TextInputBuilder()
                    .setCustomId('level_emoji')
                    .setLabel("Reaction Emoji (✨, :star:, etc.)")
                    .setStyle(TextInputStyle.Short)
                    .setValue(config.xp_level_up_emoji || '✨')
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(emojiInput));
                return i.showModal(modal);
            }
            
            if (i.customId === 'cat_create') {
                const modal = new ModalBuilder().setCustomId('modal_cat_create').setTitle('Create Category');
                const catInput = new TextInputBuilder().setCustomId('cat_name').setLabel("Category Name").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(catInput));
                return i.showModal(modal);
            }
            if (i.customId.startsWith('cat_role_create_')) {
                const catId = i.customId.split('_').pop();
                const modal = new ModalBuilder().setCustomId(`modal_cat_role_create_${catId}`).setTitle('Create Role');
                const nameInput = new TextInputBuilder().setCustomId('role_name').setLabel("Role Name").setStyle(TextInputStyle.Short).setRequired(true);
                const colorInput = new TextInputBuilder().setCustomId('role_color').setLabel("Color (Hex)").setStyle(TextInputStyle.Short).setRequired(false);
                modal.addComponents(new ActionRowBuilder().addComponents(nameInput), new ActionRowBuilder().addComponents(colorInput));
                return i.showModal(modal);
            }
            if (i.customId.startsWith('cat_del_')) {
                const catId = i.customId.split('_').pop();
                await deleteRoleCategory(catId);
                return handleCategories(i);
            }

            if (i.customId === 'level_role_add') {
                const modal = new ModalBuilder().setCustomId('modal_level_bind').setTitle('Bind Level Role');
                const levelInput = new TextInputBuilder().setCustomId('level_num').setLabel("Level (e.g. 10)").setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(levelInput));
                return i.showModal(modal);
            }
            if (i.customId.startsWith('level_role_del_')) {
                const lvl = parseInt(i.customId.split('_').pop());
                await removeLevelRole(i.guild.id, lvl);
                return handleLevels(i);
            }

            if (i.customId === 'purge_confirm') return executePurge(i);
            if (i.customId === 'purge_dryrun') return dryRunPurge(i);
            if (i.customId === 'organize_confirm' || i.customId === 'organize_perform') return executeOrganize(i);
            
            if (i.customId.startsWith('color_page_')) {
                const page = parseInt(i.customId.split('_').pop());
                return handleColorRoles(i, page);
            }
            if (i.customId === 'color_deploy_basic') return executeColorDeployment(i, 'basic');
            if (i.customId === 'color_deploy_premium') return executeColorDeployment(i, 'premium');
        }

        if (i.isModalSubmit()) {
            if (i.customId === 'modal_cat_create') {
                const name = i.fields.getTextInputValue('cat_name');
                await createRoleCategory(i.guild.id, name);
                return handleCategories(i);
            }
            if (i.customId.startsWith('modal_cat_role_create_')) {
                const catId = i.customId.split('_').pop();
                const name = i.fields.getTextInputValue('role_name');
                const color = i.fields.getTextInputValue('role_color') || '#A78BFA';
                
                const botMember = await i.guild.members.fetchMe();
                if (!botMember.permissions.has('ManageRoles')) {
                    return i.reply({ content: "❌ **Error:** Bot lacks 'Manage Roles' permission.", flags: MessageFlags.Ephemeral });
                }

                const role = await i.guild.roles.create({ name, color, reason: 'Dashboard Creation' });
                await registerServerRole(i.guild.id, role.id, catId);
                return handleCategoryRoles(i, catId);
            }
            if (i.customId === 'modal_level_bind') {
                const lvlNum = parseInt(i.fields.getTextInputValue('level_num'));
                if (isNaN(lvlNum) || lvlNum < 1) return i.reply({ content: 'Invalid level.', flags: MessageFlags.Ephemeral }).catch(() => null);
                if (!global.tempRoleDashStore) global.tempRoleDashStore = {};
                global.tempRoleDashStore[i.user.id] = { pendingLevel: lvlNum };
                const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('level_role_bind_select').setPlaceholder(`Select Role for Level ${lvlNum}`));
                return i.reply({ content: `Select role for **Level ${lvlNum}**:`, components: [row], flags: MessageFlags.Ephemeral }).catch(() => null);
            }
            if (i.customId === 'modal_level_msg') {
                const msg = i.fields.getTextInputValue('level_msg');
                await upsertConfig(i.guild.id, { xp_level_up_message: msg || null });
                return handleLevelSettings(i);
            }
            if (i.customId === 'modal_level_emoji') {
                const emoji = i.fields.getTextInputValue('level_emoji');
                await upsertConfig(i.guild.id, { xp_level_up_emoji: emoji });
                return handleLevelSettings(i);
            }
        }
    } catch (e) {
        if (e.code === 10062 || e.code === 40060) return;
        console.error('[RoleDashboard] Interaction error:', e);
    }
};

const handleAutoRoles = async (i) => {
    const config = await fetchConfig(i.guild.id);
    const { member_role_id, bot_role_id, booster_role_id, premium_role_id } = config;

    const check = (id) => id ? (i.guild.roles.cache.has(id) ? `<@&${id}>` : `⚠️ **Invalid ID** (\`${id}\`)`) : '*Not Assigned*';

    const embed = applyLibrarianBranding(baseEmbed(), i)
        .setTitle('🤖 Auto-Role Protocol')
        .setDescription('Configure persistent roles that define the identity and structure of your library membership.')
        .addFields(
            { name: '👥 Member', value: check(member_role_id), inline: true },
            { name: '🤖 Bot', value: check(bot_role_id), inline: true },
            { name: '💎 Booster', value: check(booster_role_id), inline: true },
            { name: '✨ Seraphic', value: check(premium_role_id), inline: true }
        );

    const rows = [
        getNavigationRow(i, 'opt_autoroles'),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('autorole_set_member').setPlaceholder('Designate Member Role...')),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('autorole_set_bot').setPlaceholder('Designate Bot Role...')),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('autorole_set_premium').setPlaceholder('Designate Seraphic (Premium) Role...')),
        new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('autorole_set_booster').setPlaceholder('Designate Sacred (Booster) Role...')),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('autorole_sync').setLabel('Retroactive Sync').setStyle(ButtonStyle.Primary).setEmoji('🔄'),
            new ButtonBuilder().setCustomId('dash_home').setLabel('Home').setStyle(ButtonStyle.Secondary)
        )
    ];

    await safeUpdate(i, { embeds: [embed], components: rows });
};

const runRetroactiveAssignment = async (i) => {
    await i.reply({ content: '⏳ Starting synchronization. Watch for progress below.', flags: MessageFlags.Ephemeral }).catch(() => null);
    
    await runSafeTask(i, 'Sync', async (statusMsg) => {
        const config = await fetchConfig(i.guild.id);
        if (!config.member_role_id && !config.bot_role_id) {
            throw new Error('No Auto-Roles configured in database.');
        }

        const members = await i.guild.members.fetch({ force: true });
        const total = members.size;
        let success = 0, skipped = 0, failed = 0;
        const botMember = await i.guild.members.fetchMe();

        if (!botMember.permissions.has('ManageRoles')) {
            throw new Error("Bot lacks 'Manage Roles' permission to assign roles.");
        }

        const memberEntries = Array.from(members.values());
        for (let idx = 0; idx < memberEntries.length; idx++) {
            const member = memberEntries[idx];
            const rid = member.user.bot ? config.bot_role_id : config.member_role_id;
            
            if (!rid || member.roles.cache.has(rid)) {
                skipped++;
            } else {
                const role = i.guild.roles.cache.get(rid);
                // Smart Skipping: Check permissions/hierarchy
                if (role && role.editable) {
                    await member.roles.add(role).then(() => success++).catch(() => failed++);
                } else {
                    failed++;
                }
            }

            if ((idx + 1) % 50 === 0 || (idx + 1) === total) {
                await statusMsg.edit(
                    `🔄 **[Sync]** Assigning auto-roles...\n` +
                    `${renderProgressBar(idx + 1, total)}\n` +
                    `> 📊 Scanned: **${idx + 1}/${total}**\n` +
                    `> ✅ Assigned: **${success}**\n` +
                    `> ⏩ Skipped: **${skipped}**\n` +
                    `> ❌ Failed: **${failed}**`
                ).catch(() => null);
                await new Promise(res => setTimeout(res, 2000));
            }
        }
        await statusMsg.edit(`✅ **[Sync] Complete!** Processed ${total} members. Assigned ${success}, Skipped ${skipped}, Failed ${failed}.`);
    });
};

const handleCategories = async (i) => {
    let categories = await seedRoleCategories(i.guild.id);
    const sRoles = await getServerRoles(i.guild.id);
    
    categories = categories.filter(c => c.name !== 'Profile (Gender)')
        .sort((a, b) => {
            const idxA = ROLE_DASHBOARD.CATEGORY_ORDER.indexOf(a.name);
            const idxB = ROLE_DASHBOARD.CATEGORY_ORDER.indexOf(b.name);
            return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
        });

    let desc = 'Organize your server records into logical wings for easy identification and menu population.\n\n**Current Vitality:**\n';
    categories.forEach(c => {
        const catRoles = sRoles.filter(r => r.category_id === c.id);
        desc += `>> **${c.name}**: \`${catRoles.length}\` volumes registered.\n`;
    });

    const embed = applyLibrarianBranding(baseEmbed(), i)
        .setTitle('🗂️ Role Category Repository')
        .setDescription(desc);

    const select = new StringSelectMenuBuilder()
        .setCustomId('cat_view_')
        .setPlaceholder('Inspect a specific Category...')
        .addOptions(categories.map(c => ({ label: c.name, value: c.id.toString(), emoji: '📂' })));

    const rows = [
        getNavigationRow(i, 'opt_categories'),
        new ActionRowBuilder().addComponents(select),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cat_create').setLabel('New Category').setStyle(ButtonStyle.Success).setEmoji('➕'),
            new ButtonBuilder().setCustomId('dash_home').setLabel('Home').setStyle(ButtonStyle.Secondary)
        )
    ];
    await safeUpdate(i, { embeds: [embed], components: rows });
};

const handleCategoryRoles = async (i, categoryId) => {
    const categories = await getRoleCategories(i.guild.id);
    const cat = categories.find(c => c.id.toString() === categoryId.toString());
    if (!cat) return handleCategories(i);
    const sRoles = await getServerRoles(i.guild.id);
    const catRoles = sRoles.filter(r => r.category_id === cat.id);
    
    const mentions = catRoles.length ? catRoles.map(cr => {
        const role = i.guild.roles.cache.get(cr.role_id);
        if (!role) return `⚠️ \`${cr.role_id}\``;
        return `<@&${cr.role_id}> (\`${role.hexColor}\`)`;
    }).join('\n') : '*Empty*';
    
    const embed = applyLibrarianBranding(baseEmbed(), i)
        .setTitle(`Category Wing: ${cat.name}`)
        .setDescription(`**Registered Records:**\n${mentions}`)
        .setFooter({ text: 'Hierarchy Logic: Bottom categories appear highest in sorting.' });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cat_role_create_${cat.id}`).setLabel('Create Role').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId(`cat_del_${cat.id}`).setLabel('Delete Category').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
    );
    
    const row2 = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId(`cat_role_reg_${cat.id}`).setPlaceholder('Register Existing Role...')
    );

    const rows = [getNavigationRow(i, 'opt_categories'), row1, row2];

    if (catRoles.length) {
        const unregOptions = catRoles.map(cr => {
            const role = i.guild.roles.cache.get(cr.role_id);
            return {
                label: role ? role.name : `Unknown Role (${cr.role_id})`,
                value: cr.role_id,
                description: role ? `Hex: ${role.hexColor}` : 'ID missing from Discord cache.'
            };
        }).slice(0, 25);

        const unregMenu = new StringSelectMenuBuilder()
            .setCustomId(`cat_role_unreg_${cat.id}`)
            .setPlaceholder('Unregister / Remove Role...')
            .addOptions(unregOptions);
        
        rows.push(new ActionRowBuilder().addComponents(unregMenu));
    }

    rows.push(getBackRow('opt_categories', 'Back to Categories'));

    await safeUpdate(i, { embeds: [embed], components: rows });
};

const handleLevels = async (i) => {
    const config = await fetchConfig(i.guild.id);
    const levelingEnabled = config.leveling_enabled !== false;

    const embed = applyLibrarianBranding(baseEmbed(), i)
        .setTitle('📈 Levelling & Rank Archives')
        .setDescription(`Manage how users ascend through the Library's knowledge tiers.\n\n**Current Vitality:** ${levelingEnabled ? '✅ ACTIVE' : '❌ SUSPENDED'}\n**Activity Filtering**: ${config.leveling_mode || 'BLACKLIST'}\n**Tracked Channels**: ${config.leveling_channels?.length || 0} locations`);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('level_wing_settings').setLabel('⚙️ Settings').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('level_wing_milestones').setLabel('🎭 Milestones').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('level_wing_analytics').setLabel('📊 Analytics').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('level_toggle').setLabel(levelingEnabled ? 'Pause Tracking' : 'Resume Tracking').setStyle(levelingEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
    );

    await safeUpdate(i, { embeds: [embed], components: [getNavigationRow(i, 'opt_levels'), row, getBackRow()] });
};

const handleLevelSettings = async (i) => {
    const config = await fetchConfig(i.guild.id);
    const mode = config.leveling_mode || 'BLACKLIST';
    
    const embed = applyLibrarianBranding(baseEmbed(), i)
        .setTitle('⚙️ Levelling Architect: Settings')
        .setDescription(`Configure your announcement policies and experience filters.\n\n` +
            `**Announcement Hub**: ${config.level_up_channel_id ? `<#${config.level_up_channel_id}>` : '*Current Channel*'}\n` +
            `**Level Up Emoji**: ${config.xp_level_up_emoji || '✨'}\n` +
            `**Filter Mode**: **${mode}**\n` +
            `**Custom Message**: ${config.xp_level_up_message ? '`Configured`' : '*Default Presets*'}`);

    const rows = [
        getNavigationRow(i, 'opt_levels'),
        new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder().setCustomId('level_channel_select').setPlaceholder('Select Announcement Hub...').setChannelTypes(ChannelType.GuildText)
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('level_mode_toggle').setLabel(`Mode: ${mode}`).setStyle(ButtonStyle.Primary).setEmoji('🔄'),
            new ButtonBuilder().setCustomId('level_msg_modal').setLabel('Update Message').setStyle(ButtonStyle.Secondary).setEmoji('📝'),
            new ButtonBuilder().setCustomId('level_emoji_modal').setLabel('Set Emoji').setStyle(ButtonStyle.Secondary).setEmoji('🎭')
        ),
        new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder().setCustomId('level_filter_channels').setPlaceholder(`Manage ${mode} Channels...`).setChannelTypes(ChannelType.GuildText).setMinValues(0).setMaxValues(10)
        ),
        getBackRow('opt_levels', 'Back to Levelling Hub')
    ];

    await safeUpdate(i, { embeds: [embed], components: rows });
};

const handleLevelAnalytics = async (i) => {
    const { getLevelingStats } = require('../services/leveling');
    const stats = await getLevelingStats(i.guild.id);

    const embed = applyLibrarianBranding(baseEmbed(), i)
        .setTitle('📊 Levelling & Activity Analytics')
        .setDescription(`High-level oversight of global knowledge accumulation within **${i.guild.name}**.`)
        .addFields(
            { name: '✨ Total Server XP', value: `\`${stats.totalXp.toLocaleString()}\``, inline: true },
            { name: '👥 Active Levelers', value: `\`${stats.activeUsers}\``, inline: true },
            { name: '🎓 Avg Server Level', value: `\`${stats.avgLevel.toFixed(1)}\``, inline: true }
        );

    await safeUpdate(i, { embeds: [embed], components: [getBackRow('opt_levels', 'Back to Levelling Hub')] });
};

const handleLevelMilestones = async (i) => {
    const lvls = await getLevelRoles(i.guild.id);
    
    let desc = '**Milestone Records:**\nExperience tiers that automatically grant specialized Muse roles.\n\n';
    if (!lvls.length) desc += '*No bindings established.*';
    else lvls.forEach(l => { 
        const role = i.guild.roles.cache.get(l.role_id);
        const color = role ? ` (\`${role.hexColor}\`)` : '';
        desc += `◈ **Level ${l.level.toString().padStart(2, '0')}** ➔ <@&${l.role_id}>${color}\n`; 
    });

    const embed = applyLibrarianBranding(baseEmbed(), i)
        .setTitle('🎭 Milestone Rewards & Tiers')
        .setDescription(desc);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('level_role_add').setLabel('Bind Level').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId('level_deploy_standard').setLabel('Deploy Tiers').setStyle(ButtonStyle.Primary).setEmoji('✨')
    );

    const rows = [row];
    if (lvls.length) {
        const delRow = new ActionRowBuilder();
        lvls.slice(0, 5).forEach(l => delRow.addComponents(new ButtonBuilder().setCustomId(`level_role_del_${l.level}`).setLabel(`Del ${l.level}`).setStyle(ButtonStyle.Danger)));
        rows.push(delRow);
    }
    rows.push(getBackRow('opt_levels', 'Back to Levelling Hub'));

    await safeUpdate(i, { embeds: [embed], components: rows });
};

const handlePurge = async (i) => {
    const embed = applyLibrarianBranding(baseEmbed(), i)
        .setTitle('🧹 Server Purge Utility')
        .setDescription('Identify and dispose of undocumented "ghost" roles that do not belong to any library category or core system Feature.\n\n⚠️ **Warning**: Always run a **Dry Run** to inspect the target list before execution.')
        .setColor('#ED4245');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('purge_dryrun').setLabel('Dry Run Scan').setStyle(ButtonStyle.Primary).setEmoji('🔍'),
        new ButtonBuilder().setCustomId('purge_confirm').setLabel('Execute Nuke').setStyle(ButtonStyle.Danger).setEmoji('☢️'),
        new ButtonBuilder().setCustomId('dash_home').setLabel('Home').setStyle(ButtonStyle.Secondary)
    );
    await safeUpdate(i, { embeds: [embed], components: [getNavigationRow(i, 'opt_purge'), row] });
};

const getUnmanagedRoles = async (guild) => {
    let config, sRoles, lRoles;
    try {
        config = await fetchConfig(guild.id);
        sRoles = await getServerRoles(guild.id);
        lRoles = await getLevelRoles(guild.id);
    } catch (e) { throw new Error('DB connection failed. Purge aborted.'); }

    const managed = new Set();
    [config?.member_role_id, config?.bot_role_id, config?.mute_role_id, config?.mod_role_id, config?.super_bot_role_id].forEach(id => { if(id) managed.add(id); });
    if (sRoles) sRoles.forEach(r => managed.add(r.role_id));
    if (lRoles) lRoles.forEach(r => managed.add(r.role_id));

    const toDelete = [];
    const mePos = guild.members.me.roles.highest.position;
    const proto = ROLE_DASHBOARD.PROTECTED_ROLE_NAMES;

    guild.roles.cache.forEach(r => {
        // Base checks
        if (managed.has(r.id) || r.managed || r.position >= mePos) return;

        // Protection for special Discord tags (Boosters)
        if (r.tags?.premiumSubscriberRole !== undefined) return;

        // Protection by keyword
        if (proto.some(p => r.name.toLowerCase().includes(p.toLowerCase()))) return;

        toDelete.push({
            role: r,
            memberCount: r.members.size
        });
    });
    return toDelete;
};

const dryRunPurge = async (i) => {
    try {
        const unmanaged = await getUnmanagedRoles(i.guild);
        
        const empty = unmanaged.filter(u => u.memberCount === 0);
        const withMembers = unmanaged.filter(u => u.memberCount > 0);

        let desc = unmanaged.length === 0 
            ? '✅ **The server is perfectly clean!** No unmanaged roles found.' 
            : `Found **${unmanaged.length}** unmanaged roles.\n\n`;

        if (withMembers.length > 0) {
            desc += `⚠️ **Notice:** **${withMembers.length}** of these roles are currently held by members.\n`;
            desc += `${withMembers.slice(0, 5).map(u => `${u.role.name} (${u.memberCount})`).join(', ')}${withMembers.length > 5 ? '...' : ''}\n\n`;
        }

        if (empty.length > 0) {
            desc += `🗑️ **Empty Roles (${empty.length}):**\n`;
            desc += `${empty.slice(0, 15).map(u => u.role.name).join(', ')}${empty.length > 15 ? '...' : ''}`;
        }

        const embed = baseEmbed()
            .setTitle('🔎 Purge Dry Run Results')
            .setDescription(desc);

        await i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => null);
    } catch (e) { await i.reply({ content: `❌ ${e.message}`, flags: MessageFlags.Ephemeral }).catch(() => null); }
};

const executePurge = async (i) => {
    try {
        const unmanagedEntries = await getUnmanagedRoles(i.guild);
        if (!unmanagedEntries.length) return i.reply({ content: 'No undocumented roles found to clean.', flags: MessageFlags.Ephemeral });

        const botMember = await i.guild.members.fetchMe();
        if (!botMember.permissions.has('ManageRoles')) {
            return i.reply({ content: "❌ **Error:** Bot lacks 'Manage Roles' permission.", flags: MessageFlags.Ephemeral });
        }

        await i.update({ components: [] }).catch(() => null);
        
        await runSafeTask(i, 'Purge', async (statusMsg) => {
            let success = 0, failed = 0;
            const total = unmanagedEntries.length;

            for (let idx = 0; idx < total; idx++) {
                const entry = unmanagedEntries[idx];
                try {
                    // Smart Skipping: Only delete if editable
                    if (entry.role.editable) {
                        await entry.role.delete('Server Role Purge Utility');
                        success++;
                    } else {
                        failed++;
                    }
                } catch (err) {
                    failed++;
                }

                if ((idx + 1) % 5 === 0 || (idx + 1) === total) {
                    await statusMsg.edit(
                        `☢️ **[Purge]** Disposal in progress...\n` +
                        `${renderProgressBar(idx + 1, total)}\n` +
                        `> ✅ Deleted: **${success}**\n` +
                        `> ⚠️ Skipped: **${failed}**`
                    ).catch(() => null);
                }
                await new Promise(res => setTimeout(res, 300)); // Faster purge, but safe
            }
            await statusMsg.edit(`✅ **[Purge] Cleanup Complete!** Removed **${success}** roles. Skipped: **${failed}**.`);
        });
    } catch (e) { 
        console.error('[Purge] Crash:', e);
        await i.followUp({ content: `❌ **Purge Errored:** ${e.message}`, flags: MessageFlags.Ephemeral }).catch(() => null);
    }
};

const handleOrganizeMenu = async (i) => {
    const embed = applyLibrarianBranding(baseEmbed(), i)
        .setTitle('📏 Role Organizing & Hierarchy')
        .setDescription('Automatically sort the server\'s role hierarchy based on the designated category order. This ensures a clean, predictable Sidebar experience.');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('organize_perform').setLabel('Surgical Organize').setStyle(ButtonStyle.Success).setEmoji('📐'),
        new ButtonBuilder().setCustomId('dash_home').setLabel('Home').setStyle(ButtonStyle.Secondary)
    );
    await safeUpdate(i, { embeds: [embed], components: [getNavigationRow(i, 'opt_organize'), row] });
};

const executeOrganize = async (i) => {
    try {
        await i.update({ embeds: [], components: [] }).catch(() => null);
        await runSafeTask(i, 'Organize', async (statusMsg) => {
            await performOrganize(i.guild, statusMsg);
        });
    } catch (err) {
        console.error('[Organize] Fatal Crash:', err);
        await i.followUp({ content: `❌ **Organization Failed:** ${err.message}`, flags: MessageFlags.Ephemeral }).catch(() => null);
    }
};

const performOrganize = async (guild, statusMsg) => {
    // 1. Fetch fresh roles to ensure we have the latest hierarchy
    const roles = await guild.roles.fetch(undefined, { force: true });
    const botMember = await guild.members.fetchMe({ force: true });
    
    if (!botMember.permissions.has('ManageRoles')) {
        throw new Error("Bot lacks 'Manage Roles' permission.");
    }

    const botMaxPos = botMember.roles.highest.position;
    const allRoles = Array.from(roles.values());

    // 2. Identify strictly manageable roles (below bot and editable)
    let manageable = allRoles
        .filter(r => r.editable && r.id !== guild.id)
        .sort((a, b) => b.position - a.position);

    const skippedCount = allRoles.filter(r => r.position < botMaxPos && !r.editable && r.id !== guild.id).length;

    if (!manageable.length) {
        await statusMsg.edit(`✨ **[Organize]** No manageable roles found. ${skippedCount > 0 ? `(Skipped ${skippedCount} protected/higher roles)` : ''}`);
        return;
    }

    // 3. Define our desired hierarchy criteria
    const config = await fetchConfig(guild.id);
    const serverRoles = await getServerRoles(guild.id);
    const levelBindings = await getLevelRoles(guild.id);
    
    const rolesByCategory = {};
    const processedCategories = new Set();
    
    serverRoles.forEach(sr => {
        const catName = sr.category?.name || 'Extra';
        if (!rolesByCategory[catName]) rolesByCategory[catName] = [];
        rolesByCategory[catName].push(sr.role_id);
    });

    const hierarchyOrder = ROLE_DASHBOARD.HIERARCHY_ORDER;

    const priorityMap = {};
    let currentIndex = 0;

    // A. Smart Detection: Administrative roles (Council Fallback)
    // If a role looks like staff but isn't registered, we prioritize it at the top
    const adminTerms = ROLE_DASHBOARD.ADMIN_TERMS;
    const unmanagedAdminRoles = manageable.filter(r => 
        adminTerms.some(term => r.name.toLowerCase().includes(term)) &&
        !serverRoles.some(sr => sr.role_id === r.id) &&
        r.id !== config.member_role_id &&
        r.id !== config.bot_role_id &&
        r.id !== config.mute_role_id
    );

    if (unmanagedAdminRoles.length > 0) {
        console.log(`[Organize] Detected ${unmanagedAdminRoles.length} unmanaged administrative roles. Prioritizing at top.`);
        unmanagedAdminRoles.forEach(r => {
            if (!priorityMap[r.id]) priorityMap[r.id] = currentIndex++;
        });
    }

    // B. Main Hierarchy Processing
    hierarchyOrder.forEach((catName) => {
        processedCategories.add(catName);

        if (catName === 'AUTO_MEMBER') {
            if (config.member_role_id) priorityMap[config.member_role_id] = currentIndex++;
        } else if (catName === 'AUTO_BOT') {
            if (config.bot_role_id) priorityMap[config.bot_role_id] = currentIndex++;
        } else if (catName === 'MUTED') {
            if (config.mute_role_id) priorityMap[config.mute_role_id] = currentIndex++;
            // Fallback for roles named 'Muted'
            const mutedRole = roles.find(r => r.name.toLowerCase().includes('muted'));
            if (mutedRole && !priorityMap[mutedRole.id]) priorityMap[mutedRole.id] = currentIndex++;
        } else if (catName === 'NITRO_BOOSTER') {
            const boosterRole = roles.find(r => r.tags?.premiumSubscriberRole !== undefined);
            if (boosterRole) priorityMap[boosterRole.id] = currentIndex++;
            if (config.booster_role_id && !priorityMap[config.booster_role_id]) priorityMap[config.booster_role_id] = currentIndex++;
        } else if (catName === 'PREMIUM_MUSE') {
            if (config.premium_role_id) priorityMap[config.premium_role_id] = currentIndex++;
        } else if (catName === 'Levels') {
            const sortedLevels = [...levelBindings].sort((a, b) => b.level - a.level);
            sortedLevels.forEach(lb => {
                if (!priorityMap[lb.role_id]) priorityMap[lb.role_id] = currentIndex++;
            });
        } else if (catName === 'Colors (Premium)') {
            const premiumShades = Object.values(COLOR_FAMILIES).flat();
            const rids = rolesByCategory[catName] || [];
            rids.sort((a, b) => {
                const nameA = roles.get(a)?.name;
                const nameB = roles.get(b)?.name;
                const idxA = premiumShades.findIndex(s => s.name === nameA);
                const idxB = premiumShades.findIndex(s => s.name === nameB);
                return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
            }).forEach(rid => {
                if (!priorityMap[rid]) priorityMap[rid] = currentIndex++;
            });
        } else if (catName === 'Colors (Basic)') {
            const rids = rolesByCategory[catName] || [];
            rids.sort((a, b) => {
                const nameA = roles.get(a)?.name;
                const nameB = roles.get(b)?.name;
                const idxA = BASIC_COLORS.findIndex(s => s.name === nameA);
                const idxB = BASIC_COLORS.findIndex(s => s.name === nameB);
                return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
            }).forEach(rid => {
                if (!priorityMap[rid]) priorityMap[rid] = currentIndex++;
            });
        } else {
            rolesByCategory[catName]?.forEach(rid => {
                if (!priorityMap[rid]) priorityMap[rid] = currentIndex++;
            });
        }
    });

    // C. Process any other registered categories not in the main hierarchy list
    Object.keys(rolesByCategory).forEach(catName => {
        if (!processedCategories.has(catName) && catName !== 'Extra') {
            rolesByCategory[catName].forEach(rid => {
                if (!priorityMap[rid]) priorityMap[rid] = currentIndex++;
            });
        }
    });

    // D. Final Registered Extras
    rolesByCategory['Extra']?.forEach(rid => {
        if (!priorityMap[rid]) priorityMap[rid] = currentIndex++;
    });

    // 4. Sort the manageable roles: Priority first, then current position
    const sortedManageable = [...manageable].sort((a, b) => {
        const prioA = priorityMap[a.id] ?? 9999;
        const prioB = priorityMap[b.id] ?? 9999;
        
        if (prioA !== prioB) return prioA - prioB;
        
        // If both are 9999 (extras), sort by their managed status then original position
        // We want non-managed roles to be above managed bot roles if they are both extras?
        // Actually, user said managed roles to the bottom.
        if (prioA === 9999) {
            if (a.managed !== b.managed) return a.managed ? 1 : -1;
        }
        
        return b.position - a.position; // Keep relative original order if same prio
    });

    // 5. Build the swap plan (Full Payload Mode)
    const originalPositions = manageable.map(r => r.position); // Already sorted desc
    const roleData = [];
    let changeCount = 0;

    for (let i = 0; i < sortedManageable.length; i++) {
        const role = sortedManageable[i];
        const targetPos = originalPositions[i];
        
        // CRITICAL: We include ALL manageable roles in the payload.
        // Even if the absolute position hasn't changed, including them ensures 
        // the relative order is locked in exactly as calculated by the sort.
        roleData.push({ role: role.id, position: targetPos });
        
        if (role.position !== targetPos) {
            console.log(`[Organize] Plan: ${role.name} (${role.position} -> ${targetPos})`);
            changeCount++;
        }
    }

    if (changeCount === 0) {
        await statusMsg.edit('✨ **[Organize] Roles are already perfectly aligned.**').catch(() => null);
        return;
    }

    console.log(`[Organize] Execution Phase: Syncing ${roleData.length} role positions (${changeCount} actual moves).`);
    await statusMsg.edit(`📏 **[Organize] Resyncing server hierarchy (${changeCount} roles to move)...**`).catch(() => null);
    
    // EXTREMELY CRITICAL: Use guild.roles.setPositions for BULK update
    // This is 100x faster and much safer against rate limits than 1-by-1 setPosition
    try {
        console.log(`[Organize] Dispatching bulk position sync for ${roleData.length} roles...`);
        await guild.roles.setPositions(roleData, { reason: 'Automated Server Organization' });
        console.log(`[Organize] Bulk sync successful.`);
        
        let completionMsg = `✅ **[Organize] Complete!** Hierarchy re-synchronized successfully.`;
        if (skippedCount > 0) {
            completionMsg += `\n⚠️ **Notice:** **${skippedCount}** roles were skipped because they are above the bot's highest role. Please move the **${botMember.roles.highest.name}** role higher to organize those.`;
        }
        await statusMsg.edit(completionMsg);
    } catch (err) {
        console.error(`[Organize] Bulk sync failed, falling back to surgical moves:`, err.message);
        
        let success = 0, skipped = 0;
        for (const move of roleData) {
            try {
                const role = manageable.find(r => r.id === move.role);
                if (role && role.position !== move.position) {
                    await role.setPosition(move.position).catch(e => { if (e.code !== 50013) throw e; });
                    success++;
                }
            } catch (err) {
                console.error(`[Organize] Failed surgical move for ${move.role}:`, err.message);
                skipped++;
            }
            if ((success + skipped) % 5 === 0) {
                 await statusMsg.edit(`📏 **[Organize]** Sorting (Fallback Mode)...\n${renderProgressBar(success + skipped, roleData.length)}`).catch(() => null);
                 await new Promise(r => setTimeout(r, 800));
            }
        }
        await statusMsg.edit(`✅ **[Organize] Complete (Surgical)!** Success: **${success}**, Skipped: **${skipped}**.`);
    }
};

const executeLevelDeployment = async (i) => {
    try {
        await i.update({ components: [] }).catch(() => null);
        
        await runSafeTask(i, 'Deploy Tiers', async (statusMsg) => {
            const guild = i.guild;
            const botMember = await guild.members.fetchMe();

            if (!botMember.permissions.has('ManageRoles')) {
                throw new Error("Bot lacks 'Manage Roles' permission to deploy tiers.");
            }

            const tiers = [
                { level: 1, name: 'Fledgling Muse', color: '#FFACD1' },
                { level: 5, name: 'Apprentice Muse', color: '#10B981' },
                { level: 10, name: 'Scribe Muse', color: '#84CC16' },
                { level: 20, name: 'Scholar Muse', color: '#EAB308' },
                { level: 30, name: 'Chronicler Muse', color: '#F97316' },
                { level: 40, name: 'Curator Muse', color: '#F59E0B' },
                { level: 50, name: 'Artisan Muse', color: '#D946EF' },
                { level: 60, name: 'Mystic Muse', color: '#F43F5E' },
                { level: 70, name: 'Harbinger Muse', color: '#EF4444' },
                { level: 80, name: 'Oracle Muse', color: '#3498DB' },
                { level: 90, name: 'Sage Muse', color: '#9B59B6' },
                { level: 100, name: 'Archon Muse', color: '#8B5CF6' },
                { level: 150, name: 'Eternal Muse', color: '#6366F1' },
                { level: 200, name: 'Genesis Muse', color: '#4F46E5' }
            ];

            let success = 0, failed = 0;

            // 1. Ensure "Levels" category exists for organization
            let categories = await getRoleCategories(guild.id);
            let levelCat = categories.find(c => c.name === 'Levels');
            if (!levelCat) {
                levelCat = await createRoleCategory(guild.id, 'Levels');
            }

            for (let idx = 0; idx < tiers.length; idx++) {
                const t = tiers[idx];
                const fullName = `${t.level} | ${t.name}`;
                try {
                    let role = guild.roles.cache.find(r => r.name === fullName || r.name === t.name);
                    if (!role) {
                        role = await guild.roles.create({
                            name: fullName,
                            color: t.color,
                            hoist: true,
                            reason: 'Level Role Deployment'
                        });
                    } else if (role.editable) {
                        // Update naming and color if they exist but are old
                        if (role.name !== fullName || role.hexColor !== t.color.toUpperCase()) {
                            await role.setName(fullName);
                            await role.edit({ color: t.color }).catch(() => null);
                        }
                    } else if (role.name !== fullName) {
                        console.warn(`[Deploy Tiers] Cannot rename protected role: ${role.name}`);
                    }

                    await setLevelRole(guild.id, t.level, role.id);
                    
                    // 2. Register in server_roles for organization
                    if (levelCat) {
                        await registerServerRole(guild.id, role.id, levelCat.id);
                    }
                    
                    success++;
                } catch (err) {
                    console.error(`[Deploy Tiers] Failed to deploy/update ${fullName}:`, err);
                    failed++;
                }

                if (statusMsg && ((idx + 1) % 3 === 0 || (idx + 1) === tiers.length)) {
                    await statusMsg.edit(
                        `✨ **[Deploy Tiers]** Constructing Muse hierarchy...\n` +
                        `${renderProgressBar(idx + 1, tiers.length)}\n` +
                        `> 🎭 Role: **${fullName}**\n` +
                        `> ✅ Success: **${success}**\n` +
                        `> ❌ Errors: **${failed}**`
                    ).catch(() => null);
                }
                
                await new Promise(res => setTimeout(res, 500));
            }

            await statusMsg.edit(`✅ **[Deploy Tiers] Complete!** Deployed **${success}** Muse tiers.\n📏 **[Deploy Tiers]** Organizing server hierarchy...`);
            
            // 3. Trigger Organization
            try {
                await performOrganize(guild, statusMsg);
                await statusMsg.edit(`✅ **[Deploy Tiers] Complete!** Deployed ${success} tiers and organized hierarchy.`);
            } catch (err) {
                console.error('Post-deployment organize failed:', err);
                await statusMsg.edit(`✅ **[Deploy Tiers] Complete!** Deployed ${success} tiers.\n⚠️ **[Organize]** Auto-sort failed: ${err.message}`);
            }
        });
    } catch (e) {
        console.error('[Deploy Tiers] Fatal Crash:', e);
        await i.followUp({ content: `❌ **Deployment Failed:** ${e.message}`, flags: MessageFlags.Ephemeral }).catch(() => null);
    }
};

// --- Color Management ---

const handleColorRoles = async (i, page = 0) => {
    const families = Object.keys(COLOR_FAMILIES);
    const familyName = families[page];
    const shades = COLOR_FAMILIES[familyName];
    
    const embed = baseEmbed()
        .setTitle('🎨 Color Catalog Management')
        .setDescription(`Review and deploy curated color shades for your server.\n\n**Current Family:** ${familyName} (${page + 1}/${families.length})\n\n` +
            shades.map(s => `◈ **${s.name}**: \`${s.hex}\``).join('\n'))
        .setColor(shades[0].hex)
        .addFields(
            { name: '✨ Basic Set', value: '10 fundamental core colors.', inline: true },
            { name: '💎 Premium Set', value: '90 curated shades (9 families).', inline: true }
        )
        .setFooter({ text: 'Hierarchy: Colors are grouped into specialized categories.' });

    const navRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`color_page_${Math.max(0, page - 1)}`).setLabel('◀️').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`color_page_${Math.min(families.length - 1, page + 1)}`).setLabel('▶️').setStyle(ButtonStyle.Secondary).setDisabled(page === families.length - 1)
    );

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('color_deploy_basic').setLabel('Deploy Basic').setStyle(ButtonStyle.Primary).setEmoji('🌈'),
        new ButtonBuilder().setCustomId('color_deploy_premium').setLabel('Deploy Premium').setStyle(ButtonStyle.Success).setEmoji('💎'),
        new ButtonBuilder().setCustomId('dash_home').setLabel('Home').setStyle(ButtonStyle.Secondary)
    );

    await safeUpdate(i, { embeds: [embed], components: [getNavigationRow(i, 'opt_colors'), navRow, actionRow] });
};

const executeColorDeployment = async (i, type) => {
    try {
        if (i.isMessageComponent()) {
            await i.update({ embeds: [], components: [] }).catch(() => null);
        } else {
            // For Slash Commands
            if (!i.deferred && !i.replied) {
                await i.reply({ content: `🚀 Initializing ${type} color deployment...`, flags: MessageFlags.Ephemeral }).catch(() => null);
            }
        }

        await runSafeTask(i, `Deploy ${type === 'basic' ? 'Basic' : 'Premium'} Colors`, async (statusMsg) => {
            const guild = i.guild;
            const familiesToDeploy = type === 'basic' 
                ? [{ name: 'Basic', shades: BASIC_COLORS }]
                : Object.entries(COLOR_FAMILIES).map(([name, shades]) => ({ name, shades }));
            
            const totalRoles = familiesToDeploy.reduce((acc, f) => acc + f.shades.length, 0);
            const catName = type === 'basic' ? 'Colors (Basic)' : 'Colors (Premium)';
            
            console.log(`[Deploy Colors] Starting deployment of ${totalRoles} roles for category: ${catName}`);
            
            // Watchdog: monitor for local stalls
            let lastProgressTime = Date.now();
            const watchdog = setInterval(() => {
                const idle = (Date.now() - lastProgressTime) / 1000;
                if (idle > 30) { // 30 seconds of no progress
                    const msg = `🎨 **[Deploy Colors] Still working...**\n` +
                        `> 📡 Discord API is currently throttling role creation.\n` +
                        `> ⌛ Last activity: **${Math.floor(idle)}s ago** (Potential Rate Limit detected).`;
                    statusMsg.edit(msg).catch(() => null);
                }
            }, 10000);

            const botMember = await guild.members.fetchMe();
            if (!botMember.permissions.has('ManageRoles')) {
                clearInterval(watchdog);
                throw new Error("Bot lacks 'Manage Roles' permission.");
            }

            // --- Phase 1: Scanning Server State ---
            await statusMsg.edit(`🔍 **[Phase 1/2] Scanning server state...**\n` +
                `Comparing internal configuration with Discord's current roll...\n` +
                `> 📊 Target: **${totalRoles}** total roles to scan.`);

            await guild.roles.fetch();
            
            // Map existing managed roles
            const roleNameMap = new Map();
            guild.roles.cache.forEach(r => {
                if (r.editable && r.id !== guild.id) {
                    roleNameMap.set(r.name, r);
                }
            });

            // O(1) DB lookup enhancement
            const allDbRoles = await getServerRoles(guild.id);
            const otherCatName = type === 'basic' ? 'Colors (Premium)' : 'Colors (Basic)';
            const otherCatId = (await getRoleCategories(guild.id)).find(c => c.name === otherCatName)?.id;
            const dbRoleMap = new Map();
            allDbRoles.forEach(sr => dbRoleMap.set(sr.role_id, sr.category_id));

            // Categorize colors
            const toCreate = [], toUpdate = [], correct = [];
            
            for (const family of familiesToDeploy) {
                for (const c of family.shades) {
                    const existingRole = roleNameMap.get(c.name);
                    const dbCat = existingRole ? dbRoleMap.get(existingRole.id) : null;
                    
                    if (!existingRole || dbCat === otherCatId) {
                        toCreate.push(c);
                    } else {
                        const targetHex = (c.hex.startsWith('#') ? c.hex : `#${c.hex}`).toUpperCase();
                        const currentHex = existingRole.hexColor.substring(0, 7).toUpperCase();
                        
                        if (currentHex !== targetHex) {
                            toUpdate.push({ color: c, role: existingRole });
                        } else {
                            correct.push({ color: c, role: existingRole });
                        }
                    }
                }
            }

            const totalToWork = toCreate.length + toUpdate.length;

            await statusMsg.edit(`✅ **Scan Complete!** Preparing deployment strategy.\n` +
                `> 🆕 To Create: **${toCreate.length}**\n` +
                `> 🎨 To Update: **${toUpdate.length}**\n` +
                `> ✨ Valid: **${correct.length}**\n\n` +
                `🚀 **Starting Execution Phase in 3s...**`).catch(() => null);

            await new Promise(res => setTimeout(res, 3000));

            // --- Phase 2: Execution Phase ---
            let success = 0, failed = 0;
            const failedNames = [];

            // 1. Ensure Category exists
            let colorCat = (await getRoleCategories(guild.id)).find(c => c.name === catName);
            if (!colorCat) {
                colorCat = await createRoleCategory(guild.id, catName);
            }

            // 2. Register correct ones already (Batch DB check)
            const dbUpdates = [];
            for (const {role} of correct) {
                if (dbRoleMap.get(role.id) !== colorCat.id) {
                    dbUpdates.push({ role_id: role.id, guild_id: guild.id, category_id: colorCat.id });
                }
                success++;
            }
            if (dbUpdates.length > 0) {
                console.log(`[Deploy Colors] Batch-registering ${dbUpdates.length} existing roles into DB...`);
                await registerServerRoles(dbUpdates).catch(e => console.error('[Deploy Colors] DB Batch Error:', e));
            }

            let globalIdx = 0;
            let lastUpdateIdx = 0;

            for (let fIdx = 0; fIdx < familiesToDeploy.length; fIdx++) {
                const family = familiesToDeploy[fIdx];
                
                for (let sIdx = 0; sIdx < family.shades.length; sIdx++) {
                    const c = family.shades[sIdx];
                    if (!c) continue;
                    
                    const isNew = toCreate.includes(c);
                    const updateObj = toUpdate.find(u => u.color === c);
                    
                    if (!isNew && !updateObj) {
                        lastProgressTime = Date.now(); 
                        continue; 
                    }

                    globalIdx++;
                    lastProgressTime = Date.now();

                    try {
                        let targetRole = null;
                        const sanitizedHex = c.hex.startsWith('#') ? c.hex : `#${c.hex}`;

                        if (isNew) {
                            console.log(`[Deploy Colors] [${globalIdx}/${totalToWork}] ACTION: CREATE | NAME: ${c.name}`);
                            // Detect hang within 35 seconds
                            targetRole = await withTimeout(
                                guild.roles.create({
                                    name: c.name,
                                    color: sanitizedHex,
                                    reason: `Color Role Deployment (${type})`
                                }),
                                35000,
                                'TIMEOUT'
                            );

                            if (targetRole === 'TIMEOUT') throw new Error('STALL: Discord hung on creation.');
                            roleNameMap.set(targetRole.name, targetRole);
                        } else {
                            targetRole = updateObj.role;
                            console.log(`[Deploy Colors] [${globalIdx}/${totalToWork}] ACTION: UPDATE | NAME: ${c.name} (${targetRole.hexColor} -> ${sanitizedHex})`);
                            const editResult = await withTimeout(
                                targetRole.edit({ color: sanitizedHex }),
                                20 * 1000,
                                'TIMEOUT'
                            );
                            if (editResult === 'TIMEOUT') throw new Error('STALL: Discord hung on edit.');
                        }

                        if (targetRole && targetRole !== 'TIMEOUT') {
                            await registerServerRole(guild.id, targetRole.id, colorCat.id);
                            success++;
                        }
                    } catch (err) {
                        console.error(`[Deploy Colors] [${globalIdx}/${totalToWork}] FAILED: ${c.name} | ERROR: ${err.message}`);
                        failed++;
                        const category = err.message.includes('STALL') ? 'Stall' : 'Error';
                        failedNames.push(`${c.name} [${category}]`);
                        
                        await new Promise(res => setTimeout(res, 4000));
                    }

                    lastProgressTime = Date.now();

                    // Only update message every 10 roles (plus first/last) to prevent rate limits on the dashboard message itself
                    if (globalIdx - lastUpdateIdx >= 10 || globalIdx === totalToWork) {
                        lastUpdateIdx = globalIdx;
                        await statusMsg.edit(
                            `🎨 **[Phase 2/2] Brushing the palette...**\n` +
                            `📂 **Family:** ${family.name} (${fIdx + 1}/${familiesToDeploy.length})\n` +
                            `${renderProgressBar(globalIdx, totalToWork)}\n` +
                            `> 🖌️ Recent: **${c.name}**\n` +
                            `> ✅ Success: **${success}**\n` +
                            `> ❌ Skipped/Failed: **${failed}**`
                        ).catch(() => null);
                    }
                    
                    const delay = isNew ? 2200 : 900;
                    await new Promise(res => setTimeout(res, delay));
                }

                const remainingWork = familiesToDeploy.slice(fIdx + 1).some(f => f.shades.some(s => toCreate.includes(s) || toUpdate.some(u => u.color === s)));
                if (type === 'premium' && remainingWork) {
                    await statusMsg.edit(
                        `⏳ **[Deploy Colors]** Family **${family.name}** complete.\n` +
                        `> ☕ Letting the paint dry... (10s break before next family)`
                    ).catch(() => null);
                    await new Promise(res => setTimeout(res, 10000));
                }
            }

            clearInterval(watchdog);
            let finalSummary = `✅ **[Deploy Colors] Deployment Finished.**\n` +
                `> ✨ Deployed/Validated: **${success}**\n` +
                `> ⚠️ Skipped (Stalls/Errors): **${failed}**`;
            
            if (failed > 0) {
                finalSummary += `\n\n**Problematic Roles:**\n\`${failedNames.join(', ')}\``;
            }
            
            await statusMsg.edit(`${finalSummary.slice(0, 1900)}\n📏 Organizing server...`);
            
            try {
                await performOrganize(guild, statusMsg);
                await statusMsg.edit(`${finalSummary}\n✅ Organized hierarchy successfully.`);
            } catch (err) {
                console.error('Post-color-deploy organize failed:', err);
                await statusMsg.edit(`${finalSummary}\n⚠️ **[Organize]** Auto-sort failed: ${err.message}`);
            }
        });
    } catch (e) {
        console.error('[Deploy Colors] Fatal Crash:', e);
        if (i.replied || i.deferred) {
            await i.followUp({ content: `❌ **Deployment Failed:** ${e.message}`, flags: MessageFlags.Ephemeral }).catch(() => null);
        } else {
            await i.reply({ content: `❌ **Deployment Failed:** ${e.message}`, flags: MessageFlags.Ephemeral }).catch(() => null);
        }
    }
};

// --- Additional Category Handlers ---

const handleBotInsight = async (i) => {
    const uptime = process.uptime();
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const uptimeStr = `${days}d ${hours}h ${minutes}m`;

    const memory = process.memoryUsage();
    const heapUsed = (memory.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotal = (memory.heapTotal / 1024 / 1024).toFixed(2);
    const rss = (memory.rss / 1024 / 1024).toFixed(2);
    const latency = i.client.ws.ping;

    const embed = applyLibrarianBranding(baseEmbed(), i)
        .setTitle('📊 Library Analytics & Pulse')
        .setDescription('Current operational metrics and system vitality.')
        .addFields(
            { name: '🕰️ Library Uptime', value: `\`${uptimeStr}\``, inline: true },
            { name: '🛰️ Heartbeat (Ping)', value: `\`${latency}ms\``, inline: true },
            { name: '🛠️ Environment', value: `\`${process.env.NODE_ENV || 'Production'}\``, inline: true },
            { name: '🧠 Core (Heap Used)', value: `\`${heapUsed} MB\``, inline: true },
            { name: '🧬 Memory (Heap Tot)', value: `\`${heapTotal} MB\``, inline: true },
            { name: '📦 RSS (Resident)', value: `\`${rss} MB\``, inline: true },
            { name: '🏛️ Registered Guilds', value: `\`${i.client.guilds.cache.size}\``, inline: true },
            { name: '📚 Total Volumes', value: `\`${i.client.commands.size}\``, inline: true }
        );

    const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('opt_flush_cache').setLabel('Flush Library Cache').setStyle(ButtonStyle.Danger).setEmoji('🧹'),
        new ButtonBuilder().setCustomId('dash_home').setLabel('Home').setStyle(ButtonStyle.Secondary)
    );

    await safeUpdate(i, { embeds: [embed], components: [getNavigationRow(i, 'opt_insight'), actionRow] });
};

const handleAdminWing = async (i) => {
    await i.deferUpdate().catch(() => null);
    const guild = i.guild;
    const bans = await guild.bans.fetch({ limit: 5 }).catch(() => null);
    const invites = await guild.invites.fetch({ limit: 3 }).catch(() => null);
    const emojis = guild.emojis.cache;

    const topEmojis = Array.from(emojis.values()).slice(0, 5).map(e => `<:${e.name}:${e.id}>`).join(' ') || '*None*';

    const embed = applyLibrarianBranding(baseEmbed(), i)
        .setTitle('🔨 Administrative Annex')
        .setDescription('Overview of the server\'s administrative state.')
        .addFields(
            { name: '😀 Emoji Asset Count', value: `\`${emojis.size}\``, inline: true },
            { name: '📨 Active Invites', value: `\`${invites ? invites.size : '?'}\``, inline: true },
            { name: '🔨 Recent Bans', value: bans && bans.size > 0 ? bans.map(b => b.user.username).join(', ').slice(0, 100) : '*No recent bans.*', inline: false },
            { name: '💎 Showcase', value: topEmojis, inline: false }
        );

    await safeUpdate(i, { embeds: [embed], components: [getNavigationRow(i, 'opt_admin')] });
};

const handleMediaAiring = async (i) => {
    const config = await fetchConfig(i.guild.id);
    const me = i.guild.members.me;

    const checkPerms = async (cid) => {
        if (!cid) return '⚪ *Not Assigned*';
        const ch = await i.guild.channels.fetch(cid).catch(() => null);
        if (!ch) return '🔴 *Missing Channel*';
        const p = ch.permissionsFor(me);
        if (p.has(['SendMessages', 'EmbedLinks', 'AttachFiles'])) return `🟢 <#${cid}>`;
        return `🟠 <#${cid}> (Lacks Perms)`;
    };

    const airingStatus = await checkPerms(config.airing_channel_id);
    const activityStatus = await checkPerms(config.activity_channel_id);

    const embed = applyLibrarianBranding(baseEmbed(), i)
        .setTitle('📡 Media & Airing Systems')
        .setDescription('Configure how AniMuse monitors and broadcasts media updates.')
        .addFields(
            { name: '📢 Airing Alerts', value: airingStatus, inline: true },
            { name: '🔔 Activity Feed', value: activityStatus, inline: true },
            { name: '📸 Gallery Wing', value: config.gallery_channel_ids?.length ? config.gallery_channel_ids.map(id => `<#${id}>`).join(', ').slice(0, 1024) : '*None Assigned*', inline: true }
        );

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('opt_channels').setLabel('Assign Channels').setStyle(ButtonStyle.Primary).setEmoji('🏗️'),
        new ButtonBuilder().setCustomId('dash_home').setLabel('Home').setStyle(ButtonStyle.Secondary)
    );

    await safeUpdate(i, { embeds: [embed], components: [getNavigationRow(i, 'opt_media'), btnRow] });
};

module.exports = {
    displayRoleDashboard,
    handleDashboardInteraction,
    executeColorDeployment,
    handleLevels,
    handleAutoRoles,
    handleCategories,
    handleCategoryRoles,
    handlePurge,
    handleOrganizeMenu,
    handleBotInsight,
    handleAdminWing,
    handleMediaAiring,
    getNavigationRow,
    routerConfig: {
        ids: [
            'role_dash_menu', 'dash_home', 'autorole_set_member', 'autorole_set_bot', 'autorole_set_booster', 'autorole_set_premium',
            'autorole_sync', 'cat_create', 'level_role_add', 'level_role_bind_select', 'level_deploy_standard',
            'purge_confirm', 'purge_dryrun', 'organize_confirm', 'organize_perform', 'color_deploy_basic', 'color_deploy_premium', 
            'role_dash_home', 'level_toggle', 'level_wing_settings', 'level_wing_milestones', 'level_wing_analytics',
            'level_mode_toggle', 'level_msg_modal', 'level_emoji_modal', 'level_channel_select', 'level_filter_channels',
            'opt_refresh', 'opt_flush_cache'
        ],
        prefixes: [
            'cat_del_', 'level_role_del_', 'level_role_bind_', 'cat_view_', 'cat_role_reg_', 
            'cat_role_unreg_', 'cat_role_create_', 'modal_cat_role_create_', 'color_page_',
            'modal_cat_', 'modal_level_'
        ],
        handle: handleDashboardInteraction
    }
};

