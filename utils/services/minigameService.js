const supabase = require('../core/supabaseClient');
const logger = require('../core/logger');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getRandomOfflineWord, getOfflineWordData } = require('../core/wordDictionary');
const { isSafeWord } = require('../core/wordleSafety');

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
        this._fileLock = Promise.resolve();
    }

    /**
     * getWordleDate: Returns the current date in GMT+5 format.
     */
    getWordleDate() {
        const offset = 5 * 60 * 60 * 1000;
        const now = new Date();
        const gmtPlus5 = new Date(now.getTime() + offset);
        const dateStr = gmtPlus5.toISOString().split('T')[0];
        
        return process.env.TEST_MODE === 'true' ? `${dateStr}-test` : dateStr;
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
                    .select('high_score, total_plays, wins, metadata')
                    .eq('user_id', userId)
                    .eq('game_id', gameId)
                    .maybeSingle();

                const newHighScore = Math.max(existingStats?.high_score || 0, score);
                const newTotalPlays = (existingStats?.total_plays || 0) + 1;
                const newWins = (existingStats?.wins || 0) + (options.isWin ? 1 : 0);
                const newMetadata = { ...(existingStats?.metadata || {}), ...metadata };

                await supabase
                    .from('minigame_stats')
                    .upsert({
                        user_id: userId,
                        game_id: gameId,
                        high_score: newHighScore,
                        total_plays: newTotalPlays,
                        wins: newWins,
                        metadata: newMetadata,
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
                return {
                    totalPoints: globalStats?.total_points || 0,
                    isNewHighScore: false
                };
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
    async recordWordleResult(userId, guesses, solved, date = null, options = {}) {
        const { isTimeout = false } = options;
        if (!supabase) return;
        const today = date || this.getWordleDate();

        // 1. Fetch Streak and Metadata (Resilient Fallback)
        // Default: 1 for a win, 0 for a loss — used only if DB fetch fails
        let streak = solved ? 1 : 0;
        try {
            const { data: stats } = await supabase
                .from('minigame_stats')
                .select('last_played, metadata')
                .eq('user_id', userId)
                .eq('game_id', 'wordle')
                .maybeSingle();

            // Convert lastPlayed (UTC) to GMT+5 to match 'today' logic
            let lastPlayed = null;
            if (stats?.last_played) {
                const lpDate = new Date(stats.last_played);
                const offset = 5 * 60 * 60 * 1000;
                const lpGmtPlus5 = new Date(lpDate.getTime() + offset);
                lastPlayed = lpGmtPlus5.toISOString().split('T')[0];
            }
            
            // Calculate yesterday strictly relative to the GMT+5 'today' string
            const todayObj = new Date(today); // 'YYYY-MM-DD' parses as midnight UTC
            const yesterdayObj = new Date(todayObj.getTime() - 86400000);
            const yesterday = yesterdayObj.toISOString().split('T')[0];
            const currentStreak = stats?.metadata?.streak || 0;

            if (solved) {
                if (lastPlayed === yesterday) {
                    streak = currentStreak + 1; // Extend streak
                } else if (lastPlayed === today) {
                    streak = currentStreak; // Guard: same-day duplicate call
                } else {
                    streak = 1; // Streak broken or first play
                }
            } else {
                streak = 0; // Streak resets on loss
            }
        } catch (e) {
            logger.error('[Wordle] Failed to fetch streak context:', e);
        }

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
            // V2: Differentiate between a loss (2 pts) and a timeout/stale session (1 pt)
            basePoints = isTimeout ? 1 : 2;
        }

        // 3. Apply Streak Bonus (Tiered: +1 per 2 days of streak, max +5)
        // e.g. streak 2-3 = +1, 4-5 = +2, 6-7 = +3, 8-9 = +4, 10+ = +5
        const streakBonus = solved && streak >= 2 ? Math.min(Math.floor(streak / 2), 5) : 0;
        const totalEarned = basePoints + streakBonus;

        // 4. Fetch Insight
        const target = await this.getDailyWord();
        // 2. Fetch definition (Best Effort: API -> Local Archive -> Placeholder)
        let definition = 'A highly confidential decryption key.';
        try {
            const dictRes = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${target.toLowerCase()}`, { timeout: 3000 });
            definition = dictRes.data[0].meanings[0].definitions[0].definition;
        } catch (e) {
            const offlineData = getOfflineWordData(target);
            if (offlineData) {
                definition = offlineData.definition;
            }
        }

        // Apply narrative wrapper to the definition
        definition = this.getDecryptedIntel(definition);

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
        // Update DB
        const result = await this.awardPoints(userId, totalEarned, { 
            gameId: 'wordle', 
            isWin: solved, 
            score: solved ? (100 / (solvedOrder || 1)) : 0,
            metadata: { streak: streak } 
        });

        return {
            points: totalEarned,
            streakBonus,
            streak,
            totalPoints: result?.totalPoints || 0,
            definition: definition
        };
    }

    /**
     * Narrative Wrapper: Transforms raw dictionary definitions into thematic "Decrypted Intel".
     * @param {string} definition 
     * @returns {string}
     */
    getDecryptedIntel(definition) {
        if (!definition) return 'A highly confidential decryption key.';
        
        const prefixes = [
            'FRAGMENT DECRYPTED: ',
            'INTEL RECOVERED: ',
            'ARCHIVE INSIGHT: ',
            'PROTOCOL DECODED: ',
            'DATA FRAGMENT: '
        ];
        
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        
        // Ensure the definition starts with lowercase if it's following a colon
        let cleanDef = definition.trim();
        if (cleanDef.endsWith('.')) cleanDef = cleanDef.slice(0, -1);
        
        return `${prefix}${cleanDef}. ♡`;
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
            // Unbounded Cache Fix: Keep size small
            if (this.cache.size > 5) {
                const firstKey = this.cache.keys().next().value;
                this.cache.delete(firstKey);
            }
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
                // Fetch 5-letter words from Datamuse (Common English words)
                const response = await axios.get('https://api.datamuse.com/words?sp=?????&max=1000', { timeout: 5000 });
                
                // Filter for valid 5-letter English words
                const validCandidates = response.data
                    .filter(w => /^[a-zA-Z]{5}$/.test(w.word))
                    .map(w => w.word.toUpperCase());
                
                // Prioritize the top 1000 but shuffle them to avoid predictability
                // Shuffle array
                for (let i = validCandidates.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [validCandidates[i], validCandidates[j]] = [validCandidates[j], validCandidates[i]];
                }

                // Check candidates one by one until we find a real, unused, and SAFE dictionary word
                for (const candidate of validCandidates) {
                    if (usedWords.has(candidate)) continue;
                    if (!isSafeWord(candidate)) {
                        logger.warn(`[Wordle] Safety Filter intercepted sensitive candidate: ${candidate}. Searching for alternative...`);
                        continue;
                    }

                    // VERIFICATION: Check against Dictionary API to ensure it's a "real" common word
                    try {
                        const dictCheck = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${candidate.toLowerCase()}`, { timeout: 2000 });
                        if (dictCheck.data && dictCheck.data[0]) {
                            word = candidate;
                            logger.info(`[Wordle] Determined actual word for today: ${word}`, 'Arcade');
                            break;
                        }
                    } catch (err) {
                        // If 404 or error, it might not be a "common enough" dictionary word, skip to next
                        continue;
                    }
                }
            } catch (e) {
                logger.warn(`[Wordle] Datamuse API unreachable (${e.message}). Retrying...`);
            }
            attempts++;
        }

        // 3. Final Fail-Safe: If API is completely down, use our robust offline dictionary
        if (!word) {
            logger.info('[Wordle] All external word sources failed. Deploying Offline Decryption Key...');
            
            let offlineAttempts = 0;
            while (!word && offlineAttempts < 50) {
                const backup = getRandomOfflineWord();
                if (!usedWords.has(backup.word)) {
                    word = backup.word;
                }
                offlineAttempts++;
            }
            
            if (!word) {
                word = getRandomOfflineWord().word; // Absolute last resort
            }
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
        this._fileLock = this._fileLock.then(async () => {
            try {
                await fs.promises.writeFile(this.SESSION_FILE, JSON.stringify(data), 'utf-8');
            } catch (e) {
                logger.error('[ArcadeProtocol] Failed to write local sessions:', e);
            }
        }).catch(() => {});
        return this._fileLock;
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
                const target = wordData?.word || '?????';
                
                // Parse strings into objects expected by the generator
                const rawGuesses = data.metadata?.full_guesses || [];
                const wordleEngine = require('../core/wordleEngine');
                const parsedGuesses = rawGuesses.map(guessItem => {
                    if (typeof guessItem === 'string') {
                        return {
                            word: guessItem,
                            result: wordleEngine.calculateTileStates(target, guessItem)
                        };
                    }
                    return guessItem; // Already formatted as { word, result }
                });

                return {
                    targetWord: target,
                    guesses: parsedGuesses,
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

    /**
     * Record a Connect4 result with the 3 points per win (max 3 times per opponent per day) system.
     * Bonus: +5 points for precision wins (<= 10 moves).
     */
    async recordConnect4Result(p1Id, p2Id, winnerId, moves = 0, options = {}) {
        if (!supabase) return { pointsAwarded: 0 };
        const today = this.getWordleDate();
        
        let pointsAwarded = 0;
        
        // Anti-Farm Check: Do not award points for self-play or early abandons (Turn 1 or 2)
        const isSelfPlay = p1Id === p2Id;
        const isEarlyAbandon = options.isEarly || (moves > 0 && moves < 3);
        
        // Only award points if there is a winner (not a draw), it's not a self-play game, and not an early abandon
        if (winnerId && !isSelfPlay && !isEarlyAbandon) {
            const loserId = winnerId === p1Id ? p2Id : p1Id;

            try {
                // Check how many times winnerId has won against loserId today
                const { count } = await supabase
                    .from('connect4_history')
                    .select('*', { count: 'exact', head: true })
                    .eq('winner_id', winnerId)
                    .eq('date', today)
                    .or(`player1_id.eq.${loserId},player2_id.eq.${loserId}`);

                if (count < 3) {
                    // Standard points for natural win or late forfeit
                    pointsAwarded = moves <= 10 ? 5 : 3;
                    await this.awardPoints(winnerId, pointsAwarded, { gameId: 'connect4', isWin: true });
                } else {
                    // Still record the game played stat
                    await this.awardPoints(winnerId, 0, { gameId: 'connect4', isWin: true });
                }
                // Always record participation for loser
                await this.awardPoints(loserId, 0, { gameId: 'connect4' });
            } catch (err) {
                // If table doesn't exist yet, we still record but skip the limit check
                logger.error(`[ArcadeProtocol] Failed to check Connect4 limits: ${err.message}`);
            }
        } else if (winnerId && (isSelfPlay || isEarlyAbandon)) {
            // Record game but with 0 points for winner/loser due to farm protection or early abandon
            await this.awardPoints(winnerId, 0, { gameId: 'connect4', isWin: true });
            const loserId = winnerId === p1Id ? p2Id : p1Id;
            await this.awardPoints(loserId, 0, { gameId: 'connect4' });
        } else {
            // It's a draw, record participation for both
            await this.awardPoints(p1Id, 0, { gameId: 'connect4' });
            await this.awardPoints(p2Id, 0, { gameId: 'connect4' });
        }

        // Save history (Fire and forget or caught)
        try {
            await supabase
                .from('connect4_history')
                .insert({
                    player1_id: p1Id,
                    player2_id: p2Id,
                    winner_id: winnerId,
                    date: today,
                    points_awarded: pointsAwarded
                });
        } catch (err) {
            logger.error(`[ArcadeProtocol] Failed to save Connect4 history: ${err.message}`);
        }

        // Fetch actual total points for receipt
        const { data: scoreData } = await supabase
            .from('minigame_scores')
            .select('total_points')
            .eq('user_id', winnerId || p1Id)
            .maybeSingle();

        return { 
            pointsAwarded, 
            totalPoints: scoreData?.total_points || 0 
        };
    }
    /**
     * getArcadeStats: Unified fetch for the Arcade Passport.
     */
    async getArcadeStats(userId) {
        if (!supabase) return null;
        try {
            // 1. Global Points & Rank
            const { data: global } = await supabase
                .from('minigame_scores')
                .select('total_points')
                .eq('user_id', userId)
                .maybeSingle();

            const { count: rank } = await supabase
                .from('minigame_scores')
                .select('*', { count: 'exact', head: true })
                .gt('total_points', global?.total_points || 0);

            // 2. Wordle Stats
            const { data: wordle } = await supabase
                .from('minigame_stats')
                .select('high_score, total_plays, wins, metadata, last_played')
                .eq('user_id', userId)
                .eq('game_id', 'wordle')
                .maybeSingle();

            // 3. Connect4 Stats
            const { data: connect4 } = await supabase
                .from('minigame_stats')
                .select('high_score, total_plays, wins, metadata, last_played')
                .eq('user_id', userId)
                .eq('game_id', 'connect4')
                .maybeSingle();

            
            const { count: c4Total } = await supabase
                .from('connect4_history')
                .select('*', { count: 'exact', head: true })
                .or(`player1_id.eq.${userId},player2_id.eq.${userId}`);

            return {
                points: global?.total_points || 0,
                rank: rank + 1,
                wordle: {
                    streak: wordle?.metadata?.streak || 0,
                    totalSolved: wordle?.wins || 0,
                    totalPlays: wordle?.total_plays || 0,
                    lastPlayed: wordle?.last_played
                },
                connect4: {
                    wins: connect4?.wins || 0,
                    total: connect4?.total_plays || 0,
                    lastPlayed: connect4?.last_played
                }
            };
        } catch (err) {
            logger.error(`[ArcadeProtocol] Failed to fetch arcade stats for ${userId}:`, err);
            return null;
        }
    }
}

module.exports = new MinigameService();
