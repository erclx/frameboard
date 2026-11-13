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
import { NOTES_FOLDER } from '@/server/notes/images'
import { NOTES_FILE } from '@/server/notes/store'
import { ADDRESS_FILE, RUN_FOLDER, TOKEN_FILE } from '@/shared/board-files'
import { FACES } from '@/shared/faces'
import { BEZELS } from '@/shared/frame-device'
import {
  DEFAULT_FRAME_SIZE,
  FRAME_GAP,
  FRAME_SIZE_NAMES,
  FRAME_SIZES,
  frameSizeOf,
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
      `A page's notes sit in its ${NOTES_FILE}, never in a frame. A note pins to a frame or to one element by index and the frame file's hash, and reads at the frame once the file changes. Read them with notes, answer with notes reply, and close them with notes done. A note's images sit in its page's ${NOTES_FOLDER}/ folder, and its images field lists them relative to the page.`,
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
    frameSizes: Object.fromEntries(
      FRAME_SIZE_NAMES.map((name) => [name, frameSizeOf(name)]),
    ),
    defaultFrameSize: DEFAULT_FRAME_SIZE,
    layout: [
      'x and y are integers, width and height integers of at least 1, and order an integer of at least 0, where a higher order draws on top.',
      'hidden, locked, hugWidth, hugHeight, and scroll read as false when absent, and an axis whose hug flag is false holds the size its entry states.',
      `scroll marks a frame that holds a fixed screen height and scrolls past it, such as a page with a sticky section. It fixes both axes, so either hug flag beside it reads as false, frame fit refuses it, and serve never measures it. frame add --scroll sets it, taking the height given or else the preset height of the width (${FRAME_SIZES.desktop.height} px at ${FRAME_SIZES.desktop.width}). frame resize --scroll sets it on a placed frame, dropping a hugging height to that preset height unless a height is given and keeping a fixed height as it stands, so resize a frame fixed past a screen with --height too. frame resize --no-scroll clears it, keeping the box.`,
      `widths lists the extra widths one frame file also shows at, as { width, height } objects, each drawn ${FRAME_GAP} px past the last in a row beside the frame at its y, so a responsive page is one file rather than a copy per width. Each width follows the frame's own height mode: it hugs its content at that width while hugHeight is on, and otherwise holds its height, the preset height of its width when first set and on frame resize --scroll. A value of any other shape reads as none. frame add --widths 834,390 and frame resize --widths set it, refusing a repeated width, the frame's own width, or a frame hugging its width, and frame resize --no-widths clears it. capture writes <frame>@<width>.<theme>.png beside <frame>.<theme>.png, check reports a browser finding at a linked width with that width and prints it as <path>@<width>, and a frames.json value of <project>/<page>/<frame>@<width> syncs that width's images.`,
      `device names the device the board draws around the frame, phone or tablet, as a body ${BEZELS.phone.border} or ${BEZELS.tablet.border} px past the box on every side. It never changes the frame file or its size, the body wraps whatever box the frame holds, and a frame placed beside one lands ${FRAME_GAP} px past the body. Linked widths draw no device. Any other value reads as none and is kept on write. frame add --device and frame device <frame-ref> <phone|tablet|none> set it, and none clears it.`,
      `An axis that hugs takes its size from the frame's content: a running serve measures it after each write to the frame file and when frame add places a file already written, its width at most ${FRAME_SIZES.desktop.width} px, and writes width and height alone, never a flag. Content sized off the viewport keeps the box it has.`,
      'frame add with no size hugs both axes, --size or --width fixes the width and hugs the height, and --height fixes the height alone, its box standing in until serve measures. frame resize and a hand resize fix each axis they set, and frame fit sets the height and turns hugHeight on.',
      'Frames sort by order, then name, and a write that changes order renumbers the page from 0.',
      `A frame file with no entry is unplaced: it reads at desktop size, y 0, ${FRAME_GAP} px past the right edge of every frame placed before it in name order. frame add places it ${FRAME_GAP} px past the placed frames alone, so the first unplaced file keeps that box and any later one moves left.`,
      'An entry with no frame file beside it is ignored on read and kept on write.',
      `A ${LAYOUT_FILE} that does not parse is reported by list and refused by every verb writing that page, never overwritten.`,
      `Moving or resizing a frame writes ${LAYOUT_FILE} alone and never the frame file.`,
      "sections, when present, maps a section name to its x, y, width, height, and order. A frame belongs to the topmost section holding its center, left and top edges inside, and is never listed in it, so list --json names each section's frames and an agent moving a frame out of the box takes it out of the section. The developer writes sections by hand on the board.",
    ],
    assets: `A frame links files in its own page folder or in its project's ${ASSETS_FOLDER}/ folder. frame duplicate and frame move carry the ${FRAME_EXTENSION} file alone, so keep files shared between frames or pages in ${ASSETS_FOLDER}/.`,
    look: [
      `The board's ${TOKEN_FILE} holds the design tokens every project shares, and a project's own ${TOKEN_FILE} overrides it. serve --tokens <path> stands in for the board's sheet, resolved against the working folder and recorded as tokens in ${RUN_FOLDER}/${ADDRESS_FILE} while that server runs.`,
      `The server puts one <style ${LOOK_MARKER}> first in each frame's head, importing the faces, then the board sheet, then the project sheet, so a frame's own sheets win. The file on disk never changes, and a count of a live frame's elements skips elements carrying ${LOOK_MARKER}.`,
      `Every frame can use the families ${FACES.map((face) => face.family).join(', ')} with no link of its own. A project adds other faces in its ${ASSETS_FOLDER}/ folder.`,
      "The board sets data-theme and color-scheme to light or dark on each frame's root, with the class dark or light, so define both themes through [data-theme], .dark, prefers-color-scheme, or light-dark(), or take every color from token variables. Never paste a token sheet into a frame.",
      `A change to a token sheet reloads every frame it reaches.`,
      "A style attribute outranks every rule, and may hold a value the developer set by hand, so read it before changing a rule the element matches. While a server runs, check warns as outranked when an agent's write changed a rule in the frame's own <style> that an unchanged style attribute also sets.",
    ],
  }
}
