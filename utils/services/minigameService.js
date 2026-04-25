const supabase = require('../core/supabaseClient');
const logger = require('../core/logger');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getRandomOfflineWord } = require('../core/wordDictionary');

/**
 * Minigame Service V2: The "Arcade Protocol" Archivist.
 * Centralized management for all minigame points, per-game stats, and global standings.
 */
class MinigameService {
    constructor() {
        this.WORD_API = 'https://random-word-api.herokuapp.com/word?length=5';
        this.cache = new Map(); 
        this.generationPromise = null;
        this.SESSION_FILE = path.join(__dirname, '../../.wordle_sessions.json');
    }

    /**
     * getWordleDate: Returns the current date in GMT+5 format.
     */
    getWordleDate() {
        // GMT+5 is 5 hours ahead of UTC. 
        const offset = 5 * 60 * 60 * 1000;
        const now = new Date();
        const gmtPlus5 = new Date(now.getTime() + offset);
        return gmtPlus5.toISOString().split('T')[0];
    }

    /**
     * awardPoints: The primary entry point for all minigames.
     * Updates global points AND specific game stats in one atomic-like operation.
     * 
     * @param {string} userId - Discord User ID
     * @param {number} amount - Points to award
     * @param {object} options - { gameId, metadata, score }
     */
    async awardPoints(userId, amount, options = {}) {
        if (!supabase) return;
        const { gameId = 'generic', metadata = {}, score = amount } = options;

        try {
            // 1. Update Specific Game Stats (High Score, Total Plays)
            // We use upsert with a unique constraint on (user_id, game_id)
            try {
                // Skip if table is known to be missing in this environment
                const { data: existingStats } = await supabase
                    .from('minigame_stats')
                    .select('high_score, total_plays')
                    .eq('user_id', userId)
                    .eq('game_id', gameId)
                    .maybeSingle();

                const newHighScore = Math.max(existingStats?.high_score || 0, score);
                const newTotalPlays = (existingStats?.total_plays || 0) + 1;

                await supabase
                    .from('minigame_stats')
                    .upsert({
                        user_id: userId,
                        game_id: gameId,
                        high_score: newHighScore,
                        total_plays: newTotalPlays,
                        last_played: new Date().toISOString()
                    }, { onConflict: 'user_id,game_id' });
            } catch (statsErr) {
                // Silently ignore if table is missing 
            }

            // 2. Update Global Standing (total_points)
            const { data: globalStats, error: globalFetchError } = await supabase
                .from('minigame_scores')
                .select('total_points')
                .eq('user_id', userId)
                .maybeSingle();

            if (globalFetchError && globalFetchError.code !== 'PGRST116') {
                logger.error(`[ArcadeProtocol] Global fetch error for ${userId}:`, globalFetchError);
            }

            const newTotalPoints = (globalStats?.total_points || 0) + amount;

            const { error: scoreError } = await supabase
                .from('minigame_scores')
                .upsert({
                    user_id: userId,
                    total_points: newTotalPoints,
                    last_updated: new Date().toISOString()
                }, { onConflict: "user_id" });

            if (scoreError) {
                logger.error(`[ArcadeProtocol] Score update failed: ${scoreError.message}`);
            } else {
                logger.info(`[ArcadeProtocol] Awarded ${amount} pts to ${userId} for [${gameId}]. Global: ${newTotalPoints}`);
            }
            
            return {
                totalPoints: newTotalPoints,
                isNewHighScore: false 
            };

        } catch (error) {
            logger.error(`[ArcadeProtocol] Critical failure awarding points for ${userId}:`, error);
            return { totalPoints: 0, isNewHighScore: false };
        }
    }

