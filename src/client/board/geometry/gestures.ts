import { drag } from 'd3-drag'
import { pointer, select as d3Select } from 'd3-selection'
import { zoomTransform } from 'd3-zoom'

import { liveStore } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import type {
  ElementSize,
  ResizeRead,
} from '@/shared/frame-bridge/live-element'
import type { FrameRecord, SectionRecord } from '@/shared/records/list'

import { splitAt } from '../changes/compare'
import {
  groupBounds,
  groupBox,
  type GroupMember,
  type MemberEdit,
  moveMembers,
  scaleMembers,
  scalesAsGroup,
} from '../element/group'
import { heldOutline, holdOutline } from '../element/held'
import {
  elementsIn,
  onBareFrame,
  pickElementRead,
  type Touching,
} from '../element/pick'
import {
  cornerSize,
  dragSize,
  type ElementResize,
  type GroupEdit,
  type PlacedMove,
  type PlacedOffsets,
  placedOffsets,
  shownGroup,
  shownResize,
  startElementResize,
  startGroupEdit,
  startPlacedMove,
} from '../element/resize'
import { readTree, treeOf } from '../element/tree'
import { openFindings } from '../findings/open'
import { reportRefusal } from '../left-panel/page-actions'
import { type ModeStore, modeStore } from '../mode'
import { cornerOf, refreshCorners, subscribeCorners } from '../pin-corner'
import { type DropGhost, overFrame } from '../place/asset-drop'
import { carriedStore } from '../place/tool'
import { elementGhost, extractElement, moveElement } from '../place/write'
import { endPreview } from '../preview/store'
import {
  clear,
  type ElementKey,
  select,
  selectedElements,
  selectElement,
  selectElements,
  type SelectionStore,
  selectionStore,
  selectSection,
  toggle,
  toggleElement,
} from '../selection'
import { canvasView } from '../view'
import { boundsOf, type Box, type Point, sameBox } from './box'
import { drawGuides, drawMarquee, drawMove, drawResize, drawRest } from './draw'
import {
  badgeAt,
  cornerAt,
  cornerCursor,
  drawnAt,
  frameAt,
  framesIn,
  ghostAt,
  onOutline,
  selectedElementBox,
  selectedElementBoxes,
  selectedGroupBox,
} from './hit'
import { type Corner, resizeBox, scaleBoxes } from './resize'
import { SNAP_DISTANCE, snapMove, snapResize } from './snap'
import { withDrawn, withPending, writeBoxes } from './write'

/** How far, in screen pixels, a press travels before it counts as a drag rather than a click. */
export const CLICK_DISTANCE = 3

/**
 * How long a click waits before revealing the frame it selected, the common
 * default double-click interval, so a double-click's second press lands
 * first and drops the reveal.
 */
export const REVEAL_DELAY_MS = 500

/** What the gestures act on, read fresh at each press. */
export interface GestureTarget {
  /** The element `d3-zoom` holds, whose transform maps the screen to the canvas. */
  viewport: HTMLElement
  /** The zoomed layer holding the frames and the overlay. */
  layer: HTMLElement
  /** The page's ref, which a selection is made on. */
  page: string
  /** The page's shown frames, bottom to top. */
  frames: () => readonly FrameRecord[]
  /** The page's sections, bottom to top, absent on a surface that draws none. */
  sections?: () => readonly SectionRecord[]
  /**
   * Every frame on the page, hidden ones included, which a section move
   * carries since a hidden frame stays in its section. `frames` when absent.
   */
  pageFrames?: () => readonly FrameRecord[]
}

export interface GestureStores {
  selection: SelectionStore
  mode: ModeStore
  canWrite: () => boolean
  write: typeof writeBoxes
  /** Copies the frames shifted by `offset` from their own boxes, an Alt-drag's drop. */
  duplicate: Structure['duplicateFrames']
  /** Opens a frame's findings popover. */
  openFindings: (ref: string) => void
  /** Moves a compared frame's split divider to a screen x. */
  splitAt: (clientX: number) => void
  /** Moves the selected element into the gap under a canvas point, a drag of it released there. */
  moveElement: typeof moveElement
  /** Moves the selected element into a frame of its own at a box, a drag of it released over bare canvas. */
  extractElement: typeof extractElement
  /** How the selected element takes a corner resize, null when it takes none. */
  resizeOf: typeof shownResize
  /** Starts a corner drag of the selected element, null when its frame is held. */
  resizeElement: typeof startElementResize
  /** The offsets the selected element holds when it is placed, else null. */
  placedOffsets: typeof placedOffsets
  /** Starts a drag of the selected placed element, null when its frame is held. */
  movePlaced: typeof startPlacedMove
  /** Several selected elements as a group drag reads them at the press, null while their frame shows other bytes. */
  groupOf: typeof shownGroup
  /** Starts a drag of several selected elements, null when their frame is held. */
  editGroup: typeof startGroupEdit
  /** The element a Shift-click lands on, read once its frame's tree is held, else null. */
  pickElement: (
    layer: HTMLElement,
    frames: readonly FrameRecord[],
    at: Point,
  ) => Promise<ElementKey | null>
  /**
   * Whether a press inside a selected frame lands on its bare body, which a
   * drag marquees, false at once where the board alone can tell, as for a
   * frame whose tree is not held or holds nothing.
   */
  onBareFrame: (
    layer: HTMLElement,
    frames: readonly FrameRecord[],
    at: Point,
  ) => false | Promise<boolean>
  /** Reads a frame's element boxes once, answering which a marquee touches, with their boxes on the canvas. */
  elementsIn: (layer: HTMLElement, frame: FrameRecord) => Promise<Touching>
}

const STORES: GestureStores = {
  selection: selectionStore,
  mode: modeStore,
  canWrite: () => liveStore.getState().canWrite,
  write: writeBoxes,
  duplicate: structure.duplicateFrames,
  openFindings,
  splitAt,
  moveElement,
  extractElement,
  resizeOf: shownResize,
  resizeElement: startElementResize,
  placedOffsets,
  movePlaced: startPlacedMove,
  groupOf: shownGroup,
  editGroup: startGroupEdit,
  pickElement: (layer, frames, at) =>
    pickElementRead(layer, frames, at, readTree),
  onBareFrame: (layer, frames, at) => {
    const ref = frames.find(({ box }) => inBox(box, at))?.ref
    const tree = ref ? treeOf(ref) : null
    return tree && tree.elements.length > 0
      ? onBareFrame(layer, frames, at, tree)
      : false
  },
  elementsIn: (layer, frame) => elementsIn(layer, frame, treeOf(frame.ref)),
}

