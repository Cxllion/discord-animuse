const {
    registerParentServer, getParentSettings, isParentServer,
    createLayer, getLayers, addRoleToLayer
} = require('../core/database');

// --- CONFIGURATION ---
const MUSE_ROLES_CONFIG = [
    { level: 100, name: '100 | Muse Archon', color: '#8B5CF6' },    // Deep Violet
    { level: 50, name: '50 | Muse Sage', color: '#D946EF' },    // Magenta
    { level: 40, name: '40 | Muse Chronicler', color: '#F43F5E' }, // Crimson
    { level: 30, name: '30 | Muse Scholar', color: '#F97316' },    // Orange/Gold
    { level: 20, name: '20 | Muse Researcher', color: '#EAB308' }, // Yellow
    { level: 10, name: '10 | Muse Scribe', color: '#84CC16' },    // Lime
    { level: 5, name: '5 | Muse Apprentice', color: '#10B981' },  // Emerald
    { level: 1, name: '1 | Muse Novice', color: '#FFACD1' }     // Pink (Base)
];

const LIBRARIAN_ROLE_NAME = 'AniMuse Librarian';

/**
 * Registers the current guild as the Parent Server.
 */
const setAsParent = async (guild) => {
    await registerParentServer(guild.id);
    return true;
};

/**
 * Checks if the guild is the registered Parent.
 */
const checkIsParent = async (guildId) => {
    return await isParentServer(guildId);
};

/**
 * "Level 1: The Layer Cake"
 * Strict Hierarchy Enforcer.
 */
const organizeHierarchy = async (guild) => {
    // 1. Fetch Data
    await guild.roles.fetch(); // Cache invalidator
    const allRoles = Array.from(guild.roles.cache.values());
    const layers = await getLayers(guild.id);

    // 2. Identify Anchors
    const librarianRole = allRoles.find(r => r.name === LIBRARIAN_ROLE_NAME);
    if (!librarianRole) return "Error: 'AniMuse Librarian' role not found. Cannot anchor hierarchy.";

    // 3. Define Sort Order
    // Group 1: Managed/Bot Roles (Leave them alone or put them at top if possible, but safe to ignore)
    // Group 2: Librarian (Anchor)
    // Group 3: Muse Level Roles (100 -> 1)
    // Group 4: Custom Layers (Layer 0 -> Layer N)
    // Group 5: Everyone/Booster (Ignore)

    const museRoles = new Map(MUSE_ROLES_CONFIG.map(c => [c.name, c.level]));

    // Flatten Layer Roles for O(1) lookup
    const layerRoleMap = new Map(); // roleId -> { layerPosition, roleOrder }
    layers.forEach(l => {
        if (l.roles) l.roles.forEach(r => {
            layerRoleMap.set(r.role_id, { layerPos: l.position, roleOrder: r.grid_order });
        });
    });

    // 4. Filter Roles to Manage
    // We only move roles that are:
    // a) Muse Level Roles
    // b) Registered Layer Roles
    // calculated "Score": Higher is better (Top of list)

    const roleScores = [];

    for (const role of allRoles) {
        // Skip specialized/dangerous roles
        if (role.managed || role.id === guild.id) continue;
        if (role.tags && role.tags.premiumSubscriberRole) continue;
        if (role.name === LIBRARIAN_ROLE_NAME) continue; // Don't move the anchor

        // CRITICAL: Skip bot's own role - can't move it!
        if (role.id === guild.members.me.roles.botRole?.id) continue;
        if (role.id === guild.members.me.roles.highest.id) continue;

        if (role.comparePositionTo(guild.members.me.roles.highest) >= 0) continue; // Can't move roles above us

        let score = 0; // Default (Bottom)

        // Muse Roles: 1000 + Level (Range: 1001 - 1100)
        if (museRoles.has(role.name)) {
            score = 1000 + museRoles.get(role.name);
        }
        // Layer Roles: 500 - (LayerPos * 10) - RoleOrder (Range: ~0 - 500)
        // Higher Layer Position (index 0) = Higher Score
        // Within Layer: Lower Grid Order = Higher Score
        else if (layerRoleMap.has(role.id)) {
            const data = layerRoleMap.get(role.id);
            score = 500 - (data.layerPos * 20) - data.roleOrder;
        }

        if (score > 0) {
            roleScores.push({ role, score });
        }
    }

    // 5. Sort
    // Descending Score
    roleScores.sort((a, b) => b.score - a.score);

    // 6. Apply Positions
    // We want the highest score to be just below the Librarian.
    // However, setPositions is absolute.
    // Safe strategy: Calculate absolute position of Librarian, then stack downwards.
    // But other roles exist!
    // Better strategy: Use 'positions' array for setPositions which updates specific roles relative to each other?
    // Discord API `setPositions` takes { role, position }. 
    // If we only pass a subset, how does it handle gaps? It shifts others.
    // This is risky if we don't know the full list.

    // SAFE METHOD: 
    // We can't easily "insert" without knowing the full list.
    // Let's iterate and just ensure relative order within our managed group?
    // No, we want them grouped visually.

    // Let's try to set them relative to the Librarian's current position - 1 downwards.
    let currentPos = librarianRole.position - 1;
    if (currentPos < 1) currentPos = 1;

    const positionUpdates = [];

    for (const item of roleScores) {
        // Only update if it's not already near where we want?
        // Actually, just pushing the full list of changes is best.
        // We assign them positions descending from Librarian.
        // NOTE: If there are unmanaged roles in between, we might overwrite them or clash.
        // This acts as a "Defragmentation". Unmanaged roles might get pushed down.
        if (currentPos <= 1) break; // Safety floor
        positionUpdates.push({ role: item.role.id, position: currentPos });
        currentPos--;
    }

    // 7. Execute Batch
    if (positionUpdates.length > 0) {
        try {
            await guild.roles.setPositions(positionUpdates);
            return `Organized ${positionUpdates.length} roles into the Layer Cake.`;
        } catch (e) {
            console.error('Layer Cake Error:', e);
            return `Failed to organize: ${e.message}`;
        }
    }

    return "Hierarchy validated (No changes needed).";
};

