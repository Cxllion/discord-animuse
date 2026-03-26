const supabase = require('../core/supabaseClient');
const logger = require('../core/logger');

/**
 * Creates a new Bingo card for a user.
 * @param {string} userId 
 * @param {string} guildId 
 * @param {string} title 
 * @param {string} type 'monthly', 'yearly', 'custom'
 * @param {number} size 
 * @param {string} mode 'ANIME' or 'MANGA'
 */
const createBingoCard = async (userId, guildId, title, type, size, mode = 'ANIME') => {
    if (!supabase) return { error: 'No DB' };
    return await supabase
        .from('bingo_cards')
        .insert({
            user_id: userId,
            guild_id: guildId,
            title,
            type,
            size,
            mode,
            entries: [] // Initialize empty
        })
        .select()
        .single();
};

/**
 * Fetches all Bingo cards for a user in a guild.
 * @param {string} userId 
 * @param {string} guildId 
 */
const getBingoCards = async (userId, guildId) => {
    if (!supabase) return [];
    const { data } = await supabase
        .from('bingo_cards')
        .select('*')
        .eq('user_id', userId)
        .eq('guild_id', guildId)
        .order('created_at', { ascending: false });
    return data || [];
};

/**
 * Fetches a specific Bingo card by ID.
 * @param {string} id 
 */
const getBingoCardById = async (id) => {
    if (!supabase) return null;
    const { data } = await supabase
        .from('bingo_cards')
        .select('*')
        .eq('id', id)
        .single();
    return data;
};

/**
 * Shorthand to update just the entries of a Bingo card.
 * @param {string} cardId 
 * @param {Array} entries 
 */
const updateBingoEntries = async (cardId, entries) => {
    return await updateBingoCard(cardId, { entries });
};

/**
 * Updates any field of a Bingo card.
 * @param {string} cardId 
 * @param {object} updates 
 */
const updateBingoCard = async (cardId, updates) => {
    if (!supabase) return;
    return await supabase
        .from('bingo_cards')
        .update({ ...updates, updated_at: new Date() })
        .eq('id', cardId)
        .select()
        .single();
};

/**
 * Deletes a Bingo card.
 * @param {string} cardId 
 */
const deleteBingoCard = async (cardId) => {
    if (!supabase) return;
    await supabase
        .from('bingo_cards')
        .delete()
        .eq('id', cardId);
};

module.exports = {
    createBingoCard,
    getBingoCards,
    getBingoCardById,
    updateBingoEntries,
    updateBingoCard,
    deleteBingoCard
};
