/**
 * Animuse Core Database Interface
 * 
 * This file acts as a centralized entry point for all database-related services.
 * Individual domains (Users, Guild Configs, Anime Tracking, etc.) are managed
 * in their respective service files in utils/services/.
 */

const { 
    fetchConfig, upsertConfig, assignChannel, getArchiveSettings,
    registerParentServer, getParentSettings, isParentServer,
    pulseChannelActivity, pinChannelPosition, getGuildChannelData 
} = require('../services/guildConfigService');

const { 
    linkAnilistAccount, unlinkAnilistAccount, getLinkedAnilist, 
    updateUserBannerConfig, getUserBannerConfig, clearUserBannerGlobally, getUserTitle, 
    updateUserTitle, getUserColor, updateUserColor, 
    getUserAvatarConfig, updateUserAvatarConfig, getBulkUserAvatarConfig, 
    getOwnedTitles, addTitle, addUserFavorite, removeUserFavorite, getUserFavoritesLocal,
    getLinkedUsersForFeed, updateLastActivityId, getActivityCache, upsertActivityCache, clearActivityCache
} = require('../services/userService');

const { 
    addTracker, removeTracker, getUserTrackedAnime, getGuildTrackers,
    getAllTrackersForAnime, getAnimeDueForUpdate, 
    getTrackedAnimeState, updateTrackedAnimeState, removeAllTrackersForAnime
} = require('../services/animeTrackerService');

const { logModerationAction, getModerationLogs } = require('../services/moderationService');
const { createBingoCard, getBingoCards, getBingoCardById, updateBingoEntries, updateBingoCard, deleteBingoCard } = require('../services/bingoService');
const { 
    getRoleCategories, createRoleCategory, deleteRoleCategory, seedRoleCategories, 
    getServerRoles, registerServerRole, registerServerRoles, unregisterServerRole, 
    getLevelRoles, setLevelRole, removeLevelRole, 
    createLayer, getLayers, addRoleToLayer 
} = require('../services/roleService');

const initializeDatabase = async () => { 
    // Handled by individual services or startup migrations
    return true; 
};

module.exports = {
    // Initialization
    initializeDatabase,

    // Guild Config
    fetchConfig,
    upsertConfig,
    assignChannel,
    getArchiveSettings,
    registerParentServer,
    getParentSettings,
    isParentServer,
    pulseChannelActivity,
    pinChannelPosition,
    getGuildChannelData,

    // User
    linkAnilistAccount,
    unlinkAnilistAccount,
    getLinkedAnilist,
    updateUserBannerConfig,
    getUserBannerConfig,
    clearUserBannerGlobally,
    getUserTitle,
    updateUserTitle,
    getUserColor,
    updateUserColor,
    getUserAvatarConfig,
    updateUserAvatarConfig,
    getBulkUserAvatarConfig,
    getOwnedTitles,
    addTitle,
    addUserFavorite,
    removeUserFavorite,
    getUserFavoritesLocal,
    getLinkedUsersForFeed,
    updateLastActivityId,
    getActivityCache,
    upsertActivityCache,
    clearActivityCache,

    // Anime Tracker
    addTracker,
    removeTracker,
    getUserTrackedAnime,
    getGuildTrackers,
    getAllTrackersForAnime,
    getAnimeDueForUpdate,
    getTrackedAnimeState,
    updateTrackedAnimeState,
    removeAllTrackersForAnime,

    // Moderation
    logModerationAction,
    getModerationLogs,

    // Bingo
    createBingoCard,
    getBingoCards,
    getBingoCardById,
    updateBingoEntries,
    updateBingoCard,
    deleteBingoCard,

    // Roles
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
