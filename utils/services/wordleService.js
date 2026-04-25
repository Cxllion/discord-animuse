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

        // Social Feed Cache (30s)
        this.socialCache = { data: [], lastUpdate: 0 };
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

            // 3. Get Target Word (Universal Determined Word)
            let word = await minigameService.getDailyWord();
            
            // If word is missing (Scheduler missed or first run), generate it once.
            if (!word) {
                logger.warn(`[Wordle] Target word missing for today. Triggering on-demand synchronization.`);
                word = await minigameService.generateDailyWord();
            }

            const gameState = {
                targetWord: word,
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
            await axios.get(`${this.DICT_API}${guess.toLowerCase()}`, { timeout: 4000 });
            return true;
        } catch (error) {
            // 404 means the word doesn't exist.
            if (error.response?.status === 404) return false;
            
            // Any other error (503, Timeout, etc) means the API is down.
            // We bypass validation to keep the game playable during outages.
            logger.warn(`[Wordle] Validation API offline (${error.message}). Bypassing for: ${guess}`);
            return true;
        }
    }

    /**
     * Processes a guess for a user's game.
     */
    async submitGuess(userId, guess) {
        const game = this.activeGames.get(userId);
        if (!game || game.status !== 'PLAYING') return null;
        if (game.isProcessing) return null; // Debounce double-submissions

        game.isProcessing = true;
        try {
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
        } finally {
            if (game) game.isProcessing = false;
        }
    }

    async forfeitGame(userId) {
        const game = this.activeGames.get(userId);
        if (!game || game.status !== 'PLAYING') return null;

        game.status = 'LOST';
        const solveData = await minigameService.recordWordleResult(userId, game.guesses, false);
        game.reward = solveData;
        
        this.activeGames.delete(userId);
        await minigameService.clearWordleSession(userId);
        
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

    /**
     * Retrieves a game state, attempting to restore from database if memory is cold.
     */
    async getGame(userId) {
        // 1. Check Memory
        let game = this.activeGames.get(userId);
        if (game) {
            // Validate word consistency (new day check)
            const currentDaily = await minigameService.getDailyWord();
            if (game.targetWord !== currentDaily) {
                logger.warn(`[Wordle] Clearing stale memory session for ${userId} (Word Mismatch).`);
                this.activeGames.delete(userId);
                return null;
            }
            return game;
        }

        // 2. Check Database
        game = await minigameService.getWordleSession(userId);
        if (game) {
            const currentDaily = await minigameService.getDailyWord();
            if (game.targetWord !== currentDaily) {
                logger.warn(`[Wordle] Clearing stale database session for ${userId} (Word Mismatch).`);
                await minigameService.clearWordleSession(userId);
                return null;
            }
            
            logger.info(`[Wordle] Restored session from DB for ${userId}.`);
            this.activeGames.set(userId, game);
            return game;
        }

        return null;
    }

    /**
     * Forcefully resets the Daily Wordle session.
     */
    async forceReset(client = null) {
        // 1. Reset the underlying service data (Returns previous word)
        const previousWord = await minigameService.resetDailyWord();

        // 2. Immediately Determine the NEW word for the cycle
        await minigameService.generateDailyWord();

        // 3. Clear sessions memory
        this.activeGames.clear();

        // 4. Broadcast to all Arcade Channels (Show previous word)
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
            const { getServerRoles } = require('./roleService');
            const channels = await getAllArcadeChannels();
            if (channels.length === 0) return;

            for (const config of channels) {
                try {
                    const guild = await client.guilds.fetch(config.guild_id).catch(() => null);
                    if (!guild) continue;

                    const channel = await guild.channels.fetch(config.arcade_channel_id).catch(() => null);
                    if (!channel) continue;

                    // 1. Check for Wordle Role
                    const serverRoles = await getServerRoles(config.guild_id);
                    const wordleRoleData = serverRoles.find(r => r.category?.name === 'Wordle');
                    const pingContent = wordleRoleData ? `<@&${wordleRoleData.role_id}>` : '';

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

                    await channel.send({ content: pingContent, embeds: [embed] });
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
        const now = Date.now();
        if (now - this.socialCache.lastUpdate < 30000) {
            return this.socialCache.data.filter(g => g.userId !== excludeUserId).slice(0, limit);
        }

        const games = [];
        const today = minigameService.getWordleDate();

        // 1. Get Top Solvers for Today (Wall of Fame)
        try {
            const { data: winners } = await supabase
                .from('wordle_history')
                .select('user_id, guesses, solved, solved_at, metadata')
                .eq('date', today)
                .eq('solved', true)
                .order('solved_at', { ascending: true })
                .limit(limit);

            if (winners) {
                winners.forEach(row => {
                    if (row.user_id === excludeUserId) return;
                    games.push({
                        userId: row.user_id,
                        guesses: row.guesses || [],
                        status: 'WON',
                        finishedAt: row.solved_at,
                        solvedOrder: row.metadata?.solved_order
                    });
                });
            }
        } catch (e) {
            logger.error('[Wordle] Failed to fetch winners:', e);
        }

        // 2. Fill remaining slots with Active Games (Memory)
        if (games.length < limit) {
            for (const [userId, game] of this.activeGames.entries()) {
                if (userId === excludeUserId || games.some(g => g.userId === userId)) continue;
                games.push({
                    userId,
                    guesses: game.guesses,
                    status: game.status,
                    finishedAt: null,
                    solvedOrder: null
                });
                if (games.length >= limit) break;
            }
        }

        // 3. Last Resort: Recently Finished (Losses)
        if (games.length < limit) {
            try {
                const { data: others } = await supabase
                    .from('wordle_history')
                    .select('user_id, guesses, solved, solved_at, metadata')
                    .eq('date', today)
                    .eq('solved', false)
                    .neq('user_id', excludeUserId)
                    .limit(limit - games.length);

                    if (others) {
                        others.forEach(row => {
                            if (games.some(g => g.userId === row.user_id)) return;
                            games.push({
                                userId: row.user_id,
                                guesses: row.guesses || [],
                                status: 'LOST',
                                finishedAt: row.solved_at,
                                solvedOrder: null
                            });
                        });
                    }
                } catch (e) {
                    logger.error('[Wordle] Failed to fetch losses:', e);
                }
            }

            const result = games.slice(0, limit);
            this.socialCache = { data: result, lastUpdate: now };
            return result.filter(g => g.userId !== excludeUserId).slice(0, limit);
        }
    }

// Singleton instance
module.exports = new WordleService();
