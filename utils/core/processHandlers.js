const logger = require('./logger');

const setupProcessHandlers = () => {
    // --- Warning Suppression ---
    const originalEmit = process.emit;
    process.emit = function (name, data, ...args) {
        if (name === 'warning' && typeof data === 'object' && data.name === 'DeprecationWarning' && data.message.includes('punycode')) {
            return false;
        }
        return originalEmit.apply(process, [name, data, ...args]);
    };

    // --- Global Error Handlers ---
    process.on('unhandledRejection', (reason, promise) => {
        logger.error('[Unhandled Rejection]', reason);
    });

    process.on('uncaughtException', (error) => {
        logger.error('[Uncaught Exception]', error);
        // process.exit(1); // Optional
    });
};

const setupClientHandlers = (client) => {
    const clientError = (error) => {
        if (error.code === 'ENOTFOUND') {
            logger.warn('[Network] Connection lost (DNS/Gateway). Retrying...');
            return;
        }
        logger.error('[Discord Client Error]', error);
    };

    client.on('error', clientError);
    client.on('shardError', clientError);
};

module.exports = { setupProcessHandlers, setupClientHandlers };
