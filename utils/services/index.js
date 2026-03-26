const { fetchConfig, upsertConfig, assignChannel, getArchiveSettings, registerParentServer, getParentSettings, isParentServer, pulseChannelActivity, pinChannelPosition, getGuildChannelData } = require('./guildConfigService');
const { linkAnilistAccount, unlinkAnilistAccount, getLinkedAnilist, updateUserBackground, getUserBackground, getUserTitle, updateUserTitle, getUserColor, updateUserColor, getUserAvatarConfig, updateUserAvatarConfig, getBulkUserAvatarConfig, getOwnedTitles, addTitle, addUserFavorite, removeUserFavorite, getUserFavoritesLocal } = require('./userService');
const { addTracker, removeTracker, getUserTrackedAnime, getAllTrackersForAnime, getAnimeDueForUpdate, getTrackedAnimeState, updateTrackedAnimeState } = require('./animeTrackerService');
const { logModerationAction, getModerationLogs } = require('./moderationService');
const { createBingoCard, getBingoCards, getBingoCardById, updateBingoEntries, updateBingoCard, deleteBingoCard } = require('./bingoService');
const { getRoleCategories, createRoleCategory, deleteRoleCategory, seedRoleCategories, getServerRoles, registerServerRole, registerServerRoles, unregisterServerRole, getLevelRoles, setLevelRole, removeLevelRole, createLayer, getLayers, addRoleToLayer } = require('./roleService');
const anilistService = require('./anilistService');
const leveling = require('./leveling');
const scheduler = require('./scheduler');

module.exports = {
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
    updateUserBackground,
    getUserBackground,
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

    // Anime Tracker
    addTracker,
    removeTracker,
    getUserTrackedAnime,
    getAllTrackersForAnime,
    getAnimeDueForUpdate,
    getTrackedAnimeState,
    updateTrackedAnimeState,

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
    addRoleToLayer,

    // Services
    ...anilistService,
    ...leveling,
    ...scheduler
};