    /**
     * Record a Wordle result with the new 10/8/6/5/2 Point System and Streak logic.
     */
    async recordWordleResult(userId, guesses, solved, date = null) {
        if (!supabase) return;
        const today = date || this.getWordleDate();

        // 1. Fetch Streak and Metadata (Resilient Fallback)
        let streak = 1;
        try {
            const { data: stats } = await supabase
                .from('minigame_stats')
                .select('last_played')
                .eq('user_id', userId)
                .eq('game_id', 'wordle')
                .maybeSingle();

            const lastPlayed = stats?.last_played ? stats.last_played.split('T')[0] : null;
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

            if (lastPlayed === yesterday) {
                streak = 2; // Basic binary streak since we can't store incremental streak in metadata
            } else if (lastPlayed !== today) {
                streak = 1;
            }
        } catch (e) {}

        // 2. Base Point Calculation (10/8/6/5/2)
        let basePoints = 2; 
        let solvedOrder = 0;

        if (solved) {
            try {
                // Determine Solve Order based on current winners today
                const { count } = await supabase
                    .from('wordle_history')
                    .select('*', { count: 'exact', head: true })
                    .eq('date', today)
                    .eq('solved', true);
                
                solvedOrder = (count || 0) + 1;
                
                // Base Points based on Solve Order (10, 8, 6, 5)
                if (solvedOrder === 1) basePoints = 10;
                else if (solvedOrder === 2) basePoints = 8;
                else if (solvedOrder === 3) basePoints = 6;
                else basePoints = 5;

                // Precision Bonus (Efficiency based)
                if (guesses.length === 1) basePoints += 2;
                else if (guesses.length === 2) basePoints += 1;
            } catch (e) {
                logger.error('[Wordle] Failed to calculate solve order:', e);
                basePoints = 5; 
            }
        } else {
            // Participation reward for trying but losing
            basePoints = 2;
        }

        // 3. Apply Streak Multiplier (Simplistic fallback)
        const multiplier = streak > 1 ? 1.1 : 1; 
        const totalEarned = Math.round(basePoints * multiplier);
        const streakBonus = totalEarned - basePoints;

        // 4. Fetch Insight
        let definition = "No archives found for this word.";
        try {
            const word = await this.getDailyWord();
            const resp = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
            definition = resp.data[0]?.meanings[0]?.definitions[0]?.definition || definition;
        } catch (e) {}

        // 5. Save History (Mandatory for attempt locking)
        const { error: historyError } = await supabase
            .from('wordle_history')
            .upsert({
                user_id: userId,
                date: today,
                guesses: guesses.length, 
                solved: solved,
                solved_at: new Date().toISOString(),
                metadata: { full_guesses: guesses, solved_order: solvedOrder, awarded_points: totalEarned }
            }, { onConflict: 'user_id,date' });

        if (historyError) {
            throw new Error(`Failed to record archival history: ${historyError.message}`);
        }

        // Award via Arcade Protocol
        const result = await this.awardPoints(userId, totalEarned, {
            gameId: 'wordle',
            score: solved ? (100 / (solvedOrder || 1)) : 0
        });

        return { 
            points: totalEarned, 
            basePoints,
            streakBonus,
            streak,
            totalPoints: result.totalPoints,
            definition
        };
    }

    /**
     * Fetch the top players for the leaderboard (Arcade Standings).
     */
    async getTopPlayers(limit = 10) {
        if (!supabase) return [];
        const { data, error } = await supabase
            .from('minigame_scores')
            .select('*')
            .order('total_points', { ascending: false })
            .limit(limit);

        if (error) return [];
        return data;
    }

    /**
     * Get a user's current rank and global stats.
     */
    async getUserStats(userId) {
        if (!supabase) return null;
        const { data: userStats } = await supabase
            .from('minigame_scores')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

        if (!userStats) return { total_points: 0, rank: '?', games_played: 0 };

        const { count } = await supabase
            .from('minigame_scores')
            .select('*', { count: 'exact', head: true })
            .gt('total_points', userStats.total_points);

        return {
            ...userStats,
            rank: (count || 0) + 1
        };
    }

    /**
     * Wordle Daily Management (Legacy support)
     */
    /**
     * Retrieves the pre-determined daily word.
     * Does NOT generate a new word if missing.
     */
    async getDailyWord() {
        if (!supabase) return 'STARE';
        const today = this.getWordleDate();
        
        // 1. Check Cache/DB first
        if (this.cache.has(today)) return this.cache.get(today);
        const { data } = await supabase.from('wordle_daily').select('word').eq('date', today).maybeSingle();
        if (data) {
            this.cache.set(today, data.word);
            return data.word;
        }

        return null; // Return null if not determined yet
    }

