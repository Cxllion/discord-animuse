const axios = require('axios');
const logger = require('../core/logger');
const minigameService = require('./minigameService');
const supabase = require('../core/supabaseClient');

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
     * Starts a new Wordle session for a user.
     */
    async startNewGame(userId) {
        try {
            // 1. Check if already played today (Finished Game)
            const hasPlayed = await minigameService.hasPlayedToday(userId);
            if (hasPlayed) {
                throw new Error('You have already completed the decoding protocol for this solar cycle. The archives are currently locked until the next synchronization. ♡');
            }

            // 2. Check for Active Session (Resume Progress)
            // A. Check in-memory first
            if (this.activeGames.has(userId)) {
                logger.info(`[Wordle] Resuming in-memory session for user ${userId}.`);
                return this.activeGames.get(userId);
            }

            // B. Check database for persistent session
            const persistentSession = await minigameService.getWordleSession(userId);
            if (persistentSession) {
                logger.info(`[Wordle] Restored persistent session for user ${userId}.`);
                this.activeGames.set(userId, persistentSession);
                return persistentSession;
            }

            // 3. Fetch the Daily Word (New Session)
            const targetWord = await minigameService.getDailyWord();

            const gameState = {
                targetWord: targetWord,
                guesses: [], // Array of { word, result }
                status: 'PLAYING',
                startedAt: Date.now(),
                publicMessageId: null,
                publicChannelId: null
            };

            // 4. Save to Memory and Database
            this.activeGames.set(userId, gameState);
            await minigameService.saveWordleSession(userId, gameState);
            
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
            return false;
        }
    }

    /**
     * Processes a guess for a user's game.
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

        // If game ended, record result and clear session
        if (game.status !== 'PLAYING') {
            const solveData = await minigameService.recordWordleResult(userId, game.guesses, game.status === 'WON');
            game.reward = solveData; 
            this.activeGames.delete(userId); 
            await minigameService.clearWordleSession(userId);
        } else {
            // Otherwise, sync current state to DB
            await minigameService.saveWordleSession(userId, game);
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
    async forceReset(client = null) {
        // 1. Reset the underlying service data (Returns previous word)
        const previousWord = await minigameService.resetDailyWord();

        // 2. Clear sessions memory
        this.activeGames.clear();

        // 3. Broadcast to all Arcade Channels
        if (client) {
            await this.broadcastReset(client, previousWord);
        }

        return true;
    }

    /**
     * Announces the wordle reset to all configured Arcade Protocol channels.
     */
    async broadcastReset(client, previousWord) {
        const { getAllArcadeChannels } = require('../core/database');
        const baseEmbed = require('../generators/baseEmbed');
        
        try {
            const channels = await getAllArcadeChannels();
            if (channels.length === 0) return;

            const embed = baseEmbed(
                '🕹️ Arcade Protocol: Solar Cycle Reset',
                'The daily Wordle archives have been synchronized. A new 5-letter cipher has been generated and is now awaiting decryption. ♡',
                null
            )
            .addFields(
                { name: '🗝️ Previous Key', value: `**${previousWord || 'UNKNOWN'}**`, inline: true },
                { name: '📍 Deployment', value: 'Localized to all Arcade Wings', inline: true }
            )
            .setFooter({ text: 'Use /wordle to initialize your personal decoding terminal.' })
            .setColor(0x4ade80);

            for (const config of channels) {
                try {
                    const guild = await client.guilds.fetch(config.guild_id).catch(() => null);
                    if (!guild) continue;

                    const channel = await guild.channels.fetch(config.arcade_channel_id).catch(() => null);
                    if (!channel) continue;

                    await channel.send({ embeds: [embed] });
                } catch (e) {
                    logger.error(`[Wordle] Failed to broadcast reset to guild ${config.guild_id}:`, e);
                }
            }
        } catch (err) {
            logger.error('[Wordle] Broadcast failed:', err);
        }
    }

    /**
     * Returns a list of recent active and finished games for the social feed.
     */
    async getRecentGames(excludeUserId, limit = 5) {
        const others = [];
        
        // 1. Get Active Games (In-memory)
        for (const [uid, game] of this.activeGames.entries()) {
            if (uid !== excludeUserId) {
                others.push({ 
                    userId: uid, 
                    guesses: game.guesses, 
                    status: game.status,
                    finishedAt: null 
                });
            }
        }

        // 2. Get Finished Games (Database)
        try {
            const today = new Date().toISOString().split('T')[0];
            const { data } = await supabase
                .from('wordle_history')
                .select('user_id, guesses, solved, solved_at')
                .eq('date', today)
                .neq('user_id', excludeUserId)
                .order('solved_at', { ascending: true })
                .limit(limit);
            
            if (data) {
                for (const row of data) {
                    // Avoid duplicates if they are somehow in both
                    if (!others.find(o => o.userId === row.user_id)) {
                        others.push({
                            userId: row.user_id,
                            guesses: Array.isArray(row.guesses) ? row.guesses : [], // History might store count only, but I need result patterns
                            // Wait, wordle_history stores guesses as count? Let me check.
                            status: row.solved ? 'WON' : 'LOST',
                            finishedAt: row.solved_at
                        });
                    }
                }
            }
        } catch (e) {
            logger.error('[Wordle] Failed to fetch finished games for social feed:', e);
        }

        // Sort: Finished first (by time), then Active
        return others.sort((a, b) => {
            if (a.finishedAt && b.finishedAt) return new Date(a.finishedAt) - new Date(b.finishedAt);
            if (a.finishedAt) return -1;
            if (b.finishedAt) return 1;
            return 0;
        }).slice(0, limit);
    }
}

// Singleton instance
module.exports = new WordleService();
