const { upsertConfig, fetchConfig } = require('../core/database');
const baseEmbed = require('../generators/baseEmbed');

/**
 * Handles updates to general settings.
 * @param {string} guildId 
 * @param {object} settings 
 */
const updateGeneralSettings = async (guildId, settings) => {
    // Placeholder for general settings logic if any specific validation is needed
    // For now, it might just be passing through to upsert
    const result = await upsertConfig(guildId, settings);
    if (result.error) return configErrorEmbed();
    return configSuccessEmbed('General library settings have been updated.');
};

/**
 * Handles updates to media/gallery settings.
 * Appends new channel IDs to the existing gallery array (unique merge).
 * This avoids accidentally wiping existing gallery channels when only
 * one channel is passed, which would happen with a naive overwrite.
 * @param {string} guildId
 * @param {string[]} newChannelIds Array of channel IDs to add
 */
const updateMediaSettings = async (guildId, newChannelIds) => {
    const existing = await fetchConfig(guildId);
    const current = existing?.gallery_channel_ids || [];
    // Unique merge: only add IDs that are not already present
    const merged = [...new Set([...current, ...newChannelIds.map(String)])];
    const result = await upsertConfig(guildId, { gallery_channel_ids: merged });
    if (result.error) return configErrorEmbed();
    return configSuccessEmbed(`The gallery wing has been reorganized. ${merged.length} channels designated.`);
};

/**
 * Handles updates to level settings.
 * @param {string} guildId 
 * @param {boolean} enabled 
 */
const updateLevelSettings = async (guildId, enabled) => {
    const result = await upsertConfig(guildId, { xp_enabled: enabled });
    if (result.error) return configErrorEmbed();
    return configSuccessEmbed(`Experience tracking has been ${enabled ? 'enabled' : 'disabled'}.`);
};

// --- Helpers ---

const configSuccessEmbed = (message) => {
    return baseEmbed()
        .setDescription(`${message} ♡`)
        .setColor('#FFACD1');
};

const configErrorEmbed = () => {
    return baseEmbed()
        .setDescription('Oh dear, it seems I cannot reach the archives at the moment. Shall we try again shortly? ♡')
        .setColor('#FF0000');
};

module.exports = {
    updateGeneralSettings,
    updateMediaSettings,
    updateLevelSettings
};
