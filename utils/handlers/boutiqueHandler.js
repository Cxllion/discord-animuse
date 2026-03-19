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
        const botAvatar = member?.guild?.members?.me?.user?.displayAvatarURL({ dynamic: true }) || null;
        const thumbnail = config.boutique_thumbnail || botAvatar;
        const footerText = config.boutique_footer || 'AniMuse • Self Roles System';

        const embed = new EmbedBuilder()
            .setTitle('🎭 Self Roles')
            .setDescription(
                `Personalize your server experience by selecting roles that represent you.\n\n` +
                `📖 **How to Use**\n` +
                `1. Select a category from the dropdown below\n` +
                `2. Choose your preferred roles from the menu\n` +
                `3. Update your selections anytime you want\n\n` +
                `🎯 **Available Categories**:\n` +
                `👤 **\`Pronouns\`** • Express your identity\n` +
                `🎂 **\`Age Groups\`** • Connect with your peers\n` +
                `🔔 **\`Notification Roles\`** • Stay updated on what matters\n` +
                `🎨 **\`Simple Colors\`** • Add a splash of color to your name\n` +
                `✨ **\`Premium Colors\`** • *Exclusive shades for Premium members*`
            )
            .setColor('#2F3136')
            .setThumbnail(thumbnail)
            .setFooter({ text: footerText });

        const nonce = Date.now().toString().slice(-4);
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`boutique_view_menu_${nonce}`)
            .setPlaceholder('Choose a self-role category...')
            .addOptions(filteredCats.map(cat => {
                let emoji = '📁';
                let label = cat.name;
                let description = 'Browse entries in this collection.';

                if (cat.name === 'Colors (Premium)') {
                    emoji = '✨';
                    label = 'Premium Colors';
                    description = 'Exclusive shades for Premium members';
                } else if (cat.name === 'Colors (Basic)') {
                    emoji = '🎨';
                    label = 'Simple Colors';
                    description = 'Add a splash of color to your name';
                } else if (cat.name.includes('Pronouns')) {
                    emoji = '👤';
                    label = 'Pronouns';
                    description = 'Express your identity';
                } else if (cat.name.includes('Age')) {
                    emoji = '🎂';
                    label = 'Age Groups';
                    description = 'Connect with your peers';
                } else if (cat.name.includes('Region')) {
                    emoji = '🌍';
                    label = 'Region';
                    description = 'Where are you from?';
                } else if (cat.name.includes('Pings')) {
                    emoji = '🔔';
                    label = 'Notification Roles';
                    description = 'Stay updated on what matters';
                }

                return {
                    label: label,
                    value: cat.name,
                    emoji: emoji,
                    description: description
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
        const footerText = config.boutique_footer || 'AniMuse • Self Roles System';

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

        const embed = new EmbedBuilder()
            .setTitle(`◈ ${categoryName}`)
            .setColor('#2F3136')
            .setThumbnail(thumbnail)
            .setFooter({ text: footerText });

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
                } else {
                    const familyList = families.map(f => {
                        let basicColorInfo = BASIC_COLORS.find(bc => bc.name === f);
                        let emoji = basicColorInfo ? basicColorInfo.emoji : '🎨';
                        if (f === 'Monochrome' && !basicColorInfo) emoji = '🔳';
                        return `${emoji} **\`${f}\`**`;
                    }).join('\n');

                    previewText = `✦ **Archival Color Families**\n${familyList}\n\n*Please select a family from the list below to view its palettes.*`;
                }

                embed.setDescription(
                    `Select a color family below to reveal its specific shades.\n\n` +
                    `${previewText}`
                );

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

                const nonce = Date.now().toString().slice(-4);
                rows.push(new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`boutique_select_family_${categoryName}_${nonce}`)
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
                        const nonce = Date.now().toString().slice(-4);
                        rows.push(new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId(`boutique_toggle_${categoryName}_${selectedFamily}_${nonce}`)
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

    // 2. Navigation: View Category (Button or Menu)
    if (customId.startsWith('boutique_view_menu') || customId.startsWith('boutique_view_')) {
        const catName = customId.startsWith('boutique_view_menu') ? interaction.values[0] : customId.replace('boutique_view_', '');
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

        try {
            const categories = await getRoleCategories(guild.id);
            const serverRoles = await getServerRoles(guild.id);
            const cat = categories.find(c => c.name === catName);

            // Access Control: Premium Colors
            if (catName === 'Colors (Premium)') {
                const premiumRoleId = config.premium_role_id;
                if (premiumRoleId && !member.roles.cache.has(premiumRoleId)) {
                    return await interaction.reply({ 
                        content: `✨ **Seraphic Muse Required**\nThis palette is reserved for high-tier supporters. Unlock it by obtaining the <@&${premiumRoleId}> role.`, 
                        flags: MessageFlags.Ephemeral 
                    });
                }
            }

            const isColorCategory = catName.includes('Colors');
            const isIdentityCategory = catName.includes('Profile');

            if (member.roles.cache.has(roleId)) {
                // Remove Role
                await member.roles.remove(role);
                const payload = await renderBoutique(guild.id, catName, member, parts[3] || null);
                await interaction.update(payload);
                return await interaction.followUp({ content: `✅ **Removed**: ${role.name}`, flags: MessageFlags.Ephemeral });
            } else {
                // Add Role (Exclusive Check)
                if (isColorCategory) {
                    // Remove ALL color roles (Basic AND Premium)
                    const colorTargetCats = categories.filter(c => c.name.includes('Colors')).map(c => c.id);
                    const rolesToRemove = serverRoles
                        .filter(sr => colorTargetCats.includes(sr.category_id) && member.roles.cache.has(sr.role_id))
                        .map(sr => sr.role_id);
                    
                    if (rolesToRemove.length > 0) await member.roles.remove(rolesToRemove);
                } else if (isIdentityCategory) {
                    // Identity categories are self-exclusive (Pronouns, Age, etc.)
                    const rolesToRemove = serverRoles
                        .filter(sr => sr.category_id === cat.id && member.roles.cache.has(sr.role_id))
                        .map(sr => sr.role_id);
                    
                    if (rolesToRemove.length > 0) await member.roles.remove(rolesToRemove);
                }

                await member.roles.add(role);
                const payload = await renderBoutique(guild.id, catName, member, parts[3] || null);
                await interaction.update(payload);
                return await interaction.followUp({ content: `✅ **Assigned**: ${role.name}`, flags: MessageFlags.Ephemeral });
            }
        } catch (e) {
            console.error(`[Boutique Error] ${e.message}`);
            const errorMsg = e.message.includes('Hierarchy') 
                ? `❌ **Hierarchy Error**: The **${role.name}** role is positioned above my library clearance levels.`
                : `❌ **Interaction Error**: Librarian was unable to process this request.`;
            
            // Determine how to fail gracefully
            if (interaction.replied || interaction.deferred) {
                return await interaction.followUp({ content: errorMsg, flags: MessageFlags.Ephemeral });
            } else {
                return await interaction.reply({ content: errorMsg, flags: MessageFlags.Ephemeral });
            }
        }
    }
};

module.exports = { renderBoutique, handleBoutiqueInteraction };
