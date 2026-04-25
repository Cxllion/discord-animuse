const axios = require('axios');
const logger = require('../core/logger');
const minigameService = require('./minigameService');
const { getOfflineWordData } = require('../core/wordDictionary');
const supabase = require('../core/supabaseClient');

/**
 * Wordle Service: Handles the logic and state for the Daily Wordle minigame.
 */
class WordleService {
    constructor() {
        // Concurrency lock for user submissions (avoids race conditions)
        this.processingLocks = new Set();
        
        this.DICT_API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
        this.BACKUP_DICT_API = 'https://api.datamuse.com/words?sp='; // Datamuse is extremely reliable

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

            // 2. Check for Active Session (Resume Progress) from database directly
            const persistentSession = await minigameService.getWordleSession(userId);
            if (persistentSession) {
                logger.info(`[Wordle] Restored persistent session for user ${userId}.`);
                return persistentSession;
            }

            // 3. Get Target Word (Universal Determined Word)
            let word = await minigameService.getDailyWord();
            
            // If word is missing (Scheduler missed or first run), generate it once.
            if (!word) {
                logger.warn(`[Wordle] Target word missing for today. Triggering on-demand synchronization.`);
                word = await minigameService.generateDailyWord();
            }

            const today = minigameService.getWordleDate();
            const gameState = {
                targetWord: word,
                date: today, // NEW: Lock session to the generation cycle
                guesses: [], // Array of { word, result }
                status: 'PLAYING',
                startedAt: Date.now(),
                publicMessageId: null,
                publicChannelId: null
            };

            // 4. Save to Database
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
            
            // BACKUP API: Try Datamuse for verification (no definition, but verifies existence)
            try {
                const datamuseRes = await axios.get(`${this.BACKUP_DICT_API}${guess.toLowerCase()}&max=1`, { timeout: 3000 });
                if (datamuseRes.data.length > 0 && datamuseRes.data[0].word.toUpperCase() === guess.toUpperCase()) {
                    return true;
                }
            } catch (backupError) {
                logger.warn(`[Wordle] Backup Validation API offline (${backupError.message})`);
            }

            // FINAL FALLBACK: Check our curated offline dictionary
            logger.warn(`[Wordle] External APIs offline. Checking offline archives for: ${guess}`);
            if (getOfflineWordData(guess)) {
                return true;
            }

            throw new Error('The Dictionary API is currently unreachable and the word is not in our offline archives. Please try again later.');
        }
    }

    /**
     * Processes a guess for a user's game.
     */
    async submitGuess(userId, guess) {
        if (this.processingLocks.has(userId)) return null; // Debounce double-submissions at the memory level
        this.processingLocks.add(userId);
        
        try {
            const game = await minigameService.getWordleSession(userId);
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
                const solveData = await minigameService.recordWordleResult(userId, game.guesses, game.status === 'WON', game.date);
                game.reward = solveData; 
                await minigameService.clearWordleSession(userId);
            } else {
                // Otherwise, sync current state to DB
                await minigameService.saveWordleSession(userId, game);
            }

            return game;
        } finally {
            this.processingLocks.delete(userId);
        }
    }

    async forfeitGame(userId) {
        if (this.processingLocks.has(userId)) return null;
        this.processingLocks.add(userId);
        
        try {
            const game = await minigameService.getWordleSession(userId);
            if (!game || game.status !== 'PLAYING') return null;

            game.status = 'LOST';
            const solveData = await minigameService.recordWordleResult(userId, game.guesses, false, game.date);
            game.reward = solveData;
            
            await minigameService.clearWordleSession(userId);
            
            return game;
        } finally {
            this.processingLocks.delete(userId);
        }
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
     * Retrieves a game state, restoring from database.
     */
    async getGame(userId) {
        // Always check Database directly
        const game = await minigameService.getWordleSession(userId);
        if (game) {
            const currentDaily = await minigameService.getDailyWord();
            if (game.targetWord !== currentDaily) {
                logger.warn(`[Wordle] Clearing stale database session for ${userId} (Word Mismatch).`);
                await minigameService.clearWordleSession(userId);
                return null;
            }
            
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

        // 3. Clear locks memory
        this.processingLocks.clear();

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
        const targetWord = await minigameService.getDailyWord();

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
                    
                    const rawGuesses = row.metadata?.full_guesses || [];
                    const parsedGuesses = rawGuesses.map(word => ({
                        word,
                        result: this.calculateTileStates(targetWord, word)
                    }));

                    games.push({
                        userId: row.user_id,
                        guesses: parsedGuesses, // FIXED: Parsed with calculateTileStates
                        status: 'WON',
                        finishedAt: row.solved_at,
                        solvedOrder: row.metadata?.solved_order
                    });
                });
            }
        } catch (e) {
            logger.error('[Wordle] Failed to fetch winners:', e);
        }

        // 2. Fill remaining slots with Active Games (Database)
        if (games.length < limit) {
            try {
                // Fetch active sessions from DB
                const { data: activeSessions } = await supabase
                    .from('wordle_sessions')
                    .select('user_id, guesses, status')
                    .neq('user_id', excludeUserId)
                    .order('updated_at', { ascending: false })
                    .limit(limit);

                if (activeSessions) {
                    activeSessions.forEach(session => {
                        if (games.some(g => g.userId === session.user_id)) return;
                        games.push({
                            userId: session.user_id,
                            guesses: session.guesses || [],
                            status: session.status,
                            finishedAt: null,
                            solvedOrder: null
                        });
                    });
                }
            } catch (e) {
                logger.error('[Wordle] Failed to fetch active sessions for social feed:', e);
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
                            
                            const rawGuesses = row.metadata?.full_guesses || [];
                            const parsedGuesses = rawGuesses.map(word => ({
                                word,
                                result: this.calculateTileStates(targetWord, word)
                            }));

                            games.push({
                                userId: row.user_id,
                                guesses: parsedGuesses, 
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
