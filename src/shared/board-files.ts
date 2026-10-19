/**
 * The names a board folder is laid out by. They sit here rather than in the
 * scanner so the write hook reads them without the scanner's schema library.
 */
export const BOARD_FILE = 'board.json'
export const PROJECT_FILE = 'project.json'
export const ASSETS_FOLDER = 'assets'
export const FRAME_EXTENSION = '.html'
export const TOKEN_FILE = 'tokens.css'

/** Generated files beside the board, ignored by git through their own `.gitignore`. */
export const RUN_FOLDER = '.run'
export const ADDRESS_FILE = 'address.json'

/** Where a repository or a working folder keeps its board when no marker says otherwise. */
export const DEFAULT_BOARD_FOLDER = '.frameboard'
