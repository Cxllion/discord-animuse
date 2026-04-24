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
     * Record a Wordle result using the new Arcade Protocol.
     */
    async recordWordleResult(userId, guesses, solved) {
        if (!supabase) return;
        const today = new Date().toISOString().split('T')[0];

        // 1. Save Raw History (Wordle Specific)
        await supabase
            .from('wordle_history')
            .upsert({
                user_id: userId,
                date: today,
                guesses: guesses,
                solved: solved,
                solved_at: new Date().toISOString()
            });

        if (!solved) return { points: 0, firstBlood: false };

        // 2. Calculate Points
        let points = 100; // Base Solve
        const efficiencyBonus = (7 - guesses) * 20;
        points += efficiencyBonus;

        // Check for First Blood
        const { count } = await supabase
            .from('wordle_history')
            .select('*', { count: 'exact', head: true })
            .eq('date', today)
            .eq('solved', true);

        const isFirstBlood = count === 1;
        if (isFirstBlood) points += 50;

        // 3. Award via Arcade Protocol
        const result = await this.awardPoints(userId, points, {
            gameId: 'wordle',
            score: 1000 / guesses, // Arbitrary Wordle "Score" for stats
            metadata: { guesses, firstBlood: isFirstBlood }
        });

        return { 
            points, 
            firstBlood: isFirstBlood,
            totalPoints: result.totalPoints
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
     * RESTRICTED: Should only be called by authorized administrative triggers.
     */
    async resetDailyWord() {
        if (!supabase) return;
        const today = new Date().toISOString().split('T')[0];

        // 1. Clear Local Cache
        this.cache.delete(today);

        // 2. Remove from DB (Wordle Daily Table)
        await supabase.from('wordle_daily').delete().eq('date', today);

        // 3. Remove from History (Allow everyone to play the new word)
        await supabase.from('wordle_history').delete().eq('date', today);

        logger.warn(`[ArcadeProtocol] Daily Wordle RESET triggered for ${today}. All history wiped.`);
        return true;
    }
}

module.exports = new MinigameService();
