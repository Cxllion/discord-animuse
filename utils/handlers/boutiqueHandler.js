const { 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder,
    MessageFlags 
} = require('discord.js');
const { fetchConfig, getRoleCategories, getServerRoles } = require('../core/database');
const { COLOR_FAMILIES, BASIC_COLORS } = require('../config/colorConfig');
const { getDynamicUserTitle } = require('../core/userMeta');

/**
 * Renders the Boutique view (Main or Category)
 * @param {string} guildId 
 * @param {string} [categoryName=null] 
 * @param {import('discord.js').GuildMember} [member=null]
 * @param {string} [selectedFamily=null]
 */
const renderBoutique = async (guildId, categoryName = null, member = null, selectedFamily = null) => {
    const categories = await getRoleCategories(guildId);
    const serverRoles = await getServerRoles(guildId);
    const config = await fetchConfig(guildId);

    // Filter categories for members
    const allowedCategories = [
        'Colors (Premium)', 'Colors (Basic)', 
        'Profile (Pronouns)', 'Profile (Age)', 'Profile (Region)', 'Pings'
    ];
    const filteredCats = categories.filter(c => allowedCategories.includes(c.name));

    if (!categoryName) {
        // --- Main Menu ---
        const title = await getDynamicUserTitle(member);
        const embed = new EmbedBuilder()
            .setTitle('◈ The Master Role Boutique')
            .setDescription(
                `Welcome, **${title}**.\n\n` +
                `The Archives have been curated for your convenience. Select a collection below to personalize your appearance within the library.\n\n` +
                `✦ **Collections Available**:\n` +
                `◈ *Color Palettes (Premium & Basic)*\n` +
                `◈ *Identity Markers (Pronouns, Age, Region)*\n` +
                `◈ *Notification Tethers*`
            )
            .setColor('#2F3136') // Dark Minimalist
            .setFooter({ text: '✦ Muse Archive Curation' });
        const rows = [];
        // Category Buttons (Chunked into rows - 3 per row for 2x3 grid)
        for (let i = 0; i < filteredCats.length; i += 3) {
            const row = new ActionRowBuilder();
            filteredCats.slice(i, i + 3).forEach(cat => {
                let emoji = '📁';
                let label = cat.name;

                if (cat.name === 'Colors (Premium)') {
                    emoji = '🎨';
                    label = 'Premium Colors';
                } else if (cat.name === 'Colors (Basic)') {
                    emoji = '🎨';
                    label = 'Basic Colors';
                } else if (cat.name.includes('Pronouns')) {
                    emoji = '✨';
                    label = 'Pronouns';
                } else if (cat.name.includes('Age')) {
                    emoji = '🎂';
                    label = 'Age';
                } else if (cat.name.includes('Region')) {
                    emoji = '🌍';
                    label = 'Region';
                } else if (cat.name.includes('Pings')) {
                    emoji = '🔔';
                    label = 'Pings';
                }

                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`boutique_view_${cat.name}`)
                        .setLabel(label)
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji(emoji)
                );
            });
            rows.push(row);
        }

        return { embeds: [embed], components: rows };
    } else {
        // --- Category View ---
        const cat = filteredCats.find(c => c.name === categoryName);
        if (!cat) return renderBoutique(guildId); // Fallback to main

        const rolesInCat = serverRoles.filter(sr => sr.category_id === cat.id);
        const embed = new EmbedBuilder()
            .setTitle(`◈ ${categoryName}`)
            .setColor('#2F3136');

        const rows = [];
        
        if (rolesInCat.length === 0) {
            embed.setDescription('This collection is current empty within the Archives.');
        } else {
            // --- SPECIAL CASE: Premium Colors (Dynamic Dropdowns + Clean Preview) ---
            if (categoryName === 'Colors (Premium)') {
                const families = Object.keys(COLOR_FAMILIES); // 10 families

                // Build Clean Preview (Mentions for CURRENT family)
                let previewText = '';
                
                if (selectedFamily) {
                    const familyConfig = COLOR_FAMILIES[selectedFamily];
                    const familyShades = familyConfig.map(shade => shade.name);
                    const familyRoles = rolesInCat.filter(sr => {
                        const role = member?.guild.roles.cache.get(sr.role_id);
                        return role && familyShades.includes(role.name);
                    }).map(sr => `<@&${sr.role_id}>`).join(' ');

                    if (familyRoles.length > 0) {
                        previewText = `✦ **Available ${selectedFamily} Shades**:\n\n◈ ${familyRoles}`;
                    } else {
                        previewText = `✦ **Available ${selectedFamily} Shades**:\n\n◈ None available in this server.`;
                    }
                } else {
                    previewText = '✦ Please select a family from the list below to view its palettes.';
                }

                embed.setDescription(
                    `Select a color family below to reveal its specific shades.\n\n` +
                    `${previewText}`
                );

                // Row 1: Master Family Dropdown
                const familyOptions = families.map(familyName => {
                    let basicColorInfo = BASIC_COLORS.find(bc => bc.name === familyName);
                    
                    // Fallback for Monochrome which is now split in basic roles
                    let emoji = basicColorInfo ? basicColorInfo.emoji : '🎨';
                    if (familyName === 'Monochrome' && !basicColorInfo) emoji = '🔳';
                    
                    return {
                        label: `${familyName} Collection`,
                        value: familyName,
                        description: `Browse shades in the ${familyName} family`,
                        default: selectedFamily === familyName,
                        emoji: emoji
                    };
                });

                rows.push(new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`boutique_select_family_${categoryName}`)
                        .setPlaceholder('◈ Choose a Color Family...')
                        .addOptions(familyOptions)
                ));

                // Row 2: Dynamic Shades Dropdown (if a family is selected)
                if (selectedFamily && COLOR_FAMILIES[selectedFamily]) {
                    const familyConfig = COLOR_FAMILIES[selectedFamily];
                    const familyShades = familyConfig.map(shade => shade.name);
                    const specificFamilyRoles = rolesInCat.filter(sr => {
                        const role = member?.guild.roles.cache.get(sr.role_id);
                        return role && familyShades.includes(role.name);
                    });

                    if (specificFamilyRoles.length > 0) {
                        rows.push(new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId(`boutique_toggle_${categoryName}_${selectedFamily}`)
                                .setPlaceholder(`◈ Select a shade from ${selectedFamily}...`)
                                .addOptions(specificFamilyRoles.map(sr => {
                                    const role = member?.guild.roles.cache.get(sr.role_id);
                                    const shadeData = familyConfig.find(s => s.name === role?.name);
                                    const hexCode = shadeData ? shadeData.hex : '#???';
                                    const isActive = member?.roles.cache.has(sr.role_id);
                                    
                                    const basicColorInfo = BASIC_COLORS.find(bc => bc.name === selectedFamily);
                                    const emoji = basicColorInfo ? basicColorInfo.emoji : '🎨';

                                    return {
                                        label: role ? role.name : 'Unknown Shade',
                                        value: sr.role_id,
                                        description: `Hex: ${hexCode} | ${isActive ? 'Currently Active' : 'Select to Add'}`,
                                        emoji: emoji
                                    };
                                }))
                        ));
                    }
                }

                // Row 3: Navigation Row (Home Only)
                const navRow = new ActionRowBuilder();
                navRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId('boutique_home')
                        .setLabel('Back to Main Hall')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🏘️')
                );
                rows.push(navRow);
            } else {
                // --- STANDARD CATEGORY: Clean View ---
                const previewText = rolesInCat.map(sr => `<@&${sr.role_id}>`).join(' ');
                embed.setDescription(
                    `Select an item to toggle its status on your profile.\n\n` +
                    `✦ **Available in this Selection**:\n${previewText}`
                );

                const options = rolesInCat.map(sr => {
                    const role = member?.guild.roles.cache.get(sr.role_id);
                    return {
                        label: role ? role.name : `Unknown Entry (${sr.role_id})`,
                        value: sr.role_id,
                        description: member?.roles.cache.has(sr.role_id) ? 'Currently Assigned' : 'Select to Acquire'
                    };
                }).slice(0, 25);

                rows.push(new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`boutique_toggle_${categoryName}`)
                        .setPlaceholder('◈ Browse entries...')
                        .addOptions(options)
                ));
            }
        }

        // Add Back button ONLY if not already handled by a specialized view (like Premium Colors)
        const hasNavigation = categoryName === 'Colors (Premium)';

        if (!hasNavigation) {
            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('boutique_home')
                    .setLabel('Back to Main Hall')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🏘️')
            ));
        }

        return { embeds: [embed], components: rows.slice(0, 5) }; // Safety cap
    }
};

