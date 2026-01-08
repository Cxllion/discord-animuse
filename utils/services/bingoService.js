const {
    createBingoCard,
    getBingoCards,
    getBingoCardById,
    updateBingoEntries,
    updateBingoCard,
    deleteBingoCard,
    linkAnilistAccount,
    getLinkedAnilist
} = require('../core/database');
const { searchMedia, getPlanningList, getMediaById } = require('./anilistService');

/**
 * Validates and creates a new Bingo Card.
 * @param {string} userId
 * @param {string} guildId
 * @param {string} title
 * @param {string} type
 * @param {number} size
 * @param {string} mode
 * @returns {Promise<object>} Created card or error
 */
const createUserBingo = async (userId, guildId, title, type, size, mode = 'ANIME') => {
    // 1. Validation
    if (size < 2 || size > 5) return { error: 'Size must be between 2x2 and 5x5.' };
    const validTypes = ['monthly', 'yearly', 'custom'];
    if (!validTypes.includes(type)) return { error: 'Invalid bingo type.' };
    if (!title || title.length > 50) return { error: 'Title must be 1-50 characters.' };

    // 2. Uniqueness Check (handled by DB constraint, but friendly check here?)
    // We rely on DB constraint for atomic safety.

    // 3. Create
    try {
        const { data, error } = await createBingoCard(userId, guildId, title, type, size, mode);
        if (error) {
            if (error.code === '23505') return { error: 'You already have a bingo card with this title.' };
            throw error;
        }
        return { data };
    } catch (e) {
        console.error('Error creating bingo:', e);
        return { error: 'Database error occurred.' };
    }
};

/**
 * Adds an anime to a specific slot in a Bingo Card.
 * @param {string} cardId
 * @param {string|number} animeQuery - Name or ID
 * @param {number} slotIndex - Optional: Specific slot (0-indexed). If null, finds first empty.
 * @returns {Promise<object>} Updated card or error
 */
const addAnimeToBingo = async (cardId, animeQuery, slotIndex = null) => {
    // 1. Fetch Card
    const card = await getBingoCardById(cardId);
    if (!card) return { error: 'Bingo card not found.' };

    const maxSlots = card.size * card.size;

    // 2. Fetch Anime/Manga
    let media;
    if (typeof animeQuery === 'number') {
        media = await getMediaById(animeQuery);
    } else {
        // Enforce mode search
        const results = await searchMedia(animeQuery, card.mode || 'ANIME');
        media = results && results.length > 0 ? await getMediaById(results[0].id) : null;
    }

    if (!media) return { error: 'Media not found.' };

    // 2b. Mode Validation
    // Manga formats: MANGA, ONE_SHOT, NOVEL
    const isMangaMedia = ['MANGA', 'ONE_SHOT', 'NOVEL'].includes(media.format);
    const isMangaCard = card.mode === 'MANGA';

    if (isMangaCard && !isMangaMedia) return { error: 'This card is for Manga/Novels only.' };
    if (!isMangaCard && isMangaMedia) return { error: 'This card is for Anime only.' };

    // 3. Prepare Entry
    const newEntry = {
        mediaId: media.id,
        title: media.title.english || media.title.romaji,
        coverImage: media.coverImage.extraLarge || media.coverImage.large,
        status: media.status,
        filledAt: new Date().toISOString()
    };

    // 4. Determine Slot
    let entries = card.entries || [];
    // Ensure array is sized correctly (sparse array handling)

    // Check for duplicates
    if (entries.some(e => e && e.mediaId === media.id)) {
        return { error: 'This anime is already on the card.' };
    }

    if (slotIndex !== null) {
        if (slotIndex < 0 || slotIndex >= maxSlots) return { error: 'Invalid slot index.' };
        entries[slotIndex] = newEntry; // Overwrite
    } else {
        // Find first empty
        let found = -1;
        for (let i = 0; i < maxSlots; i++) {
            if (!entries[i]) {
                found = i;
                break;
            }
        }
        if (found === -1) return { error: 'Bingo card is full!' };
        entries[found] = newEntry;
    }

    // 5. Update DB
    const { data, error } = await updateBingoEntries(cardId, entries);
    if (error) return { error: 'Failed to update card.' };

    return { data, media };
};

/**
 * Auto-fills a Bingo Card from the user's AniList Planning list.
 * @param {string} cardId
 * @param {string} userId
 * @param {string} guildId
 */
