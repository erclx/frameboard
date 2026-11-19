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
import { MODEL_LOADS } from '@/server/checks/links'
import { VIEWER_SCRIPT } from '@/server/edit/insert'
import { shippedViewerPath } from '@/server/models/viewer'
import { NOTES_FOLDER } from '@/server/notes/images'
import { NOTES_FILE } from '@/server/notes/store'
import { PROVIDERS } from '@/server/sourcing/generate'
import {
  CREDITED_LICENSES,
  DEFAULT_LICENSES,
  PAGE_SIZE,
} from '@/server/sourcing/openverse'
import {
  DEFAULT_MODEL_SIZE,
  POLYHAVEN_SOURCE,
  RESULT_LIMIT,
} from '@/server/sourcing/polyhaven'
import { DOWNLOAD_LIMIT } from '@/server/sourcing/save'
import { FOREIGN_MODELS } from '@/shared/asset-kinds'
import { BINDS_ATTRIBUTE, UNIT_ATTRIBUTE } from '@/shared/bindings'
import { ADDRESS_FILE, RUN_FOLDER, TOKEN_FILE } from '@/shared/board-files'
import { FACES } from '@/shared/faces'
import {
  BEZELS,
  BUTTON_DEPTH,
  POSE_SIZES,
  STATUS_BAR,
} from '@/shared/frame-device'
import {
  DEFAULT_FRAME_SIZE,
  FRAME_GAP,
  FRAME_SIZE_NAMES,
  FRAME_SIZES,
  frameSizeOf,
} from '@/shared/frame-sizes'
import {
  KIT_ASSETS,
  KIT_FILE,
  KIT_NOTE,
  KIT_PAGE,
  KIT_SHEET,
  KITS_FOLDER,
  NO_KIT_WORD,
  PROJECT_KITS,
  SHIPPED_KITS,
} from '@/shared/kits'
import { VIEWER_FILE, VIEWER_TAG } from '@/shared/model-viewer'
import {
  NAME_MAX_LENGTH,
  NAME_PATTERN,
  RESERVED_PAGE_NAMES,
} from '@/shared/names'
import {
  DEFAULT_TRANSITION_MS,
  DIRECTED,
  DIRECTIONS,
  STEP_ATTRIBUTES,
  STEP_EFFECTS,
  STEP_STARTS,
  TRANSITION_FILE_EXTENSION,
  TRANSITION_MS,
  TRANSITIONS,
  TRANSITIONS_FOLDER,
} from '@/shared/present-transition'
import { SPEAKER_NOTES_MAX } from '@/shared/records/board'
import { LICENSE_FILE_SUFFIX, MODEL_SIZES } from '@/shared/records/sourcing'
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
      `showDevice true has the board draw the frame inside the device its width names: a phone from 320 to 479 px wide, a tablet from 480 to 1023, and a laptop from 1024 up, with none under 320. The phone's body stands ${BEZELS.phone.border} px past the box on every side, with side buttons ${BUTTON_DEPTH} px past that, and the tablet's ${BEZELS.tablet.border}, and the laptop's lid ${BEZELS.laptop.border} px past its top and sides, with a chin and a wider base below. A resize redraws the body with no write, and list reports the device the width names as device, absent when off or under 320. It never changes the frame file, its size, or its box. frame add, frame duplicate, and a paste place a frame beside another with its own body, a laptop's base included, ${FRAME_GAP} px past the other's body. A frame given --x keeps that x, a frame landing in a reserved box keeps that box with no room for a device, and a placed frame stays where it stands when its device turns on. Linked widths draw no device. Any other value of showDevice reads as off and is kept on write. A device string from before showDevice reads as on, and the entry's next write replaces it with showDevice. frame add --device on and frame device <frame-ref> <on|off> set it, taking phone and tablet as on and none as off.`,
      `While a phone shows, the board draws a status bar over the top ${STATUS_BAR.height} px of the frame's box, in the page's own fill and text color, and the page starts under it: a frame ${FRAME_SIZES.phone.width} by ${FRAME_SIZES.phone.height} shows a page ${FRAME_SIZES.phone.width} by ${FRAME_SIZES.phone.height - STATUS_BAR.height}. The box in layout.json keeps the screen's size, and the frame file gains no padding. A hugging height measures the page and stores it plus the bar, frame fit does the same, and capture, check, inspect, and present each read the page under the bar. An export draws the bar only with its device included, and lays the page out at the whole box without it. A linked width draws no device and no bar. With the device off, or on any other device, the page is the whole box.`,
      `island wide has a phone draw its wide island, the one a call or a timer shows, and absent draws the compact one. It is kept while the device is off and reads as compact on any other device. Any other value reads as compact and is kept on write. frame device <frame-ref> --island wide sets it, --island compact clears it, and both refuse a frame whose width names no phone or that names the foldable.`,
      `turn left or right turns a phone or a tablet a quarter, with the island on the left short side for left and the right for right, and absent stands it upright. The first turn keeps the box's upright width and height in upright, and the upright width still picks the device, so a turned phone reads as a phone however wide its box. A fixed or scroll box swaps its sides, and a hugging one takes the reference height of its upright width, ${FRAME_SIZES.phone.height} px for a phone, and hugs its height at that width. A turned phone draws no status bar, so its page is the whole box, and its buttons stand on its long edges. list reports turn while the frame is turned, shown or not, and never upright. Turning upright restores the kept size, even after a hand resize of the turned box. frame device <frame-ref> --turn <upright|left|right> sets it, writing the layout entry alone, and a quarter turn refuses a foldable, a laptop, a frame showing no device, and a frame holding extra widths, each with usage. A turned frame refuses new extra widths, and naming it the foldable stands it upright first. A turn with no readable upright, or a value no reader knows, reads as upright.`,
      `foldable true has the frame name the foldable device over the one its width picks, and pose folds it: closed is the cover screen at ${POSE_SIZES.closed.width} by ${POSE_SIZES.closed.height}, and half and open are the inner screen at ${POSE_SIZES.open.width} by ${POSE_SIZES.open.height}, half shading the fold. Naming a foldable or setting a pose sets the box's width and height to that screen and turns both hug flags off, and writes the layout entry alone, never the frame file, so one file shows every pose and its content reflows as on the device. The body stands ${BEZELS.foldable.border} px past the box on every side. A newly named foldable starts in the pose nearest its width, closed up to 678 px wide and open past it. list reports device as foldable while it shows, and pose on every frame naming one, shown or not. With showDevice off the box keeps its pose's size and no body draws. A foldable draws no linked width and refuses a new one, and widths its entry held from before stay in the file undrawn, draw again once --no-foldable un-names it, and clear on frame resize --no-widths. Any other value of foldable reads as width-picked, a pose no reader knows reads as closed, and both are kept on write. An older Frameboard rewriting the entry may drop both keys, leaving a width-picked frame at the pose's size. frame device <frame-ref> --foldable names it and shows it, --pose <closed|half|open> folds it, and --no-foldable hands the pick back to the width at the size it stands.`,
      `An axis that hugs takes its size from the frame's content: a running serve measures it after each write to the frame file and when frame add places a file already written, its width at most ${FRAME_SIZES.desktop.width} px, and writes width and height alone, never a flag. Content sized off the viewport keeps the box it has.`,
      'frame add with no size hugs both axes, --size or --width fixes the width and hugs the height, and --height fixes the height alone, its box standing in until serve measures. frame resize and a hand resize fix each axis they set, and frame fit sets the height and turns hugHeight on.',
      'Frames sort by order, then name, and a write that changes order renumbers the page from 0.',
      `A frame file with no entry is unplaced: it reads at desktop size, y 0, ${FRAME_GAP} px past the right edge of every frame placed before it in name order. frame add places it ${FRAME_GAP} px past the placed frames alone, so the first unplaced file keeps that box and any later one moves left.`,
      'An entry with no frame file beside it is ignored on read and kept on write.',
      `A ${LAYOUT_FILE} that does not parse is reported by list and refused by every verb writing that page, never overwritten.`,
      `Moving or resizing a frame writes ${LAYOUT_FILE} alone and never the frame file.`,
      "sections, when present, maps a section name to its x, y, width, height, and order. A frame belongs to the topmost section holding its center, left and top edges inside, and is never listed in it, so list --json names each section's frames and an agent moving a frame out of the box takes it out of the section. The developer writes sections by hand on the board.",
    ],
    present: [
      `A page's slide transition sits on the present key of its ${LAYOUT_FILE} as { transition: { name, direction, ms } }, and a frame's entry may hold its own transition, which wins as that slide arrives. name is one of ${TRANSITIONS.join(', ')}, or one of the project's own. direction is one of ${DIRECTIONS.join(', ')}, taken by ${DIRECTED.join(' and ')} alone and defaulting to left. ms runs ${TRANSITION_MS.min} to ${TRANSITION_MS.max}, a frame's taking its page's when absent and the page's defaulting to ${DEFAULT_TRANSITION_MS}. Any other value reads as none and is kept on write. The board draws a transition itself and never writes it into a frame file.`,
      `A project adds its own transition as a stylesheet at ${ASSETS_FOLDER}/${TRANSITIONS_FOLDER}/<name>${TRANSITION_FILE_EXTENSION}, set by <name> as a built-in is. The name is lowercase kebab case and never a built-in name, none, or page. The file holds @keyframes enter, which the arriving slide plays, optionally @keyframes leave, which the leaving slide plays or else holds still, and nothing else: no other rule or at-rule, and no url(), quoted string, or backslash escape in a value. The board plays those two keyframes over the transition's ms and never loads the file itself. It takes --ms and no direction, so a second file covers a second direction. A file breaking any of this is refused whole, reported by check and the write hook as transition-file, left out of list --json's transitions on its project, and a page or frame naming it cuts. Turning transition-file off silences the finding and the file stays refused.`,
      `A frame's entry may hold speakerNotes, what the presenter means to say over the slide: plain text up to ${SPEAKER_NOTES_MAX} characters with its line breaks kept and no markup read. It lives on the entry alone and never enters the frame file, so a rewrite of the file keeps it, and a duplicate or a move to another page carries it. list --json reports it on the frame, absent when it holds none, and any value other than text reads as none and is kept on write. frame speaker-notes <frame-ref> prints it, frame speaker-notes <frame-ref> <text> sets it, refusing usage past the limit rather than cutting it, and --clear or blank text removes it. The board shows it in a strip under each slide while the Slides tab's Notes button shows notes, and the presenter view's window shows it beside the slide, while the slide the audience sees never does.`,
      "page transition <page-ref> <name> sets the page's, and none clears it so slides cut. frame transition <frame-ref> <name> sets a frame's, and page clears it so the frame takes its page's. Both take --ms and --direction, refuse usage on a name that is neither built in nor the project's own with the known names in the error's details, and write only layout.json.",
      `A step is an element present mode holds back until a press reveals it, marked by three attributes on that element and nothing else. ${STEP_ATTRIBUTES.step}="<n>" is a positive integer, and steps show in number order with equal numbers together and gaps closed. ${STEP_ATTRIBUTES.effect} is one of ${STEP_EFFECTS.join(', ')}, defaulting to appear. ${STEP_ATTRIBUTES.start} is one of ${STEP_STARTS.join(', ')}, defaulting to click, where with shows the step beside the one before it and after shows it once that one finishes. Set them with edit --attr. Edit, Play, capture, and an exported PNG show every step.`,
    ],
    controls: [
      `A control is an ordinary range or number input in a frame carrying ${BINDS_ATTRIBUTE}="<selector> <--property>" and ${UNIT_ATTRIBUTE}="<unit>". The selector names the element it tunes and may hold spaces, the last word is a custom property the target's own CSS reads through var(), and the unit follows the control's value, so a value of 130 under ${UNIT_ATTRIBUTE}="%" sets 130%. The frame holds no script for it.`,
      "In Play, moving a control sets its property inline on the target at once and writes nothing. Keep values writes each moved control's value attribute and one style attribute per target holding its properties, as one undo step. Reset, or leaving the frame or Play without keeping, puts the file's values back.",
      'An export, a thumbnail, a presented slide, and the phone link hide every control, a label holding one, and a container holding only controls and their labels. The canvas and capture show them.',
      `check reports binding-target at warning when a ${BINDS_ATTRIBUTE} misses its selector or property, sets a property that is not custom, or matches no element, as after a rewrite renames the target's id.`,
    ],
    kits: [
      `A kit is a folder of plain files: ${KIT_FILE} naming it, ${TOKEN_FILE} with a light and a dark block, ${KIT_SHEET} of component styles, ${KIT_NOTE} saying what to reach for, and a ${KIT_PAGE} page of sample frames. The tool ships ${SHIPPED_KITS.join(', ')}, and a board keeps the kits saved from its projects in ${KITS_FOLDER}/.`,
      `kit add copies the kit's folder into the project's ${ASSETS_FOLDER}/${PROJECT_KITS}/<kit>/ and writes no token sheet and no page, so a project holds several kits beside its own look. It refuses name-taken where the project already holds a kit by that name, and accepts --replace without acting on it. kit remove deletes that folder and clears the kit from every frame naming it, refusing kit-not-found for a kit the project lacks. kit save refuses name-taken for a name a shipped or saved kit holds, and tokens-not-found for a project no sheet reaches.`,
      `A frame draws with a kit only where its ${LAYOUT_FILE} entry names one under kit. frame kit <frame-ref> <kit> sets it and frame kit <frame-ref> ${NO_KIT_WORD} clears it, each writing ${LAYOUT_FILE} alone, and it refuses kit-not-found for a kit the project lacks. The frame file never names the kit, so rewriting the frame keeps it. list --json answers kit on each frame naming one and kits on each project, with every kit's name, title, and frameCount.`,
      `The server imports ${ASSETS_FOLDER}/${PROJECT_KITS}/<kit>/${TOKEN_FILE} then ${KIT_SHEET} into a frame naming that kit, after the project sheet, and check reads the same sheets. A plain frame beside it loads neither, and a frame naming a kit whose folder is gone loads none and keeps the name. Read ${ASSETS_FOLDER}/${PROJECT_KITS}/<kit>/${KIT_NOTE} and the sample frames under its ${KIT_PAGE}/ folder before drawing a frame that names it.`,
      `A project holding ${ASSETS_FOLDER}/${KIT_ASSETS}/${KIT_FILE} took its kit before a frame could name one, and every frame in it still loads ${ASSETS_FOLDER}/${KIT_ASSETS}/${KIT_SHEET} after the project sheet. An ${ASSETS_FOLDER}/${KIT_ASSETS}/ holding no ${KIT_FILE} is loaded into no frame, so a frame using it links it itself.`,
    ],
    images: [
      `image find searches Openverse under ${DEFAULT_LICENSES.join(', ')} alone, and --credited widens it to ${CREDITED_LICENSES.join(', ')}. It lists up to ${PAGE_SIZE} results numbered from 1 and writes nothing. --save <number> runs the search again and saves that result, and --save <id> saves the Openverse image with that id with no search, refusing result-not-found for an id under a license the flags do not allow. Openverse allows an address 200 anonymous requests a day, so save by id.`,
      `image generate runs on the provider --provider names, else the first whose key is set, in the order ${PROVIDERS.map((each) => `${each.name} (${each.model}, ${each.keyEnv})`).join(', ')}. A key set to an empty string reads as unset. comfyui's key is the address of a ComfyUI server the developer runs, charging nothing, and it runs the bundled FLUX.2 klein 4B workflow, or with --workflow <file> a workflow exported from ComfyUI in the API format, its {{prompt}} filled with the prompt and any {{width}}, {{height}}, and {{seed}} with typed numbers. --workflow runs on comfyui alone and refuses usage beside another --provider, or for a file holding no {{prompt}}, before any request. Each local run draws a new seed, which the license file records with the workflow named. priceUsd is the estimate before the call, and --dry-run answers it with saved null and makes no request. Without --dry-run the call spends on that key at once, since no verb prompts. No ready provider refuses no-provider with the keys in the details, and a failed call refuses provider-failed with the provider's status and never the key.`,
      `A saved image lands in the project's ${ASSETS_FOLDER}/ under the --name stem, else the query or prompt as a lowercase dashed name, taking the first free -2, -3, and onward. Its license file lands beside it as <file>${LICENSE_FILE_SUFFIX}, the licenseFile record, saying where it came from. A download is held whole, at most ${DOWNLOAD_LIMIT / 1024 / 1024} MiB, before anything is written, so a failed one leaves no file, and the Assets tab never draws a license file as its own tile.`,
      'image doctor reports the GPU nvidia-smi names, whether a ComfyUI server answers at FRAMEBOARD_COMFYUI_URL or the default address, and each key as set or unset, never its value. It installs and spends nothing.',
      'image free asks that ComfyUI server to unload its models and free their memory, which the model holds between runs so the next one starts warm. Run it once a batch of generations ends, and the next generate loads the model again.',
      `A frame links a saved image as ../${ASSETS_FOLDER}/<path>, never by its web address, since a frame loads nothing over the network.`,
    ],
    models: [
      `A frame shows a 3D model through one <${VIEWER_TAG} src="../${ASSETS_FOLDER}/<file>.glb" alt=""> element, sized by its own width and height as an image is. It reads .glb and .gltf alone, and a .gltf carries its buffers and images inside itself. A drop refuses ${FOREIGN_MODELS.join(', ')}, so export any of those from Blender through File, Export, glTF 2.0 as a glTF Binary (.glb).`,
      `The element draws only in a frame whose head loads the viewer, as ${VIEWER_SCRIPT}. Placing a model on the board copies ${VIEWER_FILE} into the project's ${ASSETS_FOLDER}/ once and adds that tag to a head loading no viewer, and removing the last model leaves both. The file ships with the tool at ${shippedViewerPath()}, so copy it to the project's ${ASSETS_FOLDER}/${VIEWER_FILE} before writing the element in a project that holds none. A frame loads nothing over the network, so never link the viewer from a CDN.`,
      `Every staging control is an attribute on the element, set with edit --attr. camera-orbit="<theta>deg <phi>deg <radius>" places the camera, across and then down from the top, and defaults to 0deg 75deg auto. The viewer holds the camera inside max-camera-orbit, so state both once the radius passes the model's own framing, as camera-orbit="30deg 70deg 6m" max-camera-orbit="auto auto 6m". orientation="<roll>deg <pitch>deg <yaw>deg" turns the model itself, scale="<x> <y> <z>" sizes it, animation-name picks one of its clips, and autoplay starts it. The board's Model section writes these same attributes, the angle as both orbit attributes in one undo step, and a double-click on a selected model turns it by drag.`,
      `check reports missing-file at error for a ${VIEWER_TAG} whose ${MODEL_LOADS.join(', ')} names no file, as it does for the viewer script. capture waits for each model to draw inside the frame's load budget and holds its clip at the start, and --at seeks every clip to that moment, so two captures match. A model that fails to load, or is still loading when the budget ends, never refuses: the image lists it under models with state error or pending.`,
      `model find searches ${POLYHAVEN_SOURCE.name}'s CC0 models, which ask no credit, and writes nothing. ${POLYHAVEN_SOURCE.name} has no search, so it reads the whole list in one request and ranks it here: by how many distinct query words match a word of the name, the tags, or the categories, then by download count, then by id, listing up to ${RESULT_LIMIT} numbered from 1 and none for a query matching nothing. Its results and human output name ${POLYHAVEN_SOURCE.name}, as its terms ask of any surface showing its content. --save <number> runs the search again, and --save <id> saves that ${POLYHAVEN_SOURCE.name} model with no search. A saved model is one .glb packed from the glTF, its buffer, and its textures, at ${DEFAULT_MODEL_SIZE} textures unless --size names one of ${MODEL_SIZES.join(', ')}, refusing usage with the sizes it offers for one the model lacks. A larger size weighs more, about 1 MB at 1k and 40 MB at 8k for a stool. Every file is held whole before anything is written, and its license file records the authors and the model's page.`,
    ],
    assets: `A frame links files in its own page folder or in its project's ${ASSETS_FOLDER}/ folder. frame duplicate and frame move carry the ${FRAME_EXTENSION} file alone, so keep files shared between frames or pages in ${ASSETS_FOLDER}/.`,
    look: [
      `The board's ${TOKEN_FILE} holds the design tokens every project shares, and a project's own ${TOKEN_FILE} overrides it. serve --tokens <path> stands in for the board's sheet, resolved against the working folder and recorded as tokens in ${RUN_FOLDER}/${ADDRESS_FILE} while that server runs.`,
      `The server puts one <style ${LOOK_MARKER}> first in each frame's head, importing the faces, then the board sheet, then the project sheet, then the sheets of the kit the frame names, so a frame's own sheets win. The file on disk never changes, and a count of a live frame's elements skips elements carrying ${LOOK_MARKER}.`,
      `Every frame can use the families ${FACES.map((face) => face.family).join(', ')} with no link of its own. A project adds other faces in its ${ASSETS_FOLDER}/ folder.`,
      "The board sets data-theme and color-scheme to light or dark on each frame's root, with the class dark or light, so define both themes through [data-theme], .dark, prefers-color-scheme, or light-dark(), or take every color from token variables. Never paste a token sheet into a frame.",
      `A change to a token sheet reloads every frame it reaches.`,
      "A style attribute outranks every rule, and may hold a value the developer set by hand, so read it before changing a rule the element matches. While a server runs, check warns as outranked when an agent's write changed a rule in the frame's own <style> that an unchanged style attribute also sets.",
    ],
  }
}
