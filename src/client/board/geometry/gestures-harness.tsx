import { act, render } from '@testing-library/react'
import { Profiler } from 'react'

import type {
  ElementSize,
  ResizeKind,
  ResizeRead,
} from '@/shared/frame-bridge/live-element'
import type { FrameRecord, SectionRecord } from '@/shared/records/list'
import { frameOf } from '@/test/board'
import { BRIDGE } from '@/test/frame-bridge'

import type { GroupMember, MemberEdit } from '../element/group'
import type { PlacedOffsets } from '../element/resize'
import { createModeStore } from '../mode'
import { SectionBoxes } from '../sections/box'
import { type ElementKey, selectionStore } from '../selection'
import type { Box, Point } from './box'
import { attachGestures } from './gestures'
import { SelectionOverlay } from './overlay'

export const PAGE = 'studio/home'

export const LEFT = frameOf('left', {
  box: { x: 100, y: 100, width: 200, height: 200 },
  order: 0,
})

export const RIGHT = frameOf('right', {
  box: { x: 400, y: 100, width: 200, height: 200 },
  order: 1,
})

export const LOCKED = frameOf('locked', {
  box: { x: 100, y: 400, width: 200, height: 100 },
  order: 2,
  locked: true,
})

interface Write {
  page: string
  boxes: Readonly<Record<string, Box>>
  expected: Readonly<Record<string, Box>>
  sections?: {
    boxes: Readonly<Record<string, Box>>
    expected: Readonly<Record<string, Box>>
  }
}

/**
 * The canvas's three layers at the identity view, a screen pixel being a
 * canvas pixel: the viewport, the layer holding plain frame boxes and the
 * real overlay, and the hit layer the gestures bind to.
 */