    /**
     * Verifies if the database is synchronized with the current Solar Cycle.
     */
    async isSyncRequired() {
        if (!supabase) return false;
        const today = this.getWordleDate();
        
        // Fetch the absolute latest entry in the database
        const { data } = await supabase.from('wordle_daily').select('date').order('date', { ascending: false }).limit(1).maybeSingle();
        
        if (!data) return true; // No records at all
        return data.date !== today;
    }

    /**
     * Forcefully generates and determines the daily word for the current Solar Cycle.
     */
    async generateDailyWord() {
        if (!supabase) return 'STARE';
        const today = this.getWordleDate();

        // Check if already exists to avoid duplicate generation
        const existing = await this.getDailyWord();
        if (existing) return existing;

        // Concurrency Lock: If already generating, await the existing promise
        if (this.generationPromise) {
            logger.info('[ArcadeProtocol] Word generation already in progress. Awaiting lock...');
            return this.generationPromise;
        }

        this.generationPromise = this._executeWordGeneration(today);
        try {
            const word = await this.generationPromise;
            return word;
        } finally {
            this.generationPromise = null; // Release lock
        }
    }

    async _executeWordGeneration(today) {

        // 1. Fetch Global Used Words Archive from daily history (Schema-Resilient)
        const { data: pastWords } = await supabase.from('wordle_daily').select('word');
        const usedWords = new Set(pastWords?.map(r => r.word) || []);

        // 2. Fetch unique word
        let word = null;
        let attempts = 0;
        
        // Loop for API attempts

        while (!word && attempts < 3) {
            try {
                // Fetch a batch of 10 to reduce API calls
                const response = await axios.get('https://random-word-api.herokuapp.com/word?length=5&number=10', { timeout: 5000 });
                const candidates = response.data.map(w => w.toUpperCase());
                
                for (const candidate of candidates) {
                    if (!usedWords.has(candidate)) {
                        word = candidate;
                        break;
                    }
                }
            } catch (e) {
                logger.warn(`[Wordle] Dictionary API unreachable (${e.message}). Preparing offline backup...`);
            }
            attempts++;
        }

        // 3. Final Fail-Safe: If API is completely down, use our robust offline dictionary
        if (!word) {
            logger.info('[Wordle] All external word sources failed. Deploying Offline Decryption Key...');
            word = getRandomOfflineWord();
        }

        // 3. Save as Today's Word
        await supabase.from('wordle_daily').upsert({ date: today, word: word });
        this.cache.set(today, word);
        
        logger.info(`[ArcadeProtocol] Universal Word determined for ${today}: ${word}`);
        return word;
    }

    async hasPlayedToday(userId) {
        const today = this.getWordleDate();
        const { data } = await supabase.from('wordle_history').select('user_id').eq('user_id', userId).eq('date', today).maybeSingle();
        return !!data;
    }

    /**
     * Resets the Daily Word and clears today's play history.
     * Also DEDUCTS points from all users who played today.
     */
    async resetDailyWord() {
        if (!supabase) return;
        const today = this.getWordleDate();

        // 0. Fetch Previous Word for broadcast
        const { data: currentWordData } = await supabase.from('wordle_daily').select('word').eq('date', today).maybeSingle();
        const previousWord = currentWordData?.word || this.cache.get(today);

        // 1. Clear Local Cache
        this.cache.delete(today);

        // 2. Reverse points awarded today
        try {
            const { data: history } = await supabase.from('wordle_history').select('user_id, metadata').eq('date', today).eq('solved', true);
            if (history && history.length > 0) {
                for (const record of history) {
                    const pts = record.metadata?.awarded_points || 10;
                    await this.deductPoints(record.user_id, pts, { gameId: 'wordle' });
                }
                logger.info(`[ArcadeProtocol] Reversed points for ${history.length} patrons due to daily reset.`);
            }
        } catch (e) {
            logger.error(`[ArcadeProtocol] Failed to reverse points during reset: ${e.message}`);
        }

        // 3. Remove from DB (Daily Word)
        await supabase.from('wordle_daily').delete().eq('date', today);

        // 3. Clear today's sessions and history
        // This allows users to play the fresh word without having "already played" flag
        await supabase.from('wordle_history').delete().eq('date', today);
        const { error } = await supabase.from('wordle_sessions').delete().eq('target_word', previousWord);
        if (error) {
            await this._saveLocalSessions({}); // Flush local cache
        }

        // Clear memory cache of locks
        const wordleService = require('./wordleService');
        if (wordleService && wordleService.processingLocks) {
            wordleService.processingLocks.clear();
        }

        logger.warn(`[ArcadeProtocol] Daily Wordle RESET triggered for ${today}. Key was: ${previousWord || 'UNKNOWN'}. Today's history wiped for fresh attempts.`);
        return previousWord;
    }

