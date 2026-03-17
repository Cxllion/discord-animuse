const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType, MessageFlags } = require('discord.js');
const { fetchConfig, assignChannel, getGuildChannelData, pinChannelPosition, pulseChannelActivity } = require('../core/database');
const CONFIG = require('../config');

// Unified Progress Bar Helper
const renderProgressBar = (progress, total) => {
    const percent = Math.round((progress / total) * 100);
    const size = 15;
    const filled = Math.round((percent / 100) * size);
    const bar = '▓'.repeat(filled) + '░'.repeat(size - filled);
    return `\`${bar}\` **${percent}%** (${progress}/${total})`;
};

const safeUpdate = async (i, options) => {
    try {
        if (i.deferred || i.replied) return await i.editReply(options);
        return await i.update(options);
    } catch (err) {
        if (err.code === 10062 || err.code === 40060) return;
        console.error('[ChannelDashboard] safeUpdate Error:', err);
    }
};

const displayChannelDashboard = async (interaction, isUpdate = false) => {
    const embed = new EmbedBuilder()
        .setTitle('Channel Architect Dashboard')
        .setDescription('Welcome to the Server Infrastructure Bureau. Configure your server zones, activity sorting, and feature bindings below.')
        .setColor(CONFIG.COLORS?.PRIMARY || '#A78BFA')
        .addFields(
            { name: '🔗 Assignment Hub', value: 'Bind bot features (Welcome, Logs, Airing, levels) to specific channels.', inline: false },
            { name: '📏 Hybrid Sorting', value: 'Manage Intra-Category sorting. Pin priority channels and enable activity-based rising.', inline: false },
            { name: '👻 Ghost Detection', value: 'Scan for inactive channels that havent seen activity in weeks.', inline: false },
            { name: '📌 Archive Bureau', value: 'Configure pinning mirrors and permanent history backups.', inline: false }
        );

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('channel_dash_menu')
            .setPlaceholder('Select an Infrastructure Module...')
            .addOptions([
                { label: 'Assignment Hub', value: 'opt_assignment', emoji: '🔗' },
                { label: 'Hybrid Sorting Control', value: 'opt_sorting', emoji: '📏' },
                { label: 'Zoning & Ghost Scan', value: 'opt_zoning', emoji: '👻' },
                { label: 'Archive & Pinned Mirror', value: 'opt_archive', emoji: '📌' },
                { label: 'Return to Hub', value: 'opt_home', emoji: '🏠' }
            ])
    );

    if (isUpdate) {
        await safeUpdate(interaction, { embeds: [embed], components: [row] });
    } else {
        await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    }
};

const handleChannelDashboardInteraction = async (interaction) => {
    const customId = interaction.customId;

    if (customId === 'channel_dash_menu') {
        const option = interaction.values[0];
        if (option === 'opt_assignment') return handleAssignmentHub(interaction, true);
        if (option === 'opt_sorting') return handleSortingControl(interaction, true);
        if (option === 'opt_zoning') return handleZoningMenu(interaction, true);
        if (option === 'opt_archive') return handleArchiveMenu(interaction, true);
        if (option === 'opt_home') return displayChannelDashboard(interaction, true);
        return interaction.reply({ content: `The **${option}** wing is currently under renovation.`, flags: MessageFlags.Ephemeral });
    }

    if (customId === 'channel_dash_home') return displayChannelDashboard(interaction, true);
    if (customId === 'opt_assignment') return handleAssignmentHub(interaction, true);
    if (customId === 'opt_sorting') return handleSortingControl(interaction, true);
    if (customId === 'opt_zoning') return handleZoningMenu(interaction, true);
    if (customId === 'opt_archive') return handleArchiveMenu(interaction, true);

    // --- Zoning & Ghost Scan ---
    if (customId === 'zoning_ghost_scan') {
        return performGhostScan(interaction);
    }

    if (customId === 'zoning_sync_perms') {
        return performCategorySync(interaction);
    }

    // --- Assignment Hub Interactivity ---
    if (customId === 'assign_select_feature') {
        const featureKey = interaction.values[0];
        
        const row = new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId(`execute_assign_${featureKey}`)
                .setPlaceholder(`Select Channel for ${featureKey.replace(/_/g, ' ')}...`)
                .addChannelTypes(ChannelType.GuildText)
        );
        
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('opt_assignment').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        );

        return await safeUpdate(interaction, { content: `📍 **Assignment Mode**: Select the target channel for **${featureKey}**.`, embeds: [], components: [row, row2] });
    }

    if (customId.startsWith('execute_assign_')) {
        const key = customId.replace('execute_assign_', '');
        const channelId = interaction.values[0];

        if (key === 'add_gallery') {
            const config = await fetchConfig(interaction.guildId);
            const current = config.gallery_channel_ids || [];
            if (!current.includes(channelId)) {
                current.push(channelId);
                await assignChannel(interaction.guildId, 'gallery_channel_ids', current);
            }
        } else {
            await assignChannel(interaction.guildId, key, channelId);
        }

        return handleAssignmentHub(interaction, true, `✅ Linked **${key}** to <#${channelId}>.`);
    }

    if (customId === 'assign_clear_all') {
        // Logic to clear all assignments would go here
        return interaction.reply({ content: '⚠️ Clear All functionality is currently locked for safety.', flags: MessageFlags.Ephemeral });
    }

    // --- Sorting Interactivity ---
    if (customId === 'sorting_perform') {
        return performChannelOrganize(interaction);
    }

    if (customId === 'sorting_pin_manage' || customId.startsWith('pin_set_')) {
        return handlePinManagement(interaction);
    }
};

