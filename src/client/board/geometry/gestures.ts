import { drag } from 'd3-drag'
import { pointer, select as d3Select } from 'd3-selection'
import { zoomTransform } from 'd3-zoom'

import { liveStore } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import type { FrameRecord } from '@/shared/records/list'

import { openFindings } from '../findings-open'
import { reportRefusal } from '../left-panel/page-actions'
import { type ModeStore, modeStore } from '../mode'
import {
  clear,
  select,
  type SelectionStore,
  selectionStore,
  toggle,
} from '../selection'
import { boundsOf, type Box, type Point, sameBox } from './box'
import { drawGuides, drawMarquee, drawMove, drawResize, drawRest } from './draw'
import {
  badgeAt,
  cornerAt,
  frameAt,
  framesIn,
  onOutline,
  selectedElementBox,
} from './hit'
import { type Corner, resizeBox, scaleBoxes } from './resize'
import { SNAP_DISTANCE, snapMove, snapResize } from './snap'
import { withPending, writeBoxes } from './write'

/** How far, in screen pixels, a press travels before it counts as a drag rather than a click. */
export const CLICK_DISTANCE = 3

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
}

const STORES: GestureStores = {
  selection: selectionStore,
  mode: modeStore,
  canWrite: () => liveStore.getState().canWrite,
  write: writeBoxes,
  duplicate: structure.duplicateFrames,
  openFindings,
}

type Gesture =
  | { kind: 'press'; frame: FrameRecord; shift: boolean }
  /** A press on a frame's findings badge, which opens its list on release and selects nothing. */
  | { kind: 'badge'; ref: string }
  | { kind: 'marquee'; shift: boolean; base: readonly string[] }
  | { kind: 'resize'; corner: Corner; boxes: Record<string, Box>; bounds: Box }
  | { kind: 'move'; boxes: Record<string, Box>; bounds: Box }
  /** A drag that may not change anything, such as one on a locked frame. */
  | { kind: 'none' }

/**
 * Binds the Move tool's pointer gestures to the hit layer over the frames,
 * on `d3-drag` beside the viewport's `d3-zoom`. A click selects, Shift-click
 * toggles, a drag on a frame moves the selection, a drag on a corner handle
 * resizes it, and a drag on empty canvas draws a marquee. A move released
 * with Alt held copies the frames at the drop instead. A drag writes the
 * frames and the overlay straight from its handler and sends one write on
 * release. Returns the function that unbinds them.
 */
