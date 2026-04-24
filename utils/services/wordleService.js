const axios = require('axios');
const logger = require('../core/logger');
const minigameService = require('./minigameService');

/**
 * Wordle Service: Handles the logic and state for the Daily Wordle minigame.
 */
class WordleService {
    constructor() {
        // In-memory storage for active sessions (current day only)
        // Key: userId, Value: { guesses, status, startedAt }
        this.activeGames = new Map();
        
        // API Endpoints
        this.DICT_API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
    }

    /**
     * Starts a new Wordle session for a user using the Daily Word.
     */
    async startNewGame(userId) {
        try {
            // 1. Check if already played today
            const hasPlayed = await minigameService.hasPlayedToday(userId);
            if (hasPlayed) {
                throw new Error('You have already completed the decoding protocol for this solar cycle. Return after the next GMT reset.');
            }

            // 2. Fetch the Daily Word
            const targetWord = await minigameService.getDailyWord();

            const gameState = {
                targetWord: targetWord,
                guesses: [], // Array of { word, result }
                status: 'PLAYING',
                startedAt: Date.now()
            };

            this.activeGames.set(userId, gameState);
            return gameState;
        } catch (error) {
            if (error.message.includes('solar cycle')) throw error;
            logger.error(`[Wordle] Failed to start game for ${userId}:`, error);
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
    async submitGuess(userId, guess) {
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

        // If game ended, record result and award points
        if (game.status !== 'PLAYING') {
            const solveData = await minigameService.recordWordleResult(userId, game.guesses.length, game.status === 'WON');
            game.reward = solveData; // { points, firstBlood }
            this.activeGames.delete(userId); // Clear active session
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

    /**
     * Forcefully resets the Daily Wordle session.
     */
    async forceReset() {
        // 1. Reset the underlying service data
        await minigameService.resetDailyWord();

        // 2. Clear all active in-memory games
        this.activeGames.clear();

        return true;
    }
}

// Singleton instance
module.exports = new WordleService();
