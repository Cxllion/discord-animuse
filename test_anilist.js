const { searchMedia, getMediaById } = require('./utils/services/anilistService');
const logger = require('./utils/core/logger');

async function test() {
    try {
        console.log('Testing searchMedia("Mushoku Tensei")...');
        const results = await searchMedia('Mushoku Tensei', 'ANIME');
        console.log('Results found:', results.length);
        if (results.length > 0) {
            console.log('First result ID:', results[0].id);
            const media = await getMediaById(results[0].id);
            console.log('Media Title:', media.title.english || media.title.romaji);
        }
    } catch (error) {
        console.error('Test Failed:');
        console.error(error);
    }
}

test();