/**
 * "Level 2: Deploy Level Roles"
 * Creates/Updates the 8 Muse roles and sorts them.
 */
const deployLevelRoles = async (guild) => {
    const createdLog = [];
    const roles = await guild.roles.fetch();

    // A. Creation Phase
    const roleMap = new Map();

    for (const config of MUSE_ROLES_CONFIG) {
        let role = roles.find(r => r.name === config.name);

        if (!role) {
            try {
                role = await guild.roles.create({
                    name: config.name,
                    color: config.color,
                    reason: 'Parent Engine: Deploy Level Roles',
                    hoist: true
                });
                createdLog.push(`Created: ${config.name}`);
            } catch (e) {
                console.error(`Failed to create ${config.name}`, e);
            }
        } else {
            // Update Color/Hoist if needed
            if (role.hexColor !== config.color.toUpperCase() || !role.hoist) {
                await role.edit({
                    color: config.color,
                    hoist: true
                });
                createdLog.push(`Updated: ${config.name}`);
            }
        }
        if (role) roleMap.set(config.level, role);
    }

    if (createdLog.length === 0) {
        return "All roles already exist and are strictly formatted.";
    }

    return `Manifest Update:\n` + createdLog.join('\n');
};

// --- Archivist's Loom (Dynamic Role & Layer Manager) ---

/**
 * Creates a role, assigns it to a layer, and positions it safely.
 */
