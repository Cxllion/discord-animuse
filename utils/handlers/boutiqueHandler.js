const { 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder,
    MessageFlags 
} = require('discord.js');
const { fetchConfig, getRoleCategories, getServerRoles } = require('../core/database');
const { COLOR_FAMILIES, BASIC_COLORS } = require('../config/colorConfig');
const baseEmbed = require('../generators/baseEmbed');
const CONFIG = require('../config');

/**
 * Renders the Boutique view (Main or Category)
 * @param {string} guildId 
 * @param {string} [categoryName=null] 
 * @param {import('discord.js').GuildMember} [member=null]
 * @param {string} [selectedFamily=null]
 * @param {Object} [cache=null]
 */
const renderBoutique = async (guildId, categoryName = null, member = null, selectedFamily = null, cache = null) => {
    let categories = cache?.categories || await getRoleCategories(guildId);
    const serverRoles = cache?.serverRoles || await getServerRoles(guildId);
    const config = cache?.config || await fetchConfig(guildId);

    // Define category priority and metadata for uniform look
    const categoryRegistry = [
        { name: 'Profile (Pronouns)', label: 'Pronouns', emoji: '👤', description: 'Express your identity' },
        { name: 'Profile (Age)', label: 'Age Groups', emoji: '🎂', description: 'Connect with your peers' },
        { name: 'Profile (Region)', label: 'Region', emoji: '🌍', description: 'Where are you from?' },
        { name: 'Pings', label: 'Notification Roles', emoji: '🔔', description: 'Stay updated on what matters' },
        { name: 'Colors (Basic)', label: 'Simple Colors', emoji: '🎨', description: 'Add a splash of color to your name' },
        { name: 'Colors (Premium)', label: 'Premium Colors', emoji: '✨', description: 'Exclusive shades for Premium members' }
    ];

    const allowedNames = categoryRegistry.map(c => c.name);
    let filteredCats = categories
        .filter(c => allowedNames.includes(c.name))
        .sort((a, b) => allowedNames.indexOf(a.name) - allowedNames.indexOf(b.name));

    // Auto-seed if empty (Initial Hub Deployment)
    if (filteredCats.length === 0) {
        const { seedRoleCategories } = require('../core/database');
        categories = await seedRoleCategories(guildId);
        filteredCats = categories
            .filter(c => allowedNames.includes(c.name))
            .sort((a, b) => allowedNames.indexOf(a.name) - allowedNames.indexOf(b.name));
    }

    if (!categoryName) {
        // --- Main Menu ---
        const botAvatar = member?.guild?.members?.me?.user?.displayAvatarURL({ dynamic: true }) || null;
        const thumbnail = config.boutique_thumbnail || botAvatar;

        // Generate dynamic category list for embed
        const categoryList = filteredCats.map(cat => {
            const meta = categoryRegistry.find(r => r.name === cat.name);
            return `${meta.emoji} **\`${meta.label}\`** • ${meta.description}`;
        }).join('\n');

        const embed = baseEmbed('🎭 Self Role Boutique', 
            `Personalize your server experience by selecting roles that represent you.\n\n` +
            `📖 **How to Use**\n` +
            `1. Select a category from the dropdown below\n` +
            `2. Choose your preferred roles from the menu\n` +
            `3. Update your selections anytime you want\n\n` +
            `🎯 **Available Categories**:\n` +
            `${categoryList}`,
            botAvatar
        ).setThumbnail(thumbnail);

        const nonce = Date.now().toString().slice(-4);
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`boutique_view_menu_${nonce}`)
            .setPlaceholder('Choose a self-role category...')
            .addOptions(filteredCats.map(cat => {
                const meta = categoryRegistry.find(r => r.name === cat.name);
                return {
                    label: meta.label,
                    value: cat.name,
                    emoji: meta.emoji,
                    description: meta.description
                };
            }));

        const row = new ActionRowBuilder().addComponents(selectMenu);
        return { embeds: [embed], components: [row] };
    } else {
        // --- Category View ---
        const cat = filteredCats.find(c => c.name === categoryName);
        if (!cat) return renderBoutique(guildId); // Fallback to main

        const botAvatar = member?.guild?.members?.me?.user?.displayAvatarURL({ dynamic: true }) || null;
        const thumbnail = config.boutique_thumbnail || botAvatar;

        const rolesInCat = serverRoles.filter(sr => sr.category_id === cat.id);
        
        // Sort rolesInCat by their actual position in the server (top to bottom)
        const guildRoles = member?.guild?.roles?.cache;
        if (guildRoles) {
            rolesInCat.sort((a, b) => {
                const roleA = guildRoles.get(a.role_id);
                const roleB = guildRoles.get(b.role_id);
                return (roleB?.position || 0) - (roleA?.position || 0); // Higher position first (top of list)
            });
        }

        const embed = baseEmbed(`◈ ${categoryName}`, null, botAvatar)
            .setThumbnail(thumbnail);

        const rows = [];
        
        if (rolesInCat.length === 0) {
            embed.setDescription('This collection is currently empty within the Archives.');
        } else {
            // --- SPECIAL CASE: Premium Colors (Dynamic Dropdowns + Clean Preview) ---
            if (categoryName === 'Colors (Premium)') {
                const families = Object.keys(COLOR_FAMILIES); // 10 families

                // Build Clean Preview (Mentions for CURRENT family)
                let previewText = '';
                
                if (selectedFamily) {
                    const familyConfig = COLOR_FAMILIES[selectedFamily];
                    if (!familyConfig) {
                        // Safe fallback if an invalid family was passed
                        previewText = `✦ **Archival Color Families**\n${families.map(f => `◈ **\`${f}\`**`).join('\n')}\n\n*Please select a family from the list below to view its palettes.*`;
                    } else {
                        const familyShades = familyConfig.map(shade => shade.name);
                        const familyRoles = rolesInCat.filter(sr => {
                            const role = member?.guild.roles.cache.get(sr.role_id);
                            return role && familyShades.includes(role.name);
                        }).map(sr => `◈ <@&${sr.role_id}>`).join('\n');

                        if (familyRoles.length > 0) {
                            previewText = `✦ **Available ${selectedFamily} Shades**:\n\n${familyRoles}`;
                        } else {
                            previewText = `✦ **Available ${selectedFamily} Shades**:\n\n◈ None available in this server.`;
                        }
                    }

                    embed.setDescription(
                        `Previewing the **${selectedFamily}** collection. Select a shade below to update your appearance.\n\n` +
                        `${previewText}`
                    );
                } else {
                    const familyList = families.map(f => {
                        let basicColorInfo = BASIC_COLORS.find(bc => bc.name === f);
                        let emoji = basicColorInfo ? basicColorInfo.emoji : '🎨';
                        if (f === 'Monochrome' && !basicColorInfo) emoji = '🔳';
                        return `${emoji} **\`${f}\`**`;
                    }).join('\n');

                    previewText = `✦ **Archival Color Families**\n${familyList}\n\n*Please select a family from the list below to view its palettes.*`;

                    embed.setDescription(
                        `Select a color family below to reveal its specific shades.\n\n` +
                        `${previewText}`
                    );
                }

                // Row 1: Master Family Dropdown
                const familyOptions = families.map(familyName => {
                    let basicColorInfo = BASIC_COLORS.find(bc => bc.name === familyName);
                    let emoji = basicColorInfo ? basicColorInfo.emoji : '🎨';
                    if (familyName === 'Monochrome' && !basicColorInfo) emoji = '🔳';
                    
                    return {
                        label: `${familyName} Collection`,
                        value: familyName,
                        description: `Browse shades in the ${familyName} family`,
                        emoji: emoji
                    };
                });

                const familyNonce = (Date.now() + 1).toString().slice(-4);
                rows.push(new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`boutique_select_family_${categoryName}_${familyNonce}`)
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
                        const shadeNonce = (Date.now() + 2).toString().slice(-4);
                        rows.push(new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId(`boutique_toggle_${categoryName}_${selectedFamily}_${shadeNonce}`)
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
                let loreHeader = '✦ **Archival Collection**';
                if (categoryName.includes('Pronouns')) loreHeader = '✦ **Identity Marking**';
                else if (categoryName.includes('Age')) loreHeader = '✦ **Maturation Records**';
                else if (categoryName.includes('Region')) loreHeader = '✦ **Geographic Origins**';
                else if (categoryName.includes('Pings')) loreHeader = '✦ **Notification Tethers**';

                const previewText = rolesInCat.map(sr => `◈ <@&${sr.role_id}>`).join('\n');
                embed.setDescription(
                    `${loreHeader}\n` +
                    `Select an item to toggle its status on your profile.\n\n` +
                    `✦ **Available in this Selection**:\n${previewText}`
                );

                const options = rolesInCat.map(sr => {
                    const role = member?.guild.roles.cache.get(sr.role_id);
                    const isActive = member?.roles.cache.has(sr.role_id);
                    return {
                        label: role ? role.name : `Unknown Entry (${sr.role_id})`,
                        value: sr.role_id,
                        description: isActive ? 'Currently Active' : 'Select to Acquire',
                        emoji: isActive ? '✅' : '📥'
                    };
                }).slice(0, 25);

                const nonce = Date.now().toString().slice(-4);
                rows.push(new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`boutique_toggle_${categoryName}_${nonce}`)
                        .setPlaceholder('◈ Browse entries...')
                        .addOptions(options)
                ));

                rows.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('boutique_home')
                        .setLabel('Back to Main Hall')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🏘️')
                ));
            }
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
    
    // 0. Proactive Deferral: Extends the 3s window to 15m immediately.
    // This prevents "Unknown Interaction" errors if DB calls or logic take > 3s.
    await interaction.deferUpdate().catch(() => null);

    // 1. Pre-fetch data for optimization (one DB call each per interaction)
    const [config, categories, serverRoles] = await Promise.all([
        fetchConfig(guild.id),
        getRoleCategories(guild.id),
        getServerRoles(guild.id)
    ]);
    const cache = { config, categories, serverRoles };
    
    // Determine if this interaction comes from the PERSISTENT HUB message (pinned/saved)
    const isPersistentHub = message.id === config.boutique_message_id;

    /**
     * Internal helper to respond correctly
     */
    const respond = async (payload) => {
        try {
            if (isPersistentHub) {
                // Return Hub to Main Menu (since we deferred, we use editReply)
                const resetPayload = await renderBoutique(guild.id, null, member, null, cache);
                await interaction.editReply(resetPayload).catch(() => null);
                
                // Deliver the category view as an ephemeral follow-up
                return await interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
            } else {
                // Existing Ephemeral Session: Use editReply because we already deferred
                return await interaction.editReply(payload).catch(() => null);
            }
        } catch (err) {
            console.error('[Boutique Response Error]:', err);
        }
    };

    try {
        // 1. Navigation: Home
        if (customId === 'boutique_home') {
            const payload = await renderBoutique(guild.id, null, member, null, cache);
            return await respond(payload);
        }

        // 2. Navigation: View Category (Button or Menu)
        if (customId.startsWith('boutique_view_menu') || customId.startsWith('boutique_view_')) {
            let catName;
            if (customId.startsWith('boutique_view_menu')) {
                catName = interaction.values[0];
            } else {
                // Format: boutique_view_CategoryName_Nonce
                const parts = customId.split('_');
                catName = parts[parts.length - 2]; // Use parts.length - 2 to be safe if name has underscores
            }
            const payload = await renderBoutique(guild.id, catName, member, null, cache);
            return await respond(payload);
        }

        // 2.5 Navigation: Select Family
        if (customId.startsWith('boutique_select_family_')) {
            const parts = customId.split('_');
            // Format: boutique_select_family_CategoryName_Nonce
            // If CategoryName has spaces, it works. If it has underscores, we need to be careful.
            // Current categories do not have underscores.
            const catName = parts[3]; 
            const selectedFamilyItem = interaction.values[0];
            const payload = await renderBoutique(guild.id, catName, member, selectedFamilyItem, cache);
            return await respond(payload);
        }

        // 3. Logic: Toggle Role
        if (customId.startsWith('boutique_toggle_')) {
            const parts = customId.split('_');
            const catName = parts[2]; 
            // Logic: boutique_toggle_Category_Nonce (len 4) OR boutique_toggle_Category_Family_Nonce (len 5)
            const selectedFamily = parts.length === 5 ? parts[3] : null;
            const roleId = interaction.values[0];
            const role = guild.roles.cache.get(roleId);

            if (!role) {
                const payload = { content: '❌ **Role Error**: This role no longer exists in the server archives.', flags: MessageFlags.Ephemeral };
                if (interaction.deferred || interaction.replied) return await interaction.followUp(payload);
                else return await interaction.reply(payload);
            }

            try {
                const cat = categories.find(c => c.name === catName);

                // Access Control: Premium Colors
                if (catName === 'Colors (Premium)') {
                    const premiumRoleId = config.premium_role_id;
                    if (premiumRoleId && !member.roles.cache.has(premiumRoleId)) {
                        return await interaction.followUp({ 
                            content: `✨ **Seraphic Muse Required**\nThis palette is reserved for high-tier supporters. Unlock it by obtaining the <@&${premiumRoleId}> role.`, 
                            flags: MessageFlags.Ephemeral 
                        });
                    }
                }

                const isColorCategory = catName.includes('Colors');
                const isIdentityCategory = catName.includes('Profile');

                // --- Optimized Role Update (Batched via .set) ---
                const currentRoleIds = Array.from(member.roles.cache.keys());
                let finalRoleIds;
                let actionText = '';

                if (member.roles.cache.has(roleId)) {
                    // Logic: Remove Role
                    finalRoleIds = currentRoleIds.filter(id => id !== roleId);
                    actionText = `Removed: ${role.name}`;
                } else {
                    // Logic: Add Role (with Exclusivity checks)
                    let rolesToClear = [];
                    if (isColorCategory) {
                        const colorTargetCats = categories.filter(c => c.name.includes('Colors')).map(c => c.id);
                        rolesToClear = serverRoles.filter(sr => colorTargetCats.includes(sr.category_id)).map(sr => sr.role_id);
                    } else if (isIdentityCategory) {
                        rolesToClear = serverRoles.filter(sr => sr.category_id === cat.id).map(sr => sr.role_id);
                    }
                    
                    finalRoleIds = currentRoleIds.filter(id => !rolesToClear.includes(id)).concat(roleId);
                    actionText = `Assigned: ${role.name}`;
                }

                // Apply all changes in ONE API call
                const updatedMember = await member.roles.set(finalRoleIds);
                
                // Re-render with the updated member state
                const payload = await renderBoutique(guild.id, catName, updatedMember, selectedFamily, cache);
                await respond(payload);
                
                // Optional success notification (non-blocking)
                return await interaction.followUp({ content: `✅ **${actionText}**`, flags: MessageFlags.Ephemeral }).catch(() => null);

            } catch (e) {
                console.error(`[Boutique Role Update Error] ${e.message}`);
                const errorMsg = e.message.includes('Hierarchy') 
                    ? `❌ **Hierarchy Error**: The **${role.name}** role is positioned above my library clearance levels.`
                    : `❌ **Interaction Error**: Librarian was unable to process this request.`;
                
                return await interaction.followUp({ content: errorMsg, flags: MessageFlags.Ephemeral }).catch(() => null);
            }
        }
    } catch (err) {
        console.error('[Boutique Handler Fatal Error]:', err);
        const errorMsg = `❌ **Interaction Failed**: An internal error occurred while processing the archives.`;
        if (interaction.deferred || interaction.replied) await interaction.followUp({ content: errorMsg, flags: MessageFlags.Ephemeral }).catch(() => null);
        else await interaction.reply({ content: errorMsg, flags: MessageFlags.Ephemeral }).catch(() => null);
    }
};

module.exports = { renderBoutique, handleBoutiqueInteraction };