const handlePinManagement = async (interaction) => {
    const customId = interaction.customId;
    
    // If setting a pin
    if (customId.startsWith('pin_set_')) {
        const [_, channelId, position] = customId.split('_').slice(1);
        await pinChannelPosition(interaction.guildId, channelId, parseInt(position));
        return handlePinManagement(interaction); // Refresh
    }

    // Main Pin UI
    const channelData = await getGuildChannelData(interaction.guildId);
    const pinnedChannels = channelData.filter(d => d.pinned_position !== -1);
    
    const embed = new EmbedBuilder()
        .setTitle('📌 Pin Management')
        .setDescription('Set manual priority positions for channels. Pinned channels always stay at the top of their category, ignoring activity pulses.')
        .setColor('#A78BFA');

    if (pinnedChannels.length > 0) {
        embed.addFields({ 
            name: 'Current Pins', 
            value: pinnedChannels.map(d => `<#${d.channel_id}>: Position **${d.pinned_position}**`).join('\n') 
        });
    } else {
        embed.addFields({ name: 'Current Pins', value: '*No channels are currently pinned.*' });
    }

    const row1 = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
            .setCustomId('pin_select_channel')
            .setPlaceholder('Pin a channel...')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('opt_sorting').setLabel('Back').setStyle(ButtonStyle.Secondary)
    );

    // Handle channel selection for pinning
    if (interaction.isChannelSelectMenu() && interaction.customId === 'pin_select_channel') {
        const channelId = interaction.values[0];
        const rowPin = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`pin_set_${channelId}_0`).setLabel('Pos 1').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`pin_set_${channelId}_1`).setLabel('Pos 2').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`pin_set_${channelId}_2`).setLabel('Pos 3').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`pin_set_${channelId}_-1`).setLabel('Unpin').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('sorting_pin_manage').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
        );
        return await safeUpdate(interaction, { content: `📌 Setting priority for <#${channelId}>:`, components: [rowPin] });
    }

    await safeUpdate(interaction, { content: null, embeds: [embed], components: [row1, row2] });
};

const handleAssignmentHub = async (interaction, isUpdate = false, successMsg = null) => {
    const config = await fetchConfig(interaction.guildId);
    
    const embed = new EmbedBuilder()
        .setTitle('🔗 Assignment Hub')
        .setDescription('Link server features to specific channels. This ensures the bot knows exactly where to direct its energy.')
        .setColor('#A78BFA')
        .addFields(
            { name: '🖼️ Welcome (Image)', value: config.welcome_channel_id ? `<#${config.welcome_channel_id}>` : '*Not Assigned*', inline: true },
            { name: '💬 Greeting (Text)', value: config.greeting_channel_id ? `<#${config.greeting_channel_id}>` : '*Not Assigned*', inline: true },
            { name: '📜 Manager Logs', value: config.logs_channel_id ? `<#${config.logs_channel_id}>` : '*Not Assigned*', inline: true },
            { name: '📡 Airing Alerts', value: config.airing_channel_id ? `<#${config.airing_channel_id}>` : '*Not Assigned*', inline: true },
            { name: '✨ Level Milestones', value: config.level_up_channel_id ? `<#${config.level_up_channel_id}>` : '*Not Assigned*', inline: true },
            { name: '🖼️ Visual Gallery', value: config.gallery_channel_ids?.length ? config.gallery_channel_ids.map(id => `<#${id}>`).join(', ') : '*Not Assigned*', inline: false }
        );

    if (successMsg) embed.setFooter({ text: successMsg });

    const row1 = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('assign_select_feature')
            .setPlaceholder('Select Feature to Assign...')
            .addOptions([
                { label: 'Welcome (Image)', value: 'welcome_channel_id', emoji: '🖼️' },
                { label: 'Greeting (Text)', value: 'greeting_channel_id', emoji: '💬' },
                { label: 'Manager Logs', value: 'logs_channel_id', emoji: '📜' },
                { label: 'Airing Alerts', value: 'airing_channel_id', emoji: '📡' },
                { label: 'Archive Mirror', value: 'archive_mirror_channel_id', emoji: '📌' },
                { label: 'Add Gallery Channel', value: 'add_gallery', emoji: '📸' }
            ])
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('channel_dash_home').setLabel('Back to Dashboard').setStyle(ButtonStyle.Secondary).setEmoji('🏠'),
        new ButtonBuilder().setCustomId('assign_clear_all').setLabel('Clear All').setStyle(ButtonStyle.Danger)
    );

    await safeUpdate(interaction, { embeds: [embed], components: [row1, row2] });
};

