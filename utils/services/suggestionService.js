const supabase = require('../core/supabaseClient');
const logger = require('../core/logger');

/**
 * Suggestion Service: Manages the lifecycle of user feedback and ideas.
 */
class SuggestionService {
    /**
     * Creates a new suggestion record.
     */
    async createSuggestion(data) {
        if (!supabase) return { error: 'DB_OFFLINE' };

        const { guildId, userId, title, content, channelId } = data;

        const { data: suggestion, error } = await supabase
            .from('suggestions')
            .insert({
                guild_id: guildId,
                user_id: userId,
                title: title,
                content: content,
                channel_id: channelId,
                status: 'pending'
            })
            .select()
            .single();

        if (error) {
            logger.error('Failed to create suggestion in DB', error, 'SuggestionService');
            return { error };
        }

        return { data: suggestion };
    }

    /**
     * Updates an existing suggestion (message_id, status, thread_id, etc.)
     */
    async updateSuggestion(id, updates) {
        if (!supabase) return { error: 'DB_OFFLINE' };

        const { data, error } = await supabase
            .from('suggestions')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            logger.error(`Failed to update suggestion ${id}`, error, 'SuggestionService');
            return { error };
        }

        return { data };
    }

    /**
     * Fetches a suggestion by ID or Message ID
     */
    async getSuggestion(id, byMessage = false) {
        if (!supabase) return null;

        const query = supabase.from('suggestions').select('*');
        if (byMessage) query.eq('message_id', id);
        else query.eq('id', id);

        const { data, error } = await query.single();
        if (error) return null;
        return data;
    }

    /**
     * Handles voting logic (Up/Down) with double-vote prevention.
     * Returns the updated vote counts.
     */
    async handleVote(suggestionId, userId, voteType) {
        if (!supabase) return { error: 'DB_OFFLINE' };

        // 1. Check for existing vote
        const { data: existingVote } = await supabase
            .from('suggestion_votes')
            .select('*')
            .eq('suggestion_id', suggestionId)
            .eq('user_id', userId)
            .single();

        if (existingVote) {
            // If clicking the SAME vote type, remove it (Toggle off)
            if (existingVote.vote_type === voteType) {
                await supabase
                    .from('suggestion_votes')
                    .delete()
                    .eq('suggestion_id', suggestionId)
                    .eq('user_id', userId);
            } else {
                // If switching vote type, update it
                await supabase
                    .from('suggestion_votes')
                    .update({ vote_type: voteType })
                    .eq('suggestion_id', suggestionId)
                    .eq('user_id', userId);
            }
        } else {
            // New vote
            await supabase
                .from('suggestion_votes')
                .insert({ suggestion_id: suggestionId, user_id: userId, vote_type: voteType });
        }

        // 2. Recalculate totals (Atomic-ish)
        const { data: upCount } = await supabase
            .from('suggestion_votes')
            .select('user_id', { count: 'exact', head: true })
            .eq('suggestion_id', suggestionId)
            .eq('vote_type', 'up');

        const { data: downCount } = await supabase
            .from('suggestion_votes')
            .select('user_id', { count: 'exact', head: true })
            .eq('suggestion_id', suggestionId)
            .eq('vote_type', 'down');

        const upvotes = upCount ? upCount.length : 0; // Head count doesn't return length like this in JS usually, but Supabase count does.
        // Actually select count is better:
        const up = await supabase.from('suggestion_votes').select('*', { count: 'exact', head: true }).eq('suggestion_id', suggestionId).eq('vote_type', 'up');
        const down = await supabase.from('suggestion_votes').select('*', { count: 'exact', head: true }).eq('suggestion_id', suggestionId).eq('vote_type', 'down');

        const updates = {
            upvotes: up.count || 0,
            downvotes: down.count || 0
        };

        await this.updateSuggestion(suggestionId, updates);

        return { data: updates };
    }
}

module.exports = new SuggestionService();
