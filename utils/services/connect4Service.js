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
        const { data: activeGames } = await supabase
            .from('connect4_sessions')
            .select('id')
            .eq('status', 'PLAYING')
            .or(`player1.eq.${player1Id},player2.eq.${player1Id},player1.eq.${player2Id},player2.eq.${player2Id}`);

        if (activeGames && activeGames.length > 0) {
            throw new Error('ACTIVE_LINK_DETECTED: One or more patrons are already engaged in a Tactical Link.');
        }

        const startingPlayer = Math.random() < 0.5 ? player1Id : player2Id;
        const gameState = {
            id: `c4_${Date.now()}_${player1Id.substring(0, 5)}`,
            board: connect4Engine.createBoard(),
            player1: player1Id,
            player2: player2Id,
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
            if (!game.history) game.history = [];
            game.history.push({
                user: userId,
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
            } else if (connect4Engine.isBoardFull(game.board)) {
                game.status = 'DRAW';
                game.winner = null;
                await minigameService.recordConnect4Result(p1, p2, null, game.moves);
            } else {
                game.current_turn = userId === p1 ? p2 : p1;
            }

            game.last_move_at = new Date().toISOString();

            /* 
               TODO LATER:
               - [7] AI Difficulty (7)
               - [8] Multi-Theme Support (8)
               - [9] Custom Token Skins (9)
               - [11] Time-of-Day Shading (11)
               - [18] Weekly Tournaments (18)
            */

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
                    history: game.history.slice(-10), // Cap history to last 10 moves
                    last_move_coord: game.last_move_coord,
                    last_move_at: game.last_move_at,
                    updated_at: new Date().toISOString()
                })
                .eq('id', gameId)
                .eq('moves', originalMoves);

            if (updateError) {
                throw new Error('CONCURRENCY_ERROR: The grid state has shifted. Please refresh.');
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

        // Early Forfeit Forgiveness: If no moves made, just delete the session
        if ((game.moves || 0) === 0) {
            await this.deleteSession(gameId);
            return { ...game, status: 'CANCELLED' };
        }

        game.status = 'FORFEITED';
        game.winner = userId === game.player1 ? game.player2 : game.player1;
        
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
            const row = game.last_move_coord?.r;
            const col = game.last_move_coord?.c;
            if (row !== undefined && col !== undefined) {
                game.board[row][col] = 0;
            }

            // Revert state
            game.history.pop();
            game.moves -= 1;
            game.current_turn = userId;
            
            // Recalculate last move coord from history if available
            if (game.history.length > 0) {
                const prevMove = game.history[game.history.length - 1];
                // Note: We don't store the row in history currently, which is a flaw.
                // For now, just clear the indicator or leave it (UX will be slightly messy without row in history).
                game.last_move_coord = null; 
            } else {
                game.last_move_coord = null;
            }

            await this.saveSession(gameId, game);
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
     * Housekeeping: Archives sessions with no activity for more than 2 hours.
     */
    async cleanupStaleSessions() {
        if (!supabase) return;

        try {
            const threshold = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
            
            const { data: staleSessions, error } = await supabase
                .from('connect4_sessions')
                .select('*')
                .lt('last_move_at', threshold)
                .eq('status', 'PLAYING');

            if (error) throw error;
            if (!staleSessions || staleSessions.length === 0) return;

            logger.info(`[Connect4] Housekeeping: Found ${staleSessions.length} stale sessions. Archiving...`);

            for (const session of staleSessions) {
                try {
                    // Mark as FORFEITED, winner is the one whose turn it ISN'T.
                    const currentTurn = session.current_turn || session.currentTurn;
                    const winner = session.player1 === currentTurn ? session.player2 : session.player1;
                    
                    session.status = 'FORFEITED';
                    session.winner = winner;
                    
                    await this.saveSession(session.id, session);
                    logger.debug(`[Connect4] Stale session ${session.id} auto-forfeited.`);
                } catch (err) {
                    logger.error(`[Connect4] Failed to archive stale session ${session.id}:`, err);
                }
            }
        } catch (e) {
            logger.error('[Connect4] Housekeeping failed:', e);
        }
    }
}

module.exports = new Connect4Service();
