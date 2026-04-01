const axios = require('axios');
const logger = require('../core/logger');

/**
 * Wordle Service: Handles the logic and state for the Wordle minigame.
 */
class WordleService {
    constructor() {
        // In-memory storage for active games
        // Key: userId, Value: { targetWord, guesses, status, startedAt }
        this.activeGames = new Map();
        
        // API Endpoints
        this.WORD_API = 'https://random-word-api.herokuapp.com/word?length=5';
        this.DICT_API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
    }

    /**
     * Starts a new Wordle session for a user.
     */
    async startNewGame(userId) {
        try {
            const response = await axios.get(this.WORD_API);
            const word = response.data[0].toUpperCase();
            
            // Log target word for debugging (only in dev/test)
            if (process.env.TEST_MODE === 'true') {
                logger.debug(`[Wordle] New game for ${userId}. Target: ${word}`);
            }

            const gameState = {
                targetWord: word,
                guesses: [], // Array of { word, result }
                status: 'PLAYING',
                startedAt: Date.now()
            };

            this.activeGames.set(userId, gameState);
            return gameState;
        } catch (error) {
            logger.error(`[Wordle] Failed to fetch word for ${userId}:`, error);
            throw new Error('The Wordle Archives are currently unreachable. Please try again later.');
        }
    }

    /**
     * Validates if a guess is a real English word.
     */
    async isValidWord(guess) {
        try {
            await axios.get(`${this.DICT_API}${guess.toLowerCase()}`);
            return true;
        } catch (error) {
            // 404 means it's not a word
            return false;
        }
    }

    /**
     * Processes a guess and updates the game state.
     */
    submitGuess(userId, guess) {
        const game = this.activeGames.get(userId);
        if (!game || game.status !== 'PLAYING') return null;

        const target = game.targetWord;
        const result = this.calculateTileStates(target, guess.toUpperCase());
        
        game.guesses.push({ word: guess.toUpperCase(), result });

        if (guess.toUpperCase() === target) {
            game.status = 'WON';
        } else if (game.guesses.length >= 6) {
            game.status = 'LOST';
        }

        return game;
    }

    /**
     * Internal logic for determining tile colors.
     * 0 = Gray (Absence), 1 = Yellow (Misplaced), 2 = Green (Correct)
     */
    calculateTileStates(target, guess) {
        const result = new Array(5).fill(0);
        const targetArr = target.split('');
        const guessArr = guess.split('');
        const targetCounts = {};

        // 1. Initial count of letters in target
        for (const char of targetArr) {
            targetCounts[char] = (targetCounts[char] || 0) + 1;
        }

        // 2. Identify Green Tiles (Correct position)
        for (let i = 0; i < 5; i++) {
            if (guessArr[i] === targetArr[i]) {
                result[i] = 2;
                targetCounts[guessArr[i]]--;
            }
        }

        // 3. Identify Yellow Tiles (Wrong position)
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

    getGame(userId) {
        return this.activeGames.get(userId);
    }

    endGame(userId) {
        this.activeGames.delete(userId);
    }
}

// Singleton instance
module.exports = new WordleService();
