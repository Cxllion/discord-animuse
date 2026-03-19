const { searchMedia } = require('./utils/services/anilistService');

async function test() {
    try {
        console.log('Searching for something obscure...');
        // Try searching for something that might only have native titles
        const results = await searchMedia('あ', 'ANIME'); // "a" in hiragana
        console.log('Results:', results.length);
        results.slice(0, 5).forEach(r => {
            console.log(`ID: ${r.id}, English: ${r.title.english}, Romaji: ${r.title.romaji}`);
        });
    } catch (error) {
        console.error('Test Failed:');
        console.error(error);
    }
}

test();