const createRoleInLayer = async (guild, roleName, color, layerId) => {
    // 1. Safety Check: Librarian Position
    const myMember = guild.members.me;
    const librarianRole = guild.roles.cache.find(r => r.name === LIBRARIAN_ROLE_NAME);
    const botTopRole = myMember.roles.highest;

    // We can't create roles higher than our own.
    // The visual requirement says "sit below Color roles but above Social".

    // 2. Create Role
    let role;
    try {
        role = await guild.roles.create({
            name: roleName,
            color: color,
            reason: `Loom: Created for Layer ${layerId}`,
            // We can try to set position here if we know it, or move it after.
        });
    } catch (e) {
        return { success: false, error: e.message };
    }

    // 3. Move Position (Safe Move)
    if (librarianRole && librarianRole.rawPosition > 1) {
        // Try to place it below Librarian.
        // In djs, setPosition(pos) uses absolute position or relative?
        // Actually, changing position is expensive.
        // We will default to leaving it where it spawns (usually at the bottom of the bot's role list)
        // and let 'Organize Layers' handle the strict ordering later.
    }

    // 4. DB Association
    await addRoleToLayer(layerId, role.id, roleName); // Use Name as default label

    // 5. Trigger Auto-Refresh
    if (layerId) {
        // We would call refreshSelfRoleUI(guild) here.
        // Implementing basic placeholder.
        await refreshSelfRoleUI(guild);
    }

    return { success: true, role };
};

const { COLOR_FAMILIES, SIMPLE_COLORS, calculateLightness } = require('../config/colorConfig');

/**
 * "Task 2: Automatic Role Generation"
 * Generates Premium Color Families from config.
 */
const generatePremiumPalette = async (guild) => {
    const report = [];

    // Iterate Families
    for (const [family, shades] of Object.entries(COLOR_FAMILIES)) {
        // 1. Sort by Lightness (Light -> Dark)
        // Lightest = Highest in hierarchy
        const sortedShades = [...shades].sort((a, b) => calculateLightness(b.hex) - calculateLightness(a.hex));

        // 2. Create/Check Layer
        const layerName = `Colors - ${family}`;
        let layerId;

        // Check if layer exists in DB, else create
        const layers = await getLayers(guild.id);
        const existingLayer = layers.find(l => l.name === layerName);

        if (existingLayer) {
            layerId = existingLayer.id;
        } else {
            const newL = await createLayer(guild.id, layerName, false); // false = single choice per color family? 
            // Actually, requirements say "Mutually Exclusive" across ALL colors. 
            // So we might enforce that in the Handler, but 'false' here helps UI hint.
            if (newL && newL.data) layerId = newL.data.id;
        }

        if (!layerId) {
            report.push(`Failed to create layer for ${family}`);
            continue;
        }

        // 3. Create Roles
        for (let i = 0; i < sortedShades.length; i++) {
            const shade = sortedShades[i];
            const roleName = shade.name; // Simplified naming (e.g. "Void")

            // Check existence
            let role = guild.roles.cache.find(r => r.name === roleName);
            if (!role) {
                try {
                    role = await guild.roles.create({
                        name: roleName,
                        color: shade.hex,
                        reason: 'Loom: Premium Palette Generation'
                    });
                    report.push(`Created ${roleName}`);
                } catch (e) {
                    console.error(`Failed to create ${roleName}`, e);
                    continue;
                }
            }

            // 4. Assign to Layer
            // grid_order = i (0 is lightest/highest)
            await addRoleToLayer(layerId, role.id, shade.name, '🎨');
        }
    }

    // Trigger Hierarchy Sort
    organizeHierarchy(guild).catch(console.error);
    refreshSelfRoleUI(guild).catch(console.error);

    return `Palette Generation Complete. processed ${Object.keys(COLOR_FAMILIES).length} families.`;
};

/**
 * "Task 4: The Simple Palette"
 */
const generateSimplePalette = async (guild) => {
    const layerName = 'Colors - Basic';
    const layers = await getLayers(guild.id);
    let layerId = layers.find(l => l.name === layerName)?.id;

    if (!layerId) {
        const newL = await createLayer(guild.id, layerName, false);
        if (newL && newL.data) layerId = newL.data.id;
    }

    if (!layerId) return "Failed to create Basic Layer.";

    const report = [];
    for (const color of SIMPLE_COLORS) {
        let role = guild.roles.cache.find(r => r.name === color.name);
        if (!role) {
            role = await guild.roles.create({
                name: color.name,
                color: color.hex,
                reason: 'Loom: Simple Palette'
            });
            report.push(`Created ${color.name}`);
        }
        await addRoleToLayer(layerId, role.id, color.name, color.emoji);
    }

    organizeHierarchy(guild).catch(console.error);
    refreshSelfRoleUI(guild).catch(console.error);

    return `Simple Palette Verified.`;
};

const { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');

const refreshSelfRoleUI = async (guild) => {
    // 1. Get Settings
    const settings = await getParentSettings(guild.id);
    if (!settings || !settings.master_embed_id || !settings.self_role_channel_id) return;

    // 2. Fetch Master Message
    try {
        const channel = await guild.channels.fetch(settings.self_role_channel_id);
        const msg = await channel.messages.fetch(settings.master_embed_id);
        if (!msg) return;

        // 3. Re-generate Components based on Layers
        const layers = await getLayers(guild.id);
        const rows = [];

        // We can only have 5 rows max.
        // Logic: Create a Select Menu for each Layer that has roles.
        // Limit to first 5 populated layers.

        let validLayers = layers.filter(l => l.roles && l.roles.length > 0);
        if (validLayers.length > 5) validLayers = validLayers.slice(0, 5);

        for (const layer of validLayers) {
            const options = layer.roles.map(r =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(r.label || r.role_id) // Fallback if no specific label, ideally lookup name?
                    // We don't have role name stored directly per role in DB (added role_id),
                    // but we can fetch from guild cache.
                    .setLabel(guild.roles.cache.get(r.role_id)?.name || r.label || 'Unknown Role')
                    .setValue(r.role_id.toString())
                    .setEmoji(r.emoji || '💠')
            );

            // If options > 25, slice (Discord limit)
            const safeOptions = options.slice(0, 25);

            if (safeOptions.length > 0) {
                const menu = new StringSelectMenuBuilder()
                    .setCustomId(`loom_select_${layer.id}`)
                    .setPlaceholder(`Select ${layer.name}...`)
                    .addOptions(safeOptions)
                    .setMinValues(0) // Allow deselecting all?
                    .setMaxValues(layer.allow_multiple ? safeOptions.length : 1);

                rows.push(new ActionRowBuilder().addComponents(menu));
            }
        }

        // 4. Update Message
        // Keep existing embeds, just update components
        await msg.edit({ components: rows });
        console.log(`[Loom] Updated Master Embed ${msg.id} with ${rows.length} layer menus.`);

    } catch (e) {
        console.warn('[Loom] Failed to refresh Master UI:', e);
    }
};

// --- Sanitization & Cleanup ---

const registerExistingRole = async (guild, roleId, layerId) => {
    const role = guild.roles.cache.get(roleId);
    if (!role) return { success: false, error: 'Role not found.' };

    // Add to DB
    const { error } = await addRoleToLayer(layerId, roleId, role.name);

    if (error) return { success: false, error: error.message };

    // Trigger Sort in background
    organizeHierarchy(guild).catch(console.error);

    // Trigger Refresh
    refreshSelfRoleUI(guild).catch(console.error);

    return { success: true, role };
};

const purgeUnregisteredRoles = async (guild) => {
    // 1. Fetch All Roles
    await guild.roles.fetch(); // Force cache update
    const allRoles = guild.roles.cache; // Use cache directly after fetch to ensure Collection

    // 2. Fetch Whitelist (DB) & Winnow Zombies
    const { COLOR_FAMILIES, SIMPLE_COLORS } = require('../config/colorConfig');
    const layers = await getLayers(guild.id);
    const dbRoleIds = new Set();

    layers.forEach(l => {
        let validSchemaNames = null;

        // Determine if this is a Strick-Schema Layer
        if (l.name === 'Colors - Basic') {
            validSchemaNames = new Set(SIMPLE_COLORS.map(c => c.name));
        } else if (l.name.startsWith('Colors - ')) {
            const family = l.name.replace('Colors - ', '');
            if (COLOR_FAMILIES[family]) {
                validSchemaNames = new Set(COLOR_FAMILIES[family].map(c => c.name));
            }
        }

        if (l.roles) {
            l.roles.forEach(dbRole => {
                // If Schema is active, we valid against the REAL role 
                if (validSchemaNames) {
                    const realRole = guild.roles.cache.get(dbRole.role_id);
                    if (realRole) {
                        // ZOMBIE CHECK: Does the real role name match the current schema?
                        if (validSchemaNames.has(realRole.name)) {
                            // Safe.
                            dbRoleIds.add(dbRole.role_id);
                        } else {
                            // Zombie Detected! (e.g. "Void | Black" vs "Void")
                            // We do NOT whitelist it. It will be purged.
                            // console.log(`[Zombie Hunter] Marking ${realRole.name} (ID: ${realRole.id}) for expiration.`);
                        }
                    } else {
                        // Role doesn't exist in Discord anyway.
                    }
                } else {
                    // Standard Layer (Allow all)
                    dbRoleIds.add(dbRole.role_id);
                }
            });
        }
    });

    // 3. Helper: Muse Roles
    // Ensure config exists
    const safeConfig = (typeof MUSE_ROLES_CONFIG !== 'undefined') ? MUSE_ROLES_CONFIG : [];
    const museRoles = new Set(safeConfig.map(c => c.name));

    const deleted = [];
    const failed = [];
    let kept = 0;

    // 4. Duplicate Scanner (Pre-Purge)
    const nameWhitelist = new Set([...museRoles, LIBRARIAN_ROLE_NAME]);
    const nameGroups = new Map();

    allRoles.forEach(r => {
        if (nameWhitelist.has(r.name)) {
            if (!nameGroups.has(r.name)) nameGroups.set(r.name, []);
            nameGroups.get(r.name).push(r);
        }
    });

    const duplicatesToDelete = new Set(); // Use Set for O(1) lookup

    for (const [name, roles] of nameGroups) {
        if (roles.length > 1) {
            // Sort: High Members > Older
            roles.sort((a, b) => {
                if (b.members.size !== a.members.size) return b.members.size - a.members.size;
                return a.createdTimestamp - b.createdTimestamp;
            });
            // Mark losers
            for (let i = 1; i < roles.length; i++) {
                duplicatesToDelete.add(roles[i].id);
            }
        }
    }

    // 5. Purge Loop
    // Iterate using Array to avoid iterator issues during deletion (though concurrent mod might be okay with cache)
    // Safer to just map IDs first? No, role ref is needed for props.
    const rolesArray = Array.from(allRoles.values());

    for (const role of rolesArray) {
        let shouldDelete = false;

        // Safety: @everyone, Managed, Bot Role
        if (role.id === guild.id || role.managed || role.tags?.botId) {
            kept++;
            continue;
        }

        // Safety: Whitelisted IDs
        if (dbRoleIds.has(role.id)) {
            kept++;
            continue;
        }

        // Check Duplicates (by ID now)
        if (duplicatesToDelete.has(role.id)) {
            shouldDelete = true;
        }
        // Check Name Whitelist (if not duplicate)
        else if (museRoles.has(role.name) || role.name === LIBRARIAN_ROLE_NAME) {
            kept++;
            continue;
        }
        // Booster
        else if (role.tags && role.tags.premiumSubscriberRole) {
            kept++;
            continue;
        }
        else {
            shouldDelete = true;
        }

        if (shouldDelete) {
            try {
                if (role.comparePositionTo(guild.members.me.roles.highest) >= 0) {
                    failed.push(`${role.name} (Higher than Bot)`);
                    continue;
                }
                await role.delete('Librarian Purge: Unregistered / Duplicate');
                deleted.push(role.name);
            } catch (e) {
                console.error(`Failed to delete ${role.name}:`, e);
                failed.push(`${role.name} (${e.message})`);
            }
        }
    }

    return { kept, deleted, failed };
};

module.exports = {
    setAsParent,
    checkIsParent,
    organizeHierarchy,
    deployLevelRoles,
    createRoleInLayer,
    refreshSelfRoleUI,
    registerExistingRole,
    purgeUnregisteredRoles,
    getLayers, // Exporting for command usage
    generatePremiumPalette,
    generateSimplePalette,
    setupEssentialRoles: require('./setupWizard').setupEssentialRoles
};