const handleSortingControl = async (interaction, isUpdate = false, successMsg = null) => {
    const embed = new EmbedBuilder()
        .setTitle('📏 Hybrid Sorting Control')
        .setDescription('Manage the relative order of channels inside your categories.\n\n**Pinned Tier**: Stay at the top.\n**Active Tier**: Rise based on message pulse.')
        .setColor('#A78BFA')
        .addFields(
            { name: 'Status', value: '🟢 Activity Pulse Active\n🔵 Intra-Category Sorting: Ready' }
        );

    if (successMsg) embed.setFooter({ text: successMsg });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sorting_perform').setLabel('Organize Channels').setStyle(ButtonStyle.Success).setEmoji('📏'),
        new ButtonBuilder().setCustomId('sorting_pin_manage').setLabel('Manage Pins').setStyle(ButtonStyle.Primary).setEmoji('📌'),
        new ButtonBuilder().setCustomId('channel_dash_home').setLabel('Back').setStyle(ButtonStyle.Secondary).setEmoji('🏠')
    );

    await safeUpdate(interaction, { embeds: [embed], components: [row] });
};

const performChannelOrganize = async (interaction) => {
    await interaction.deferUpdate();
    const guild = interaction.guild;
    const channelData = await getGuildChannelData(guild.id);
    const channels = await guild.channels.fetch();
    
    // Group by category
    const categories = channels.filter(c => c.type === ChannelType.GuildCategory);
    let totalMoved = 0;
    let totalSkipped = 0;
    let errors = 0;

    const statusMsg = await interaction.followUp({ content: `⏳ **[Channel Architect]** Scanning category zones...` });

    for (const [catId, category] of categories) {
        const children = channels.filter(c => c.parentId === catId);
        if (children.size === 0) continue;

        // Sort children
        const sortedChildren = [...children.values()].sort((a, b) => {
            const dataA = channelData.find(d => d.channel_id === a.id) || { pinned_position: -1, last_active_at: 0 };
            const dataB = channelData.find(d => d.channel_id === b.id) || { pinned_position: -1, last_active_at: 0 };

            // Pinned first
            if (dataA.pinned_position !== -1 && dataB.pinned_position === -1) return -1;
            if (dataA.pinned_position === -1 && dataB.pinned_position !== -1) return 1;
            if (dataA.pinned_position !== -1 && dataB.pinned_position !== -1) return dataA.pinned_position - dataB.pinned_position;

            // Then Active
            const timeA = new Date(dataA.last_active_at).getTime();
            const timeB = new Date(dataB.last_active_at).getTime();
            return timeB - timeA; // Newer first
        });

        // Surgical reorder
        for (let i = 0; i < sortedChildren.length; i++) {
            const channel = sortedChildren[i];
            const targetPos = i; 

            if (channel.position !== targetPos) {
                try {
                    await channel.setPosition(targetPos, { relative: false });
                    totalMoved++;
                } catch (err) {
                    console.error(`Failed to move channel ${channel.name}:`, err);
                    errors++;
                }
            } else {
                totalSkipped++;
            }

            if ((totalMoved + totalSkipped) % 5 === 0) {
                await statusMsg.edit(`⏳ **[Channel Architect]** Organizing **${category.name}**...\n${renderProgressBar(totalMoved + totalSkipped, channels.size)}`).catch(() => null);
            }
        }
    }

    await statusMsg.edit(`✅ **[Channel Architect]** Intra-category organization complete.\n**${totalMoved}** Channels Repositioned | **${totalSkipped}** Channels Verified | **${errors}** Errors encountered.`);
};

