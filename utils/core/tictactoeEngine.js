/**
 * Tic Tac Toe Engine: Pure logic for the Tic Tac Toe game.
 * Board is represented as a 3x3 2D array.
 * 0 = Empty, 1 = Player 1, 2 = Player 2
 */
class TicTacToeEngine {
    constructor() {
        this.ROWS = 3;
        this.COLS = 3;
    }

    /**
     * Creates a new empty 3x3 board.
     * @returns {number[][]} 2D array representing the board.
     */
    createBoard() {
        return [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0]
        ];
    }

    /**
     * Places a piece into the specified row and column.
     * @param {number[][]} board - The current board state.
     * @param {number} row - The row (0-2).
     * @param {number} col - The column (0-2).
     * @param {number} player - The player making the move (1 or 2).
     * @returns {Object} { success, board }
     */
    placePiece(board, row, col, player) {
        if (row < 0 || row >= this.ROWS || col < 0 || col >= this.COLS) {
            return { success: false, board };
        }
        
        if (board[row][col] === 0) {
            // Create a deep copy of the board to prevent mutating the original reference directly 
            // if it's passed around (though typically we replace the whole board in DB).
            const newBoard = board.map(r => [...r]);
            newBoard[row][col] = player;
            return { success: true, board: newBoard };
        }
        
        return { success: false, board }; // Cell is already occupied
    }

    /**
     * Checks if a player has won the game.
     * @param {number[][]} board - The current board state.
     * @param {number} player - The player to check for a win (1 or 2).
     * @returns {Object|boolean} An object with winning tiles if won, else false.
     */
    checkWin(board, player) {
        // Check horizontal rows
        for (let r = 0; r < this.ROWS; r++) {
            if (board[r][0] === player && board[r][1] === player && board[r][2] === player) {
                return { tiles: [{r, c: 0}, {r, c: 1}, {r, c: 2}] };
            }
        }

        // Check vertical columns
        for (let c = 0; c < this.COLS; c++) {
            if (board[0][c] === player && board[1][c] === player && board[2][c] === player) {
                return { tiles: [{r: 0, c}, {r: 1, c}, {r: 2, c}] };
            }
        }

        // Check diagonals
        if (board[0][0] === player && board[1][1] === player && board[2][2] === player) {
            return { tiles: [{r: 0, c: 0}, {r: 1, c: 1}, {r: 2, c: 2}] };
        }
        
        if (board[0][2] === player && board[1][1] === player && board[2][0] === player) {
            return { tiles: [{r: 0, c: 2}, {r: 1, c: 1}, {r: 2, c: 0}] };
        }

        return false;
    }

    /**
     * Checks if the board is completely full (resulting in a draw if no win).
     * @param {number[][]} board - The current board state.
     * @returns {boolean} True if there are no empty slots.
     */
    isBoardFull(board) {
        for (let r = 0; r < this.ROWS; r++) {
            for (let c = 0; c < this.COLS; c++) {
                if (board[r][c] === 0) {
                    return false;
                }
            }
        }
        return true;
    }
}

module.exports = new TicTacToeEngine();
