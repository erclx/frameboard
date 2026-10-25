import { LOCK_SUFFIX, TEMP_SUFFIX } from '@/server/board/json-record'
import {
  DEFAULT_BOARD_FOLDER,
  START_PAGE,
  START_PROJECT,
} from '@/server/board/root'
import {
  ASSETS_FOLDER,
  BOARD_FILE,
  FRAME_EXTENSION,
  LAYOUT_FILE,
  PROJECT_FILE,
} from '@/server/board/scan'
import { NOTES_FILE } from '@/server/notes/store'
import { ADDRESS_FILE, RUN_FOLDER, TOKEN_FILE } from '@/shared/board-files'
import { FACES } from '@/shared/faces'
import {
  DEFAULT_FRAME_SIZE,
  FRAME_GAP,
  FRAME_SIZES,
} from '@/shared/frame-sizes'
import {
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  RESERVED_PAGE_NAMES,
} from '@/shared/names'
import { LOOK_MARKER } from '@/shared/theme'

/** The content format `docs` prints, built from the constants the verbs run on. */
export function contentFormat() {
  return {
    folders: [
      `A board folder holds ${BOARD_FILE}. Without --root, a verb walks up from the working folder to the first folder holding ${BOARD_FILE} or ${DEFAULT_BOARD_FOLDER}/${BOARD_FILE}, stopping after the first folder holding .git.`,
      `A project is any folder in the board whose name does not open with a dot. Its ${PROJECT_FILE} lists page names in display order, and pages it does not list follow by name.`,
      `A page is any folder in a project except ${ASSETS_FOLDER}/ and dot-named ones. Its ${LAYOUT_FILE} holds each frame's box, stacking order, and flags.`,
      `A frame is any *${FRAME_EXTENSION} file directly in a page, named by its stem.`,
      `A page's notes sit in its ${NOTES_FILE}, never in a frame. A note pins to a frame or to one element by index and the frame file's hash, and reads at the frame once the file changes. Read them with notes, answer with notes reply, and close them with notes done.`,
      `serve reuses a board the walk finds, and otherwise creates ${DEFAULT_BOARD_FOLDER}/ in the working folder with project ${START_PROJECT} and empty page ${START_PAGE}, and records its address in ${RUN_FOLDER}/${ADDRESS_FILE}.`,
      `Dot-named folders, *${LOCK_SUFFIX} files, and *${TEMP_SUFFIX} files belong to Frameboard and are never content.`,
    ],
    names: {
      pattern: NAME_PATTERN.source,
      maxLength: NAME_MAX_LENGTH,
      reservedPageNames: [...RESERVED_PAGE_NAMES],
      collision:
        'Two names collide when they match case-insensitively. A verb choosing a name itself takes the first free -2, -3, and onward.',
    },
    frameSizes: FRAME_SIZES,
    defaultFrameSize: DEFAULT_FRAME_SIZE,
    layout: [
      'x and y are integers, width and height integers of at least 1, and order an integer of at least 0, where a higher order draws on top.',
      'hidden and locked read as false when absent.',
      'Frames sort by order, then name, and a write that changes order renumbers the page from 0.',
      `A frame file with no entry is unplaced: it reads at desktop size, y 0, ${FRAME_GAP} px past the right edge of every frame placed before it in name order, and frame add persists that box.`,
      'An entry with no frame file beside it is ignored on read and kept on write.',
      `A ${LAYOUT_FILE} that does not parse is reported by list and refused by every verb writing that page, never overwritten.`,
      `Moving or resizing a frame writes ${LAYOUT_FILE} alone and never the frame file.`,
    ],
    assets: `A frame links files in its own page folder or in its project's ${ASSETS_FOLDER}/ folder. frame duplicate and frame move carry the ${FRAME_EXTENSION} file alone, so keep files shared between frames or pages in ${ASSETS_FOLDER}/.`,
    look: [
      `The board's ${TOKEN_FILE} holds the design tokens every project shares, and a project's own ${TOKEN_FILE} overrides it. serve --tokens <path> stands in for the board's sheet, resolved against the working folder and recorded as tokens in ${RUN_FOLDER}/${ADDRESS_FILE} while that server runs.`,
      `The server puts one <style ${LOOK_MARKER}> first in each frame's head, importing the faces, then the board sheet, then the project sheet, so a frame's own sheets win. The file on disk never changes, and a count of a live frame's elements skips elements carrying ${LOOK_MARKER}.`,
      `Every frame can use the families ${FACES.map((face) => face.family).join(', ')} with no link of its own. A project adds other faces in its ${ASSETS_FOLDER}/ folder.`,
      "The board sets data-theme and color-scheme to light or dark on each frame's root, with the class dark or light, so define both themes through [data-theme], .dark, prefers-color-scheme, or light-dark(), or take every color from token variables. Never paste a token sheet into a frame.",
      `A change to a token sheet reloads every frame it reaches.`,
    ],
  }
}
