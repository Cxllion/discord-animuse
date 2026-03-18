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
const logger = require('../core/logger');

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
        logger.error('Error creating bingo:', e, 'BingoService');
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
        status: 'PLANNING', // Default user state is Planning, not Media Aired status
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
                status: 'PLANNING', // Default to Planning list state
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
 * Syncs the current status (Completed, Paused, Dropped) for all entries on a Bingo Card via AniList.
 * @param {string} cardId
 * @param {string} userId
 * @param {string} guildId
 */
const syncBingoEntriesFromAnilist = async (cardId, userId, guildId) => {
    // 1. Get Card
    const card = await getBingoCardById(cardId);
    if (!card) return { error: 'Bingo card not found.' };

    const entries = card.entries || [];
    if (entries.length === 0) return { count: 0 };

    // 2. Get Linked User
    const anilistUsername = await getLinkedAnilist(userId, guildId);
    if (!anilistUsername) return { error: 'No linked AniList account.' };

    // 3. Get Media List Collection for the user
    // We could either fetch individual media by ID (lots of requests)
    // or fetch the entire collection (one large request). 
    // Fetching entire collection is usually better for overall sync.
    const query = `
    query ($username: String, $type: MediaType) {
        MediaListCollection(userName: $username, type: $type) {
            lists {
                entries {
                    mediaId
                    status
                    progress
                    score
                }
            }
        }
    }
    `;

    const anilist = require('./anilistService');
    const data = await anilist.queryAnilist(query, { username: anilistUsername, type: card.mode || 'ANIME' });
    if (!data.MediaListCollection.lists) return { error: 'Failed to fetch your list from AniList.' };

    // Map all entries from all lists (Completed, Watching, Planning, etc)
    const listMap = new Map();
    data.MediaListCollection.lists.forEach(l => {
        l.entries.forEach(e => listMap.set(e.mediaId, e));
    });

    // 4. Update Entries Statuses
    let updatedCount = 0;
    const changedTitles = [];
    const newEntries = entries.map(entry => {
        if (!entry) return null;
        const currentData = listMap.get(entry.mediaId);
        if (currentData) {
            // Update status if it changed
            if (entry.status !== currentData.status) {
                const oldStatus = entry.status || 'PLANNING';
                entry.status = currentData.status;
                updatedCount++;
                changedTitles.push({ title: entry.title, from: oldStatus, to: entry.status });
            }
        }
        return entry;
    });

    if (updatedCount > 0) {
        await updateBingoEntries(cardId, newEntries);
    }

    return { count: updatedCount, data: newEntries, changes: changedTitles };
};

/**
 * Manually updates the status of an entry in a Bingo Card.
 * @param {string} cardId
 * @param {number} mediaId
 * @param {string} status - New status (e.g. 'COMPLETED', 'DROPPED', 'PAUSED')
 */
const updateBingoEntryStatus = async (cardId, mediaId, status) => {
    const card = await getBingoCardById(cardId);
    if (!card) return { error: 'Bingo card not found.' };

    let entries = card.entries || [];
    const idx = entries.findIndex(e => e && e.mediaId === mediaId);
    if (idx === -1) return { error: 'Entry not found on this card.' };

    entries[idx].status = status;
    return await updateBingoEntries(cardId, entries);
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
        logger.error('Error renaming bingo:', e, 'BingoService');
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

/**
 * Shuffles the existing entries on a Bingo Card.
 * @param {string} cardId
 */
const shuffleBingoCard = async (cardId) => {
    const card = await getBingoCardById(cardId);
    if (!card) return { error: 'Card not found.' };

    const entries = card.entries || [];
    if (entries.length <= 1) return { count: 0 };

    // Simple Fisher-Yates Shuffle for existing items
    const shuffled = [...entries];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return await updateBingoEntries(cardId, shuffled);
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
    getBingoCardById,
    syncBingoEntriesFromAnilist,
    updateBingoEntryStatus,
    shuffleBingoCard
};

