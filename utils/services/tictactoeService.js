const tictactoeEngine = require('../core/tictactoeEngine');
const minigameService = require('./minigameService');
const supabase = require('../core/supabaseClient');
const logger = require('../core/logger');

/**
 * Tic Tac Toe Service: Manages the lifecycle and state of Tic Tac Toe sessions.
 */
class TicTacToeService {
    constructor() {
        this.processingLocks = new Set();
    }

    /**
     * Start a new Tic Tac Toe session.
     */
    async startNewGame(player1Id, player2Id, guildId) {
        if (!supabase) return null;

        // Active Session Blocking: Prevent concurrent games
        const prefix = process.env.TEST_MODE === 'true' ? 't3t-' : 't3-';
        const { data: activeGames, error: fetchError } = await supabase
            .from('tictactoe_sessions')
            .select('id')
            .eq('status', 'PLAYING')
            .like('id', `${prefix}%`)
            .or(`player1.eq.${player1Id},player2.eq.${player1Id},player1.eq.${player2Id},player2.eq.${player2Id}`);

        if (fetchError) {
            logger.error('[TicTacToe] Failed to check for active sessions:', fetchError);
        }

        if (activeGames && activeGames.length > 0) {
            throw new Error('ACTIVE_LINK_DETECTED: One or more patrons are already engaged in a Tactical Link (Tic Tac Toe).');
        }

        // Shuffle Player Slots
        const players = Math.random() < 0.5 ? [player1Id, player2Id] : [player2Id, player1Id];
        const p1 = players[0];
        const p2 = players[1];

        // Randomize Starting Turn
        const startingPlayer = Math.random() < 0.5 ? p1 : p2;

        const gameState = {
            id: `${prefix}${Date.now()}-${p1.substring(0, 5)}`,
            board: tictactoeEngine.createBoard(),
            player1: p1,
            player2: p2,
            current_turn: startingPlayer,
            currentTurn: startingPlayer,
            status: 'PLAYING',
            startedAt: new Date().toISOString(),
            moves: 0,
            winningTiles: [],
            history: [],
            guildId: guildId
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
                .from('tictactoe_sessions')
                .select('*')
                .eq('id', gameId)
                .maybeSingle();
            return data;
        } catch (err) {
            logger.error(`[TicTacToeService] Failed to fetch session ${gameId}:`, err);
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
                .from('tictactoe_sessions')
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
                    guild_id: state.guildId || null,
                    updated_at: new Date().toISOString()
                });
        } catch (err) {
            logger.error(`[TicTacToeService] Failed to save session ${gameId}:`, err);
        }
    }

    /**
     * Submit a move.
     */
    async submitMove(gameId, userId, row, col) {
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
            const result = tictactoeEngine.placePiece(game.board, row, col, playerValue);
            
            if (!result.success) {
                throw new Error('INVALID_INPUT: This tile is already occupied.');
            }

            game.board = result.board;
            game.last_move_coord = { r: row, c: col };
            game.moves = (game.moves || 0) + 1;
            
            // Log move
            game.history.push({
                user: userId,
                row: row,
                col: col,
                time: new Date().toISOString()
            });

            // Check Win
            const win = tictactoeEngine.checkWin(game.board, playerValue);
            if (win) {
                game.status = 'WON';
                game.winner = userId;
                game.winningTiles = win.tiles;
                
                const reward = await minigameService.recordTicTacToeResult(p1, p2, userId, { guildId: game.guild_id || game.guildId });
                game.reward = reward;
            } else if (tictactoeEngine.isBoardFull(game.board)) {
                game.status = 'DRAW';
                game.winner = null;
                await minigameService.recordTicTacToeResult(p1, p2, null, { guildId: game.guild_id || game.guildId });
            } else {
                game.current_turn = userId === p1 ? p2 : p1;
            }

            game.last_move_at = new Date().toISOString();

            await supabase
                .from('tictactoe_sessions')
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
                .eq('id', gameId);

            return game;
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
        
        const reward = await minigameService.recordTicTacToeResult(p1, p2, winnerId, { isForfeit: true, guildId: game.guild_id || game.guildId });
        game.reward = reward;
        
        await this.saveSession(gameId, game);
        return game;
    }

    /**
     * Delete a game session.
     */
    async deleteSession(gameId) {
        if (!supabase) return;
        try {
            await supabase.from('tictactoe_sessions').delete().eq('id', gameId);
        } catch (err) {
            logger.error(`[TicTacToeService] Failed to delete session ${gameId}:`, err);
        }
    }
}

module.exports = new TicTacToeService();