export function setup(
  frames: FrameRecord[] = [LEFT, RIGHT, LOCKED],
  {
    canWrite = true,
    onCommit = () => {},
    elementBox,
    badge,
    control,
    divider,
    shape,
    resizeRead = {
      kind: 'box',
      natural: null,
      hugsHeight: false,
      inset: { width: 0, height: 0 },
      sizing: null,
    },
    placed,
    ghost,
    pick = () => null,
    bare = () => false,
    inner = [],
    outlines = [],
    group,
    live,
    sections = [],
    lands = true,
    hidden = [],
  }: {
    /** Frames on the page the canvas does not draw, which a section move still carries. */
    hidden?: FrameRecord[]
    /** The page's sections, drawn under the frames as the canvas draws them. */
    sections?: SectionRecord[]
    /** Whether a write lands, false answering it refused. */
    lands?: boolean
    canWrite?: boolean
    onCommit?: () => void
    elementBox?: Box
    /** A findings badge drawn in the label strip above a frame, at a canvas box. */
    badge?: { ref: string; box: Box }
    /** A button drawn in the label strip above a frame, at a canvas box. */
    control?: { box: Box; onClick: () => void }
    /** A compared frame's split divider, at a canvas box. */
    divider?: Box
    /** The selected element takes a corner resize, in a frame free to write or held by another session. */
    shape?: 'free' | 'held'
    /** What the corner resize `shape` grants reads off the element, a box by default. */
    resizeRead?: ResizeRead
    /** The selected element is placed at these offsets, out of the flow. */
    placed?: PlacedOffsets
    /** An element's ghost drawn past its frame's edge, at a canvas box. */
    ghost?: { key: ElementKey; box: Box }
    /** What a Shift-click picks at each point, null by default. */
    pick?: (at: Point) => ElementKey | null | Promise<ElementKey | null>
    /** Whether a point inside a selected frame is its bare body, false by default. */
    bare?: (at: Point) => boolean
    /** The elements a marquee inside a frame touches, none by default. */
    inner?: { key: ElementKey; box: Box }[]
    /** Outlines drawn for several selected elements, last picked last. */
    outlines?: { index: number; box: Box }[]
    /**
     * The box several selected elements draw at a canvas box, with corner
     * marks when `scales`, and the members a group drag reads, in a frame
     * free to write or held by another session.
     */
    group?: {
      box: Box
      scales: boolean
      members: GroupMember[]
      held?: boolean
    }
    /**
     * A body LEFT renders live in an iframe filling its box, whose pin is
     * anchored to the element at file index 3, the first in the body.
     */
    live?: string
  } = {},
) {
  const mode = createModeStore(1280)
  const writes: Write[] = []
  const duplicates: {
    refs: readonly string[]
    offset?: { x: number; y: number }
  }[] = []
  const opened: string[] = []
  const splits: number[] = []
  const moves: { page: string; at: Point; key: ElementKey }[] = []
  const extracts: { page: string; key: ElementKey; box: Box }[] = []
  const resizes: {
    page: string
    key: ElementKey
    kind: ResizeKind
    previews: ElementSize[]
    commits: ElementSize[]
    cancelled: boolean
  }[] = []
  const groupEdits: {
    page: string
    keys: readonly ElementKey[]
    previews: (readonly MemberEdit[])[]
    commits: (readonly MemberEdit[])[]
    cancelled: boolean
  }[] = []
  const placedMoves: {
    page: string
    key: ElementKey
    previews: PlacedOffsets[]
    commits: PlacedOffsets[]
    cancelled: boolean
  }[] = []
  const view = render(
    <Profiler id="canvas" onRender={onCommit}>
      <div
        data-viewport
        className="relative overflow-hidden"
        style={{ width: 800, height: 600 }}
      >
        <div data-layer className="absolute top-0 left-0 origin-top-left">
          <SectionBoxes page={PAGE} sections={sections} />
          {frames.map((frame) => (
            <div
              key={frame.ref}
              data-frame={frame.ref}
              className="absolute"
              style={{
                left: frame.box.x,
                top: frame.box.y,
                width: frame.box.width,
                height: frame.box.height,
              }}
            >
              {live && frame.ref === LEFT.ref ? (
                <iframe
                  title={frame.ref}
                  className="size-full border-0"
                  srcDoc={`<!doctype html><html><head>${BRIDGE}</head><body style="margin:0">${live}</body></html>`}
                />
              ) : null}
            </div>
          ))}
          <SelectionOverlay frames={frames} />
          {elementBox ? (
            <div
              data-element-selection
              className="pointer-events-none absolute"
              style={{
                left: elementBox.x,
                top: elementBox.y,
                width: elementBox.width,
                height: elementBox.height,
              }}
            />
          ) : null}
          {group ? (
            <div
              data-element-group
              className="pointer-events-none absolute"
              style={{
                left: group.box.x,
                top: group.box.y,
                width: group.box.width,
                height: group.box.height,
              }}
            >
              {group.scales ? <span data-element-corner /> : null}
            </div>
          ) : null}
          {outlines.map(({ index, box }) => (
            <div
              key={index}
              data-element-selection
              data-element-index={index}
              className="pointer-events-none absolute"
              style={{
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height,
              }}
            />
          ))}
          {ghost ? (
            <div
              data-element-ghost
              data-ghost-frame={ghost.key.frame}
              data-ghost-index={ghost.key.index}
              data-ghost-hash={ghost.key.hash}
              className="pointer-events-none absolute"
              style={{
                left: ghost.box.x,
                top: ghost.box.y,
                width: ghost.box.width,
                height: ghost.box.height,
              }}
            />
          ) : null}
          {badge ? (
            <span
              data-findings-badge={badge.ref}
              className="absolute"
              style={{
                left: badge.box.x,
                top: badge.box.y,
                width: badge.box.width,
                height: badge.box.height,
              }}
            />
          ) : null}
          {control ? (
            <button
              type="button"
              data-label-control
              onClick={control.onClick}
              className="absolute"
              style={{
                left: control.box.x,
                top: control.box.y,
                width: control.box.width,
                height: control.box.height,
              }}
            />
          ) : null}
          {divider ? (
            <div
              data-compare-divider={LEFT.ref}
              className="absolute"
              style={{
                left: divider.x,
                top: divider.y,
                width: divider.width,
                height: divider.height,
              }}
            />
          ) : null}
        </div>
        <div
          data-notes-layer
          className="pointer-events-none absolute top-0 left-0"
        >
          {frames.map((frame) => (
            <span
              key={frame.ref}
              data-note-marker
              data-note-frame={frame.ref}
              data-note-element={live && frame.ref === LEFT.ref ? 3 : undefined}
              className="absolute"
              style={{ left: frame.box.x + frame.box.width, top: frame.box.y }}
            />
          ))}
        </div>
        <div data-hit-layer className="absolute inset-0" />
      </div>
    </Profiler>,
  )
  const part = (selector: string) => {
    const element = view.container.querySelector<HTMLElement>(selector)
    if (!element) throw new Error(`no ${selector}`)
    return element
  }
  const viewport = part('[data-viewport]')
  const origin = viewport.getBoundingClientRect()
  const { detach, cursorAt } = attachGestures(
    part('[data-hit-layer]'),
    {
      viewport,
      layer: part('[data-layer]'),
      page: PAGE,
      frames: () => frames,
      sections: () => sections,
      pageFrames: () => [...frames, ...hidden],
    },
    {
      selection: selectionStore,
      mode,
      canWrite: () => canWrite,
      write: async (page, boxes, expected, _send, sectionBoxes) => {
        writes.push({
          page,
          boxes,
          expected,
          ...(sectionBoxes ? { sections: sectionBoxes } : {}),
        })
        return lands
      },
      duplicate: async (refs, offset) => {
        duplicates.push({ refs, offset })
        return []
      },
      openFindings: (ref) => opened.push(ref),
      splitAt: (clientX) => splits.push(clientX - origin.left),
      moveElement: async (_layer, page, _frames, at, key) => {
        moves.push({ page, at, key })
        return null
      },
      extractElement: async (page, key, box) => {
        extracts.push({ page, key, box })
        return lands ? `${PAGE}/own` : null
      },
      pickElement: async (_layer, _frames, at) => pick(at),
      // False at once as the store answers where it can tell, else the frame's word.
      onBareFrame: (_layer, _frames, at) =>
        bare(at) ? Promise.resolve(true) : false,
      elementsIn: async () => () => inner,
      resizeOf: () => (shape === undefined ? null : resizeRead),
      placedOffsets: () => placed ?? null,
      groupOf: () => group?.members ?? null,
      editGroup: (page, keys) => {
        if (group?.held) return null
        const edit = {
          page,
          keys,
          previews: [] as (readonly MemberEdit[])[],
          commits: [] as (readonly MemberEdit[])[],
          cancelled: false,
        }
        groupEdits.push(edit)
        return {
          preview: (edits) => edit.previews.push(edits),
          commit: async (edits) => {
            edit.commits.push(edits)
            return lands
          },
          cancel: () => {
            edit.cancelled = true
          },
        }
      },
      movePlaced: (page, key) => {
        const move = {
          page,
          key,
          previews: [] as PlacedOffsets[],
          commits: [] as PlacedOffsets[],
          cancelled: false,
        }
        placedMoves.push(move)
        return {
          preview: (offsets) => move.previews.push(offsets),
          commit: async (offsets) => {
            move.commits.push(offsets)
            return lands
          },
          cancel: () => {
            move.cancelled = true
          },
        }
      },
      resizeElement: (page, key, { kind }) => {
        if (shape !== 'free') return null
        const resize = {
          page,
          key,
          kind,
          previews: [] as ElementSize[],
          commits: [] as ElementSize[],
          cancelled: false,
        }
        resizes.push(resize)
        return {
          preview: (size) => resize.previews.push(size),
          commit: async (size) => {
            resize.commits.push(size)
            return true
          },
          cancel: () => {
            resize.cancelled = true
          },
        }
      },
    },
  )
  const pointer = new Pointer(part('[data-hit-layer]'), origin)
  return {
    ...view,
    mode,
    writes,
    duplicates,
    opened,
    splits,
    moves,
    extracts,
    resizes,
    placedMoves,
    groupEdits,
    part,
    pointer,
    detach,
    cursorOver: (x: number, y: number, over?: HTMLElement) =>
      cursorAt(pointer.at(x, y, over)),
  }
}

