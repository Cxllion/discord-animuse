const axios = require('axios');
const supabase = require('../core/supabaseClient');
const logger = require('../core/logger');

const BUCKETS = {
    AVATARS: 'avatars',
    BANNERS: 'banners'
};

/**
 * Ensures that the required storage buckets exist and are public.
 */
const initializeStorage = async () => {
    if (!supabase) return;
    
    for (const bucketName of Object.values(BUCKETS)) {
        try {
            const { data: buckets } = await supabase.storage.listBuckets();
            const exists = buckets?.find(b => b.name === bucketName);
            
            if (!exists) {
                logger.info(`Initializing storage bucket: ${bucketName}`, 'StorageService');
                const { error } = await supabase.storage.createBucket(bucketName, {
                    public: true,
                    fileSizeLimit: 5242880, // 5MB
                    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
                });
                if (error) logger.error(`Failed to create bucket ${bucketName}: ${error.message}`, null, 'StorageService');
            }
        } catch (e) {
            logger.error(`Storage initialization error for ${bucketName}: ${e.message}`, null, 'StorageService');
        }
    }
};

/**
 * Downloads an image from a URL and uploads it to Supabase Storage.
 * @param {string} url - The source URL (usually a Discord attachment)
 * @param {string} bucket - The bucket name
 * @param {string} fileName - The target filename
 * @returns {string|null} - The public URL of the uploaded image
 */
const uploadFromUrl = async (url, bucket, fileName) => {
    if (!supabase) return null;

    try {
        // 1. Download image
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);
        const contentType = response.headers['content-type'] || 'image/png';

        // 2. Upload to Supabase
        const { data, error } = await supabase.storage
            .from(bucket)
            .upload(fileName, buffer, {
                contentType,
                upsert: true
            });

        if (error) {
            logger.error(`Storage Upload Error: ${error.message}`, null, 'StorageService');
            return null;
        }

        // 3. Get Public URL
        const { data: publicData } = supabase.storage
            .from(bucket)
            .getPublicUrl(fileName);

        return publicData.publicUrl;
    } catch (err) {
        logger.error(`Failed to process asset upload: ${err.message}`, null, 'StorageService');
        return null;
    }
};

/**
 * Uses the Discord API to refresh expired CDN attachment URLs.
 * @param {string|string[]} urls - The expired URL(s)
 * @returns {Promise<string|string[]|null>} - The fresh URL(s)
 */
const refreshDiscordUrls = async (urls) => {
    if (!supabase) return urls; // Can't refresh without token usually, but we need the client token

    const isArray = Array.isArray(urls);
    const urlList = isArray ? urls : [urls];
    
    // Filter for Discord CDN links that need refreshing
    const discordUrls = urlList.filter(u => typeof u === 'string' && u.includes('cdn.discordapp.com/attachments/'));
    if (discordUrls.length === 0) return urls;

    try {
        const token = process.env.DISCORD_TOKEN;
        if (!token) return urls;

        const response = await axios.post('https://discord.com/api/v10/attachments/refresh-urls', {
            attachment_urls: discordUrls
        }, {
            headers: {
                'Authorization': `Bot ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const refreshed = response.data.refreshed_urls;
        const resultMap = {};
        refreshed.forEach(item => {
            resultMap[item.original] = item.refreshed;
        });

        const resultList = urlList.map(u => resultMap[u] || u);
        return isArray ? resultList : resultList[0];
    } catch (err) {
        logger.error(`Discord URL Refresh Failed: ${err.message}`, null, 'StorageService');
        return urls;
    }
};

module.exports = {
    initializeStorage,
    uploadFromUrl,
    refreshDiscordUrls,
    BUCKETS
};
