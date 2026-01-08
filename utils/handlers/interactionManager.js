const { ActionRowBuilder, ComponentType } = require('discord.js');

/**
 * Global Interaction Manager
 * Handles component collectors and automatic cleanup of "Ephemeral Buttons".
 */

/**
 * Watches a message for component interactions.
 * Automatically removes specified components (by customId) when the time expires.
 * 
 * @param {Message} message - The message to watch.
 * @param {number} time - Duration in milliseconds.
 * @param {Function} onCollect - Async callback (interaction) => void.
 * @param {string[]} ephemeralIds - List of customIds to remove on timeout.
 */
const watchInteraction = (message, time, onCollect, ephemeralIds = []) => {

    const collector = message.createMessageComponentCollector({ time });

    collector.on('collect', async (interaction) => {
        try {
            await onCollect(interaction);
        } catch (error) {
            console.error('[InteractionManager] Callback Error:', error);
            // Try to respond if not already
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Interaction Handler Error.', ephemeral: true }).catch(() => { });
            }
        }
    });

    collector.on('end', async () => {
        // Cleanup Phase
        if (ephemeralIds.length === 0) return;

        try {
            // Fetch fresh message to ensure we have latest state
            const freshMessage = await message.fetch().catch(() => null);
            if (!freshMessage) return; // Message deleted

            // Rebuild Components excluding ephemeralIds
            const oldRows = freshMessage.components;
            const newRows = [];

            for (const row of oldRows) {
                const newComponents = row.components.filter(c => {
                    // Keep if customId is NOT in ephemeralIds
                    // Note: Link buttons don't have customId (usually), so they are kept.
                    // If c.customId is null/undefined (Link Button), we keep it.
                    if (!c.customId) return true;
                    return !ephemeralIds.includes(c.customId);
                });

                if (newComponents.length > 0) {
                    // We must reconstruct the ActionRowBuilder because API components are read-only
                    // But wait, message.edit accepts API objects too? Yes.
                    // We can just pass the filtered array of components if we structure it right?
                    // Actually, safer to just use the filtered structure.
                    // However, we need to map them back to Builders if we wanted to change them. 
                    // But for removal, passing the reduced API structure usually works.
                    // Let's rely on Discord.js handling the API structures returned by .components

                    // Logic check: row.toJSON() gives the API data.
                    const rowData = row.toJSON();
                    rowData.components = newComponents.map(c => c.toJSON());
                    newRows.push(rowData);
                }
            }

            // Update Message
            // Only update if changes were made? No, always safer to ensure sync.
            // But if newRows is same as oldRows (length/content), skip to save API call?
            // Ephemeral Logic implies we WANT to remove something.

            await freshMessage.edit({ components: newRows });

        } catch (error) {
            // Common error: Message deleted, permissions lost.
            // console.debug('[InteractionManager] Cleanup failed (Message likely gone).');
        }
    });
};

module.exports = { watchInteraction };