export function attachGestures(
  hit: HTMLElement,
  target: GestureTarget,
  stores: GestureStores = STORES,
): () => void {
  const { selection, mode } = stores
  let gesture: Gesture = { kind: 'none' }
  let from: Point = { x: 0, y: 0 }
  let pressed = { x: 0, y: 0 }
  let moved = false
  // The press took focus out of an inspector field, so a click only leaves it.
  let leaving = false
  let last: MouseEvent | null = null
  let elements = new Map<string, HTMLElement>()

  const overlay = () =>
    target.layer.querySelector<HTMLElement>('[data-overlay]')
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

  const start = (event: MouseEvent) => {
    const frames = withPending(target.frames())
    const point = toCanvas(event)
    from = point
    pressed = { x: event.clientX, y: event.clientY }
    moved = false
    last = event
    const field = inspectorField()
    leaving = field !== null
    // Blurring here applies the field's edit before any drag writes.
    field?.blur()
    const badge = badgeAt(target.layer, event)
    if (badge) {
      gesture = { kind: 'badge', ref: badge }
      return
    }
    // A press on the selected element's outline or a corner mark does
    // nothing, since an element's size is never set by hand, and the frame's
    // handles are hidden while an element is selected, so they take no press.
    const element = selection.getState().element
    const outline = element ? selectedElementBox(target.layer) : null
    if (outline && onOutline(outline, point, zoom())) {
      gesture = { kind: 'none' }
      return
    }
    const chosen = selected(frames)
    const bounds = boundsOf(chosen.map((frame) => frame.box))
    const corner = bounds && !element ? cornerAt(bounds, point, zoom()) : null
    if (bounds && corner) {
      gesture = { kind: 'resize', corner, boxes: boxesOf(chosen), bounds }
      return
    }
    const frame = frameAt(frames, point, zoom())
    if (frame) {
      // Pressing an unselected frame selects it at once, so a drag moves it.
      // A press leaving a field waits for the drag, since its click selects nothing.
      const unselected = !chosen.some(({ ref }) => ref === frame.ref)
      if (!leaving && !event.shiftKey && unselected) {
        select(selection, target.page, [frame.ref])
      }
      gesture = { kind: 'press', frame, shift: event.shiftKey }
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
    if (gesture.kind !== 'press' && gesture.kind !== 'resize') return
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
      elements = new Map(
        Object.keys(gesture.boxes).flatMap((ref) => {
          const element = target.layer.querySelector<HTMLElement>(
            `[data-frame="${CSS.escape(ref)}"]`,
          )
          return element ? [[ref, element] as const] : []
        }),
      )
    }
  }

  const update = (event: MouseEvent) => {
    const root = overlay()
    if (!root) return
    const point = toCanvas(event)
    const dx = point.x - from.x
    const dy = point.y - from.y
    const threshold = event.ctrlKey ? -1 : SNAP_DISTANCE / zoom()
    const others = () =>
      withPending(target.frames())
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
        drawResize(root, next)
        drawGuides(root, snap.guides, snap.gaps)
        return
      }
      case 'marquee': {
        const rect = rectFrom(from, point)
        const touched = framesIn(withPending(target.frames()), rect)
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

  /**
   * Puts the dragged frames back and copies them at the drop, as a move
   * released with Alt held. One duplicate write lands the copies, and no box
   * write is sent, so the originals stay where they were.
   */
  const dropCopies = (boxes: Record<string, Box>) => {
    const [first] = Object.entries(boxes)
    const dropped = first ? elements.get(first[0]) : undefined
    if (!first || !dropped) return
    const offset = {
      x: parseFloat(dropped.style.left) - first[1].x,
      y: parseFloat(dropped.style.top) - first[1].y,
    }
    for (const [ref, box] of Object.entries(boxes)) {
      const element = elements.get(ref)
      if (!element) continue
      element.style.left = `${box.x}px`
      element.style.top = `${box.y}px`
    }
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
      } else if (gesture.kind === 'press') {
        if (gesture.shift) toggle(selection, target.page, gesture.frame.ref)
        else select(selection, target.page, [gesture.frame.ref])
      } else if (gesture.kind === 'marquee' && !gesture.shift) {
        clear(selection)
      }
      gesture = { kind: 'none' }
      return
    }
    if (root) drawRest(root)
    const point = toCanvas(event)
    if (gesture.kind === 'marquee') {
      const touched = framesIn(
        withPending(target.frames()),
        rectFrom(from, point),
      ).map((frame) => frame.ref)
      select(selection, target.page, [...gesture.base, ...touched])
    } else if (gesture.kind === 'move' && event.altKey) {
      dropCopies(gesture.boxes)
    } else if (gesture.kind === 'move' || gesture.kind === 'resize') {
      const next: Record<string, Box> = {}
      const expected: Record<string, Box> = {}
      for (const [ref, box] of Object.entries(gesture.boxes)) {
        const element = elements.get(ref)
        if (!element) continue
        const drawn = {
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
    // The primary button alone, and a Ctrl-press too, since Ctrl turns
    // snapping off rather than meaning a right-click here.
    .filter((event: MouseEvent) => {
      const { mode: current, tool, spacePan } = mode.getState()
      // Held Space hands the drag to the viewport's pan.
      return (
        event.button === 0 && current === 'edit' && tool === 'move' && !spacePan
      )
    })
    .touchable(false)
    .on('start', (event: { sourceEvent: MouseEvent }) => {
      start(event.sourceEvent)
      addEventListener('keydown', onKey)
      addEventListener('keyup', onKey)
    })
    .on('drag', (event: { sourceEvent: MouseEvent }) => {
      const source = event.sourceEvent
      last = source
      if (!moved) {
        const distance = Math.hypot(
          source.clientX - pressed.x,
          source.clientY - pressed.y,
        )
        if (distance <= CLICK_DISTANCE) return
        moved = true
        begin()
      }
      update(source)
    })
    .on('end', (event: { sourceEvent: MouseEvent }) => {
      removeEventListener('keydown', onKey)
      removeEventListener('keyup', onKey)
      finish(event.sourceEvent)
      last = null
    })

  // A Ctrl-press on a Mac is a right-click, whose menu would eat the drag.
  const noMenu = (event: MouseEvent) => {
    if (event.ctrlKey && event.button === 0) event.preventDefault()
  }

  const selectionOfHit = d3Select(hit)
  selectionOfHit.call(behavior)
  hit.addEventListener('contextmenu', noMenu)
  return () => {
    selectionOfHit.on('.drag', null)
    hit.removeEventListener('contextmenu', noMenu)
    removeEventListener('keydown', onKey)
    removeEventListener('keyup', onKey)
  }
}

/** The inspector text field focus sits in, which a press on the canvas leaves. */
function inspectorField(): HTMLElement | null {
  const active = document.activeElement
  return active instanceof HTMLElement &&
    active.matches('input, textarea') &&
    active.closest('[data-inspector]')
    ? active
    : null
}

function rectFrom(a: Point, b: Point): Box {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}
