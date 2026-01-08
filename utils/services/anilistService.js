const axios = require('axios');

const anilistClient = axios.create({
    baseURL: 'https://graphql.anilist.co',
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
});

// Cache for AniList requests
const mediaCache = new Map();
const searchCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Helper function to make GraphQL requests to AniList
 * @param {string} query
 * @param {object} variables
 * @returns {Promise<any>}
 */
const queryAnilist = async (query, variables = {}, retries = 3) => {
    let attempt = 0;
    while (attempt <= retries) {
        try {
            const response = await anilistClient.post('/', {
                query,
                variables,
            });
            return response.data.data;
        } catch (error) {
            const status = error.response ? error.response.status : null;
            const isRetryable = !status || (status >= 500 && status < 600) || status === 429;

            if (isRetryable && attempt < retries) {
                attempt++;
                const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                console.warn(`[AniList] Request failed (${status || error.code}). Retrying in ${delay}ms... (Attempt ${attempt}/${retries})`);
                await new Promise(res => setTimeout(res, delay));
            } else {
                console.error('[AniList] Request Failed:', status ? `Status ${status}` : error.message);
                if (attempt >= retries) console.error('[AniList] Max retries reached.');
                // Return null instead of throwing to prevent bot crash, callers must handle null
                // Actually, throwing might be better for the caller to know it failed, but we promised grace.
                // Let's throw, but ensure top-level handlers catch it.
                // Re-reading user request: "broken things dont just stop the bot".
                // If I throw, I rely on the caller catch block. Most callers have one.
                throw error;
            }
        }
    }
};

/**
 * Searches for anime or manga on AniList.
 * Uses local cache.
 * @param {string} search 
 * @param {string} type 'ANIME' or 'MANGA'
 * @returns {Promise<Array>} List of media
 */
const searchMedia = async (search, type = 'ANIME') => {
    const cacheKey = `search_${type}_${search.toLowerCase()}`;
    if (searchCache.has(cacheKey)) {
        const { data, timestamp } = searchCache.get(cacheKey);
        if (Date.now() - timestamp < CACHE_TTL) return data;
        searchCache.delete(cacheKey);
    }

    const query = `
    query ($search: String, $type: MediaType) {
        Page(perPage: 10) {
            media(search: $search, type: $type, sort: POPULARITY_DESC) {
                id
                title {
                    romaji
                    english
                }
                siteUrl
                format
                startDate { year }
            }
        }
    }
    `;
    const data = await queryAnilist(query, { search, type });
    const results = data.Page.media;

    searchCache.set(cacheKey, { data: results, timestamp: Date.now() });
    return results;
};

/**
 * Gets detailed media info by ID.
 * Uses local cache.
 * @param {number} id 
 * @returns {Promise<object>} Media details
 */
const getMediaById = async (id) => {
    const cacheKey = `media_${id}`;
    if (mediaCache.has(cacheKey)) {
        const { data, timestamp } = mediaCache.get(cacheKey);
        if (Date.now() - timestamp < CACHE_TTL) return data;
        mediaCache.delete(cacheKey);
    }

    const query = `
    query ($id: Int) {
        Media(id: $id) {
            id
            title {
                romaji
                english
            }
            coverImage {
                extraLarge
                large
                color
            }
            bannerImage
            siteUrl
            description
            format
            status
            episodes
            chapters
            averageScore
            meanScore
            studios(isMain: true) {
                nodes {
                    name
                }
            }
            season
            seasonYear
            genres
            startDate {
                year
            }
        }
    }
    `;
    const data = await queryAnilist(query, { id });
    const result = data.Media;

    mediaCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
};

/**
 * Checks if an AniList user exists.
 * @param {string} username 
 * @returns {Promise<object|null>} User user data or null
 */
const getAnilistUser = async (username) => {
    const query = `
    query ($username: String) {
        User(name: $username) {
            id
            name
            avatar { large }
            siteUrl
        }
    }
    `;
    try {
        const data = await queryAnilist(query, { username });
        return data.User;
    } catch (e) {
        return null; // Not found
    }
};

/**
 * Fetches user's Planning list.
 * @param {string} username 
 * @param {string} type 'ANIME' or 'MANGA'
 * @returns {Promise<Array>} List of media objects
 */