/** The drags that move or resize a selected element's outline while it carries. */
const CARRIES: ReadonlySet<Gesture['kind']> = new Set([
  'placed',
  'carry',
  'group',
  'group-resize',
  'element-resize',
])

type Gesture =
  | {
      kind: 'press'
      frame: FrameRecord
      shift: boolean
      /** Whether it landed on the selected frame's bare body, where a drag marquees its elements, null until the frame answers. */
      inner: boolean | null
      /** Whether the press selected the frame, which was not selected before it. */
      fresh: boolean
    }
  /** A marquee inside one selected frame, selecting the elements it touches. */
  | {
      kind: 'inner-marquee'
      frame: FrameRecord
      base: readonly ElementKey[]
      /** Which elements a rectangle touches, null until the frame's boxes answer. */
      touching: Touching | null
      boxes: Promise<Touching>
    }
  /** A press on a frame's findings badge, which opens its list on release and selects nothing. */
  | { kind: 'badge'; ref: string }
  /** A press on a button in a frame's label, clicked on release, selecting nothing. */
  | { kind: 'control'; element: HTMLElement }
  /** A drag on a compared frame's split divider, which moves it and selects nothing. */
  | { kind: 'divider' }
  | { kind: 'marquee'; shift: boolean; base: readonly string[] }
  | { kind: 'resize'; corner: Corner; boxes: Record<string, Box>; bounds: Box }
  | { kind: 'move'; boxes: Record<string, Box>; bounds: Box }
  /**
   * A press on the selected element, which a drag turns into a move of it
   * and a plain click keeps. `frame` holds a press inside its box, which a
   * Shift-click toggles, and is null on its outline.
   */
  | {
      kind: 'element'
      key: ElementKey
      frame: FrameRecord | null
      shift: boolean
      /** The offsets a placed element holds, whose drag moves them rather than carrying it. */
      placed: PlacedOffsets | null
      /** Where it draws, null while nothing has measured it. */
      box: Box | null
    }
  /** A drag of the selected placed element, written as its offsets on release inside a frame. */
  | {
      kind: 'placed'
      key: ElementKey
      box: Box | null
      from: PlacedOffsets
      move: PlacedMove
      to: PlacedOffsets | null
    }
  /** A drag carrying the selected element, dropped into the gap under release, or over bare canvas into a frame of its own. */
  | { kind: 'carry'; key: ElementKey; box: Box | null }
  /** A press on a corner of several selected elements' box, which a drag turns into a scale of them. */
  | { kind: 'group-corner'; corner: Corner }
  /** A drag of several selected elements, each free one moved as far, written as one step on release. */
  | {
      kind: 'group'
      members: readonly GroupMember[]
      edit: GroupEdit
      edits: readonly MemberEdit[]
      moved: boolean
    }
  /** A corner drag of several selected elements' box, scaling each, written as one step on release. */
  | {
      kind: 'group-resize'
      corner: Corner
      members: readonly GroupMember[]
      bounds: Box
      edit: GroupEdit
      edits: readonly MemberEdit[]
      moved: boolean
    }
  /** A press on a corner of an element that takes a resize, which a drag turns into one. */
  | {
      kind: 'corner'
      key: ElementKey
      corner: Corner
      box: Box
      read: ResizeRead
    }
  /** A corner drag of the selected element, written as its size on release. */
  | {
      kind: 'element-resize'
      corner: Corner
      box: Box
      read: ResizeRead
      resize: ElementResize
      size: ElementSize | null
    }
  /** A press on a section's name, which selects it and a drag turns into a move of it. */
  | { kind: 'section'; section: SectionRecord }
  /** A drag carrying a section's box and every frame it holds, written as one step. */
  | {
      kind: 'section-move'
      section: SectionRecord
      boxes: Record<string, Box>
    }
  /** A drag on a corner of the selected section, resizing its box and leaving its frames. */
  | {
      kind: 'section-resize'
      section: SectionRecord
      corner: Corner
      moved: boolean
    }
  /** A drag that may not change anything, such as one on a locked frame. */
  | { kind: 'none' }

/** A corner mark that takes a press, and what the press needs from it. */
type Mark =
  | {
      kind: 'element'
      key: ElementKey
      corner: Corner
      box: Box
      read: ResizeRead
    }
  | { kind: 'section'; section: SectionRecord; corner: Corner }
  | { kind: 'group'; corner: Corner }
  | { kind: 'frame'; corner: Corner }

/**
 * Binds the Move tool's gestures on `d3-drag` beside the viewport's `d3-zoom`.
 * A drag writes the frames and overlay from its handler and sends one write on
 * release, and `cursorAt` answers the resize cursor a position takes.
 */
