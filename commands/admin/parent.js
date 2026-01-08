const {
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
    MessageFlags, ButtonBuilder, ButtonStyle, ModalBuilder,
    TextInputBuilder, TextInputStyle, ComponentType, RoleSelectMenuBuilder
} = require('discord.js');
const {
    setAsParent, checkIsParent, organizeHierarchy,
    deployLevelRoles, createRoleInLayer, getLayers, setupEssentialRoles
} = require('../../utils/services/parentManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('parent')
        .setDescription(' restricted // Access the Parent Server Engine.')
        .setDefaultMemberPermissions(8),

    async execute(interaction) {
        // 1. Restriction Check: Bot Owner Only
        if (!interaction.client.application.owner) await interaction.client.application.fetch();
        const ownerId = interaction.client.application.owner.id;

        if (interaction.user.id !== ownerId) {
            return await interaction.reply({
                content: '🚫 **ACCESS DENIED** // You are not the Parent of this system.',
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // 2. Gather Statistics
        const isRegistered = await checkIsParent(interaction.guild.id);
        const statusText = isRegistered
            ? '✅ **ACTIVE** (This is the Parent Server)'
            : '⚠️ **UNREGISTERED** (Slave Node)';

        const { fetchConfig } = require('../../utils/core/database');
        const config = await fetchConfig(interaction.guild.id);
        const layers = await getLayers(interaction.guild.id);

        // Role Statistics (use cache, don't fetch)
        const allRoles = interaction.guild.roles.cache.filter(r => r.id !== interaction.guild.id);
        const managedRoles = allRoles.filter(r => r.managed).size;
        const hoistedRoles = allRoles.filter(r => r.hoist).size;

        // Member Statistics (fetch for accuracy)
        const allMembers = await interaction.guild.members.fetch();
        const humans = allMembers.filter(m => !m.user.bot).size;
        const bots = allMembers.filter(m => m.user.bot).size;
        const totalMembers = allMembers.size;

        // Configuration Status
        const configChecks = [];
        configChecks.push(config.welcome_channel_id ? '✅ Welcome Channel' : '❌ Welcome Channel');
        configChecks.push(config.member_role_id ? '✅ Member Role' : '❌ Member Role');
        configChecks.push(config.bot_role_id ? '✅ Bot Role' : '❌ Bot Role');

        // Layer Statistics
        const totalLayers = layers.length;
        const totalLayerRoles = layers.reduce((sum, layer) => sum + (layer.roles ? layer.roles.length : 0), 0);
        const coverage = totalLayers > 0 && allRoles.size > 0 ? Math.round((totalLayerRoles / allRoles.size) * 100) : 0;

        // 3. Enhanced Embed
        const embed = new EmbedBuilder()
            .setTitle('⚙️ PARENT SERVER ENGINE')
            .setDescription('`System Level: ROOT ACCESS`\nComprehensive server management and role orchestration.')
            .setColor('#FFACD1')
            .addFields(
                { name: '🏛️ Server Status', value: statusText, inline: true },
                { name: '⚡ Engine State', value: '`ONLINE`', inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                { name: '👥 Members', value: `> Humans: **${humans}**\n> Bots: **${bots}**\n> **Total: ${totalMembers}**`, inline: true },
                { name: '🎭 Roles', value: `> Total: **${allRoles.size}**\n> Hoisted: **${hoistedRoles}**\n> Managed: **${managedRoles}**`, inline: true },
                { name: '📚 Layers', value: `> Layers: **${totalLayers}**\n> Registered: **${totalLayerRoles}**\n> Coverage: **${coverage}%**`, inline: true },
                { name: '⚙️ Configuration', value: configChecks.join('\n'), inline: false }
            )
            .setFooter({ text: `AniMuse Parent Engine v2.0 • ${interaction.guild.name}`, iconURL: interaction.client.user.displayAvatarURL() })
            .setTimestamp();

        // 4. Components
        // Unified Operations Menu
        const select = new StringSelectMenuBuilder()
            .setCustomId('parent_engine_select')
            .setPlaceholder('Select Protocol...')
            .addOptions(
                // ⚙️ Core Systems
                new StringSelectMenuOptionBuilder()
                    .setLabel('Register Parent Server')
                    .setDescription('Designate this guild as the central node.')
                    .setValue('protocol_register')
                    .setEmoji('👑'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Server Configuration')
                    .setDescription('Manage Welcome Channel & Member Role.')
                    .setValue('protocol_config')
                    .setEmoji('⚙️'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Organize Role Hierarchy')
                    .setDescription('Execute "Layer Cake" sorting.')
                    .setValue('protocol_organize')
                    .setEmoji('🍰'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Server Setup Wizard')
                    .setDescription('One-click setup: Create all essential roles.')
                    .setValue('protocol_setup_wizard')
                    .setEmoji('🎯'),

                // 🎨 Palette Generator
                new StringSelectMenuOptionBuilder()
                    .setLabel('Weave Premium Spectrum')
                    .setDescription('Generate 100+ shades (Premium).')
                    .setValue('loom_generate_premium')
                    .setEmoji('🎨'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Weave Basic Colors')
                    .setDescription('Generate 8 simple colors.')
                    .setValue('loom_generate_simple')
                    .setEmoji('🖍️'),

                // 🧵 Loom / Role Management
                new StringSelectMenuOptionBuilder()
                    .setLabel('Create New Thread')
                    .setDescription('Create a new role & layer.')
                    .setValue('loom_create_role')
                    .setEmoji('🧵'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('Register Existing Role')
                    .setDescription('Archive an existing role into a layer.')
                    .setValue('loom_register_role')
                    .setEmoji('📎'),

                // 🛠️ Deployment
                new StringSelectMenuOptionBuilder()
                    .setLabel('Deploy Level Roles')
                    .setDescription('Construct Muse 1-100 roles.')
                    .setValue('protocol_deploy')
                    .setEmoji('✨')
            );

        // Safety Console
        const dangerRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('loom_purge')
                .setLabel('Clear Role Trash')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️')
        );

        const selectRow = new ActionRowBuilder().addComponents(select);

        const msg = await interaction.editReply({
            embeds: [embed],
            components: [selectRow, dangerRow]
        });

        // 5. Collector
        const collector = msg.createMessageComponentCollector({ time: 300000 }); // 5 minutes

        collector.on('collect', async i => {
            // ROUTING: Check values from Select Menu OR CustomID from Button
            let action = null;
            if (i.isStringSelectMenu()) action = i.values[0];
            if (i.isButton()) action = i.customId;

            // --- Handlers ---

            if (action === 'protocol_register') {
                await setAsParent(i.guild);
                embed.data.fields[0].value = '✅ **ACTIVE** (This is the Parent Server)';
                await i.update({ embeds: [embed] });
                await i.followUp({ content: '✅ Server registered as Parent Node.', flags: MessageFlags.Ephemeral });
            }
            else if (action === 'protocol_config') {
                // Config Sub-Menu
                const { ChannelSelectMenuBuilder, ChannelType, RoleSelectMenuBuilder } = require('discord.js');
                const { fetchConfig, upsertConfig } = require('../../utils/core/database');
                const logger = require('../../utils/core/logger');

                // Fetch current config
                const config = await fetchConfig(i.guild.id);

                let desc = `**Current Configuration**\n`;
                desc += `> **Welcome Channel**: ${config.welcome_channel_id ? `<#${config.welcome_channel_id}>` : 'Not Set'}\n`;
                desc += `> **Member Role**: ${config.member_role_id ? `<@&${config.member_role_id}>` : 'Not Set'}\n`;

                const channelSelect = new ChannelSelectMenuBuilder()
                    .setCustomId('config_select_channel')
                    .setPlaceholder('Select Welcome Channel')
                    .setChannelTypes(ChannelType.GuildText);

                const memberRoleSelect = new RoleSelectMenuBuilder()
                    .setCustomId('config_select_member_role')
                    .setPlaceholder('Select Member Role (Auto-assigned to Humans)');

                const botRoleSelect = new RoleSelectMenuBuilder()
                    .setCustomId('config_select_bot_role')
                    .setPlaceholder('Select Bot Role (Auto-assigned to Bots)');

                const superBotRoleSelect = new RoleSelectMenuBuilder()
                    .setCustomId('config_select_super_bot_role')
                    .setPlaceholder('Select Super Bot Role (Manual Only)');

                // Add buttons for manual ID input
                const manualInputButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('config_manual_member')
                        .setLabel('Manual Member Role ID')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🆔'),
                    new ButtonBuilder()
                        .setCustomId('config_manual_bot')
                        .setLabel('Manual Bot Role ID')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🤖'),
                    new ButtonBuilder()
                        .setCustomId('config_manual_super_bot')
                        .setLabel('Manual Super Bot ID')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('⭐')
                );

                const row1 = new ActionRowBuilder().addComponents(channelSelect);
                const row2 = new ActionRowBuilder().addComponents(memberRoleSelect);
                const row3 = new ActionRowBuilder().addComponents(botRoleSelect);
                const row4 = new ActionRowBuilder().addComponents(superBotRoleSelect);

                await i.reply({
                    content: desc + '\n\n_Tip: Use buttons below for manual Role ID input (bypasses 25-item limit)_',
                    components: [row1, row2, row3, row4, manualInputButtons],
                    flags: MessageFlags.Ephemeral
                });
                const response = await i.fetchReply();

                const subCollector = response.createMessageComponentCollector({ time: 120000 }); // 2 minutes

                subCollector.on('collect', async subI => {
                    if (subI.customId === 'config_select_channel') {
                        const channelId = subI.values[0];
                        await upsertConfig(subI.guild.id, { welcome_channel_id: channelId });
                        await subI.update({ content: `✅ **Welcome Channel** set to <#${channelId}>` });
                    }
                    else if (subI.customId === 'config_select_member_role') {
                        const roleId = subI.values[0];
                        await upsertConfig(subI.guild.id, { member_role_id: roleId });
                        await subI.deferUpdate();

                        // Bulk assign to all existing human members
                        const role = subI.guild.roles.cache.get(roleId);
                        if (role) {
                            let assigned = 0, skipped = 0;
                            const members = await subI.guild.members.fetch();
                            for (const [, member] of members) {
                                if (member.user.bot || member.roles.cache.has(roleId)) { skipped++; continue; }
                                try {
                                    await member.roles.add(role);
                                    assigned++;
                                } catch (error) {
                                    logger.error(`Failed to assign member role to ${member.user.tag}:`, error, 'BulkRole');
                                }
                            }
                            await subI.editReply({ content: `✅ **Member Role** set to <@&${roleId}>\n📊 Assigned to **${assigned}** existing members (${skipped} skipped)` });
                        }
                    }
                    else if (subI.customId === 'config_select_bot_role') {
                        const roleId = subI.values[0];
                        await upsertConfig(subI.guild.id, { bot_role_id: roleId });
                        await subI.deferUpdate();

                        // Bulk assign to all existing bots
                        const role = subI.guild.roles.cache.get(roleId);
                        if (role) {
                            let assigned = 0, skipped = 0;
                            const members = await subI.guild.members.fetch();
                            for (const [, member] of members) {
                                if (!member.user.bot || member.roles.cache.has(roleId)) { if (member.user.bot && member.roles.cache.has(roleId)) skipped++; continue; }
                                try {
                                    await member.roles.add(role);
                                    assigned++;
                                } catch (error) {
                                    logger.error(`Failed to assign bot role to ${member.user.tag}:`, error, 'BulkRole');
                                }
                            }
                            await subI.editReply({ content: `✅ **Bot Role** set to <@&${roleId}>\n🤖 Assigned to **${assigned}** existing bots (${skipped} skipped)` });
                        }
                    }
                    else if (subI.customId === 'config_select_super_bot_role') {
                        const roleId = subI.values[0];
                        await upsertConfig(subI.guild.id, { super_bot_role_id: roleId });
                        await subI.update({ content: `✅ **Super Bot Role** set to <@&${roleId}>\n⚠️ Note: This role is NOT auto-assigned. Manually give it to admin bots.` });
                    }
                    // Manual ID Input Handlers
                    else if (subI.customId === 'config_manual_member') {
                        const modal = new ModalBuilder()
                            .setCustomId('modal_member_role_id')
                            .setTitle('Enter Member Role ID');

                        const roleIdInput = new TextInputBuilder()
                            .setCustomId('role_id_input')
                            .setLabel('Role ID')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('123456789012345678')
                            .setRequired(true);

                        modal.addComponents(new ActionRowBuilder().addComponents(roleIdInput));
                        await subI.showModal(modal);

                        try {
                            const submission = await subI.awaitModalSubmit({ time: 60000, filter: s => s.user.id === subI.user.id });
                            const roleId = submission.fields.getTextInputValue('role_id_input').trim();
                            const role = subI.guild.roles.cache.get(roleId);

                            if (!role) {
                                return await submission.reply({ content: `❌ **Error**: Role with ID \`${roleId}\` not found in this server.`, flags: MessageFlags.Ephemeral });
                            }

                            await upsertConfig(subI.guild.id, { member_role_id: roleId });
                            await submission.deferReply({ flags: MessageFlags.Ephemeral });

                            // Bulk assign
                            let assigned = 0, skipped = 0;
                            const members = await subI.guild.members.fetch();
                            for (const [, member] of members) {
                                if (member.user.bot || member.roles.cache.has(roleId)) { skipped++; continue; }
                                try {
                                    await member.roles.add(role);
                                    assigned++;
                                } catch (error) {
                                    logger.error(`Failed to assign member role to ${member.user.tag}:`, error, 'BulkRole');
                                }
                            }
                            await submission.editReply({ content: `✅ **Member Role** set to <@&${roleId}>\n📊 Assigned to **${assigned}** existing members (${skipped} skipped)` });
                        } catch (e) {
                            // Modal timeout or error
                        }
                    }
                    else if (subI.customId === 'config_manual_bot') {
                        const modal = new ModalBuilder()
                            .setCustomId('modal_bot_role_id')
                            .setTitle('Enter Bot Role ID');

                        const roleIdInput = new TextInputBuilder()
                            .setCustomId('role_id_input')
                            .setLabel('Role ID')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('123456789012345678')
                            .setRequired(true);

                        modal.addComponents(new ActionRowBuilder().addComponents(roleIdInput));
                        await subI.showModal(modal);

                        try {
                            const submission = await subI.awaitModalSubmit({ time: 60000, filter: s => s.user.id === subI.user.id });
                            const roleId = submission.fields.getTextInputValue('role_id_input').trim();
                            const role = subI.guild.roles.cache.get(roleId);

                            if (!role) {
                                return await submission.reply({ content: `❌ **Error**: Role with ID \`${roleId}\` not found in this server.`, flags: MessageFlags.Ephemeral });
                            }

                            await upsertConfig(subI.guild.id, { bot_role_id: roleId });
                            await submission.deferReply({ flags: MessageFlags.Ephemeral });

                            // Bulk assign
                            let assigned = 0, skipped = 0;
                            const members = await subI.guild.members.fetch();
                            for (const [, member] of members) {
                                if (!member.user.bot || member.roles.cache.has(roleId)) { if (member.user.bot && member.roles.cache.has(roleId)) skipped++; continue; }
                                try {
                                    await member.roles.add(role);
                                    assigned++;
                                } catch (error) {
                                    logger.error(`Failed to assign bot role to ${member.user.tag}:`, error, 'BulkRole');
                                }
                            }
                            await submission.editReply({ content: `✅ **Bot Role** set to <@&${roleId}>\n🤖 Assigned to **${assigned}** existing bots (${skipped} skipped)` });
                        } catch (e) {
                            // Modal timeout or error
                        }
                    }
                    else if (subI.customId === 'config_manual_super_bot') {
                        const modal = new ModalBuilder()
                            .setCustomId('modal_super_bot_role_id')
                            .setTitle('Enter Super Bot Role ID');

                        const roleIdInput = new TextInputBuilder()
                            .setCustomId('role_id_input')
                            .setLabel('Role ID')
                            .setStyle(TextInputStyle.Short)
                            .setPlaceholder('123456789012345678')
                            .setRequired(true);

                        modal.addComponents(new ActionRowBuilder().addComponents(roleIdInput));
                        await subI.showModal(modal);

                        try {
                            const submission = await subI.awaitModalSubmit({ time: 60000, filter: s => s.user.id === subI.user.id });
                            const roleId = submission.fields.getTextInputValue('role_id_input').trim();
                            const role = subI.guild.roles.cache.get(roleId);

                            if (!role) {
                                return await submission.reply({ content: `❌ **Error**: Role with ID \`${roleId}\` not found in this server.`, flags: MessageFlags.Ephemeral });
                            }

                            await upsertConfig(subI.guild.id, { super_bot_role_id: roleId });
                            await submission.reply({ content: `✅ **Super Bot Role** set to <@&${roleId}>\n⚠️ Note: This role is NOT auto-assigned. Manually give it to admin bots.`, flags: MessageFlags.Ephemeral });
                        } catch (e) {
                            // Modal timeout or error
                        }
                    }
                });
            }
            else if (action === 'protocol_organize') {
                const res = await organizeHierarchy(i.guild);
                await i.reply({ content: `⚙️ **Layer Cake**: ${res}`, flags: MessageFlags.Ephemeral });
            }
            else if (action === 'protocol_deploy') {
                await i.deferUpdate();
                const res = await deployLevelRoles(i.guild);
                await i.followUp({ content: `✨ **Level Roles**: ${res}`, flags: MessageFlags.Ephemeral });
            }
            else if (action === 'loom_generate_premium') {
                await i.deferReply({ flags: MessageFlags.Ephemeral });
                const { generatePremiumPalette } = require('../../utils/services/parentManager');
                await i.editReply({ content: '🎨 **Weaving Premium Spectrum**... This may take a moment to generate 100+ threads.' });
                const res = await generatePremiumPalette(i.guild);
                await i.editReply({ content: `✅ **Spectrum Online**: ${res}` });
            }
            else if (action === 'loom_generate_simple') {
                await i.deferReply({ flags: MessageFlags.Ephemeral });
                const { generateSimplePalette } = require('../../utils/services/parentManager');
                const res = await generateSimplePalette(i.guild);
                await i.editReply({ content: `✅ **Basic Colors**: ${res}` });
            }
            else if (action === 'loom_create_role') {
                // Modal Flow (Unchanged logic, just routed here)
                const modal = new ModalBuilder()
                    .setCustomId('modal_create_role')
                    .setTitle('Create New Thread');

                const nameInput = new TextInputBuilder()
                    .setCustomId('role_name')
                    .setLabel("Role Name")
                    .setStyle(TextInputStyle.Short);

                const colorInput = new TextInputBuilder()
                    .setCustomId('role_color')
                    .setLabel("Hex Color")
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder("#FFACD1")
                    .setRequired(false);

                const layerInput = new TextInputBuilder()
                    .setCustomId('layer_name')
                    .setLabel("Layer Name (Optional)")
                    .setPlaceholder("Cosmetic, Pronouns, etc.")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(nameInput),
                    new ActionRowBuilder().addComponents(colorInput),
                    new ActionRowBuilder().addComponents(layerInput)
                );

                await i.showModal(modal);

                try {
                    const submission = await i.awaitModalSubmit({
                        filter: (submit) => submit.customId === 'modal_create_role' && submit.user.id === i.user.id,
                        time: 60000
                    });

                    const roleName = submission.fields.getTextInputValue('role_name');
                    const roleColor = submission.fields.getTextInputValue('role_color') || '#FFACD1';
                    const layerName = submission.fields.getTextInputValue('layer_name');

                    const existingLayers = await getLayers(i.guild.id);
                    let targetLayerId = existingLayers.find(l => l.name.toLowerCase() === (layerName || 'default').toLowerCase())?.id;

                    if (!targetLayerId && layerName) {
                        const newLayer = await createLayer(i.guild.id, layerName);
                        if (newLayer && newLayer.data) targetLayerId = newLayer.data.id;
                    }

                    await submission.deferReply({ flags: MessageFlags.Ephemeral });
                    const result = await createRoleInLayer(i.guild, roleName, roleColor, targetLayerId);

                    if (result.success) {
                        await submission.editReply({ content: `✅ **Thread Spun**: ${result.role} created in layer '${layerName || 'Unassigned'}'.` });
                    } else {
                        await submission.editReply({ content: `❌ **Loom Error**: ${result.error}` });
                    }

                } catch (e) {
                    if (e.code !== 'InteractionCollectorError') console.error(e);
                }
            }
            else if (action === 'loom_register_role') {
                // Role Select Flow
                const roleSelect = new RoleSelectMenuBuilder()
                    .setCustomId('loom_role_select')
                    .setPlaceholder('Select a role to register...')
                    .setMaxValues(1);

                const rRow = new ActionRowBuilder().addComponents(roleSelect);

                await i.reply({
                    content: '📎 **Registration Protocol**\nSelect the role you wish to archive into the Loom.',
                    components: [rRow],
                    flags: MessageFlags.Ephemeral
                });
                const response = await i.fetchReply();

                try {
                    const roleConfirmation = await response.awaitMessageComponent({
                        filter: (inter) => inter.customId === 'loom_role_select' && inter.user.id === i.user.id,
                        time: 60000,
                        componentType: ComponentType.RoleSelect
                    });

                    const selectedRoleId = roleConfirmation.values[0];
                    const layers = await getLayers(i.guild.id);
                    if (!layers || layers.length === 0) {
                        return await roleConfirmation.update({ content: '⚠️ **Error**: No Layers found. Create a Layer first via "Create Thread".', components: [] });
                    }

                    const layerSelect = new StringSelectMenuBuilder()
                        .setCustomId('loom_layer_registration_select')
                        .setPlaceholder('Select Target Layer...')
                        .addOptions(layers.map(l => ({ label: l.name, value: l.id.toString(), emoji: '📚' })));

                    const lRow = new ActionRowBuilder().addComponents(layerSelect);
                    await roleConfirmation.update({
                        content: `Checking **<@&${selectedRoleId}>**...\nSelect the Layer this role belongs to:`,
                        components: [lRow]
                    });
                    const layerResponse = await roleConfirmation.fetchReply();

                    const layerConfirmation = await layerResponse.awaitMessageComponent({
                        filter: (inter) => inter.customId === 'loom_layer_registration_select' && inter.user.id === i.user.id,
                        time: 60000,
                        componentType: ComponentType.StringSelect
                    });

                    const selectedLayerId = layerConfirmation.values[0];
                    const { registerExistingRole } = require('../../utils/services/parentManager');
                    const res = await registerExistingRole(i.guild, selectedRoleId, selectedLayerId);

                    if (res.success) {
                        await layerConfirmation.update({ content: `✅ **Registered**: <@&${selectedRoleId}> assigned to Layer ID ${selectedLayerId}.`, components: [] });
                    } else {
                        await layerConfirmation.update({ content: `❌ **Failed**: ${res.error}`, components: [] });
                    }
                } catch (e) { }
            }
            else if (action === 'loom_purge') {
                await i.deferReply({ flags: MessageFlags.Ephemeral });
                await i.editReply({ content: '⚠️ **WARNING**: Initiating Librarian\'s Purge sequence...' });

                try {
                    const { purgeUnregisteredRoles } = require('../../utils/services/parentManager');
                    const report = await purgeUnregisteredRoles(i.guild);

                    let resultMsg = `🗑️ **Purge Complete**\n`;
                    resultMsg += `> **Review**: ${report.kept + report.deleted.length + report.failed.length} Roles scanned.\n`;
                    resultMsg += `> **Deleted**: ${report.deleted.length} (Unregistered)\n`;
                    resultMsg += `> **Kept**: ${report.kept} (Whitelisted)\n`;

                    if (report.deleted.length > 0) resultMsg += `\n**Removed Content**: ${report.deleted.join(', ')}`;
                    if (report.failed.length > 0) resultMsg += `\n**Errors**: ${report.failed.join(', ')}`;

                    await i.editReply({ content: resultMsg });
                } catch (error) {
                    console.error('Purge Error:', error);
                    await i.editReply({ content: `❌ **Purge Failed**: ${error.message}` });
                }
            }
        });

        // Modal Collector (Attached to interaction context? No, strictly need `interaction.awaitModalSubmit` or event listener)
        // Since we are in comp collector, we can't catch the modal submit here easily on `msg`.
        // Modal submits are global interactions.
        // But we can use `awaitModalSubmit` on the button interaction `i` if we don't reply closely?
        // Actually, `i.showModal` ends the interaction response. The submit comes as a new interaction.
        // We'll trust the main interaction handler or set up a scoped one if possible, 
        // but typically modals are handled by a separate event listener or a very long await.
        // For simplicity in this restricted command, we can listen on the channel or client?
        // Risky. 
        // Correct way: use `i.awaitModalSubmit`.
    },
};