const fetchAndFillBingo = async (cardId, userId, guildId) => {
    // 1. Get Card
    const card = await getBingoCardById(cardId);
    if (!card) return { error: 'Bingo card not found.' };

    // 2. Get Linked User
    const anilistUsername = await getLinkedAnilist(userId, guildId);
    if (!anilistUsername) return { error: 'No linked AniList account.' };

    // 3. Fetch Planning List
    let planningList = await getPlanningList(anilistUsername, card.mode || 'ANIME');

    if (!planningList || planningList.length === 0) return { error: 'No items found in your AniList Planning list.' };

    // 4. Fill Empty Slots
    const maxSlots = card.size * card.size;
    let entries = card.entries || [];
    let modified = false;

    // Filter out already added anime AND blacklisted (removed) IDs
    const existingIds = new Set(entries.filter(e => e).map(e => e.mediaId));
    const removedIds = new Set(card.removed_ids || []);
    const availableAnime = planningList.filter(m => !existingIds.has(m.id) && !removedIds.has(m.id));

    // Shuffle available anime for randomness? Or keep order? 
    // User often wants "random" or "top priority".
    // Let's shuffle significantly to give variety if the list is huge.
    const shuffled = availableAnime.sort(() => 0.5 - Math.random());

    let animeIdx = 0;
    for (let i = 0; i < maxSlots; i++) {
        if (!entries[i]) {
            if (animeIdx >= shuffled.length) break; // Use up all planning items
            const media = shuffled[animeIdx++];
            entries[i] = {
                mediaId: media.id,
                title: media.title.english || media.title.romaji,
                coverImage: media.coverImage.extraLarge || media.coverImage.large,
                status: media.status,
                filledAt: new Date().toISOString()
            };
            modified = true;
        }
    }

    if (!modified) return { error: 'No new anime were added (Card full or no new items found).' };

    // 5. Save
    const { data, error } = await updateBingoEntries(cardId, entries);
    return { data, count: animeIdx, error };
};

/**
 * Removes multiple entries from a Bingo Card and blacklists them.
 * @param {string} cardId
 * @param {Array<number>} mediaIds
 */
const removeEntriesFromBingo = async (cardId, mediaIds) => {
    const card = await getBingoCardById(cardId);
    if (!card) return { error: 'Card not found.' };

    let entries = card.entries || [];
    let removedIds = card.removed_ids || [];

    mediaIds.forEach(mid => {
        const idNum = parseInt(mid);
        // Find in entries and nullify
        const idx = entries.findIndex(e => e && e.mediaId === idNum);
        if (idx !== -1) entries[idx] = null;

        // Add to blacklist
        if (!removedIds.includes(idNum)) removedIds.push(idNum);
    });

    return await updateBingoCard(cardId, { entries, removed_ids: removedIds });
};

/**
 * Renames a Bingo Card.
 * @param {string} cardId
 * @param {string} newTitle
 */
const renameBingoCard = async (cardId, newTitle) => {
    if (!newTitle || newTitle.length > 50) return { error: 'Title must be 1-50 characters.' };

    // Uniqueness handled by DB, but we catch it
    try {
        const { data, error } = await updateBingoCard(cardId, { title: newTitle });
        if (error) {
            if (error.code === '23505') return { error: 'You already have a bingo card with this title.' };
            throw error;
        }
        return { data };
    } catch (e) {
        console.error('Error renaming bingo:', e);
        return { error: 'Database error occurred.' };
    }
};

/**
 * Resizes a Bingo Card.
 * @param {string} cardId
 * @param {number} newSize
 */
const resizeBingoCard = async (cardId, newSize) => {
    if (newSize < 2 || newSize > 5) return { error: 'Size must be between 2x2 and 5x5.' };

    const card = await getBingoCardById(cardId);
    if (!card) return { error: 'Card not found.' };

    const filledEntries = (card.entries || []).filter(e => e !== null);
    const newCapacity = newSize * newSize;

    if (filledEntries.length > newCapacity) {
        const diff = filledEntries.length - newCapacity;
        return {
            error: `Grid is too small, remove some entries first. You have **${filledEntries.length}** entries, but a **${newSize}x${newSize}** grid only holds **${newCapacity}**. You must remove at least **${diff}** entry/ies.`,
            diff
        };
    }

    // Adjust entries array size if needed (padding with nulls)
    let entries = card.entries || [];
    if (entries.length > newCapacity) {
        // Shrink only if no data lost (verified above)
        entries = entries.slice(0, newCapacity);
    } else if (entries.length < newCapacity) {
        // Grow - array handles sparse, but we can pad
        while (entries.length < newCapacity) entries.push(null);
    }

    return await updateBingoCard(cardId, { size: newSize, entries });
};

module.exports = {
    createUserBingo,
    addAnimeToBingo,
    fetchAndFillBingo,
    removeEntriesFromBingo,
    renameBingoCard,
    resizeBingoCard,
    getBingoCards,
    deleteBingoCard,
    getBingoCardById
};
