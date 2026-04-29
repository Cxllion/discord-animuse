const connect4Engine = require('../core/connect4Engine');
const minigameService = require('./minigameService');
const supabase = require('../core/supabaseClient');
const logger = require('../core/logger');

/**
 * Connect4 Service: Manages the lifecycle and state of tactical link sessions.
 */
class Connect4Service {
    constructor() {
        this.processingLocks = new Set();
    }

    /**
     * Start a new Connect4 session.
     */
    async startNewGame(player1Id, player2Id) {
        if (!supabase) return null;

        // Active Session Blocking: Prevent concurrent games
        const prefix = process.env.TEST_MODE === 'true' ? 't4-' : 'c4-';
        const { data: activeGames, error: fetchError } = await supabase
            .from('connect4_sessions')
            .select('id')
            .eq('status', 'PLAYING')
            .like('id', `${prefix}%`)
            .or(`player1.eq.${player1Id},player2.eq.${player1Id},player1.eq.${player2Id},player2.eq.${player2Id}`);

        if (fetchError) {
            logger.error('[Connect4] Failed to check for active sessions:', fetchError);
            // We proceed if there's an error to avoid blocking users due to DB hiccups, 
            // but we log it for forensics.
        }

        if (activeGames && activeGames.length > 0) {
            throw new Error('ACTIVE_LINK_DETECTED: One or more patrons are already engaged in a Tactical Link.');
        }

        // Shuffle Player Slots (Placement Randomization)
        const players = Math.random() < 0.5 ? [player1Id, player2Id] : [player2Id, player1Id];
        const p1 = players[0];
        const p2 = players[1];

        // Randomize Starting Turn
        const startingPlayer = Math.random() < 0.5 ? p1 : p2;

        const gameState = {
            id: `${prefix}${Date.now()}-${p1.substring(0, 5)}`,
            board: connect4Engine.createBoard(),
            player1: p1,
            player2: p2,
            current_turn: startingPlayer,
            currentTurn: startingPlayer,
            status: 'PLAYING',
            startedAt: new Date().toISOString(),
            moves: 0,
            winningTiles: [],
            history: []
        };
        
        await this.saveSession(gameState.id, gameState);
        return gameState;
    }

    /**
     * Retrieve a game session from database.
     */
    async getGame(gameId) {
        if (!supabase) return null;
        try {
            const { data } = await supabase
                .from('connect4_sessions')
                .select('*')
                .eq('id', gameId)
                .maybeSingle();
            return data;
        } catch (err) {
            logger.error(`[Connect4Service] Failed to fetch session ${gameId}:`, err);
            return null;
        }
    }

    async hasActiveSession(userId) {
        const prefix = process.env.TEST_MODE === 'true' ? 't4-' : 'c4-';
        const { data } = await supabase
            .from('connect4_sessions')
            .select('id')
            .or(`player1.eq.${userId},player2.eq.${userId}`)
            .eq('status', 'PLAYING')
            .like('id', `${prefix}%`)
            .maybeSingle();
        return !!data;
    }

    /**
     * Save/Update a game session.
     */
    async saveSession(gameId, state) {
        if (!supabase) return;
        try {
            await supabase
                .from('connect4_sessions')
                .upsert({
                    id: gameId,
                    player1: state.player1,
                    player2: state.player2,
                    board: state.board,
                    current_turn: state.currentTurn || state.current_turn,
                    status: state.status,
                    winner: state.winner || null,
                    winning_tiles: state.winningTiles || [],
                    moves: state.moves || 0,
                    public_message_id: state.publicMessageId || null,
                    public_channel_id: state.publicChannelId || null,
                    last_move_at: state.lastMoveAt || new Date().toISOString(),
                    history: state.history || [],
                    last_move_coord: state.lastMoveCoord || null,
                    updated_at: new Date().toISOString()
                });
        } catch (err) {
            logger.error(`[Connect4Service] Failed to save session ${gameId}:`, err);
        }
    }