const handleZoningMenu = async (interaction, isUpdate = false) => {
    const embed = new EmbedBuilder()
        .setTitle('👻 Zoning & Ghost Detection')
        .setDescription('Scan for stagnant channels that haven\'t seen a message in a while. Keep your archives clean and vibrant.')
        .setColor('#A78BFA')
        .addFields(
            { name: 'Threshold', value: '30 Days of Inactivity' }
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('zoning_ghost_scan').setLabel('Perform Ghost Scan').setStyle(ButtonStyle.Danger).setEmoji('🔍'),
        new ButtonBuilder().setCustomId('zoning_sync_perms').setLabel('Sync Category Perms').setStyle(ButtonStyle.Primary).setEmoji('🛡️'),
        new ButtonBuilder().setCustomId('channel_dash_home').setLabel('Back').setStyle(ButtonStyle.Secondary)
    );

    await safeUpdate(interaction, { embeds: [embed], components: [row] });
};

const performGhostScan = async (interaction) => {
    await interaction.deferUpdate();
    const guild = interaction.guild;
    const channelData = await getGuildChannelData(guild.id);
    const channels = await guild.channels.fetch();
    
    // Threshold: 30 days
    const THRESHOLD_DAYS = 30;
    const cutoff = Date.now() - (THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

    const ghosts = channels.filter(c => {
        if (c.type !== ChannelType.GuildText && c.type !== ChannelType.GuildVoice) return false;
        const data = channelData.find(d => d.channel_id === c.id);
        if (!data) return false; // Not registered in activity yet, skip for safety
        const lastActive = new Date(data.last_active_at).getTime();
        return lastActive < cutoff;
    });

    const embed = new EmbedBuilder()
        .setTitle('🔍 Ghost Scan Results')
        .setDescription(ghosts.size > 0 
            ? `Found **${ghosts.size}** stagnant channels that have been silent for over ${THRESHOLD_DAYS} days.` 
            : '✅ No ghost channels detected. All wings are currently vibrant and active!')
        .setColor(ghosts.size > 0 ? '#EF4444' : '#10B981');

    if (ghosts.size > 0) {
        embed.addFields({ 
            name: 'Stagnant Channels', 
            value: ghosts.map(c => `<#${c.id}> (Category: **${c.parent?.name || 'Root'}**)`).join('\n').slice(0, 1024) 
        });
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('opt_zoning').setLabel('Back').setStyle(ButtonStyle.Secondary)
    );

    await interaction.followUp({ embeds: [embed], components: [row] });
};
const handleArchiveMenu = async (interaction, isUpdate = false) => {
    const config = await fetchConfig(interaction.guildId);
    
    const embed = new EmbedBuilder()
        .setTitle('📌 Archive Bureau')
        .setDescription('Configure manual pin mirroring. When a message is pinned anywhere in the server, the bot can automatically back it up to a dedicated history channel.')
        .setColor('#A78BFA')
        .addFields(
            { name: 'Mirror Status', value: config.archive_mirror_channel_id ? `🟢 Active Mirror: <#${config.archive_mirror_channel_id}>` : '⚪ Mirror Currently Disabled' }
        );

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('opt_assignment').setLabel('Set Mirror Channel').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('channel_dash_home').setLabel('Back').setStyle(ButtonStyle.Secondary)
    );

    await safeUpdate(interaction, { embeds: [embed], components: [row] });
};

const performCategorySync = async (interaction) => {
    await interaction.deferUpdate();
    const guild = interaction.guild;
    const channels = await guild.channels.fetch();
    const categories = channels.filter(c => c.type === ChannelType.GuildCategory);
    
    let totalSynced = 0;
    let totalChildren = 0;
    let errors = 0;

    const statusMsg = await interaction.followUp({ content: `🛡️ **[Zoning Architect]** Analyzing category permissions...` });

    for (const [catId, category] of categories) {
        const children = channels.filter(c => c.parentId === catId);
        totalChildren += children.size;

        for (const [childId, channel] of children) {
            try {
                // Sync permissions to category
                await channel.lockPermissions();
                totalSynced++;
            } catch (err) {
                console.error(`Failed to sync channel ${channel.name}:`, err);
                errors++;
            }

            if (totalSynced % 5 === 0) {
                await statusMsg.edit(`🛡️ **[Zoning Architect]** Syncing **${category.name}**...\n${renderProgressBar(totalSynced, totalChildren)}`).catch(() => null);
            }
        }
    }

    await statusMsg.edit(`✅ **[Zoning Architect]** Category Synchronization Complete.\n**${totalSynced}** Channels Locked to Parent | **${errors}** Errors encountered.`);
};

module.exports = { displayChannelDashboard, handleChannelDashboardInteraction };
