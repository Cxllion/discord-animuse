const axios = require('axios');
const logger = require('./logger');
const { getOfflineWordData } = require('./wordDictionary');

class WordleEngine {
    constructor() {
        this.DICT_API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
        this.BACKUP_DICT_API = 'https://api.datamuse.com/words?sp=';
        this.validWordCache = new Set();
        this.invalidWordCache = new Set();
    }

    /**
     * Calculates the Wordle tile states.
     * 0 = Gray (Absence), 1 = Yellow (Misplaced), 2 = Green (Correct)
     */
    calculateTileStates(target, guess) {
        const result = new Array(5).fill(0);
        const targetArr = target.toUpperCase().split('');
        const guessArr = guess.toUpperCase().split('');
        const targetCounts = {};

        // Initial count of letters in target
        for (const char of targetArr) {
            targetCounts[char] = (targetCounts[char] || 0) + 1;
        }

        // Identify Green Tiles (Correct position)
        for (let i = 0; i < 5; i++) {
            if (guessArr[i] === targetArr[i]) {
                result[i] = 2;
                targetCounts[guessArr[i]]--;
            }
        }

        // Identify Yellow Tiles (Wrong position)
        for (let i = 0; i < 5; i++) {
            if (result[i] === 2) continue; // Already marked green
            
            const char = guessArr[i];
            if (targetCounts[char] > 0) {
                result[i] = 1;
                targetCounts[char]--;
            }
        }

        return result;
    }

    /**
     * Validates if a guess is a real English word.
     * Uses memory cache to avoid repeat API hits.
     */
    async isValidWord(guess) {
        const word = guess.toUpperCase();
        if (this.validWordCache.has(word)) return true;
        if (this.invalidWordCache.has(word)) return false;
        
        // Fast path: offline dict
        if (getOfflineWordData(word)) {
            this.validWordCache.add(word);
            return true;
        }

        try {
            await axios.get(`${this.DICT_API}${word.toLowerCase()}`, { timeout: 3000 });
            this.validWordCache.add(word);
            return true;
        } catch (error) {
            if (error.response?.status === 404) {
                // Try Datamuse as a backup before marking invalid
                try {
                    const datamuseRes = await axios.get(`${this.BACKUP_DICT_API}${word.toLowerCase()}&max=1`, { timeout: 2000 });
                    if (datamuseRes.data.length > 0 && datamuseRes.data[0].word.toUpperCase() === word) {
                        this.validWordCache.add(word);
                        return true;
                    }
                } catch (backupError) {
                    logger.warn(`[Wordle Engine] Backup Validation API offline.`);
                }
                
                this.invalidWordCache.add(word);
                return false;
            }

            logger.warn(`[Wordle Engine] Dictionary API unreachable. Assuming invalid to prevent crash.`);
            this.invalidWordCache.add(word);
            return false;
        }
    }
}

module.exports = new WordleEngine();
