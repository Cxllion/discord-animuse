const supabase = require('../core/supabaseClient');
const logger = require('../core/logger');

class MafiaService {
    /**
     * Records a win or loss for a list of players.
     * @param {string[]} userIds Array of Discord user IDs
     * @param {boolean} isWin Whether these players won
     */
    async recordMatchResults(userIds, isWin) {
        if (!supabase) return;
        
        try {
            for (const userId of userIds) {
                const { data, error } = await supabase
                    .from('archive_stats')
                    .select('*')
                    .eq('user_id', userId)
                    .single();

                if (error && error.code !== 'PGRST116') { 
                    logger.error(`Failed to fetch stats for ${userId}: ${error.message}`, 'MafiaService');
                    continue;
                }

                if (!data) {
                    await supabase.from('archive_stats').insert({
                        user_id: userId,
                        wins: isWin ? 1 : 0,
                        losses: isWin ? 0 : 1,
                        games_played: 1,
                        last_played: new Date().toISOString()
                    });
                } else {
                    await supabase.from('archive_stats').update({
                        wins: isWin ? data.wins + 1 : data.wins,
                        losses: isWin ? data.losses : data.losses + 1,
                        games_played: data.games_played + 1,
                        last_played: new Date().toISOString()
                    }).eq('user_id', userId);
                }
            }
            logger.info(`Recorded match results (${isWin ? 'Win' : 'Loss'}) for ${userIds.length} players.`, 'MafiaService');
        } catch (e) {
            logger.error(`Mafia statistics update failed: ${e.message}`, 'MafiaService');
        }
    }

    /**
     * Fetches statistics for a specific user.
     */
    async getPlayerStats(userId) {
        if (!supabase) return null;
        const { data, error } = await supabase
            .from('archive_stats')
            .select('*')
            .eq('user_id', userId)
            .single();
        
        if (error) return null;
        return data;
    }
}

module.exports = new MafiaService();
