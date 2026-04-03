const supabase = require('../core/supabaseClient');
const logger = require('../core/logger');

// --- Caching Infrastructure ---
const categoriesCache = new Map();
const serverRolesCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// --- Role Categories ---
const getRoleCategories = async (guildId) => {
    // Cache Check
    if (categoriesCache.has(guildId)) {
        const { data, timestamp } = categoriesCache.get(guildId);
        if (Date.now() - timestamp < CACHE_TTL) return data;
        categoriesCache.delete(guildId);
    }

    if (!supabase) return [];
    
    const { data, error } = await supabase
        .from('role_categories')
        .select('*')
        .eq('guild_id', guildId)
        .order('created_at', { ascending: true });

    if (error) {
        logger.error(`[RoleService] Error fetching categories for ${guildId}:`, error);
        return [];
    }

    categoriesCache.set(guildId, { data: data || [], timestamp: Date.now() });
    return data || [];
};

const createRoleCategory = async (guildId, name) => {
    if (!supabase) return null;
    const { data, error } = await supabase.from('role_categories').insert({ guild_id: guildId, name }).select().single();
    
    if (error) {
        logger.error(`[RoleService] Error creating category "${name}" for ${guildId}:`, error);
        return null;
    }

    categoriesCache.delete(guildId); // Invalidate
    return data;
};

const deleteRoleCategory = async (categoryId) => {
    if (!supabase) return;
    const { error } = await supabase.from('role_categories').delete().eq('id', categoryId);
    
    if (error) {
        logger.error(`[RoleService] Error deleting category ${categoryId}:`, error);
        return;
    }

    categoriesCache.clear(); // Safe bet for global deletion
};

const seedRoleCategories = async (guildId) => {
    if (!supabase) return;
    const defaults = [
        'Council',
        'Colors (Premium)',
        'Colors (Basic)',
        'Profile (Pronouns)',
        'Profile (Age)',
        'Profile (Region)',
        'Levels',
        'Pings',
        'Extra'
    ];
    
    const [existing] = await Promise.all([getRoleCategories(guildId)]);
    const existingNames = existing.map(c => c.name);
    
    const toInsert = defaults.filter(name => !existingNames.includes(name)).map(name => ({ guild_id: guildId, name }));
    
    if (toInsert.length > 0) {
        await supabase.from('role_categories').insert(toInsert);
    }
    
    categoriesCache.delete(guildId); // Invalidate
    return await getRoleCategories(guildId);
};

// --- Server Roles ---
const getServerRoles = async (guildId) => {
    // Cache Check
    if (serverRolesCache.has(guildId)) {
        const { data, timestamp } = serverRolesCache.get(guildId);
        if (Date.now() - timestamp < CACHE_TTL) return data;
        serverRolesCache.delete(guildId);
    }

    if (!supabase) return [];
    
    const { data, error } = await supabase
        .from('server_roles')
        .select('*, category:role_categories(*)')
        .eq('guild_id', guildId);

    if (error) {
        logger.error(`[RoleService] Error fetching server roles for ${guildId}:`, error);
        return [];
    }

    serverRolesCache.set(guildId, { data: data || [], timestamp: Date.now() });
    return data || [];
};

const registerServerRole = async (guildId, roleId, categoryId = null) => {
    if (!supabase) return;
    const { error } = await supabase.from('server_roles').upsert({ role_id: roleId, guild_id: guildId, category_id: categoryId });
    
    if (error) {
        logger.error(`[RoleService] Error registering role ${roleId} for ${guildId}:`, error);
        return;
    }

    serverRolesCache.delete(guildId); // Invalidate
};

const registerServerRoles = async (records) => {
    if (!supabase || !records.length) return;
    const { error } = await supabase.from('server_roles').upsert(records);
    
    if (error) {
        logger.error(`[RoleService] Error batch registering roles:`, error);
        return;
    }

    // Invalidate all involved guilds (usually just one)
    const guildIds = [...new Set(records.map(r => r.guild_id))];
    guildIds.forEach(id => serverRolesCache.delete(id));
};

const unregisterServerRole = async (roleId) => {
    if (!supabase) return;
    const { error } = await supabase.from('server_roles').delete().eq('role_id', roleId);
    
    if (error) {
        logger.error(`[RoleService] Error unregistering role ${roleId}:`, error);
        return;
    }

    serverRolesCache.clear(); // Safe bet for global role removal
};

// --- Level Roles ---
const getLevelRoles = async (guildId) => {
    if (!supabase) return [];
    const { data, error } = await supabase.from('level_roles').select('*').eq('guild_id', guildId).order('level', { ascending: true });
    
    if (error) {
        logger.error(`[RoleService] Error fetching level roles for ${guildId}:`, error);
        return [];
    }

    return data || [];
};

const setLevelRole = async (guildId, level, roleId) => {
    if (!supabase) return;
    const { error } = await supabase.from('level_roles').upsert({ guild_id: guildId, level, role_id: roleId });
    
    if (error) {
        logger.error(`[RoleService] Error setting level role (Lvl ${level}, Role ${roleId}) for ${guildId}:`, error);
        return;
    }
};

const removeLevelRole = async (guildId, level) => {
    if (!supabase) return;
    const { error } = await supabase.from('level_roles').delete().eq('guild_id', guildId).eq('level', level);
    
    if (error) {
        logger.error(`[RoleService] Error removing level role (Lvl ${level}) for ${guildId}:`, error);
    }
};

// --- Config Layers (The Loom) ---
const createLayer = async (guildId, name, allowMultiple = true) => {
    if (!supabase) return null;
    const { data, error } = await supabase
        .from('config_layers')
        .insert({ guild_id: guildId, name, allow_multiple: allowMultiple })
        .select()
        .single();
    
    if (error) {
        logger.error(`[RoleService] Error creating layer "${name}" for ${guildId}:`, error);
        return null;
    }

    return data;
};

const getLayers = async (guildId) => {
    if (!supabase) return [];
    const { data, error } = await supabase
        .from('config_layers')
        .select(`
            *,
            roles:config_layer_roles(*)
        `)
        .eq('guild_id', guildId)
        .order('position', { ascending: true });

    if (error) {
        logger.error(`[RoleService] Error fetching layers for ${guildId}:`, error);
        return [];
    }

    return data || [];
};

const addRoleToLayer = async (layerId, roleId, label = null, emoji = null) => {
    if (!supabase) return;
    const { error } = await supabase
        .from('config_layer_roles')
        .insert({ layer_id: layerId, role_id: roleId, label, emoji });
        
    if (error) {
        logger.error(`[RoleService] Error adding role ${roleId} to layer ${layerId}:`, error);
    }
};

module.exports = {
    getRoleCategories,
    createRoleCategory,
    deleteRoleCategory,
    seedRoleCategories,
    getServerRoles,
    registerServerRole,
    registerServerRoles,
    unregisterServerRole,
    getLevelRoles,
    setLevelRole,
    removeLevelRole,
    createLayer,
    getLayers,
    addRoleToLayer
};
