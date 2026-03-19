const { generateSearchCard } = require('./utils/generators/searchGenerator');
const { createMediaResponse } = require('./utils/generators/mediaResponse');
const { getMediaById } = require('./utils/services/anilistService');

async function test() {
    try {
        console.log('Fetching media 101280 (Zombie Land Saga)...');
        const media = await getMediaById(101280);
        console.log('Media Title:', media.title.english || media.title.romaji);
        
        console.log('Testing createMediaResponse...');
        const response = await createMediaResponse(media, '123', '456');
        console.log('Response generated successfully. Has files:', response.files?.length > 0);
        
        if (response.embeds?.length > 0) {
            console.log('Fallbacked to Embed! This means an error occurred during image generation.');
        }

    } catch (error) {
        console.error('Test Failed:');
        console.error(error);
    }
}

test();
