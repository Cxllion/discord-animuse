const supabase = require('../core/supabaseClient');
const logger = require('../core/logger');
const axios = require('axios');

/**
 * Minigame Service V2: The "Arcade Protocol" Archivist.
 * Centralized management for all minigame points, per-game stats, and global standings.
 */
class MinigameService {
    constructor() {
        this.WORD_API = 'https://random-word-api.herokuapp.com/word?length=5';
        this.cache = new Map(); 
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
                    metadata: metadata,
                    last_played: new Date().toISOString()
                });

            // 2. Update Global Standing (total_points, games_played)
            const { data: globalStats } = await supabase
                .from('minigame_scores')
                .select('total_points, games_played')
                .eq('user_id', userId)
                .maybeSingle();

            const newTotalPoints = (globalStats?.total_points || 0) + amount;
            const newGamesPlayed = (globalStats?.games_played || 0) + 1;

            await supabase
                .from('minigame_scores')
                .upsert({
                    user_id: userId,
                    total_points: newTotalPoints,
                    games_played: newGamesPlayed,
                    last_updated: new Date().toISOString()
                });

            logger.info(`[ArcadeProtocol] Awarded ${amount} pts to ${userId} for [${gameId}]. Global: ${newTotalPoints}`);
            
            return {
                totalPoints: newTotalPoints,
                isNewHighScore: newHighScore > (existingStats?.high_score || 0)
            };

        } catch (error) {
            logger.error(`[ArcadeProtocol] Failed to award points for ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Record a Wordle result with the new 10/8/6/5/2 Point System and Streak logic.
     */
    async recordWordleResult(userId, guesses, solved) {
        if (!supabase) return;
        const today = new Date().toISOString().split('T')[0];

        // 1. Fetch Streak and Metadata
        const { data: stats } = await supabase
            .from('minigame_stats')
            .select('metadata, last_played')
            .eq('user_id', userId)
            .eq('game_id', 'wordle')
            .maybeSingle();

        let streak = stats?.metadata?.streak || 0;
        const lastPlayed = stats?.last_played ? stats.last_played.split('T')[0] : null;
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        // Update Streak: If played yesterday, increment. If missed days, reset.
        if (lastPlayed === yesterday) {
            streak += 1;
        } else if (lastPlayed !== today) {
            streak = 1; // Start fresh today if they haven't played yet
        }

        // 2. Base Point Calculation (10/8/6/5/2)
        let basePoints = 2; // Default for Participation
        let solvedOrder = 0;

        if (solved) {
            // Count how many solved before us today
            const { count } = await supabase
                .from('wordle_history')
                .select('*', { count: 'exact', head: true })
                .eq('date', today)
                .eq('solved', true);
            
            solvedOrder = (count || 0) + 1;

            if (solvedOrder === 1) basePoints = 10;
            else if (solvedOrder === 2) basePoints = 8;
            else if (solvedOrder === 3) basePoints = 6;
            else basePoints = 5;
        }

        // 3. Apply Streak Multiplier (5% per day)
        const multiplier = 1 + (streak * 0.05);
        const totalEarned = Math.round(basePoints * multiplier);
        const streakBonus = totalEarned - basePoints;

        // 4. Fetch Insight (Definition)
        let definition = "No archives found for this word.";
        try {
            const word = await this.getDailyWord();
            const resp = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
            definition = resp.data[0]?.meanings[0]?.definitions[0]?.definition || definition;
        } catch (e) {
            logger.error(`[Wordle] Failed to fetch definition:`, e);
        }

        // 5. Save History & Stats
        await supabase
            .from('wordle_history')
            .upsert({
                user_id: userId,
                date: today,
                guesses: guesses,
                solved: solved,
                solved_at: new Date().toISOString(),
                metadata: { 
                    points_earned: totalEarned, 
                    streak, 
                    solved_order: solvedOrder 
                }
            });

        // Award via Arcade Protocol (Updates global scores and minigame_stats)
        const result = await this.awardPoints(userId, totalEarned, {
            gameId: 'wordle',
            score: solved ? (100 / solvedOrder) : 0,
            metadata: { streak, solvedOrder }
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
    async getDailyWord() {
        const today = new Date().toISOString().split('T')[0];
        if (this.cache.has(today)) return this.cache.get(today);

        const { data } = await supabase.from('wordle_daily').select('word').eq('date', today).maybeSingle();
        if (data) {
            this.cache.set(today, data.word);
            return data.word;
        }

        const response = await axios.get(this.WORD_API);
        const word = response.data[0].toUpperCase();
        await supabase.from('wordle_daily').upsert({ date: today, word: word });
        this.cache.set(today, word);
        return word;
    }

    async hasPlayedToday(userId) {
        const today = new Date().toISOString().split('T')[0];
        const { data } = await supabase.from('wordle_history').select('user_id').eq('user_id', userId).eq('date', today).maybeSingle();
        return !!data;
    }

    /**
     * Resets the Daily Word and clears today's play history.
     * Also DEDUCTS points from all users who played today.
     */
    async resetDailyWord() {
        if (!supabase) return;
        const today = new Date().toISOString().split('T')[0];

        // 1. Fetch Today's History to find who to deduct from
        const { data: history } = await supabase
            .from('wordle_history')
            .select('user_id, metadata, solved')
            .eq('date', today);

        if (history && history.length > 0) {
            for (const record of history) {
                // If they solved it, they got points. Deduct them.
                if (record.solved) {
                    const points = record.metadata?.points_earned || 0;
                    if (points > 0) {
                        await this.deductPoints(record.user_id, points, { gameId: 'wordle' });
                    }
                } else {
                    // Even if they failed, we need to decrement their total_plays
                    await this.deductPoints(record.user_id, 0, { gameId: 'wordle' });
                }
            }
        }

        // 2. Clear Local Cache
        this.cache.delete(today);

        // 3. Remove from DB (Wordle Daily Table) - This triggers a repick on next access
        await supabase.from('wordle_daily').delete().eq('date', today);

        // 4. Clear all active sessions (New word means old sessions are invalid)
        await this.clearAllWordleSessions();

        // 5. Remove from History
        await supabase.from('wordle_history').delete().eq('date', today);

        logger.warn(`[ArcadeProtocol] Daily Wordle RESET triggered for ${today}. All history wiped and points deducted.`);
        return true;
    }

    /**
     * Reverses points and increments/decrements stats accordingly.
     */
    async deductPoints(userId, amount, options = {}) {
        if (!supabase) return;
        const { gameId = 'generic' } = options;

        try {
            // 1. Update Game Stats (Decrement plays, high score check)
            const { data: existingStats } = await supabase
                .from('minigame_stats')
                .select('high_score, total_plays')
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

            // 2. Update Global Standing (Deduct points)
            const { data: globalStats } = await supabase
                .from('minigame_scores')
                .select('total_points, games_played')
                .eq('user_id', userId)
                .maybeSingle();

            const newTotalPoints = Math.max(0, (globalStats?.total_points || 0) - amount);
            const newGamesPlayed = Math.max(0, (globalStats?.games_played || 1) - 1);

            await supabase
                .from('minigame_scores')
                .upsert({
                    user_id: userId,
                    total_points: newTotalPoints,
                    games_played: newGamesPlayed,
                    last_updated: new Date().toISOString()
                });

            return true;
        } catch (error) {
            logger.error(`[ArcadeProtocol] Failed to deduct points for ${userId}:`, error);
        }
    }

    /**
     * Session Persistence for Wordle (Saves active games across restarts)
     */
    async saveWordleSession(userId, gameState) {
        if (!supabase) return;
        try {
            await supabase
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
        } catch (err) {
            logger.error(`[ArcadeProtocol] Failed to save Wordle session for ${userId}:`, err);
        }
    }

    async getWordleSession(userId) {
        if (!supabase) return null;
        try {
            const { data } = await supabase
                .from('wordle_sessions')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
            
            if (data) {
                return {
                    targetWord: data.target_word,
                    guesses: data.guesses || [],
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
            await supabase.from('wordle_sessions').delete().eq('user_id', userId);
        } catch (err) {
            logger.error(`[ArcadeProtocol] Failed to clear Wordle session for ${userId}:`, err);
        }
    }

    async clearAllWordleSessions() {
        if (!supabase) return;
        try {
            // Delete all records (no filter)
            await supabase.from('wordle_sessions').delete().neq('user_id', '0'); 
        } catch (err) {
            logger.error(`[ArcadeProtocol] Failed to clear all Wordle sessions:`, err);
        }
    }
}

module.exports = new MinigameService();