export function attachGestures(
  hit: HTMLElement,
  target: GestureTarget,
  stores: GestureStores = STORES,
): {
  detach: () => void
  cursorAt: (event: MouseEvent) => ReturnType<typeof cornerCursor> | null
} {
  const { selection, mode } = stores
  let gesture: Gesture = { kind: 'none' }
  let from: Point = { x: 0, y: 0 }
  let pressed = { x: 0, y: 0 }
  let moved = false
  // Counts presses, so a Shift-click waiting on a tree yields to any made after it.
  let presses = 0
  // The press took focus out of an inspector field, so a click only leaves it.
  let leaving = false
  let last: MouseEvent | null = null
  let elements = new Map<string, HTMLElement>()

  const overlay = () =>
    target.layer.querySelector<HTMLElement>('[data-overlay]')
  // `data-carrying` gives the outline its own layer mid-drag alone, since one blurs it at rest.
  const markCarrying = (on: boolean) => {
    if (on) target.layer.dataset.carrying = ''
    else delete target.layer.dataset.carrying
  }
  const shiftElementOutline = (dx: number, dy: number) => {
    for (const outline of target.layer.querySelectorAll<HTMLElement>(
      '[data-element-selection]',
    )) {
      outline.style.transform =
        dx === 0 && dy === 0 ? '' : `translate(${dx}px, ${dy}px)`
    }
  }
  // `translate` composes with the pin's own centering and zoom `transform`.
  const shiftPins = (refs: readonly string[], dx: number, dy: number) => {
    const pins =
      target.viewport.querySelectorAll<HTMLElement>('[data-note-frame]')
    for (const pin of pins) {
      const moves =
        refs.includes(pin.dataset.noteFrame ?? '') && (dx !== 0 || dy !== 0)
      pin.style.translate = moves ? `${dx}px ${dy}px` : ''
    }
    // A drag's end puts every pin back, so each reads its element's corner where the drag left it.
    if (refs.length === 0) refreshCorners()
  }
  // A placed element's drag carries the pins pinned on it, so none is left behind.
  const shiftElementPins = (key: ElementKey, dx: number, dy: number) => {
    const pins = target.viewport.querySelectorAll<HTMLElement>(
      `[data-note-frame="${CSS.escape(key.frame)}"][data-note-element="${key.index}"]`,
    )
    for (const pin of pins) {
      pin.style.translate = dx !== 0 || dy !== 0 ? `${dx}px ${dy}px` : ''
    }
  }
  /** The boxes a frame resize last drew, which a corner the frame pushes after reflowing places the pins in again. */
  let reflowing: Readonly<Record<string, Box>> | null = null
  // A pin moves by `cornerOf`'s gap, so it follows its element as the frame reflows.
  const followPins = (boxes: Readonly<Record<string, Box>>) => {
    const pins =
      target.viewport.querySelectorAll<HTMLElement>('[data-note-frame]')
    const devices = new Map(
      target.frames().map((frame) => [frame.ref, frame.device]),
    )
    for (const pin of pins) {
      const ref = pin.dataset.noteFrame ?? ''
      const box = boxes[ref]
      if (!box) {
        pin.style.translate = ''
        continue
      }
      const element = pin.dataset.noteElement
      const at = cornerOf(
        { ref, box, device: devices.get(ref) },
        element === undefined ? null : Number(element),
        target.layer,
      )
      const dx = at.x - parseFloat(pin.style.left)
      const dy = at.y - parseFloat(pin.style.top)
      pin.style.translate = dx !== 0 || dy !== 0 ? `${dx}px ${dy}px` : ''
    }
  }
  const zoom = () => zoomTransform(target.viewport).k
  const toCanvas = (event: MouseEvent): Point => {
    const [x, y] = pointer(event, target.viewport)
    const { x: tx, y: ty, k } = zoomTransform(target.viewport)
    return { x: (x - tx) / k, y: (y - ty) / k }
  }
  const selected = (frames: readonly FrameRecord[]) => {
    const { page, frames: refs } = selection.getState()
    return page === target.page
      ? frames.filter((frame) => refs.includes(frame.ref))
      : []
  }
  const boxesOf = (frames: readonly FrameRecord[]) =>
    Object.fromEntries(frames.map((frame) => [frame.ref, frame.box]))
  /**
   * The frame a release of a dragged element makes, which is over bare canvas
   * alone, never over a panel that hides the canvas under it.
   */
  const frameMadeAt = (
    event: MouseEvent,
    { key, box }: { key: ElementKey; box: Box | null },
  ): DropGhost | null => {
    // A key's own event has no target, so it reads the pointer's last.
    if (!box || (event.target ?? last?.target) !== hit) return null
    const all = withDrawn(target.pageFrames?.() ?? target.frames())
    const point = toCanvas(event)
    if (overFrame(all, point)) return null
    const x = box.x + point.x - from.x
    const y = box.y + point.y - from.y
    return elementGhost(key, { ...box, x, y }, all)
  }
  const sectionNamed = (name: string | undefined) =>
    target.sections?.().find((section) => section.name === name)
  const sectionElement = (name: string) =>
    target.layer.querySelector<HTMLElement>(
      `[data-section="${CSS.escape(name)}"]`,
    )
  const placeSection = (name: string, box: Box) => {
    const element = sectionElement(name)
    if (!element) return
    Object.assign(element.style, {
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    })
  }

  /** The press a label control, a split divider, or a findings badge takes, ahead of any mark. */
  const chromeAt = (event: MouseEvent): Gesture | null => {
    const control = drawnAt(target.layer, '[data-label-control]', event)
    if (control) return { kind: 'control', element: control }
    if (drawnAt(target.layer, '[data-compare-divider]', event)) {
      return { kind: 'divider' }
    }
    const badge = badgeAt(target.layer, event)
    return badge ? { kind: 'badge', ref: badge } : null
  }

  // Only a resizable element answers, and frame handles are hidden while one is selected.
  const markAt = (
    event: MouseEvent,
    point: Point,
    drawn: readonly FrameRecord[],
  ): Mark | null => {
    const state = selection.getState()
    const element = state.element
    // Several draw their marks on the box around them, while a corner drag scales them.
    const group =
      selectedElements(state).length > 1 ? selectedGroupBox(target.layer) : null
    if (group) {
      const corner = group.scales ? cornerAt(group.box, point, zoom()) : null
      if (corner) return { kind: 'group', corner }
      if (onOutline(group.box, point, zoom()) || inBox(group.box, point)) {
        return null
      }
    }
    const outline =
      element && selectedElements(state).length <= 1
        ? selectedElementBox(target.layer)
        : null
    if (element && outline) {
      const corner = cornerAt(outline, point, zoom())
      const read = corner ? stores.resizeOf(target.layer, element) : null
      if (corner && read) {
        return { kind: 'element', key: element, corner, box: outline, read }
      }
      if (onOutline(outline, point, zoom()) || inBox(outline, point)) {
        return null
      }
    }
    // The selected section's corners sit over its frames, as a frame's handles do.
    const held = sectionNamed(
      selection.getState().page === target.page
        ? selection.getState().section
        : undefined,
    )
    const sectionCorner = held
      ? drawnAt(target.layer, '[data-section-corner]', event)
      : null
    if (held && sectionCorner) {
      return {
        kind: 'section',
        section: held,
        corner: sectionCorner.dataset.sectionCorner as Corner,
      }
    }
    const shown = boundsOf(selected(drawn).map((frame) => frame.box))
    const corner = shown && !element ? cornerAt(shown, point, zoom()) : null
    return corner ? { kind: 'frame', corner } : null
  }

  const moveToolOn = () => {
    const { mode: current, tool, spacePan } = mode.getState()
    return current === 'edit' && tool === 'move' && !spacePan
  }

  const cursorAt = (event: MouseEvent) => {
    // A drag outruns the marks' reach, so it holds the corner it took.
    if (last && moved) {
      return 'corner' in gesture ? cornerCursor(gesture.corner) : null
    }
    if (!moveToolOn() || !stores.canWrite()) return null
    // A card over the mark takes the press, so its move bubbles with nothing to resize.
    if (event.target !== hit) return null
    const mark = markAt(event, toCanvas(event), withDrawn(target.frames()))
    if (!mark) return null
    // `begin` turns a press on a locked frame's handle into no drag.
    if (
      mark.kind === 'frame' &&
      selected(target.frames()).some((f) => f.locked)
    ) {
      return null
    }
    return chromeAt(event) ? null : cornerCursor(mark.corner)
  }

  const start = (event: MouseEvent) => {
    // A press hits frames as drawn, while a drag writes from their unpreviewed boxes.
    const drawn = withDrawn(target.frames())
    const point = toCanvas(event)
    from = point
    presses += 1
    reflowing = null
    pressed = { x: event.clientX, y: event.clientY }
    moved = false
    last = event
    const field = inspectorField()
    leaving = field !== null
    // Blurring here applies the field's edit before any drag writes.
    field?.blur()
    const chrome = chromeAt(event)
    if (chrome) {
      gesture = chrome
      if (chrome.kind === 'divider') stores.splitAt(event.clientX)
      return
    }
    const mark = markAt(event, point, drawn)
    if (mark?.kind === 'element') {
      gesture = { ...mark, kind: 'corner' }
      return
    }
    if (mark?.kind === 'group') {
      gesture = { kind: 'group-corner', corner: mark.corner }
      return
    }
    const state = selection.getState()
    const element = state.element
    const members = selectedElements(state)
    const several = members.length > 1
    // A drag on one of several moves every free member, else that one alone.
    const member = several
      ? selectedElementBoxes(target.layer)
          .reverse()
          .find(({ box }) => inBox(box, point) || onOutline(box, point, zoom()))
      : undefined
    const memberKey = member
      ? members.find(({ index }) => index === member.index)
      : undefined
    if (member && memberKey) {
      gesture = {
        kind: 'element',
        key: memberKey,
        frame: onOutline(member.box, point, zoom())
          ? null
          : frameAt(drawn, point, zoom()),
        shift: event.shiftKey,
        placed: stores.placedOffsets(target.layer, memberKey),
        box: member.box,
      }
      return
    }
    // The bare space inside several's box is theirs too, as a design tool's selection is.
    const group = several ? selectedGroupBox(target.layer) : null
    if (element && group && inBox(group.box, point)) {
      gesture = {
        kind: 'element',
        key: element,
        frame: frameAt(drawn, point, zoom()),
        shift: event.shiftKey,
        placed: null,
        box: selectedElementBox(target.layer),
      }
      return
    }
    const outline =
      element && !several ? selectedElementBox(target.layer) : null
    if (element && outline) {
      const edge = onOutline(outline, point, zoom())
      if (edge || inBox(outline, point)) {
        const frame = edge ? null : frameAt(drawn, point, zoom())
        gesture = {
          kind: 'element',
          key: element,
          frame,
          shift: event.shiftKey,
          placed: stores.placedOffsets(target.layer, element),
          box: outline,
        }
        return
      }
    }
    if (mark?.kind === 'section') {
      gesture = { ...mark, kind: 'section-resize', moved: false }
      return
    }
    const chosen = selected(withPending(target.frames()))
    const bounds = boundsOf(chosen.map((frame) => frame.box))
    if (bounds && mark?.kind === 'frame') {
      gesture = {
        kind: 'resize',
        corner: mark.corner,
        boxes: boxesOf(chosen),
        bounds,
      }
      return
    }
    // A selected frame's or section's corner over a ghost keeps the press.
    const ghost = ghostAt(target.layer, drawn, point)
    if (ghost) {
      selectElement(selection, target.page, ghost.key)
      gesture = {
        kind: 'element',
        key: ghost.key,
        frame: null,
        shift: event.shiftKey,
        placed: stores.placedOffsets(target.layer, ghost.key),
        box: ghost.box,
      }
      return
    }
    // Only the name is a handle, so a press on the plate marquees across the section.
    const label = drawn.some((shown) => inBox(shown.box, point))
      ? null
      : topmost(target.layer, '[data-section-label]', event)
    const section = sectionNamed(label?.dataset.sectionLabel)
    if (section) {
      if (!leaving) selectSection(selection, target.page, section.name)
      gesture = { kind: 'section', section }
      return
    }
    const frame = frameAt(drawn, point, zoom())
    if (frame) {
      // Selects at once so a drag moves it, unless the press only leaves a field.
      const unselected = !chosen.some(({ ref }) => ref === frame.ref)
      if (!leaving && !event.shiftKey && unselected) {
        select(selection, target.page, [frame.ref])
      }
      const press: Gesture = {
        kind: 'press',
        frame,
        shift: event.shiftKey,
        inner: false,
        fresh: unselected,
      }
      gesture = press
      const bare =
        chosen.length === 1 && !unselected && !leaving
          ? stores.onBareFrame(target.layer, drawn, point)
          : false
      if (bare !== false) {
        press.inner = null
        // A later press drops the answer, so it never decides another drag.
        void bare.then((answer) => {
          if (gesture === press) press.inner = answer
        })
      }
      return
    }
    gesture = {
      kind: 'marquee',
      shift: event.shiftKey,
      base: event.shiftKey ? selection.getState().frames : [],
    }
  }

  /** Turns a press into the drag it starts once it passes the click distance. */
  const begin = () => {
    if (gesture.kind === 'corner') {
      const resize = stores.canWrite()
        ? stores.resizeElement(target.page, gesture.key, gesture.read)
        : null
      gesture = resize
        ? { ...gesture, kind: 'element-resize', resize, size: null }
        : { kind: 'none' }
      return
    }
    if (gesture.kind === 'group-corner') {
      const keys = selectedElements(selection.getState())
      const members = stores.groupOf(target.layer, keys)
      const bounds = members ? groupBounds(members) : null
      const edit =
        members && bounds && scalesAsGroup(members) && stores.canWrite()
          ? stores.editGroup(target.page, keys)
          : null
      gesture =
        members && bounds && edit
          ? {
              kind: 'group-resize',
              corner: gesture.corner,
              members,
              bounds,
              edit,
              edits: [],
              moved: false,
            }
          : { kind: 'none' }
      return
    }
    if (
      gesture.kind === 'element' &&
      selectedElements(selection.getState()).length > 1
    ) {
      const keys = selectedElements(selection.getState())
      const members = stores.groupOf(target.layer, keys)
      if (members?.some(({ placed }) => placed !== null)) {
        const edit = stores.canWrite()
          ? stores.editGroup(target.page, keys)
          : null
        gesture = edit
          ? { kind: 'group', members, edit, edits: [], moved: false }
          : { kind: 'none' }
        return
      }
      // With none free there is no group move, so the drag carries the one pressed.
      selectElement(selection, target.page, gesture.key)
    }
    if (gesture.kind === 'element' && gesture.placed) {
      const move = stores.canWrite()
        ? stores.movePlaced(target.page, gesture.key)
        : null
      gesture = move
        ? {
            kind: 'placed',
            key: gesture.key,
            box: gesture.box,
            from: gesture.placed,
            move,
            to: null,
          }
        : { kind: 'none' }
      return
    }
    if (gesture.kind === 'element') {
      gesture = stores.canWrite()
        ? { kind: 'carry', key: gesture.key, box: gesture.box }
        : { kind: 'none' }
      if (gesture.kind === 'carry') {
        carriedStore.setState({ carried: gesture.key })
      }
      return
    }
    if (gesture.kind === 'section') {
      const { section } = gesture
      const members = withPending(
        target.pageFrames?.() ?? target.frames(),
      ).filter((frame) => section.frames.includes(frame.name))
      gesture =
        stores.canWrite() && members.every(({ locked }) => !locked)
          ? { kind: 'section-move', section, boxes: boxesOf(members) }
          : { kind: 'none' }
      if (gesture.kind === 'section-move') {
        selectSection(selection, target.page, section.name)
        endPreview(Object.keys(gesture.boxes))
        elements = framesElements(Object.keys(gesture.boxes))
      }
      return
    }
    if (gesture.kind === 'section-resize') {
      if (!stores.canWrite()) gesture = { kind: 'none' }
      return
    }
    if (gesture.kind !== 'press' && gesture.kind !== 'resize') return
    if (gesture.kind === 'press' && gesture.inner && !last?.altKey) {
      const marquee: Gesture = {
        kind: 'inner-marquee',
        frame: gesture.frame,
        base: gesture.shift ? selectedElements(selection.getState()) : [],
        touching: null,
        boxes: stores.elementsIn(target.layer, gesture.frame),
      }
      gesture = marquee
      void marquee.boxes.then((touching) => {
        marquee.touching = touching
        if (gesture === marquee && last) update(last)
      })
      return
    }
    if (gesture.kind === 'press') {
      const { frame, shift } = gesture
      const unselected = !selection.getState().frames.includes(frame.ref)
      if (shift && unselected) toggle(selection, target.page, frame.ref)
      else if (leaving && unselected)
        select(selection, target.page, [frame.ref])
      const chosen = selected(withPending(target.frames()))
      const bounds = boundsOf(chosen.map(({ box }) => box))
      gesture =
        bounds && chosen.every(({ locked }) => !locked) && stores.canWrite()
          ? { kind: 'move', boxes: boxesOf(chosen), bounds }
          : { kind: 'none' }
    } else {
      const refs = Object.keys(gesture.boxes)
      const locked = target
        .frames()
        .some((frame) => refs.includes(frame.ref) && frame.locked)
      if (locked || !stores.canWrite()) gesture = { kind: 'none' }
    }
    if (gesture.kind === 'move' || gesture.kind === 'resize') {
      // Previews end as the drag starts, so frames never jump on release.
      endPreview(Object.keys(gesture.boxes))
      elements = framesElements(Object.keys(gesture.boxes))
    }
  }

  const framesElements = (refs: readonly string[]) =>
    new Map(
      refs.flatMap((ref) => {
        const element = target.layer.querySelector<HTMLElement>(
          `[data-frame="${CSS.escape(ref)}"]`,
        )
        return element ? [[ref, element] as const] : []
      }),
    )

  const update = (event: MouseEvent) => {
    const root = overlay()
    if (!root) return
    const point = toCanvas(event)
    const dx = point.x - from.x
    const dy = point.y - from.y
    const threshold = event.ctrlKey ? -1 : SNAP_DISTANCE / zoom()
    const others = () =>
      withDrawn(target.frames())
        .filter((frame) => !('boxes' in gesture && frame.ref in gesture.boxes))
        .map((frame) => frame.box)
    switch (gesture.kind) {
      case 'move': {
        const { bounds, boxes } = gesture
        const shifted = {
          ...bounds,
          x: Math.round(bounds.x + dx),
          y: Math.round(bounds.y + dy),
        }
        const snap = snapMove(shifted, others(), threshold)
        const ox = snap.box.x - bounds.x
        const oy = snap.box.y - bounds.y
        for (const [ref, box] of Object.entries(boxes)) {
          const element = elements.get(ref)
          if (!element) continue
          element.style.left = `${box.x + ox}px`
          element.style.top = `${box.y + oy}px`
        }
        drawMove(root, ox, oy, snap.box)
        shiftElementOutline(ox, oy)
        shiftPins(Object.keys(boxes), ox, oy)
        drawGuides(root, snap.guides, snap.gaps)
        return
      }
      case 'resize': {
        const { bounds, boxes, corner } = gesture
        const resized = resizeBox(bounds, corner, dx, dy)
        const snap = snapResize(
          resized,
          {
            x: corner.endsWith('w') ? 'start' : 'end',
            y: corner.startsWith('n') ? 'start' : 'end',
          },
          others(),
          threshold,
        )
        const next = scaleBoxes(boxes, bounds, snap.box)
        for (const [ref, box] of Object.entries(next)) {
          const element = elements.get(ref)
          if (!element) continue
          Object.assign(element.style, {
            left: `${box.x}px`,
            top: `${box.y}px`,
            width: `${box.width}px`,
            height: `${box.height}px`,
          })
        }
        followPins(next)
        reflowing = next
        drawResize(root, next)
        drawGuides(root, snap.guides, snap.gaps)
        return
      }
      case 'section-move': {
        const { section, boxes } = gesture
        const shifted = {
          ...section.box,
          x: Math.round(section.box.x + dx),
          y: Math.round(section.box.y + dy),
        }
        const snap = snapMove(shifted, others(), threshold)
        const ox = snap.box.x - section.box.x
        const oy = snap.box.y - section.box.y
        placeSection(section.name, snap.box)
        for (const [ref, box] of Object.entries(boxes)) {
          const element = elements.get(ref)
          if (!element) continue
          element.style.left = `${box.x + ox}px`
          element.style.top = `${box.y + oy}px`
        }
        shiftPins(Object.keys(boxes), ox, oy)
        drawGuides(root, snap.guides, snap.gaps)
        return
      }
      case 'section-resize': {
        gesture.moved = true
        placeSection(
          gesture.section.name,
          roundBox(resizeBox(gesture.section.box, gesture.corner, dx, dy)),
        )
        return
      }
      case 'placed': {
        // Canvas units are the frame's own pixels, whatever the zoom.
        const ox = Math.round(dx)
        const oy = Math.round(dy)
        gesture.to = {
          left: gesture.from.left + ox,
          top: gesture.from.top + oy,
        }
        gesture.move.preview(gesture.to)
        shiftElementOutline(ox, oy)
        shiftElementPins(gesture.key, ox, oy)
        carriedStore.setState({ ghost: frameMadeAt(event, gesture) })
        return
      }
      case 'carry': {
        carriedStore.setState({ ghost: frameMadeAt(event, gesture) })
        return
      }
      case 'group': {
        gesture.edits = moveMembers(gesture.members, dx, dy)
        gesture.moved = Math.round(dx) !== 0 || Math.round(dy) !== 0
        gesture.edit.preview(gesture.edits)
        const [first] = selectedElements(selection.getState())
        if (first) {
          for (const { index } of gesture.edits) {
            shiftElementPins(
              { ...first, index },
              Math.round(dx),
              Math.round(dy),
            )
          }
        }
        return
      }
      case 'group-resize': {
        const to = groupBox(
          gesture.bounds,
          gesture.corner,
          dx,
          dy,
          event.shiftKey,
        )
        gesture.edits = scaleMembers(gesture.members, gesture.bounds, to)
        gesture.moved = !sameBox(to, gesture.bounds)
        gesture.edit.preview(gesture.edits)
        return
      }
      case 'element-resize': {
        gesture.size = dragSize(
          gesture.read,
          gesture.box,
          gesture.corner,
          dx,
          dy,
          event.shiftKey,
        )
        gesture.resize.preview(gesture.size)
        return
      }
      case 'inner-marquee': {
        const rect = rectFrom(from, point)
        drawMarquee(
          root,
          rect,
          (gesture.touching?.(rect) ?? []).map(({ box }) => box),
        )
        return
      }
      case 'marquee': {
        const rect = rectFrom(from, point)
        const touched = framesIn(withDrawn(target.frames()), rect)
        drawMarquee(
          root,
          rect,
          touched.map((frame) => frame.box),
        )
        return
      }
      default:
        return
    }
  }

  const putFramesBack = (boxes: Readonly<Record<string, Box>>) => {
    for (const [ref, box] of Object.entries(boxes)) {
      const element = elements.get(ref)
      if (!element) continue
      Object.assign(element.style, {
        left: `${box.x}px`,
        top: `${box.y}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      })
    }
  }

  // An Alt release sends one duplicate write and no box write, so originals stay put.
  const dropCopies = (boxes: Record<string, Box>) => {
    const [first] = Object.entries(boxes)
    const dropped = first ? elements.get(first[0]) : undefined
    if (!first || !dropped) return
    const offset = {
      x: parseFloat(dropped.style.left) - first[1].x,
      y: parseFloat(dropped.style.top) - first[1].y,
    }
    putFramesBack(boxes)
    if (offset.x === 0 && offset.y === 0) return
    const refs = Object.keys(boxes)
    stores.duplicate(refs, offset).then(
      (copies) =>
        select(
          selection,
          target.page,
          copies.map((copy) => copy.ref),
        ),
      reportRefusal(
        refs.length === 1
          ? `Couldn't duplicate ${refs[0]?.split('/').at(-1) ?? 'the frame'}`
          : `Couldn't duplicate ${refs.length} frames`,
      ),
    )
  }

  // An element in another frame starts a new selection there.
  const pickToggle = (event: MouseEvent) => {
    const turn = presses
    void stores
      .pickElement(target.layer, withDrawn(target.frames()), toCanvas(event))
      .then((key) => {
        if (key && turn === presses) {
          toggleElement(selection, target.page, key)
        }
      })
  }

  // Waits on the frame's tree, and a later press drops it.
  const pickOrFrame = (event: MouseEvent, frame: FrameRecord) => {
    const turn = presses
    void stores
      .pickElement(target.layer, withDrawn(target.frames()), toCanvas(event))
      .then((key) => {
        if (turn !== presses) return
        if (key?.frame === frame.ref) selectElement(selection, target.page, key)
        else select(selection, target.page, [frame.ref])
      })
  }

  /** Whether an element of `frame` is selected, which a plain click there picks past. */
  const holdsElement = (frame: FrameRecord) =>
    selectedElements(selection.getState()).some(
      (key) => key.frame === frame.ref,
    )

  let revealing: ReturnType<typeof setTimeout> | undefined
  // Waits out a double-click, since a travel would move the point it picks through.
  const revealLater = (frame: FrameRecord) => {
    const turn = presses
    clearTimeout(revealing)
    revealing = setTimeout(() => {
      const { page, frames } = selection.getState()
      if (turn !== presses || page !== target.page) return
      if (frames.length !== 1 || frames[0] !== frame.ref) return
      // The frame was hit where it draws, so its box is the previewed one.
      canvasView.reveal(frame.box, { fit: false })
    }, REVEAL_DELAY_MS)
  }

  const finish = (event: MouseEvent) => {
    const root = overlay()
    if (!moved) {
      // A click that only leaves an inspector field keeps the selection it edits.
      if (leaving) {
        gesture = { kind: 'none' }
        return
      }
      if (gesture.kind === 'badge') {
        stores.openFindings(gesture.ref)
      } else if (gesture.kind === 'control') {
        gesture.element.click()
      } else if (
        (gesture.kind === 'press' || gesture.kind === 'element') &&
        gesture.shift &&
        selection.getState().element
      ) {
        pickToggle(event)
      } else if (gesture.kind === 'press') {
        if (gesture.shift) toggle(selection, target.page, gesture.frame.ref)
        else if (holdsElement(gesture.frame)) pickOrFrame(event, gesture.frame)
        else {
          select(selection, target.page, [gesture.frame.ref])
          if (gesture.fresh) revealLater(gesture.frame)
        }
      } else if (gesture.kind === 'element' && gesture.frame) {
        // A plain click inside a selected element's own box keeps it.
        if (gesture.shift) toggle(selection, target.page, gesture.frame.ref)
      } else if (gesture.kind === 'section') {
        selectSection(selection, target.page, gesture.section.name)
      } else if (gesture.kind === 'marquee' && !gesture.shift) {
        clear(selection)
      }
      gesture = { kind: 'none' }
      return
    }
    if (root) drawRest(root)
    shiftElementOutline(0, 0)
    shiftPins([], 0, 0)
    const point = toCanvas(event)
    if (gesture.kind === 'inner-marquee') {
      const { base, frame, boxes } = gesture
      const rect = rectFrom(from, point)
      const turn = presses
      // Selects once the boxes answer, unless a later press came first.
      void boxes.then((touching) => {
        if (turn !== presses) return
        const keys = [...base, ...touching(rect).map(({ key }) => key)]
        if (keys.length > 0) selectElements(selection, target.page, keys)
        else select(selection, target.page, [frame.ref])
      })
    } else if (gesture.kind === 'marquee') {
      const touched = framesIn(
        withDrawn(target.frames()),
        rectFrom(from, point),
      ).map((frame) => frame.ref)
      select(selection, target.page, [...gesture.base, ...touched])
    } else if (gesture.kind === 'element-resize') {
      const { box, corner, resize, size } = gesture
      // The size a drag of nothing draws, which rounds a fractional box as the drag does.
      const start = cornerSize(box, corner, 0, 0, false)
      if (
        size &&
        (size.width !== start.width || size.height !== start.height)
      ) {
        void resize.commit(size)
      } else {
        resize.cancel()
      }
    } else if (gesture.kind === 'group' || gesture.kind === 'group-resize') {
      if (gesture.moved && gesture.edits.length > 0) {
        void gesture.edit.commit(gesture.edits)
      } else {
        gesture.edit.cancel()
      }
    } else if (gesture.kind === 'placed') {
      const { from: start, to, move, key } = gesture
      const made = frameMadeAt(event, gesture)
      carriedStore.setState({ ghost: null })
      if (to && (to.left !== start.left || to.top !== start.top)) {
        // Held until the reload measures the element, and a refusal puts it back.
        const outline = selectedElementBox(target.layer)
        if (outline) {
          holdOutline({
            key,
            box: {
              ...outline,
              x: outline.x + to.left - start.left,
              y: outline.y + to.top - start.top,
            },
            read: stores.resizeOf(target.layer, key),
          })
        }
        const letGo = () => {
          if (heldOutline()?.key === key) holdOutline(null)
        }
        if (made) {
          void stores
            .extractElement(target.page, key, made.box)
            .then((landed) => {
              if (!landed) move.cancel()
              letGo()
            })
        } else {
          void move.commit(to).then((landed) => {
            if (!landed) letGo()
          })
        }
      } else {
        move.cancel()
      }
    } else if (gesture.kind === 'carry') {
      const { key } = gesture
      const made = frameMadeAt(event, gesture)
      carriedStore.setState({ carried: null, ghost: null })
      if (made) {
        void stores.extractElement(target.page, key, made.box)
      } else {
        void stores.moveElement(
          target.layer,
          target.page,
          withDrawn(target.frames()),
          point,
          key,
        )
      }
    } else if (gesture.kind === 'section-move') {
      writeSection(gesture.section, gesture.boxes)
    } else if (gesture.kind === 'section-resize' && gesture.moved) {
      writeSection(gesture.section, {})
    } else if (gesture.kind === 'move' && event.altKey) {
      dropCopies(gesture.boxes)
    } else if (gesture.kind === 'move' || gesture.kind === 'resize') {
      const next: Record<string, Box> = {}
      const expected: Record<string, Box> = {}
      for (const [ref, box] of Object.entries(gesture.boxes)) {
        const element = elements.get(ref)
        if (!element) continue
        // The start size, which a frame just leaving its preview may not have drawn.
        const drawn =
          gesture.kind === 'move'
            ? {
                ...box,
                x: parseFloat(element.style.left),
                y: parseFloat(element.style.top),
              }
            : {
                x: parseFloat(element.style.left),
                y: parseFloat(element.style.top),
                width: parseFloat(element.style.width),
                height: parseFloat(element.style.height),
              }
        if (sameBox(drawn, box)) continue
        next[ref] = drawn
        expected[ref] = box
      }
      void stores.write(target.page, next, expected)
    }
    gesture = { kind: 'none' }
    elements = new Map()
  }

  // A refusal restores the box itself, since no newer board redraws it.
  const writeSection = (
    section: SectionRecord,
    members: Readonly<Record<string, Box>>,
  ) => {
    const element = sectionElement(section.name)
    if (!element) return
    const box = {
      x: parseFloat(element.style.left),
      y: parseFloat(element.style.top),
      width: parseFloat(element.style.width),
      height: parseFloat(element.style.height),
    }
    if (sameBox(box, section.box)) return
    const next: Record<string, Box> = {}
    const expected: Record<string, Box> = {}
    const dx = box.x - section.box.x
    const dy = box.y - section.box.y
    for (const [ref, from] of Object.entries(members)) {
      next[ref] = { ...from, x: from.x + dx, y: from.y + dy }
      expected[ref] = from
    }
    void stores
      .write(target.page, next, expected, undefined, {
        boxes: { [section.name]: box },
        expected: { [section.name]: section.box },
      })
      .then((landed) => {
        if (!landed) placeSection(section.name, section.box)
      })
  }

  // Captures Esc ahead of the registry's earlier listener, which would also clear.
  const onEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    // With no drag there is nothing to put back, though a corner press is a `resize`.
    if (!moved) return
    const root = overlay()
    if (gesture.kind === 'placed') {
      gesture.move.cancel()
      shiftElementOutline(0, 0)
      shiftElementPins(gesture.key, 0, 0)
      carriedStore.setState({ ghost: null })
    } else if (gesture.kind === 'element-resize') {
      gesture.resize.cancel()
    } else if (gesture.kind === 'group' || gesture.kind === 'group-resize') {
      gesture.edit.cancel()
      shiftPins([], 0, 0)
    } else if (gesture.kind === 'section-resize') {
      placeSection(gesture.section.name, gesture.section.box)
    } else if (gesture.kind === 'carry') {
      carriedStore.setState({ carried: null, ghost: null })
    } else if (gesture.kind === 'marquee' || gesture.kind === 'inner-marquee') {
      if (root) drawRest(root)
    } else if (
      gesture.kind === 'move' ||
      gesture.kind === 'resize' ||
      gesture.kind === 'section-move'
    ) {
      if (gesture.kind === 'section-move') {
        placeSection(gesture.section.name, gesture.section.box)
      }
      putFramesBack(gesture.boxes)
      if (root) {
        // No write lands, so React has no changed prop to redraw a resize from.
        if (gesture.kind === 'resize') drawResize(root, gesture.boxes)
        drawRest(root)
      }
      shiftElementOutline(0, 0)
      shiftPins([], 0, 0)
    } else {
      return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    markCarrying(false)
    gesture = { kind: 'none' }
  }

  // Snapping follows Ctrl at once, rather than waiting for the next move.
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Control' || !moved || !last) return
    update(
      new MouseEvent('mousemove', {
        clientX: last.clientX,
        clientY: last.clientY,
        ctrlKey: event.type === 'keydown',
      }),
    )
  }

  const behavior = drag<HTMLElement, unknown>()
    .container(() => target.viewport)
    // A Ctrl-press counts, since Ctrl turns snapping off rather than meaning right-click.
    .filter((event: MouseEvent) => event.button === 0 && moveToolOn())
    .touchable(false)
    .on('start', (event: { sourceEvent: MouseEvent }) => {
      start(event.sourceEvent)
      addEventListener('keydown', onEscape, true)
      addEventListener('keydown', onKey)
      addEventListener('keyup', onKey)
    })
    .on('drag', (event: { sourceEvent: MouseEvent }) => {
      const source = event.sourceEvent
      last = source
      if (gesture.kind === 'divider') {
        stores.splitAt(source.clientX)
        return
      }
      if (!moved) {
        const distance = Math.hypot(
          source.clientX - pressed.x,
          source.clientY - pressed.y,
        )
        if (distance <= CLICK_DISTANCE) return
        // Waits on whether the press is on the bare body, which the next move reads. An Alt-drag never marquees.
        if (
          gesture.kind === 'press' &&
          gesture.inner === null &&
          !source.altKey
        ) {
          return
        }
        moved = true
        begin()
        markCarrying(CARRIES.has(gesture.kind))
      }
      update(source)
    })
    .on('end', (event: { sourceEvent: MouseEvent }) => {
      removeEventListener('keydown', onEscape, true)
      removeEventListener('keydown', onKey)
      removeEventListener('keyup', onKey)
      markCarrying(false)
      finish(event.sourceEvent)
      last = null
    })

  // A Ctrl-press on a Mac is a right-click, whose menu would eat the drag.
  const noMenu = (event: MouseEvent) => {
    if (event.ctrlKey && event.button === 0) event.preventDefault()
  }

  // A corner lands once the frame reflows, a frame after the drag drew its box.
  const stopCorners = subscribeCorners(() => {
    if (gesture.kind === 'resize' && reflowing) followPins(reflowing)
  })

  const selectionOfHit = d3Select(hit)
  selectionOfHit.call(behavior)
  hit.addEventListener('contextmenu', noMenu)
  return {
    detach: () => {
      stopCorners()
      clearTimeout(revealing)
      markCarrying(false)
      carriedStore.setState({ ghost: null })
      selectionOfHit.on('.drag', null)
      hit.removeEventListener('contextmenu', noMenu)
      removeEventListener('keydown', onEscape, true)
      removeEventListener('keydown', onKey)
      removeEventListener('keyup', onKey)
    },
    cursorAt,
  }
}

