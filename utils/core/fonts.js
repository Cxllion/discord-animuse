const { GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const logger = require('./logger');
const fs = require('fs');

/**
 * Loads custom fonts to ensure consistency across environments.
 */
function loadCustomFonts() {
    try {
        const fontsDir = path.join(__dirname, '..', '..', 'assets', 'fonts');
        
        if (!fs.existsSync(fontsDir)) {
            logger.warn('Fonts directory not found at: ' + fontsDir, 'Fonts');
            return;
        }

        const fontFiles = fs.readdirSync(fontsDir);
        let loadedCount = 0;

        for (const file of fontFiles) {
            const ext = path.extname(file).toLowerCase();
            if (ext === '.ttf' || ext === '.otf') {
                const fontPath = path.join(fontsDir, file);
                
                // Get the 'Core' name by splitting by spaces, hyphens, and underscores
                // This converts 'Neo-Externo Demo' -> 'neo' and 'DigitalGalaxy-Regular...' -> 'digitalgalaxy'
                const familyName = path.basename(file, ext).toLowerCase().split(/[ \-_]/)[0];
                const success = GlobalFonts.registerFromPath(fontPath, familyName);
                
                if (success) {
                    loadedCount++;
                    logger.debug(`Registered font family: '${familyName}' (from ${file})`, 'Fonts');
                } else {
                    logger.warn(`Failed to register font: ${file}`, 'Fonts');
                }
            }
        }

        if (loadedCount > 0) {
            logger.info(`Successfully curated ${loadedCount} typography assets for the visual archives. ♡`, 'System', 'Fonts');
        } else {
            logger.info('No valid font files (.ttf, .otf) found in the archives.', 'Fonts');
        }

    } catch (error) {
        logger.error('Error loading custom fonts:', error, 'Fonts');
    }
}

module.exports = { loadCustomFonts };