/** Sends mouse events in canvas pixels, which the identity view maps one to one. */
class Pointer {
  constructor(
    private readonly hit: HTMLElement,
    private readonly origin: DOMRect,
  ) {}

  down(x: number, y: number, init: MouseEventInit = {}) {
    this.hit.dispatchEvent(this.event('mousedown', x, y, init))
  }

  /** Sent on the hit layer, as a pointer over the canvas sends it, unless `over` is on top. */
  move(
    x: number,
    y: number,
    init: MouseEventInit = {},
    over: HTMLElement = this.hit,
  ) {
    over.dispatchEvent(this.event('mousemove', x, y, init))
  }

  up(
    x: number,
    y: number,
    init: MouseEventInit = {},
    over: HTMLElement = this.hit,
  ) {
    over.dispatchEvent(this.event('mouseup', x, y, init))
  }

  click(x: number, y: number, init: MouseEventInit = {}) {
    this.down(x, y, init)
    this.up(x, y, init)
  }

  drag(
    from: [number, number],
    to: [number, number],
    init: MouseEventInit = {},
  ) {
    this.down(...from, init)
    this.move(...to, init)
    this.up(...to, init)
  }

  /** A move at this point, dispatched on `over`, the hit layer unless another element is on top. */
  at(x: number, y: number, over: HTMLElement = this.hit) {
    const event = this.event('pointermove', x, y, {})
    over.dispatchEvent(event)
    return event
  }

  private event(type: string, x: number, y: number, init: MouseEventInit) {
    return new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: this.origin.left + x,
      clientY: this.origin.top + y,
      ...init,
    })
  }
}

export function selectedRefs(): readonly string[] {
  return selectionStore.getState().frames
}

export function pressEscape() {
  act(() => {
    dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
  })
}
