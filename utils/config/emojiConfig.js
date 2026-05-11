/**
 * AniMuse Custom Emoji Configuration
 * 
 * To use a custom emoji, replace the Unicode fallback with the Discord emoji string:
 * - Regular: <:name:id>
 * - Animated: <a:name:id>
 * 
 * Tip: Type \:emoji_name: in Discord to get the exact ID string.
 */

const EMOJIS = {
    // Brand & Status
    SUCCESS: '✅',
    ERROR: '❌',
    WARNING: '⚠️',
    INFO: 'ℹ️',
    LOADING: '⏳',
    SPARKLES: '✨',
    
    // UI Elements
    ARROW: '➜',
    DOT: '•',
    SEPARATOR: '|',
    BACK: '🔙',
    CANCEL: '⛔',
    CONFIRM: '✅',
    REFRESH: '🔄',
    LEFT: '◀️',
    RIGHT: '▶️',
    PAGE: '📄',
    
    // Navigation & Dashboard Categories
    DASHBOARD: '🏠',
    GENERAL: '📖',
    LEVELS: '📈',
    ROLES: '🎭',
    MEDIA: '📸',
    SECURITY: '🛡️',
    GUILD_INFO: 'ℹ️',
    ADMIN: '🔨',
    INVITES: '📨',
    AUDIT: '📜',
    EMOJIS: '😀',
    BANS: '🔨',
    SERVER: 'ℹ️',
    
    // Feature Specific
    COLOR_PALETTE: '🎨',
    MEMBER_MANAGEMENT: '👥',
    BOOSTER: '💎',
    CHANNELS: '🏗️',
    TRASH: '🗑️',
    SETTINGS: '⚙️',
    SEARCH: '🔍',
    MAGIC: '✨',
    PARCHMENT: '📜',
    BOOKS: '📚',
    BOOK_OPEN: '📖',
    
    // Custom App-Specific Slots (Add yours here)
    ANIMUSE_LOGO: '✨', // Placeholder
    PRIME_ORB: '🔮',   // Placeholder
};

/**
 * Resolves an emoji by key, or returns the key if not found.
 * Helpful for avoiding undefined strings.
 */
const getEmoji = (key) => {
    return EMOJIS[key] || EMOJIS[key.toUpperCase()] || '❓';
};

module.exports = {
    EMOJIS,
    getEmoji
};