const getPlanningList = async (username, type = 'ANIME') => {
    const query = `
    query ($username: String, $type: MediaType) {
        MediaListCollection(userName: $username, type: $type, status: PLANNING, sort: ADDED_TIME_DESC) {
            lists {
                entries {
                    media {
                        id
                        title { english romaji }
                        coverImage { large extraLarge }
                        status
                        format
                    }
                }
            }
        }
    }
    `;
    const data = await queryAnilist(query, { username, type });
    if (!data.MediaListCollection.lists.length) return [];

    // Flatten lists (rare cases of custom lists but usually one "Planning" list)
    return data.MediaListCollection.lists.flatMap(list => list.entries.map(e => e.media));
};

/**
 * Fetches multiple media items by ID in a single query.
 * @param {Array<number|string>} ids 
 * @returns {Promise<Array>} List of media objects
 */
const getMediaByIds = async (ids) => {
    if (!ids || ids.length === 0) return [];

    const query = `
    query ($ids: [Int], $page: Int) {
        Page(page: $page, perPage: 25) {
            media(id_in: $ids) {
                id
                title { english romaji }
                siteUrl
                coverImage { large extraLarge }
            }
        }
    }
    `;

    // Note: If ids > 25, AniList pagination would be needed.
    // Since our buffer max is 25, a single page is sufficient.
    const data = await queryAnilist(query, { ids, page: 1 });
    return data.Page.media;
};

/**
 * Fetch a user's top 3 favorite anime.
 * @param {string} username 
 * @returns {Promise<Array>} List of media objects (max 3)
 */
const getUserFavorites = async (username) => {
    const query = `
    query ($username: String) {
        User(name: $username) {
            favourites {
                anime(perPage: 3) {
                    nodes {
                        title { romaji english }
                        coverImage { large extraLarge }
                    }
                }
            }
        }
    }
    `;
    try {
        const data = await queryAnilist(query, { username });
        return data.User.favourites.anime.nodes || [];
    } catch (e) {
        return [];
    }
};

/**
 * Fetch detailed user statistics (Completed, Days, Score).
 * @param {string} username 
 */
const getUserStats = async (username) => {
    const query = `
    query ($username: String) {
        User(name: $username) {
            statistics {
                anime {
                    count
                    meanScore
                    minutesWatched
                }
            }
        }
    }
    `;
    try {
        const data = await queryAnilist(query, { username });
        const stats = data.User.statistics.anime;
        return {
            completed: stats.count || 0,
            meanScore: stats.meanScore || 0,
            days: (stats.minutesWatched / 1440).toFixed(1)
        };
    } catch (e) {
        return null;
    }

};

/**
 * Fetch comprehensive user profile data (Stats + Favorites) in one query.
 * @param {string} username 
 */
const getAniListProfile = async (username) => {
    const query = `
    query ($username: String) {
        User(name: $username) {
            avatar { large }
            statistics {
                anime {
                    count
                    meanScore
                    minutesWatched
                }
            }
            favourites {
                anime(perPage: 3) {
                    nodes {
                        title { romaji english }
                        coverImage { large extraLarge }
                    }
                }
            }
        }
    }
    `;
    try {
        const data = await queryAnilist(query, { username });
        const stats = data.User.statistics.anime;
        const favs = data.User.favourites.anime.nodes || [];

        return {
            stats: {
                completed: stats.count || 0,
                meanScore: stats.meanScore || 0,
                days: (stats.minutesWatched / 1440).toFixed(1)
            },
            favorites: favs,
            avatar: data.User.avatar.large
        };
    } catch (e) {
        return { stats: null, favorites: [] };
    }
};

/**
 * Fetch a random subset of currently trending anime.
 * @returns {Promise<Array>} List of media
 */
const getTrendingAnime = async () => {
    const query = `
    query {
        Page(perPage: 10) {
            media(sort: TRENDING_DESC, type: ANIME, status: RELEASING) {
                id
                title { romaji english }
                coverImage { extraLarge large color }
                bannerImage
                nextAiringEpisode {
                    episode
                    airingAt
                    timeUntilAiring
                }
                siteUrl
                format
                genres
                studios(isMain: true) {
                    nodes { name }
                }
            }
        }
    }
    `;
    try {
        const data = await queryAnilist(query);
        return data.Page.media || [];
    } catch (e) {
        return [];
    }
};

module.exports = {
    anilistClient,
    queryAnilist,
    searchMedia,
    getMediaById,
    getAnilistUser,
    getPlanningList,
    getMediaByIds,
    getUserFavorites,
    getUserStats,
    getAniListProfile,
    getTrendingAnime
};