    /**
     * Submit a column move.
     */
    async submitMove(gameId, userId, col) {
        if (this.processingLocks.has(gameId)) return null;
        this.processingLocks.add(gameId);

        try {
            const game = await this.getGame(gameId);
            if (!game || game.status !== 'PLAYING') return null;
            
            const currentTurn = game.current_turn || game.currentTurn;
            const p1 = game.player1;
            const p2 = game.player2;

            if (currentTurn !== userId) {
                throw new Error('PROTOCOL_DEVIATION: It is not your turn in this link sequence.');
            }

            const playerValue = userId === p1 ? 1 : 2;
            const result = connect4Engine.dropPiece(game.board, col, playerValue);
            
            if (!result.success) {
                throw new Error('INVALID_INPUT: Column capacity exceeded or input out of bounds.');
            }

            game.board = result.board;
            game.last_move_coord = { r: result.row, c: col };
            game.moves = (game.moves || 0) + 1;
            
            // Log move
            game.history.push({
                user: userId,
                row: result.row,
                col: col,
                time: new Date().toISOString()
            });

            // Check Win
            const win = connect4Engine.checkWin(game.board, playerValue);
            if (win) {
                game.status = 'WON';
                game.winner = userId;
                game.winningTiles = win.tiles;
                
                const reward = await minigameService.recordConnect4Result(p1, p2, userId, game.moves);
                game.reward = reward;
            } else if (!connect4Engine.canEitherPlayerWin(game.board)) {
                game.status = 'DRAW';
                game.winner = null;
                await minigameService.recordConnect4Result(p1, p2, null, game.moves);
            } else {
                game.current_turn = userId === p1 ? p2 : p1;
            }

            game.last_move_at = new Date().toISOString();

            // Optimistic Locking: Use .eq('moves', originalMoves) to prevent race conditions
            const originalMoves = game.moves - 1;
            const { error: updateError } = await supabase
                .from('connect4_sessions')
                .update({
                    board: game.board,
                    current_turn: game.current_turn,
                    status: game.status,
                    winner: game.winner || null,
                    winning_tiles: game.winningTiles || [],
                    moves: game.moves,
                    history: game.history, 
                    last_move_coord: game.last_move_coord,
                    last_move_at: game.last_move_at,
                    updated_at: new Date().toISOString()
                })
                .eq('id', gameId)
                .eq('moves', originalMoves);

            if (updateError) {
                throw new Error('CONCURRENCY_ERROR: The grid state has shifted. Please re-synchronize.');
            }

            return {
                ...game,
                currentTurn: game.current_turn 
            };
        } finally {
            this.processingLocks.delete(gameId);
        }
    }

    /**
     * Forfeit a game session.
     */
    async forfeitGame(gameId, userId) {
        const game = await this.getGame(gameId);
        if (!game || game.status !== 'PLAYING') return null;

        const p1 = game.player1;
        const p2 = game.player2;
        const winnerId = userId === p1 ? p2 : p1;
        const moveCount = game.moves || 0;

        // Early Forfeit Forgiveness: If no moves made, just delete the session
        if (moveCount === 0) {
            await this.deleteSession(gameId);
            return { ...game, status: 'CANCELLED' };
        }

        game.status = 'FORFEITED';
        game.winner = winnerId;
        
        // Award points unless it's an "Early Abandon" (Turn 1 or 2)
        const isEarlyForfeit = moveCount < 3;
        
        const reward = await minigameService.recordConnect4Result(
            p1, 
            p2, 
            winnerId, 
            isEarlyForfeit ? 0 : moveCount, // Passing 0 moves if early to signal no points logic if needed, or just let recordConnect4Result handle it
            { isForfeit: true, isEarly: isEarlyForfeit }
        );

        game.reward = reward;
        
        await this.saveSession(gameId, game);
        return game;
    }