/**
 * Handles Boutique interactions
 * @param {import('discord.js').Interaction} interaction 
 */
const handleBoutiqueInteraction = async (interaction) => {
    const { customId, guild, member, message } = interaction;
    const config = await fetchConfig(guild.id);
    
    // Determine if this interaction should spawn a NEW ephemeral session or update an EXISTING one
    // We spawn a new one if it's from the persistent message hub
    const isPersistentHub = message.id === config.boutique_message_id;

    /**
     * Internal helper to respond correctly (Reply or Update)
     */
    const respond = async (payload) => {
        if (isPersistentHub) {
            // New Session
            return await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
        } else {
            // Existing Session Navigation
            return await interaction.update(payload);
        }
    };

    // 1. Navigation: Home
    if (customId === 'boutique_home') {
        const payload = await renderBoutique(guild.id, null, member);
        return await respond(payload);
    }

    // 2. Navigation: View Category
    if (customId.startsWith('boutique_view_')) {
        const catName = customId.replace('boutique_view_', '');
        const payload = await renderBoutique(guild.id, catName, member);
        return await respond(payload);
    }

    // 2.5 Navigation: Select Family
    if (customId.startsWith('boutique_select_family_')) {
        const catName = customId.replace('boutique_select_family_', '');
        const selectedFamilyItem = interaction.values[0];
        const payload = await renderBoutique(guild.id, catName, member, selectedFamilyItem);
        return await respond(payload);
    }

    // 3. Logic: Toggle Role
    if (customId.startsWith('boutique_toggle_')) {
        const parts = customId.split('_');
        const catName = parts[2]; 
        const roleId = interaction.values[0];
        const role = guild.roles.cache.get(roleId);

        if (!role) {
            return await interaction.reply({ content: '❌ **Role Error**: This role no longer exists in the server archives.', flags: MessageFlags.Ephemeral });
        }

        const categories = await getRoleCategories(guild.id);
        const serverRoles = await getServerRoles(guild.id);
        const cat = categories.find(c => c.name === catName);
        const isExclusiveCategory = catName.includes('Colors') || catName.includes('Profile');

        if (catName === 'Colors (Premium)') {
            const premiumRoleId = config.premium_role_id;
            if (premiumRoleId && !member.roles.cache.has(premiumRoleId)) {
                return await interaction.reply({ 
                    content: `✨ **Seraphic Muse Required**\nThis palette is reserved for high-tier supporters. Unlock it by obtaining the <@&${premiumRoleId}> role.`, 
                    flags: MessageFlags.Ephemeral 
                });
            }
        }

        if (member.roles.cache.has(roleId)) {
            try {
                await member.roles.remove(role);
                const payload = await renderBoutique(guild.id, catName, member, parts[3] || null);
                await interaction.update(payload);
                return await interaction.followUp({ content: `✅ **Removed**: ${role.name}`, flags: MessageFlags.Ephemeral });
            } catch (e) {
                return await interaction.reply({ content: `❌ **Permission Error**: I cannot manage the **${role.name}** role.`, flags: MessageFlags.Ephemeral });
            }
        } else {
            try {
                if (isExclusiveCategory) {
                    const rolesToRemove = serverRoles
                        .filter(sr => sr.category_id === cat.id && member.roles.cache.has(sr.role_id))
                        .map(sr => sr.role_id);
                    if (rolesToRemove.length > 0) await member.roles.remove(rolesToRemove);
                }
                await member.roles.add(role);
                const payload = await renderBoutique(guild.id, catName, member, parts[3] || null);
                await interaction.update(payload);
                return await interaction.followUp({ content: `✅ **Assigned**: ${role.name}`, flags: MessageFlags.Ephemeral });
            } catch (e) {
                return await interaction.reply({ content: `❌ **Permission Error**: I cannot assign the **${role.name}** role.`, flags: MessageFlags.Ephemeral });
            }
        }
    }
};

module.exports = { renderBoutique, handleBoutiqueInteraction };
