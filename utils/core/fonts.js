const { GlobalFonts } = require('@napi-rs/canvas');
const path = require('path');
const logger = require('./logger');
const fs = require('fs');

/**
 * Loads custom fonts to ensure consistency across environments (e.g., Windows vs Render).
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
            if (file.endsWith('.ttf') || file.endsWith('.otf') || file.endsWith('.woff') || file.endsWith('.woff2')) {
                const fontPath = path.join(fontsDir, file);
                
                // Register normally so it's available by its true name
                const success = GlobalFonts.registerFromPath(fontPath);
                
                // Also register as 'sans-serif' alias so that any ctx.font = '... sans-serif'
                // exactly uses these bundled fonts instead of falling back to Render's defaults.
                GlobalFonts.registerFromPath(fontPath, 'sans-serif');

                if (success) {
                    loadedCount++;
                } else {
                    logger.warn(`Failed to register font: ${file}`, 'Fonts');
                }
            }
        }

        if (loadedCount > 0) {
            logger.info(`Successfully loaded ${loadedCount} custom font(s).`, 'System', 'Fonts');
        } else {
            logger.info('No valid font files (.ttf, .otf, .woff, .woff2) found in assets/fonts.', 'Fonts');
        }

    } catch (error) {
        logger.error('Error loading custom fonts:', error, 'Fonts');
    }
}

module.exports = { loadCustomFonts };