    /**
     * Undo the last move.
     */
    async undoMove(gameId, userId) {
        if (this.processingLocks.has(gameId)) return null;
        this.processingLocks.add(gameId);

        try {
            const game = await this.getGame(gameId);
            if (!game || game.status !== 'PLAYING') return null;
            if ((game.moves || 0) === 0) throw new Error('PROTOCOL_DEVIATION: No moves to undo.');

            const lastMove = game.history[game.history.length - 1];
            if (lastMove.user !== userId) {
                throw new Error('PROTOCOL_DEVIATION: You can only undo your own last move.');
            }

            // Revert board
            const row = lastMove.row;
            const col = lastMove.col;
            if (row !== undefined && col !== undefined) {
                game.board[row][col] = 0;
            }

            // Revert state
            game.history.pop();
            const originalMoves = game.moves;
            game.moves -= 1;
            game.current_turn = userId;
            
            // Recalculate last move coord from history
            if (game.history.length > 0) {
                const prevMove = game.history[game.history.length - 1];
                game.last_move_coord = { r: prevMove.row, c: prevMove.col };
            } else {
                game.last_move_coord = null;
            }

            game.last_move_at = new Date().toISOString();

            const { error: updateError } = await supabase
                .from('connect4_sessions')
                .update({
                    board: game.board,
                    current_turn: game.current_turn,
                    moves: game.moves,
                    history: game.history,
                    last_move_coord: game.last_move_coord,
                    last_move_at: game.last_move_at,
                    updated_at: new Date().toISOString()
                })
                .eq('id', gameId)
                .eq('moves', originalMoves);

            if (updateError) {
                throw new Error('CONCURRENCY_ERROR: The grid state has shifted. Please re-synchronize.');
            }

            return game;
        } finally {
            this.processingLocks.delete(gameId);
        }
    }

    /**
     * Delete a game session.
     */
    async deleteSession(gameId) {
        if (!supabase) return;
        try {
            await supabase.from('connect4_sessions').delete().eq('id', gameId);
        } catch (err) {
            logger.error(`[Connect4Service] Failed to delete session ${gameId}:`, err);
        }
    }

    /**
     * Housekeeping: Auto-forfeits inactive games and purges expired invitations.
     */
    async cleanupStaleSessions(client) {
        if (!supabase) return;

        try {
            const now = Date.now();
            const moveThreshold = new Date(now - 2 * 60 * 1000).toISOString(); // 2 minutes for active games
            const inviteThreshold = new Date(now - 5 * 60 * 1000).toISOString(); // 5 minutes for invites
            
            // 1. Find stale active games (Move Timeout)
            const { data: staleActive, error: activeErr } = await supabase
                .from('connect4_sessions')
                .select('*')
                .lt('last_move_at', moveThreshold)
                .eq('status', 'PLAYING')
                .gt('moves', 0);

            if (activeErr) throw activeErr;

            // 2. Find expired invitations (No moves made)
            const { data: expiredInvites, error: inviteErr } = await supabase
                .from('connect4_sessions')
                .select('*')
                .lt('updated_at', inviteThreshold)
                .eq('status', 'PLAYING')
                .eq('moves', 0);

            if (inviteErr) throw inviteErr;

            // Process Active Timeouts
            if (staleActive && staleActive.length > 0) {
                logger.info(`[Connect4] Housekeeping: Found ${staleActive.length} active sessions with move timeouts.`);
                for (const session of staleActive) {
                    try {
                        const currentTurn = session.current_turn || session.currentTurn;
                        const winner = session.player1 === currentTurn ? session.player2 : session.player1;
                        
                        session.status = 'FORFEITED';
                        session.winner = winner;
                        session.metadata = { ...(session.metadata || {}), autoForfeit: true };
                        
                        await this.saveSession(session.id, session);
                        
                        // Try to notify the channel if client is provided
                        if (client && session.public_channel_id && session.public_message_id) {
                            const channel = await client.channels.fetch(session.public_channel_id).catch(() => null);
                            if (channel) {
                                await channel.send({ 
                                    content: `🕒 **Connect Muse Timeout:** <@${currentTurn}> failed to respond. Game forfeited to <@${winner}>.` 
                                }).catch(() => null);
                            }
                        }
                    } catch (err) {
                        logger.error(`[Connect4] Failed to timeout session ${session.id}:`, err);
                    }
                }
            }

            // Process Expired Invites
            if (expiredInvites && expiredInvites.length > 0) {
                logger.info(`[Connect4] Housekeeping: Purging ${expiredInvites.length} expired invitations.`);
                for (const invite of expiredInvites) {
                    await this.deleteSession(invite.id);
                }
            }

        } catch (e) {
            logger.error('[Connect4] Housekeeping failed:', e);
        }
    }
}

module.exports = new Connect4Service();
