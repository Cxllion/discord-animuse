/**
 * Connect4 Engine: Pure logic for the Connect4 game.
 * Board is represented as a 6x7 2D array.
 * 0 = Empty, 1 = Player 1, 2 = Player 2
 */
class Connect4Engine {
    constructor() {
        this.ROWS = 6;
        this.COLS = 7;
        this.WIN_LENGTH = 4;
    }

    /**
     * Creates a new empty 6x7 board.
     * @returns {number[][]} 2D array representing the board.
     */
    createBoard() {
        const board = [];
        for (let r = 0; r < this.ROWS; r++) {
            board.push(new Array(this.COLS).fill(0));
        }
        return board;
    }

    /**
     * Drops a piece into the specified column.
     * @param {number[][]} board - The current board state.
     * @param {number} col - The column to drop the piece into (0-6).
     * @param {number} player - The player making the move (1 or 2).
     * @returns {Object} { success, board, row }
     */
    dropPiece(board, col, player) {
        if (col < 0 || col >= this.COLS) return { success: false, board, row: -1 };
        
        // Start from the bottom row (ROWS - 1) and move up
        for (let r = this.ROWS - 1; r >= 0; r--) {
            if (board[r][col] === 0) {
                board[r][col] = player;
                return { success: true, board, row: r };
            }
        }
        return { success: false, board, row: -1 }; // Column is full
    }

    /**
     * Checks if a player has won the game.
     * @param {number[][]} board - The current board state.
     * @param {number} player - The player to check for a win (1 or 2).
     * @returns {Object|boolean} An object with winning tiles if won, else false.
     */
    checkWin(board, player) {
        const rows = this.ROWS;
        const cols = this.COLS;
        const win = this.WIN_LENGTH;

        // Check horizontal locations
        for (let c = 0; c <= cols - win; c++) {
            for (let r = 0; r < rows; r++) {
                let match = true;
                for (let k = 0; k < win; k++) {
                    if (board[r][c + k] !== player) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    const tiles = [];
                    for (let k = 0; k < win; k++) tiles.push({ r, c: c + k });
                    return { tiles };
                }
            }
        }

        // Check vertical locations
        for (let c = 0; c < cols; c++) {
            for (let r = 0; r <= rows - win; r++) {
                let match = true;
                for (let k = 0; k < win; k++) {
                    if (board[r + k][c] !== player) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    const tiles = [];
                    for (let k = 0; k < win; k++) tiles.push({ r: r + k, c });
                    return { tiles };
                }
            }
        }

        // Check positively sloped diagonals
        for (let c = 0; c <= cols - win; c++) {
            for (let r = 0; r <= rows - win; r++) {
                let match = true;
                for (let k = 0; k < win; k++) {
                    if (board[r + k][c + k] !== player) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    const tiles = [];
                    for (let k = 0; k < win; k++) tiles.push({ r: r + k, c: c + k });
                    return { tiles };
                }
            }
        }

        // Check negatively sloped diagonals
        for (let c = 0; c <= cols - win; c++) {
            for (let r = win - 1; r < rows; r++) {
                let match = true;
                for (let k = 0; k < win; k++) {
                    if (board[r - k][c + k] !== player) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    const tiles = [];
                    for (let k = 0; k < win; k++) tiles.push({ r: r - k, c: c + k });
                    return { tiles };
                }
            }
        }

        return false;
    }

    /**
     * Checks if it's still possible for either player to win.
     * Used for early draw detection.
     * @param {number[][]} board - The current board state.
     * @returns {boolean} True if at least one winning line is still achievable.
     */
    canEitherPlayerWin(board) {
        const rows = this.ROWS;
        const cols = this.COLS;
        const win = this.WIN_LENGTH;

        // Check every possible winning line
        // 1. Horizontal
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c <= cols - win; c++) {
                let p1Possible = true;
                let p2Possible = true;
                for (let k = 0; k < win; k++) {
                    if (board[r][c + k] === 2) p1Possible = false;
                    if (board[r][c + k] === 1) p2Possible = false;
                }
                if (p1Possible || p2Possible) return true;
            }
        }

        // 2. Vertical
        for (let c = 0; c < cols; c++) {
            for (let r = 0; r <= rows - win; r++) {
                let p1Possible = true;
                let p2Possible = true;
                for (let k = 0; k < win; k++) {
                    if (board[r + k][c] === 2) p1Possible = false;
                    if (board[r + k][c] === 1) p2Possible = false;
                }
                if (p1Possible || p2Possible) return true;
            }
        }

        // 3. Positive Diagonal
        for (let r = 0; r <= rows - win; r++) {
            for (let c = 0; c <= cols - win; c++) {
                let p1Possible = true;
                let p2Possible = true;
                for (let k = 0; k < win; k++) {
                    if (board[r + k][c + k] === 2) p1Possible = false;
                    if (board[r + k][c + k] === 1) p2Possible = false;
                }
                if (p1Possible || p2Possible) return true;
            }
        }

        // 4. Negative Diagonal
        for (let r = win - 1; r < rows; r++) {
            for (let c = 0; c <= cols - win; c++) {
                let p1Possible = true;
                let p2Possible = true;
                for (let k = 0; k < win; k++) {
                    if (board[r - k][c + k] === 2) p1Possible = false;
                    if (board[r - k][c + k] === 1) p2Possible = false;
                }
                if (p1Possible || p2Possible) return true;
            }
        }

        return false;
    }

    /**
     * Checks if the board is completely full (resulting in a draw).
     * @param {number[][]} board - The current board state.
     * @returns {boolean} True if there are no empty slots in the top row.
     */
    isBoardFull(board) {
        for (let c = 0; c < this.COLS; c++) {
            if (board[0][c] === 0) {
                return false;
            }
        }
        return true;
    }
}

module.exports = new Connect4Engine();
