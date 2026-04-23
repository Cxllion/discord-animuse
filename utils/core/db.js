const { Pool } = require('pg');
const CONFIG = require('../config');
const logger = require('./logger');

/**
 * High-Performance Postgres Pool for AniMuse V2
 * Used for write-heavy paths and complex sharded queries.
 */

const pool = new Pool({
    connectionString: CONFIG.DATABASE_URL,
    max: 20, // Max concurrent connections
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Pool Error Handling
pool.on('error', (err) => {
    logger.error('Unexpected error on idle database client', err, 'DatabasePool');
});

/**
 * Execute a query with automatic client management
 */
const query = async (text, params) => {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        logger.debug(`Executed query (${duration}ms): ${text.substring(0, 50)}...`, 'Database');
        return res;
    } catch (err) {
        logger.error('Database query error', err, 'Database');
        throw err;
    }
};

/**
 * Get a client from the pool for transactions
 */
const getClient = async () => {
    const client = await pool.connect();
    const query = client.query;
    const release = client.release;

    // Monkey patch for timing
    client.query = (...args) => {
        client.lastQuery = args;
        return query.apply(client, args);
    };

    client.release = () => {
        client.query = query;
        client.release = release;
        return release.apply(client);
    };

    return client;
};

module.exports = {
    query,
    getClient,
    pool
};
