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
 * @param {string} guildId 
 * @param {string[]} channelIds Array of channel IDs
 */
const updateMediaSettings = async (guildId, channelIds) => {
    // We might want to fetch existing to merge, or just overwrite. 
    // For this selector style, usually overwriting the selection is expected behavior 
    // OR we append. The user asked for "saved to the gallery_channel_ids array".
    // Let's assume the selector returns the *new state* of selected channels if it's a multi-select,
    // but Discord channel selects return just the ones selected in that interaction. 
    // If we want to ADD, we need to fetch first.
    // Implementation decision: The channel selector in Discord usually resets. 
    // Let's treat the selection as "Add these to the list" or "Set these as the list".
    // For simplicity and standard UI behavior, usually "Set" is safer, but if they pluck one, they might expect others to stay.
    // However, multi-channel select allows picking multiple. Let's start with SETTING the list to what was selected.

    const result = await upsertConfig(guildId, { gallery_channel_ids: channelIds });
    if (result.error) return configErrorEmbed();
    return configSuccessEmbed(`The gallery wing has been reorganized. ${channelIds.length} channels designated.`);
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