    /**
     * Reverses points and increments/decrements stats accordingly.
     */
    async deductPoints(userId, amount, options = {}) {
        if (!supabase) return;
        const { gameId = 'generic' } = options;

        try {
            // 1. Update Game Stats (Resilient Check)
            try {
                const { data: existingStats } = await supabase
                    .from('minigame_stats')
                    .select('total_plays')
                    .eq('user_id', userId)
                    .eq('game_id', gameId)
                    .maybeSingle();

                const newTotalPlays = Math.max(0, (existingStats?.total_plays || 1) - 1);
                
                await supabase
                    .from('minigame_stats')
                    .upsert({
                        user_id: userId,
                        game_id: gameId,
                        total_plays: newTotalPlays,
                        last_played: new Date().toISOString()
                    });
            } catch (statsErr) {} // Silently ignore missing stats table

            // 2. Update Global Standing (Deduct points)
            const { data: globalStats } = await supabase
                .from('minigame_scores')
                .select('total_points')
                .eq('user_id', userId)
                .maybeSingle();

            const newTotalPoints = Math.max(0, (globalStats?.total_points || 0) - amount);

            await supabase
                .from('minigame_scores')
                .upsert({
                    user_id: userId,
                    total_points: newTotalPoints,
                    last_updated: new Date().toISOString()
                });

            return true;
        } catch (error) {
            logger.error(`[ArcadeProtocol] Failed to deduct points for ${userId}:`, error);
        }
    }

    /**
     * Session Persistence Fallback Helpers
     */
    async _getLocalSessions() {
        try {
            if (fs.existsSync(this.SESSION_FILE)) {
                return JSON.parse(await fs.promises.readFile(this.SESSION_FILE, 'utf-8'));
            }
        } catch (e) {
            logger.error('[ArcadeProtocol] Failed to read local sessions:', e);
        }
        return {};
    }

    async _saveLocalSessions(data) {
        try {
            await fs.promises.writeFile(this.SESSION_FILE, JSON.stringify(data), 'utf-8');
        } catch (e) {
            logger.error('[ArcadeProtocol] Failed to write local sessions:', e);
        }
    }

    /**
     * Session Persistence for Wordle (Saves active games across restarts)
     */
    async saveWordleSession(userId, gameState) {
        if (!supabase) return;
        try {
            const { error } = await supabase
                .from('wordle_sessions')
                .upsert({
                    user_id: userId,
                    target_word: gameState.targetWord,
                    guesses: gameState.guesses,
                    status: gameState.status,
                    public_message_id: gameState.publicMessageId,
                    public_channel_id: gameState.publicChannelId,
                    updated_at: new Date().toISOString()
                });
            
            if (error) {
                // Graceful fallback to local filesystem if table is missing
                const localData = await this._getLocalSessions();
                localData[userId] = { ...gameState, updated_at: Date.now() };
                await this._saveLocalSessions(localData);
            }
        } catch (err) {
            logger.error(`[ArcadeProtocol] Failed to save Wordle session for ${userId}:`, err);
        }
    }

