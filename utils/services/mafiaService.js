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
        if (process.env.TEST_MODE === 'true') {
            logger.info(`[Test Mode] Skipping match result recording for ${userIds.length} players.`, 'MafiaService');
            return;
        }
        
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

    /**
     * Saves a Mafia game session to Supabase.
     * @param {string} guildId 
     * @param {string} channelId 
     * @param {string} hostId 
     * @param {object} state 
     */
    async saveSession(guildId, channelId, hostId, state) {
        if (!supabase) return false;
        try {
            const { error } = await supabase
                .from('mafia_sessions')
                .upsert({
                    guild_id: guildId,
                    channel_id: channelId,
                    host_id: hostId,
                    state: state,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'guild_id' });
            
            if (error) {
                logger.error(`Failed to save mafia session for guild ${guildId}: ${error.message}`, 'MafiaService');
                return false;
            }
            return true;
        } catch (e) {
            logger.error(`Mafia session save exception: ${e.message}`, 'MafiaService');
            return false;
        }
    }

    /**
     * Fetches all active Mafia sessions from Supabase.
     */
    async getAllSessions() {
        if (!supabase) return [];
        try {
            const { data, error } = await supabase
                .from('mafia_sessions')
                .select('*');
            
            if (error) {
                logger.error(`Failed to fetch mafia sessions: ${error.message}`, 'MafiaService');
                return [];
            }
            return data || [];
        } catch (e) {
            logger.error(`Mafia session fetch exception: ${e.message}`, 'MafiaService');
            return [];
        }
    }

    /**
     * Deletes a Mafia session from Supabase.
     * @param {string} guildId 
     */
    async deleteSession(guildId) {
        if (!supabase) return false;
        try {
            const { error } = await supabase
                .from('mafia_sessions')
                .delete()
                .eq('guild_id', guildId);
            
            if (error) {
                logger.error(`Failed to delete mafia session for guild ${guildId}: ${error.message}`, 'MafiaService');
                return false;
            }
            return true;
        } catch (e) {
            logger.error(`Mafia session delete exception: ${e.message}`, 'MafiaService');
            return false;
        }
    }
}

module.exports = new MafiaService();