/** The inspector text field focus sits in, which a press on the canvas leaves. */
// A scrub track applies as it moves and holds no edit to leave, so a press
// after one acts at once rather than only blurring it.
function inspectorField(): HTMLElement | null {
  const active = document.activeElement
  return active instanceof HTMLElement &&
    active.matches('input:not([type="range"]), textarea') &&
    active.closest('[data-inspector]')
    ? active
    : null
}

function inBox(box: Box, point: Point): boolean {
  return (
    point.x >= box.x &&
    point.x <= box.x + box.width &&
    point.y >= box.y &&
    point.y <= box.y + box.height
  )
}

/** The last match under a screen point, being the one drawn on top. */
function topmost(
  layer: ParentNode,
  selector: string,
  point: { clientX: number; clientY: number },
): HTMLElement | null {
  const matches = [...layer.querySelectorAll<HTMLElement>(selector)].reverse()
  return (
    matches.find((element) => {
      const { left, right, top, bottom } = element.getBoundingClientRect()
      return (
        point.clientX >= left &&
        point.clientX <= right &&
        point.clientY >= top &&
        point.clientY <= bottom
      )
    }) ?? null
  )
}

function roundBox(box: Box): Box {
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.max(1, Math.round(box.width)),
    height: Math.max(1, Math.round(box.height)),
  }
}

function rectFrom(a: Point, b: Point): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}
