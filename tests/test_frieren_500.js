const { searchMedia } = require('../utils/services/anilistService');

async function test() {
    console.log('Testing "frieren" search...');
    try {
        const results = await searchMedia('frieren', 'ANIME');
        console.log('Success! Results:', results.length);
    } catch (e) {
        console.error('Failed as expected with:', e.message);
        if (e.response) {
            console.error('Data:', JSON.stringify(e.response.data, null, 2));
        }
    }
}

test();
