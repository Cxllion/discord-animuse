const axios = require('axios');
const logger = require('../core/logger');

const anilistClient = axios.create({
    baseURL: 'https://graphql.anilist.co',
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
    timeout: parseInt(process.env.ANILIST_TIMEOUT) || 15000, 
});

const NodeCache = require('node-cache');

// Cache for AniList requests
// stdTTL: 1 hour, checkperiod: 120 seconds
const mediaCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
const searchCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
const autoCompleteCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
// Long-term cache for User IDs (24 hours) since IDs never change
const userIdCache = new NodeCache({ stdTTL: 86400, checkperiod: 600 });

let isAniListMaintenance = false;
let lastMaintenanceLog = 0;
const MAINTENANCE_COOLDOWN = 10 * 60 * 1000; // 10 minutes

// --- CIRCUIT BREAKER METRICS ---
let consecutiveFailures = 0;
const FAILURE_THRESHOLD = 5; // Shut down after 5 consecutive failures
const CIRCUIT_BREAKER_COOLDOWN = 5 * 60 * 1000; // 5 minutes
let lastCircuitTrip = 0;

/**
 * Helper function to make GraphQL requests to AniList
 * @param {string} query
 * @param {object} variables
 * @returns {Promise<any>}
 */
const queryAnilist = async (query, variables = {}, retries = 3) => {
    // 1. Maintenance & Circuit Breaker Guard
    const now = Date.now();
    if (isAniListMaintenance || (consecutiveFailures >= FAILURE_THRESHOLD && now - lastCircuitTrip < CIRCUIT_BREAKER_COOLDOWN)) {
        if (now - lastMaintenanceLog >= MAINTENANCE_COOLDOWN || (consecutiveFailures >= FAILURE_THRESHOLD && now - lastCircuitTrip >= CIRCUIT_BREAKER_COOLDOWN)) {
            // Reset and attempt recovery
            isAniListMaintenance = false;
            consecutiveFailures = 0;
        } else {
            throw new Error('AL_MAINTENANCE');
        }
    }

    let attempt = 0;
    while (attempt <= retries) {
        try {
            const response = await anilistClient.post('/', {
                query,
                variables,
            });
            
            // Success: Reset failures
            consecutiveFailures = 0;
            return response.data.data;
        } catch (error) {
            consecutiveFailures++;
            const status = error.response ? error.response.status : null;
            const aniErrors = error.response?.data?.errors;
            const errorMsg = aniErrors?.[0]?.message || "";

            // 2. Specific Maintenance Detection (403 + Specific Message)
            if (status === 403 && errorMsg.toLowerCase().includes('temporarily disabled')) {
                isAniListMaintenance = true;
                lastMaintenanceLog = Date.now();
                logger.warn('⚠️ [Maintenance] AniList API is currently DISABLED. Silencing requests for 10 minutes.', 'AniList');
                throw new Error('AL_MAINTENANCE');
            }

            // 3. Circuit Breaker Trip
            if (consecutiveFailures >= FAILURE_THRESHOLD) {
                lastCircuitTrip = Date.now();
                logger.error(`🚨 [Circuit Breaker] Tripped after ${consecutiveFailures} consecutive AniList failures. Entering cooling period.`, null, 'AniList');
                throw new Error('AL_MAINTENANCE');
            }

            const isRetryable = !status || (status >= 500 && status < 600) || status === 429;

            if (isRetryable && attempt < retries) {
                attempt++;
                const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
                logger.warn(`AniList Request failed (${status || error.code}). Retrying in ${delay}ms... (Attempt ${attempt}/${retries})`, 'AniList');
                await new Promise(res => setTimeout(res, delay));
            } else {
                const errorDetail = aniErrors?.[0]?.message || (status ? `Status ${status}` : error.message);
                
                logger.error('AniList Request Failed: ' + errorDetail, null, 'AniList');
                if (aniErrors) {
                    logger.error('Full GraphQL Errors: ' + JSON.stringify(aniErrors), null, 'AniList');
                }
                
                if (attempt >= retries) logger.error('AniList Max retries reached', null, 'AniList');
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
 * @param {Array<string>} statusIn Optional list of MediaStatus
 * @returns {Promise<Array>} List of media
 */
const searchMedia = async (search, type = 'ANIME', statusIn = null) => {
    const cacheKey = `search_${type}_${search.toLowerCase()}${statusIn ? `_${statusIn.join(',')}` : ''}`;
    const cached = searchCache.get(cacheKey);
    if (cached) return cached;

    const query = `
    query ($search: String, $type: MediaType${statusIn ? ', $statusIn: [MediaStatus]' : ''}) {
        Page(perPage: 25) {
            media(search: $search, type: $type${statusIn ? ', status_in: $statusIn' : ''}, sort: POPULARITY_DESC) {
                id
                title {
                    romaji
                    english
                    native
                }
                siteUrl
                format
                status
                averageScore
                meanScore
                startDate { year }
            }
        }
    }
    `;
    const variables = { search, type };
    if (statusIn) variables.statusIn = statusIn;

    const data = await queryAnilist(query, variables);
    if (!data || !data.Page || !data.Page.media) return [];
    const results = data.Page.media;

    searchCache.set(cacheKey, results);
    return results;
};

/**
 * Fast search specifically for Slash Command Autocomplete.
 */
const searchMediaAutocomplete = async (search, type = 'ANIME') => {
    if (!search || search.length < 3) return [];
    
    const cacheKey = `ac_${type}_${search.toLowerCase()}`;
    const cached = autoCompleteCache.get(cacheKey);
    if (cached) return cached;

    const query = `
    query ($search: String, $type: MediaType) {
        Page(perPage: 25) {
            media(search: $search, type: $type, sort: SEARCH_MATCH, isAdult: false) {
                id
                title { english romaji }
                format
                startDate { year }
            }
        }
    }
    `;

    if (isAniListMaintenance && Date.now() - lastMaintenanceLog < MAINTENANCE_COOLDOWN) {
        return [{ name: '⚠️ [OFFLINE] AniList API is currently in Maintenance.', value: 'maintenance' }];
    }

    try {
        const data = await queryAnilist(query, { search, type });
        const results = (data.Page.media || []).map(m => {
            const title = m.title.english || m.title.romaji;
            const year = m.startDate?.year ? ` [${m.startDate.year}]` : '';
            const format = m.format ? ` (${m.format})` : '';
            return {
                name: `${title.substring(0, 100)}${format}${year}`,
                value: m.id.toString()
            };
        });

        autoCompleteCache.set(cacheKey, results);
        return results;
    } catch (e) {
        if (e.message === 'AL_MAINTENANCE') {
            return [{ name: '⚠️ [OFFLINE] AniList API is currently in Maintenance.', value: 'maintenance' }];
        }
        return [];
    }
};

/**
 * Gets detailed media info by ID.
 * Uses local cache.
 * @param {number} id 
 * @returns {Promise<object>} Media details
 */
const getMediaById = async (id) => {
    const cacheKey = `media_${id}`;
    const cached = mediaCache.get(cacheKey);
    if (cached) return cached;

    const query = `
    query ($id: Int) {
        Media(id: $id) {
            id
            title {
                romaji
                english
                native
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
            isAdult
            averageScore
            meanScore
            studios {
                edges {
                    isMain
                    node { name }
                }
            }
            season
            seasonYear
            genres
            popularity
            source
            duration
            nextAiringEpisode {
                episode
                airingAt
                timeUntilAiring
            }
            startDate {
                year
            }
        }
    }
    `;
    const data = await queryAnilist(query, { id });
    const result = data.Media;

    mediaCache.set(cacheKey, result);
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
                        averageScore
                        meanScore
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
 * Fetches user's current Watching list.
 * @param {string} username 
 * @returns {Promise<Array>} List of media objects
 */
const getWatchingList = async (username) => {
    const query = `
    query ($username: String) {
        MediaListCollection(userName: $username, type: ANIME, status: CURRENT) {
            lists {
                entries {
                    media {
                        id
                        title { english romaji }
                        status
                    }
                }
            }
        }
    }
    `;
    try {
        const data = await queryAnilist(query, { username });
        if (!data || !data.MediaListCollection || !data.MediaListCollection.lists.length) return [];
        return data.MediaListCollection.lists.flatMap(list => list.entries.map(e => e.media));
    } catch (e) {
        return [];
    }
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
                coverImage { large extraLarge color }
                status
                format
                nextAiringEpisode {
                    episode
                    airingAt
                }
                averageScore
                meanScore
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
        if (!data || !data.User || !data.User.statistics) return { completed: 0, meanScore: 0, days: '0.0' };
        
        const stats = data.User.statistics.anime;
        return {
            completed: stats.count || 0,
            meanScore: stats.meanScore || 0,
            days: ((stats.minutesWatched || 0) / 1440).toFixed(1)
        };
    } catch (e) {
        return { completed: 0, meanScore: 0, days: '0.0' };
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
            bannerImage
            statistics {
                anime {
                    count
                    meanScore
                    minutesWatched
                    episodesWatched
                }
                manga {
                    count
                    chaptersRead
                    volumesRead
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
        if (!data || !data.User) return { stats: { completed: 0, meanScore: 0, days: '0.0', episodes: 0, manga_completed: 0, chapters: 0, volumes: 0 }, favorites: [], avatar: null };

        const anime = data.User.statistics?.anime || {};
        const manga = data.User.statistics?.manga || {};
        const favs = data.User.favourites?.anime?.nodes || [];

        return {
            stats: {
                // Anime
                completed: anime.count || 0,
                meanScore: anime.meanScore || 0,
                days: ((anime.minutesWatched || 0) / 1440).toFixed(1),
                episodes: anime.episodesWatched || 0,
                // Manga
                manga_completed: manga.count || 0,
                chapters: manga.chaptersRead || 0,
                volumes: manga.volumesRead || 0
            },
            favorites: favs,
            avatar: data.User.avatar?.large || null,
            banner: data.User.bannerImage || null
        };
    } catch (e) {
        return { 
            stats: { completed: 0, meanScore: 0, days: '0.0', episodes: 0, manga_completed: 0, chapters: 0, volumes: 0 }, 
            favorites: [], 
            avatar: null,
            maintenance: (e.message === 'AL_MAINTENANCE')
        };
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
                averageScore
                meanScore
                seasonYear
                genres
                status
                description
                studios {
                    edges {
                        isMain
                        node { name }
                    }
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

/**
 * Fetch a random subset of currently trending manga.
 * @returns {Promise<Array>} List of media
 */
const getTrendingManga = async () => {
    const query = `
    query {
        Page(perPage: 10) {
            media(sort: TRENDING_DESC, type: MANGA) {
                id
                title { romaji english }
                coverImage { extraLarge large color }
                bannerImage
                siteUrl
                format
                averageScore
                meanScore
                seasonYear
                startDate { year }
                genres
                status
                description
                type
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

const getTrendingMovies = async () => {
    const query = `
    query {
        Page(perPage: 10) {
            media(sort: TRENDING_DESC, type: ANIME, format: MOVIE) {
                id
                title { romaji english }
                coverImage { extraLarge large color }
                bannerImage
                siteUrl
                format
                averageScore
                meanScore
                seasonYear
                startDate { year }
                genres
                averageScore
                meanScore
                type
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

/**
 * Fetch recent activities for a user.
 * @param {string} userName AniList Username
 * @returns {Promise<Array>} List of activities
 */
const getUserActivity = async (userName) => {
    // 1. Resolve Username to UserId (AniList Page.activities expects Int userId)
    let userId = userIdCache.get(userName.toLowerCase());
    
    if (!userId) {
        const user = await getAnilistUser(userName);
        if (!user) return [];
        userId = user.id;
        userIdCache.set(userName.toLowerCase(), userId);
    }

    const query = `
    query ($userId: Int) {
        Page(page: 1, perPage: 10) {
            activities(userId: $userId, sort: ID_DESC, type: MEDIA_LIST) {
                ... on ListActivity {
                    id
                    status
                    progress
                    type
                    createdAt
                    media {
                        id
                        type
                        title { english romaji }
                        coverImage { extraLarge large color }
                        bannerImage
                        format
                        averageScore
                        meanScore
                        isAdult
                        seasonYear
                        startDate { year }
                    }
                    user {
                        id
                        name
                        avatar { large }
                    }
                }
            }
        }
    }
    `;
    try {
        const data = await queryAnilist(query, { userId });
        // Filter out non-ListActivity items (text posts etc)
        const filtered = (data.Page?.activities || []).filter(a => a && a.media);
        return filtered;
    } catch (e) {
        return [];
    }
};

/**
 * Fetch a user's score for a specific media piece.
 * @param {number} userId 
 * @param {number} mediaId 
 */
const getUserMediaScore = async (userId, mediaId) => {
    const query = `
    query ($userId: Int, $mediaId: Int) {
        MediaList(userId: $userId, mediaId: $mediaId) {
            score(format: POINT_10_DECIMAL)
        }
    }
    `;
    try {
        const data = await queryAnilist(query, { userId, mediaId });
        return data.MediaList ? data.MediaList.score : null;
    } catch (e) {
        return null;
    }
};

const flushAniListCache = () => {
    mediaCache.flushAll();
    searchCache.flushAll();
    logger.info('AniList Data Caches have been flushed. ♡', 'AniList');
};

const formatMediaTitle = (title) => {
    if (!title) return 'Unknown Title';
    return title.english || title.romaji || title.native || 'Unknown Title';
};

module.exports = {
    anilistClient,
    queryAnilist,
    searchMedia,
    getMediaById,
    getAnilistUser,
    getPlanningList,
    getWatchingList,
    getMediaByIds,
    getUserFavorites,
    getUserStats,
    getAniListProfile,
    getTrendingAnime,
    getTrendingManga,
    getTrendingMovies,
    getUserActivity,
    getUserMediaScore,
    flushAniListCache,
    formatMediaTitle,
    searchMediaAutocomplete
};