    async getWordleSession(userId) {
        if (!supabase) return null;
        try {
            const { data, error } = await supabase
                .from('wordle_sessions')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
            
            if (error || !data) {
                // Graceful fallback to local filesystem
                const localData = await this._getLocalSessions();
                if (localData[userId]) {
                    const session = localData[userId];
                    return {
                        targetWord: session.targetWord || session.target_word,
                        guesses: Array.isArray(session.guesses) ? session.guesses : [],
                        status: session.status,
                        publicMessageId: session.publicMessageId || session.public_message_id,
                        publicChannelId: session.publicChannelId || session.public_channel_id
                    };
                }
            }

            if (data) {
                return {
                    targetWord: data.target_word,
                    guesses: Array.isArray(data.guesses) ? data.guesses : [],
                    status: data.status,
                    publicMessageId: data.public_message_id,
                    publicChannelId: data.public_channel_id,
                    reward: data.reward // In case we store final reward too
                };
            }
        } catch (err) {
            logger.error(`[ArcadeProtocol] Failed to fetch Wordle session for ${userId}:`, err);
        }
        return null;
    }

    async clearWordleSession(userId) {
        if (!supabase) return;
        try {
            const { error } = await supabase.from('wordle_sessions').delete().eq('user_id', userId);
            if (error) {
                const localData = await this._getLocalSessions();
                if (localData[userId]) {
                    delete localData[userId];
                    await this._saveLocalSessions(localData);
                }
            }
        } catch (err) {
            logger.error(`[ArcadeProtocol] Failed to clear Wordle session for ${userId}:`, err);
        }
    }

    async getWordleHistory(userId) {
        if (!supabase) return null;
        const today = this.getWordleDate();
        try {
            const { data } = await supabase
                .from('wordle_history')
                .select('*')
                .eq('user_id', userId)
                .eq('date', today)
                .maybeSingle();
            
            if (data) {
                const { data: wordData } = await supabase.from('wordle_daily').select('word').eq('date', today).maybeSingle();
                return {
                    targetWord: wordData?.word || '?????',
                    guesses: data.metadata?.full_guesses || [],
                    status: data.solved ? 'WON' : 'LOST',
                    reward: data.metadata
                };
            }
        } catch (err) {
            logger.error(`[ArcadeProtocol] Failed to fetch Wordle history for ${userId}:`, err);
        }
        return null;
    }

    async clearAllWordleSessions() {
        if (!supabase) return;
        try {
            // Delete all records (no filter)
            const { error } = await supabase.from('wordle_sessions').delete().neq('user_id', '0'); 
            if (error) {
                await this._saveLocalSessions({});
            }
        } catch (err) {
            logger.error(`[ArcadeProtocol] Failed to clear all Wordle sessions:`, err);
        }
    }
    async resetUserPoints(userId) {
        if (!supabase) return;
        try {
            await supabase.from('minigame_scores').upsert({ user_id: userId, total_points: 0 });
            logger.info(`[ArcadeProtocol] Reset points for user ${userId}.`, 'Arcade');
        } catch (err) {
            logger.error(`[ArcadeProtocol] Failed to reset points for ${userId}:`, err);
        }
    }

    async resetAllPoints() {
        if (!supabase) return;
        try {
            await supabase.from('minigame_scores').update({ total_points: 0 }).neq('user_id', '0');
            logger.warn(`[ArcadeProtocol] GLOBAL ARCADE WIPE COMPLETED.`, 'Arcade');
        } catch (err) {
            logger.error(`[ArcadeProtocol] Failed to reset all points:`, err);
        }
    }

    async getAllScores() {
        if (!supabase) return [];
        const { data } = await supabase.from('minigame_scores').select('*');
        return data || [];
    }

    async bulkImportScores(scores) {
        if (!supabase || !scores.length) return;
        try {
            await supabase.from('minigame_scores').upsert(scores, { onConflict: 'user_id' });
            logger.info(`[ArcadeProtocol] Bulk restored ${scores.length} score records.`, 'Arcade');
        } catch (err) {
            logger.error(`[ArcadeProtocol] Bulk import failed:`, err);
        }
    }
}

module.exports = new MinigameService();
