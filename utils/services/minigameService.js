const supabase = require('../core/supabaseClient');
const logger = require('../core/logger');
const axios = require('axios');

/**
 * Minigame Service: Centralized management for minigame points and global daily wordle.
 */
class MinigameService {
    constructor() {
        this.WORD_API = 'https://random-word-api.herokuapp.com/word?length=5';
        this.cache = new Map(); // In-memory cache for daily word to reduce DB hits
    }

    /**
     * Fetch the global word of the day.
     * Resets at 00:00 GMT.
     */
    async getDailyWord() {
        if (!supabase) throw new Error('Archives are currently disconnected (No DB).');

        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        
        // Check local cache first
        if (this.cache.has(today)) {
            return this.cache.get(today);
        }

        try {
            // Check Database
            const { data, error } = await supabase
                .from('wordle_daily')
                .select('word')
                .eq('date', today)
                .single();

            if (data) {
                this.cache.set(today, data.word);
                return data.word;
            }

            // Not found in DB, fetch from API
            const response = await axios.get(this.WORD_API);
            const word = response.data[0].toUpperCase();

            // Store in DB for everyone else
            const { error: insertError } = await supabase
                .from('wordle_daily')
                .upsert({ date: today, word: word });

            if (insertError) {
                logger.error(`[MinigameService] Failed to save daily word:`, insertError);
            }

            this.cache.set(today, word);
            return word;

        } catch (error) {
            logger.error(`[MinigameService] Error fetching daily word:`, error);
            // Fallback to a hardcoded word list if API/DB fails? 
            // For now, let it throw so the user knows there's a protocol failure.
            throw new Error('The Daily Archive is currently unreachable.');
        }
    }

    /**
     * Check if a user has already played today.
     */
    async hasPlayedToday(userId) {
        if (!supabase) return false;
        const today = new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('wordle_history')
            .select('user_id')
            .eq('user_id', userId)
            .eq('date', today)
            .maybeSingle();

        return !!data;
    }

    /**
     * Record a Wordle result and award points.
     */
    async recordWordleResult(userId, guesses, solved) {
        if (!supabase) return;
        const today = new Date().toISOString().split('T')[0];

        // 1. Save History
        const { error: histError } = await supabase
            .from('wordle_history')
            .upsert({
                user_id: userId,
                date: today,
                guesses: guesses,
                solved: solved,
                solved_at: new Date().toISOString()
            });

        if (histError) {
            logger.error(`[MinigameService] Failed to record history for ${userId}:`, histError);
        }

        if (!solved) return { points: 0, firstBlood: false };

        // 2. Calculate Points
        let points = 100; // Base Solve
        const efficiencyBonus = (7 - guesses) * 20;
        points += efficiencyBonus;

        // 3. Check for First Blood
        const { count, error: countError } = await supabase
            .from('wordle_history')
            .select('*', { count: 'exact', head: true })
            .eq('date', today)
            .eq('solved', true);

        const isFirstBlood = !countError && count === 1; // Ours is the only solve recorded (since we just inserted)
        if (isFirstBlood) points += 50;

        // 4. Update Total Points
        await this.addPoints(userId, points);

        return { points, firstBlood: isFirstBlood };
    }

    /**
     * Generic point addition.
     */
    async addPoints(userId, amount) {
        if (!supabase) return;

        // Use RPC or Upsert logic for incrementing
        // Since Supabase doesn't have a simple increment in upsert without RPC, 
        // we'll fetch then update, or use a custom query if available.
        // Best practice is RPC, but we'll try a single-row fetch/update for now as a fallback.
        
        const { data: current } = await supabase
            .from('minigame_scores')
            .select('total_points')
            .eq('user_id', userId)
            .maybeSingle();

        const total = (current?.total_points || 0) + amount;

        await supabase
            .from('minigame_scores')
            .upsert({ 
                user_id: userId, 
                total_points: total, 
                last_updated: new Date().toISOString() 
            });
    }

    /**
     * Fetch the top players for the leaderboard.
     */
    async getTopPlayers(limit = 10) {
        if (!supabase) return [];

        const { data, error } = await supabase
            .from('minigame_scores')
            .select('*')
            .order('total_points', { ascending: false })
            .limit(limit);

        if (error) {
            // Handle missing table gracefully - it likely means no one has played yet or migration hasn't run
            if (error.code === '42P01') {
                logger.warn('[MinigameService] Leaderboard table (minigame_scores) not found. Run the migration script! ♡');
            } else {
                logger.error(`[MinigameService] Failed to fetch leaderboard: ${error.message || JSON.stringify(error)}`);
            }
            return [];
        }
        return data;
    }

    /**
     * Get a user's current rank and points.
     */
    async getUserStats(userId) {
        if (!supabase) return null;

        const { data: userStats } = await supabase
            .from('minigame_scores')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

        if (!userStats) return { total_points: 0, rank: '?' };

        // Count users with more points for rank
        const { count } = await supabase
            .from('minigame_scores')
            .select('*', { count: 'exact', head: true })
            .gt('total_points', userStats.total_points);

        return {
            ...userStats,
            rank: (count || 0) + 1
        };
    }
}

module.exports = new MinigameService();
