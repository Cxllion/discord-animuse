const supabase = require('../core/supabaseClient');
const logger = require('../core/logger');

// --- Role Categories ---
const getRoleCategories = async (guildId) => {
    if (!supabase) return [];
    const { data } = await supabase.from('role_categories').select('*').eq('guild_id', guildId).order('created_at', { ascending: true });
    return data || [];
};

const createRoleCategory = async (guildId, name) => {
    if (!supabase) return null;
    return await supabase.from('role_categories').insert({ guild_id: guildId, name }).select().single();
};

const deleteRoleCategory = async (categoryId) => {
    if (!supabase) return;
    await supabase.from('role_categories').delete().eq('id', categoryId);
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
    
    const existing = await getRoleCategories(guildId);
    const existingNames = existing.map(c => c.name);
    
    const toInsert = defaults.filter(name => !existingNames.includes(name)).map(name => ({ guild_id: guildId, name }));
    
    if (toInsert.length > 0) {
        await supabase.from('role_categories').insert(toInsert);
    }
    return await getRoleCategories(guildId);
};

// --- Server Roles ---
const getServerRoles = async (guildId) => {
    if (!supabase) return [];
    const { data } = await supabase.from('server_roles').select('*, category:role_categories(*)').eq('guild_id', guildId);
    return data || [];
};

const registerServerRole = async (guildId, roleId, categoryId = null) => {
    if (!supabase) return;
    return await supabase.from('server_roles').upsert({ role_id: roleId, guild_id: guildId, category_id: categoryId });
};

const registerServerRoles = async (records) => {
    if (!supabase || !records.length) return;
    return await supabase.from('server_roles').upsert(records);
};

const unregisterServerRole = async (roleId) => {
    if (!supabase) return;
    await supabase.from('server_roles').delete().eq('role_id', roleId);
};

// --- Level Roles ---
const getLevelRoles = async (guildId) => {
    if (!supabase) return [];
    const { data } = await supabase.from('level_roles').select('*').eq('guild_id', guildId).order('level', { ascending: true });
    return data || [];
};

const setLevelRole = async (guildId, level, roleId) => {
    if (!supabase) return;
    return await supabase.from('level_roles').upsert({ guild_id: guildId, level, role_id: roleId });
};

const removeLevelRole = async (guildId, level) => {
    if (!supabase) return;
    await supabase.from('level_roles').delete().eq('guild_id', guildId).eq('level', level);
};

// --- Config Layers (The Loom) ---
const createLayer = async (guildId, name, allowMultiple = true) => {
    if (!supabase) return null;
    return await supabase
        .from('config_layers')
        .insert({ guild_id: guildId, name, allow_multiple: allowMultiple })
        .select()
        .single();
};

const getLayers = async (guildId) => {
    if (!supabase) return [];
    const { data } = await supabase
        .from('config_layers')
        .select(`
            *,
            roles:config_layer_roles(*)
        `)
        .eq('guild_id', guildId)
        .order('position', { ascending: true });

    return data || [];
};

const addRoleToLayer = async (layerId, roleId, label = null, emoji = null) => {
    if (!supabase) return;
    await supabase
        .from('config_layer_roles')
        .insert({ layer_id: layerId, role_id: roleId, label, emoji });
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
