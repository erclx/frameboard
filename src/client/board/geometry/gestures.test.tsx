import '../../styles.css'

import { act, render } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { Profiler } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { bindKeys, registerActions } from '@/client/actions/registry'
import type { FrameRecord, SectionRecord } from '@/shared/records/list'
import { frameOf } from '@/test/board'

import type { PlacedOffsets, ShapeSize } from '../element/resize'
import { createModeStore } from '../mode'
import { carriedStore } from '../place/tool'
import { endPreview, previewOf, setPreview } from '../preview/store'
import { SectionBoxes } from '../sections/box'
import {
  clear,
  type ElementKey,
  select,
  selectElement,
  selectionStore,
  selectSection,
} from '../selection'
import type { Box, Point } from './box'
import { attachGestures } from './gestures'
import { SelectionOverlay } from './overlay'

const PAGE = 'studio/home'
const LEFT = frameOf('left', {
  box: { x: 100, y: 100, width: 200, height: 200 },
  order: 0,
})
const RIGHT = frameOf('right', {
  box: { x: 400, y: 100, width: 200, height: 200 },
  order: 1,
})
const LOCKED = frameOf('locked', {
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
function setup(
  frames: FrameRecord[] = [LEFT, RIGHT, LOCKED],
  {
    canWrite = true,
    onCommit = () => {},
    elementBox,
    badge,
    control,
    divider,
    shape,
    placed,
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
    /** The selected element is a shape, in a frame free to write or held by another session. */
    shape?: 'free' | 'held'
    /** The selected element is placed at these offsets, out of the flow. */
    placed?: PlacedOffsets
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
  const resizes: {
    page: string
    key: ElementKey
    previews: ShapeSize[]
    commits: ShapeSize[]
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
                  srcDoc={`<!doctype html><html><head></head><body style="margin:0">${live}</body></html>`}
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
  const detach = attachGestures(
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
      isShape: () => shape !== undefined,
      placedOffsets: () => placed ?? null,
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
            return true
          },
          cancel: () => {
            move.cancelled = true
          },
        }
      },
      resizeShape: (page, key) => {
        if (shape !== 'free') return null
        const resize = {
          page,
          key,
          previews: [] as ShapeSize[],
          commits: [] as ShapeSize[],
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
    resizes,
    placedMoves,
    part,
    pointer,
    detach,
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

  move(x: number, y: number, init: MouseEventInit = {}) {
    window.dispatchEvent(this.event('mousemove', x, y, init))
  }

  up(x: number, y: number, init: MouseEventInit = {}) {
    window.dispatchEvent(this.event('mouseup', x, y, init))
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

function selectedRefs(): readonly string[] {
  return selectionStore.getState().frames
}

describe('attachGestures', () => {
  // First in the file, since d3-drag swallows the next click for one timer
  // tick after a drag, and a drag ending the test before would eat this one.
  describe('on a label control', () => {
    const BOX = { x: 140, y: 80, width: 18, height: 18 }

    it('clicks the control on release and selects nothing', () => {
      const clicks: string[] = []
      const { pointer } = setup(undefined, {
        control: { box: BOX, onClick: () => clicks.push('clicked') },
      })

      pointer.click(148, 88)

      expect(clicks).toEqual(['clicked'])
      expect(selectedRefs()).toEqual([])
    })

    it('clicks nothing and moves nothing on a drag from it', () => {
      const clicks: string[] = []
      const { pointer, writes } = setup(undefined, {
        control: { box: BOX, onClick: () => clicks.push('clicked') },
      })

      pointer.drag([148, 88], [248, 188])

      expect([clicks, writes]).toEqual([[], []])
    })
  })

  describe('on a findings badge', () => {
    const BADGE = {
      ref: LEFT.ref,
      box: { x: 140, y: 80, width: 30, height: 18 },
    }

    it('opens the frame’s findings on a click and selects nothing', () => {
      const { pointer, opened } = setup(undefined, { badge: BADGE })

      pointer.click(150, 88)

      expect(opened).toEqual([LEFT.ref])
      expect(selectedRefs()).toEqual([])
    })

    it('only leaves a focused inspector field on the first press, and opens on the next', () => {
      const { pointer, opened } = setup(undefined, { badge: BADGE })
      const panel = document.createElement('aside')
      panel.dataset.inspector = ''
      const field = document.createElement('input')
      panel.append(field)
      document.body.append(panel)
      field.focus()

      pointer.click(150, 88)
      const first = [...opened]
      pointer.click(150, 88)
      panel.remove()

      expect([first, opened]).toEqual([[], [LEFT.ref]])
    })

    it('opens nothing and moves nothing on a drag from it', () => {
      const { pointer, opened, writes } = setup(undefined, { badge: BADGE })

      pointer.drag([150, 88], [250, 188])

      expect([opened, writes]).toEqual([[], []])
    })
  })

  describe('on a split divider', () => {
    it('moves the divider with the pointer and moves no frame', () => {
      const { pointer, splits, writes } = setup(undefined, {
        divider: { x: 196, y: 100, width: 8, height: 100 },
      })

      pointer.drag([200, 150], [180, 150])

      expect(splits).toEqual([200, 180])
      expect(writes).toEqual([])
      expect(selectedRefs()).toEqual([])
    })
  })

  let detach = () => {}

  afterEach(() => {
    detach()
    clear(selectionStore)
  })

  describe('on a section', () => {
    // Holds LEFT by its center, and not RIGHT. Its name sits inside the top
    // left, clear of LEFT, and every offset below stays outside the snap.
    const FLOW: SectionRecord = {
      name: 'flow',
      box: { x: 60, y: 60, width: 300, height: 300 },
      order: 0,
      frames: ['left'],
    }
    const NAME: [number, number] = [70, 68]

    it('selects the section on a press of its name', () => {
      const canvas = setup(undefined, { sections: [FLOW] })
      detach = canvas.detach

      canvas.pointer.click(...NAME)

      expect(selectionStore.getState()).toMatchObject({
        page: PAGE,
        frames: [],
        section: 'flow',
      })
    })

    it('moves its box and its frames in one write, leaving a neighbor', () => {
      const canvas = setup(undefined, { sections: [FLOW] })
      detach = canvas.detach

      canvas.pointer.drag(NAME, [95, 88])

      expect(canvas.writes).toEqual([
        {
          page: PAGE,
          boxes: { [LEFT.ref]: { x: 125, y: 120, width: 200, height: 200 } },
          expected: { [LEFT.ref]: LEFT.box },
          sections: {
            boxes: { flow: { x: 85, y: 80, width: 300, height: 300 } },
            expected: { flow: FLOW.box },
          },
        },
      ])
    })

    it('carries a hidden frame it holds, which the canvas does not draw', () => {
      const away = frameOf('away', {
        box: { x: 120, y: 260, width: 50, height: 50 },
        hidden: true,
      })
      const canvas = setup(undefined, {
        sections: [{ ...FLOW, frames: ['left', 'away'] }],
        hidden: [away],
      })
      detach = canvas.detach

      canvas.pointer.drag(NAME, [95, 88])

      expect(canvas.writes[0]?.boxes[away.ref]).toEqual({
        ...away.box,
        x: 145,
        y: 280,
      })
    })

    it('carries the pins of the frames it moves', () => {
      const canvas = setup(undefined, { sections: [FLOW] })
      detach = canvas.detach
      canvas.pointer.down(...NAME)

      canvas.pointer.move(95, 88)

      const pin = (ref: string) =>
        canvas.part(`[data-note-frame="${ref}"]`).style.translate
      expect([pin(LEFT.ref), pin(RIGHT.ref)]).toEqual(['25px 20px', ''])
      canvas.pointer.up(95, 88)
    })

    it('resizes its box alone from a corner, leaving its frames', () => {
      const canvas = setup(undefined, { sections: [FLOW] })
      detach = canvas.detach
      act(() => selectSection(selectionStore, PAGE, 'flow'))

      canvas.pointer.drag([360, 360], [380, 375])

      expect(canvas.writes).toEqual([
        {
          page: PAGE,
          boxes: {},
          expected: {},
          sections: {
            boxes: { flow: { x: 60, y: 60, width: 320, height: 315 } },
            expected: { flow: FLOW.box },
          },
        },
      ])
    })

    it('puts the box back where the board holds it when the write is refused', async () => {
      const canvas = setup(undefined, { sections: [FLOW], lands: false })
      detach = canvas.detach

      canvas.pointer.drag(NAME, [95, 88])
      await Promise.resolve()

      expect(canvas.part('[data-section="flow"]').style.left).toBe('60px')
    })

    it('moves nothing when one of its frames is locked', () => {
      const held = { ...FLOW, frames: ['left', 'locked'] }
      const canvas = setup(undefined, { sections: [held] })
      detach = canvas.detach

      canvas.pointer.drag(NAME, [95, 88])

      expect(canvas.writes).toEqual([])
    })

    it('writes nothing from a read-only tab', () => {
      const canvas = setup(undefined, { sections: [FLOW], canWrite: false })
      detach = canvas.detach

      canvas.pointer.drag(NAME, [95, 88])

      expect(canvas.writes).toEqual([])
    })

    it("takes a press on its name over a frame's label strip", () => {
      // RIGHT's label strip reaches above its top edge, over this name.
      const above = { ...FLOW, box: { x: 390, y: 80, width: 300, height: 300 } }
      const canvas = setup(undefined, { sections: [above] })
      detach = canvas.detach

      canvas.pointer.click(400, 88)

      expect([selectedRefs(), selectionStore.getState().section]).toEqual([
        [],
        'flow',
      ])
    })

    it('leaves a press on a frame over its name to the frame', () => {
      const under = { ...FLOW, box: { x: 390, y: 90, width: 300, height: 300 } }
      const canvas = setup(undefined, { sections: [under] })
      detach = canvas.detach

      canvas.pointer.click(410, 105)

      expect(selectedRefs()).toEqual([RIGHT.ref])
    })

    it('marquees on its empty plate, as on bare canvas', () => {
      const canvas = setup(undefined, { sections: [FLOW] })
      detach = canvas.detach

      canvas.pointer.drag([70, 340], [150, 150])

      expect([selectedRefs(), selectionStore.getState().section]).toEqual([
        [LEFT.ref],
        undefined,
      ])
    })
  })

  describe('Alt-drag', () => {
    it('copies the frame at the drop with one duplicate and no box write', () => {
      const canvas = setup()
      detach = canvas.detach

      canvas.pointer.drag([150, 150], [190, 210], { altKey: true })

      expect([canvas.duplicates, canvas.writes]).toEqual([
        [{ refs: [LEFT.ref], offset: { x: 40, y: 60 } }],
        [],
      ])
    })

    it('puts the dragged frame back where it was', () => {
      const canvas = setup()
      detach = canvas.detach

      canvas.pointer.drag([150, 150], [190, 210], { altKey: true })

      const left = canvas.part(`[data-frame="${LEFT.ref}"]`)
      expect([left.style.left, left.style.top]).toEqual(['100px', '100px'])
    })

    it('moves the frame when Alt is let go before the drop', () => {
      const canvas = setup()
      detach = canvas.detach

      canvas.pointer.down(150, 150, { altKey: true })
      canvas.pointer.move(190, 210, { altKey: true })
      canvas.pointer.up(190, 210)

      expect([canvas.duplicates.length, canvas.writes.length]).toEqual([0, 1])
    })

    it('leaves a locked frame alone', () => {
      const canvas = setup()
      detach = canvas.detach

      canvas.pointer.drag([150, 450], [190, 510], { altKey: true })

      expect([canvas.duplicates, canvas.writes]).toEqual([[], []])
    })
  })

  it('starts no gesture while Space is held for a pan', () => {
    const canvas = setup()
    detach = canvas.detach
    canvas.mode.setState({ spacePan: true })

    canvas.pointer.drag([150, 150], [190, 210])

    expect([selectedRefs(), canvas.writes]).toEqual([[], []])
  })

  describe('selecting', () => {
    it('selects the frame a click lands on', () => {
      const canvas = setup()
      detach = canvas.detach

      canvas.pointer.click(150, 150)

      expect(selectedRefs()).toEqual([LEFT.ref])
    })

    it('selects a frame through its label strip', () => {
      const canvas = setup()
      detach = canvas.detach

      canvas.pointer.click(420, 90)

      expect(selectedRefs()).toEqual([RIGHT.ref])
    })

    it('adds a frame on Shift-click and takes it out on another', () => {
      const canvas = setup()
      detach = canvas.detach
      canvas.pointer.click(150, 150)

      canvas.pointer.click(450, 150, { shiftKey: true })
      const both = selectedRefs()
      canvas.pointer.click(150, 150, { shiftKey: true })

      expect(both).toEqual([LEFT.ref, RIGHT.ref])
      expect(selectedRefs()).toEqual([RIGHT.ref])
    })

    it('narrows several selected frames to the one clicked', () => {
      const canvas = setup()
      detach = canvas.detach
      select(selectionStore, PAGE, [LEFT.ref, RIGHT.ref])

      canvas.pointer.click(150, 150)

      expect(selectedRefs()).toEqual([LEFT.ref])
    })

    it('clears on a click over empty canvas', () => {
      const canvas = setup()
      detach = canvas.detach
      select(selectionStore, PAGE, [LEFT.ref])

      canvas.pointer.click(700, 550)

      expect(selectedRefs()).toEqual([])
    })

    it('selects every frame a marquee touches', () => {
      const canvas = setup()
      detach = canvas.detach

      canvas.pointer.drag([50, 50], [450, 150])

      expect(selectedRefs()).toEqual([LEFT.ref, RIGHT.ref])
    })

    it('draws the marquee while it drags and clears it on release', () => {
      const canvas = setup()
      detach = canvas.detach

      canvas.pointer.down(50, 50)
      canvas.pointer.move(450, 150)
      const drawing = canvas.part('[data-marquee]')
      const shown = !drawing.hidden
      canvas.pointer.up(450, 150)

      expect(shown).toBe(true)
      expect(drawing.hidden).toBe(true)
    })

    it('selects nothing while the Note tool is picked', () => {
      const canvas = setup()
      detach = canvas.detach
      canvas.mode.setState({ tool: 'note' })

      canvas.pointer.click(150, 150)

      expect(selectedRefs()).toEqual([])
    })
  })

  describe('moving', () => {
    it('moves the frame and sends one write with the box it started from', () => {
      const canvas = setup()
      detach = canvas.detach

      canvas.pointer.drag([150, 150], [180, 175])

      expect(canvas.writes).toEqual([
        {
          page: PAGE,
          boxes: { [LEFT.ref]: { x: 130, y: 125, width: 200, height: 200 } },
          expected: { [LEFT.ref]: LEFT.box },
        },
      ])
      expect(canvas.part(`[data-frame="${LEFT.ref}"]`).style.left).toBe('130px')
    })

    it('moves every selected frame in the one write', () => {
      const canvas = setup()
      detach = canvas.detach
      select(selectionStore, PAGE, [LEFT.ref, RIGHT.ref])

      canvas.pointer.drag([150, 150], [150, 200])

      expect(canvas.writes).toHaveLength(1)
      expect(Object.keys(canvas.writes[0]?.boxes ?? {})).toEqual([
        LEFT.ref,
        RIGHT.ref,
      ])
    })

    it('renders nothing through React while the drag moves', () => {
      let commits = 0
      const canvas = setup(undefined, { onCommit: () => (commits += 1) })
      detach = canvas.detach
      select(selectionStore, PAGE, [LEFT.ref])
      canvas.pointer.down(150, 150)
      const before = commits

      canvas.pointer.move(170, 160)
      canvas.pointer.move(190, 170)
      canvas.pointer.move(210, 180)

      expect(commits).toBe(before)
      canvas.pointer.up(210, 180)
    })

    it('selects rather than moves on a press that travels under the click distance', () => {
      const canvas = setup()
      detach = canvas.detach

      canvas.pointer.drag([150, 150], [152, 151])

      expect(canvas.writes).toEqual([])
      expect(selectedRefs()).toEqual([LEFT.ref])
    })

    it('never moves a locked frame', () => {
      const canvas = setup()
      detach = canvas.detach

      canvas.pointer.drag([150, 450], [250, 480])

      expect(canvas.writes).toEqual([])
      expect(selectedRefs()).toEqual([LOCKED.ref])
    })

    it('never moves while the tab may not write', () => {
      const canvas = setup(undefined, { canWrite: false })
      detach = canvas.detach

      canvas.pointer.drag([150, 150], [180, 175])

      expect(canvas.writes).toEqual([])
    })

    it('snaps a near edge onto another frame and draws the guide', () => {
      const canvas = setup()
      detach = canvas.detach

      canvas.pointer.down(150, 150)
      canvas.pointer.move(150 + 103, 150)
      const guides = canvas.part('[data-guides]').childElementCount
      canvas.pointer.up(150 + 103, 150)

      // The right edge lands at 403, 3 short of the other frame's left edge at 400.
      expect(canvas.writes[0]?.boxes[LEFT.ref]?.x).toBe(200)
      expect(guides).toBeGreaterThan(0)
    })

    it('stops snapping while Ctrl is held', () => {
      const canvas = setup()
      detach = canvas.detach

      canvas.pointer.drag([150, 150], [150 + 103, 150], { ctrlKey: true })

      expect(canvas.writes[0]?.boxes[LEFT.ref]?.x).toBe(203)
    })

    it('stops snapping the moment Ctrl goes down mid-drag', () => {
      const canvas = setup()
      detach = canvas.detach

      canvas.pointer.down(150, 150)
      canvas.pointer.move(150 + 103, 150)
      dispatchEvent(new KeyboardEvent('keydown', { key: 'Control' }))
      const left = canvas.part(`[data-frame="${LEFT.ref}"]`).style.left
      canvas.pointer.up(150 + 103, 150, { ctrlKey: true })

      expect(left).toBe('203px')
    })
  })

  describe('resizing', () => {
    it('resizes from a corner handle and keeps the opposite corner', () => {
      const canvas = setup()
      detach = canvas.detach
      select(selectionStore, PAGE, [LEFT.ref])

      canvas.pointer.drag([300, 300], [340, 320])

      expect(canvas.writes).toEqual([
        {
          page: PAGE,
          boxes: { [LEFT.ref]: { x: 100, y: 100, width: 240, height: 220 } },
          expected: { [LEFT.ref]: LEFT.box },
        },
      ])
    })

    it('shows the new size in the chip while it drags', () => {
      const canvas = setup()
      detach = canvas.detach
      act(() => select(selectionStore, PAGE, [LEFT.ref]))

      canvas.pointer.down(100, 100)
      canvas.pointer.move(60, 80)

      expect(canvas.part('[data-chip]')).toHaveTextContent('240 × 220')
      canvas.pointer.up(60, 80)
    })

    describe('a frame with a pin', () => {
      const pin = (canvas: ReturnType<typeof setup>, ref: string) =>
        canvas.part(`[data-note-frame="${CSS.escape(ref)}"]`)

      it.each([
        ['north-east', [300, 100], [340, 80], '40px -20px'],
        ['south-east', [300, 300], [340, 320], '40px'],
        ['north-west', [100, 100], [60, 80], '0px -20px'],
        ['south-west', [100, 300], [60, 320], ''],
      ] as const)(
        'shifts the pin by its corner on a drag of the %s handle',
        (_corner, from, to, translate) => {
          const canvas = setup()
          detach = canvas.detach
          act(() => select(selectionStore, PAGE, [LEFT.ref]))

          canvas.pointer.down(from[0], from[1])
          canvas.pointer.move(to[0], to[1])

          expect(pin(canvas, LEFT.ref).style.translate).toBe(translate)
          canvas.pointer.up(to[0], to[1])
        },
      )

      it('leaves the pin of a frame it does not resize', () => {
        const canvas = setup()
        detach = canvas.detach
        act(() => select(selectionStore, PAGE, [LEFT.ref]))

        canvas.pointer.down(300, 300)
        canvas.pointer.move(340, 320)

        expect(pin(canvas, RIGHT.ref).style.translate).toBe('')
        canvas.pointer.up(340, 320)
      })

      it('shifts each pin by its own frame on a resize of several', () => {
        const canvas = setup()
        detach = canvas.detach
        act(() => select(selectionStore, PAGE, [LEFT.ref, RIGHT.ref]))

        // The selection spans 100 to 600, so 100 px more scales it by 1.2.
        canvas.pointer.down(600, 300)
        canvas.pointer.move(700, 300)

        expect([
          pin(canvas, LEFT.ref).style.translate,
          pin(canvas, RIGHT.ref).style.translate,
        ]).toEqual(['40px', '100px'])
        canvas.pointer.up(700, 300)
      })

      it('shifts the pin by the snapped edge rather than the pointer', () => {
        const canvas = setup()
        detach = canvas.detach
        act(() => select(selectionStore, PAGE, [LEFT.ref]))

        // 97 px right puts LEFT's right edge 3 px short of RIGHT's left edge.
        canvas.pointer.down(300, 300)
        canvas.pointer.move(397, 300)

        expect(pin(canvas, LEFT.ref).style.translate).toBe('100px')
        canvas.pointer.up(397, 300)
      })

      it('hands the pin back to its stored corner on release', () => {
        const canvas = setup()
        detach = canvas.detach
        act(() => select(selectionStore, PAGE, [LEFT.ref]))

        canvas.pointer.drag([300, 100], [340, 80])

        expect(pin(canvas, LEFT.ref).style.translate).toBe('')
      })

      it("follows its element's corner as the frame reflows it", async () => {
        const canvas = setup(undefined, {
          live: '<div style="position:absolute;right:20px;top:10px;width:30px;height:10px"></div>',
        })
        detach = canvas.detach
        const iframe = canvas.part('iframe')
        await new Promise((resolve) => iframe.addEventListener('load', resolve))
        // The board draws an element's pin at its corner, 20 px in from LEFT's right edge.
        Object.assign(pin(canvas, LEFT.ref).style, {
          left: '280px',
          top: '110px',
        })
        act(() => select(selectionStore, PAGE, [LEFT.ref]))

        canvas.pointer.down(300, 100)
        canvas.pointer.move(340, 80)

        expect(pin(canvas, LEFT.ref).style.translate).toBe('40px -20px')
        canvas.pointer.up(340, 80)
      })

      it("follows the frame's corner once its element is lost", async () => {
        const canvas = setup(undefined, { live: 'No elements' })
        detach = canvas.detach
        const iframe = canvas.part('iframe')
        await new Promise((resolve) => iframe.addEventListener('load', resolve))
        act(() => select(selectionStore, PAGE, [LEFT.ref]))

        canvas.pointer.down(300, 300)
        canvas.pointer.move(340, 320)

        expect(pin(canvas, LEFT.ref).style.translate).toBe('40px')
        canvas.pointer.up(340, 320)
      })
    })
  })

  describe('on a selected element', () => {
    /** An element inside LEFT, outlined at this canvas box. */
    const ELEMENT_BOX = { x: 150, y: 150, width: 100, height: 50 }
    const ELEMENT = { frame: LEFT.ref, index: 5, hash: 'a'.repeat(64) }

    function setupWithElement() {
      const canvas = setup(undefined, { elementBox: ELEMENT_BOX })
      detach = canvas.detach
      act(() => selectElement(selectionStore, PAGE, ELEMENT))
      return canvas
    }

    it('moves the element to the drop, not the frame, on a drag from inside it', () => {
      const canvas = setupWithElement()

      canvas.pointer.drag([200, 175], [200, 260])

      expect(canvas.writes).toEqual([])
      expect(canvas.moves).toEqual([
        { page: PAGE, at: { x: 200, y: 260 }, key: ELEMENT },
      ])
      expect(selectionStore.getState().element).toEqual(ELEMENT)
    })

    it.each([
      [200, 150],
      [150, 150],
      [250, 200],
    ] as const)(
      'moves the element on a drag from its outline at %i, %i',
      (x, y) => {
        const canvas = setupWithElement()

        canvas.pointer.drag([x, y], [x + 40, y + 30])

        expect(canvas.writes).toEqual([])
        expect(canvas.moves).toMatchObject([{ key: ELEMENT }])
      },
    )

    it('marks the element carried while the drag runs and clears it on release', () => {
      const canvas = setupWithElement()

      canvas.pointer.down(200, 175)
      canvas.pointer.move(200, 260)

      expect(carriedStore.getState().carried).toEqual(ELEMENT)

      canvas.pointer.up(200, 260)

      expect(carriedStore.getState().carried).toBeNull()
    })

    it('takes the frame out of the selection on a Shift-click inside the element', () => {
      const canvas = setupWithElement()

      canvas.pointer.click(200, 175, { shiftKey: true })

      expect(selectedRefs()).toEqual([])
    })

    it('moves no element while the tab may not write', () => {
      const canvas = setup(undefined, {
        elementBox: ELEMENT_BOX,
        canWrite: false,
      })
      detach = canvas.detach
      act(() => selectElement(selectionStore, PAGE, ELEMENT))

      canvas.pointer.drag([200, 175], [200, 260])

      expect(canvas.moves).toEqual([])
      expect(canvas.writes).toEqual([])
    })

    it('still moves the frame on a drag from its label strip', () => {
      const canvas = setupWithElement()

      canvas.pointer.drag([150, 95], [190, 95])

      expect(canvas.moves).toEqual([])
      expect(canvas.writes).toHaveLength(1)
    })

    it('shifts the element outline with its frame while the frame drags', () => {
      const canvas = setupWithElement()

      canvas.pointer.down(150, 95)
      canvas.pointer.move(190, 125)

      expect(canvas.part('[data-element-selection]').style.transform).toBe(
        'translate(40px, 30px)',
      )
      canvas.pointer.up(190, 125)
    })

    it('shifts the pin of the dragged frame and no other frame while it drags', () => {
      const canvas = setupWithElement()
      const pin = (ref: string) =>
        canvas.part(`[data-note-frame="${CSS.escape(ref)}"]`)

      canvas.pointer.down(150, 95)
      canvas.pointer.move(190, 125)

      expect(pin(LEFT.ref).style.translate).toBe('40px 30px')
      expect(pin(RIGHT.ref).style.translate).toBe('')
      canvas.pointer.up(190, 125)
    })

    it('hands the pin back to its stored corner on release', () => {
      const canvas = setupWithElement()

      canvas.pointer.drag([150, 95], [190, 125])

      expect(
        canvas.part(`[data-note-frame="${CSS.escape(LEFT.ref)}"]`).style
          .translate,
      ).toBe('')
    })

    it('shifts the pin by the snapped offset rather than the pointer delta', () => {
      const canvas = setup()
      detach = canvas.detach
      act(() => select(selectionStore, PAGE, [LEFT.ref]))

      // 97 px right puts LEFT's right edge 3 px short of RIGHT's left edge.
      canvas.pointer.down(150, 95)
      canvas.pointer.move(247, 95)

      expect(
        canvas.part(`[data-note-frame="${CSS.escape(LEFT.ref)}"]`).style
          .translate,
      ).toBe('100px')
      canvas.pointer.up(247, 95)
    })

    it('hands the element outline back to its drawn box on release', () => {
      const canvas = setupWithElement()

      canvas.pointer.drag([150, 95], [190, 125])

      expect(canvas.part('[data-element-selection]').style.transform).toBe('')
    })

    describe('that is placed', () => {
      const PLACED = { left: 40, top: 30 }

      function setupPlaced(live?: string) {
        const canvas = setup(undefined, {
          elementBox: ELEMENT_BOX,
          placed: PLACED,
          live,
        })
        detach = canvas.detach
        return canvas
      }

      it('moves its offsets by the drag and writes them once on release', () => {
        const canvas = setupPlaced()
        act(() => selectElement(selectionStore, PAGE, ELEMENT))

        canvas.pointer.down(200, 175)
        canvas.pointer.move(225, 155)

        expect(canvas.placedMoves).toMatchObject([
          { page: PAGE, key: ELEMENT, previews: [{ left: 65, top: 10 }] },
        ])
        expect(canvas.placedMoves[0]?.commits).toEqual([])

        canvas.pointer.up(225, 155)

        expect([
          canvas.placedMoves[0]?.commits,
          canvas.moves,
          canvas.writes,
        ]).toEqual([[{ left: 65, top: 10 }], [], []])
      })

      it('keeps Esc from the key registry, so the selection stays on the element', async () => {
        const canvas = setupPlaced()
        act(() => selectElement(selectionStore, PAGE, ELEMENT))
        const ran: string[] = []
        const unregister = registerActions([
          {
            id: 'test.escape',
            label: 'Escape',
            group: 'selection',
            keys: ['Escape'],
            run: () => ran.push('escape'),
          },
        ])
        const unbind = bindKeys(window)

        canvas.pointer.down(200, 175)
        canvas.pointer.move(225, 155)
        await userEvent.keyboard('{Escape}')
        canvas.pointer.up(225, 155)
        unbind()
        unregister()

        expect([ran, canvas.placedMoves[0]?.cancelled]).toEqual([[], true])
      })

      it('puts it back and writes nothing on Esc mid-drag', () => {
        const canvas = setupPlaced()
        act(() => selectElement(selectionStore, PAGE, ELEMENT))

        canvas.pointer.down(200, 175)
        canvas.pointer.move(225, 155)
        act(() => {
          dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        })
        canvas.pointer.up(225, 155)

        expect([
          canvas.placedMoves[0]?.commits,
          canvas.placedMoves[0]?.cancelled,
          canvas.moves,
        ]).toEqual([[], true, []])
      })

      it('carries the pin pinned on it while the drag runs', () => {
        const canvas = setupPlaced('<p>x</p>')
        act(() => selectElement(selectionStore, PAGE, { ...ELEMENT, index: 3 }))

        canvas.pointer.down(200, 175)
        canvas.pointer.move(225, 155)

        expect(
          canvas.part(`[data-note-frame="${LEFT.ref}"]`).style.translate,
        ).toBe('25px -20px')
      })
    })

    describe('that is a shape', () => {
      function setupWithShape(shape: 'free' | 'held' = 'free') {
        const canvas = setup(undefined, { elementBox: ELEMENT_BOX, shape })
        detach = canvas.detach
        act(() => selectElement(selectionStore, PAGE, ELEMENT))
        return canvas
      }

      it('resizes from its south-east corner and writes the size once on release', () => {
        const canvas = setupWithShape()

        canvas.pointer.down(250, 200)
        canvas.pointer.move(290, 230)

        expect(canvas.resizes).toMatchObject([
          { page: PAGE, key: ELEMENT, previews: [{ width: 140, height: 80 }] },
        ])
        expect(canvas.resizes[0]?.commits).toEqual([])

        canvas.pointer.up(290, 230)

        expect(canvas.resizes[0]?.commits).toEqual([{ width: 140, height: 80 }])
        expect(canvas.moves).toEqual([])
        expect(canvas.writes).toEqual([])
      })

      it('keeps the starting ratio while Shift is held', () => {
        const canvas = setupWithShape()

        canvas.pointer.drag([250, 200], [350, 210], { shiftKey: true })

        expect(canvas.resizes[0]?.commits).toEqual([
          { width: 200, height: 100 },
        ])
      })

      it('writes nothing on a drag that ends at the size it started', () => {
        const canvas = setupWithShape()

        canvas.pointer.down(150, 150)
        canvas.pointer.move(110, 150)
        canvas.pointer.move(150, 150)
        canvas.pointer.up(150, 150)

        expect(canvas.resizes[0]?.commits).toEqual([])
        expect(canvas.resizes[0]?.cancelled).toBe(true)
      })

      it('writes nothing on a drag back to the start of a shape drawn at a fractional box', () => {
        const canvas = setup(undefined, {
          elementBox: { x: 150.4, y: 150, width: 100.2, height: 50 },
          shape: 'free',
        })
        detach = canvas.detach
        act(() => selectElement(selectionStore, PAGE, ELEMENT))

        canvas.pointer.down(250, 200)
        canvas.pointer.move(290, 200)
        canvas.pointer.move(250, 200)
        canvas.pointer.up(250, 200)

        expect(canvas.resizes[0]?.commits).toEqual([])
        expect(canvas.resizes[0]?.cancelled).toBe(true)
      })

      it('previews nothing and writes nothing on a frame another session holds', () => {
        const canvas = setupWithShape('held')

        canvas.pointer.drag([250, 200], [290, 230])

        expect(canvas.resizes).toEqual([])
        expect(canvas.moves).toEqual([])
      })

      it('still moves the shape on a drag from inside it', () => {
        const canvas = setupWithShape()

        canvas.pointer.drag([200, 175], [200, 260])

        expect(canvas.resizes).toEqual([])
        expect(canvas.moves).toMatchObject([{ key: ELEMENT }])
      })

      it('resizes nothing while the tab may not write', () => {
        const canvas = setup(undefined, {
          elementBox: ELEMENT_BOX,
          shape: 'free',
          canWrite: false,
        })
        detach = canvas.detach
        act(() => selectElement(selectionStore, PAGE, ELEMENT))

        canvas.pointer.drag([250, 200], [290, 230])

        expect(canvas.resizes).toEqual([])
      })
    })

    it('keeps the element on a click on its outline', () => {
      const canvas = setupWithElement()

      canvas.pointer.click(250, 175)

      expect(selectionStore.getState().element).toEqual(ELEMENT)
    })

    it('selects the frame on a click inside the element away from its outline', () => {
      const canvas = setupWithElement()

      canvas.pointer.click(200, 175)

      expect(selectedRefs()).toEqual([LEFT.ref])
      expect(selectionStore.getState().element).toBeNull()
    })

    describe('while an inspector field has focus', () => {
      /** An inspector field holding focus, as one does mid-edit. */
      function focusField(): HTMLInputElement {
        const panel = document.createElement('aside')
        panel.dataset.inspector = ''
        const field = document.createElement('input')
        panel.append(field)
        document.body.append(panel)
        field.focus()
        return field
      }

      afterEach(() => {
        document.querySelector('[data-inspector]')?.remove()
      })

      it('blurs the field and keeps the element on a click in its frame', () => {
        const canvas = setupWithElement()
        const field = focusField()

        canvas.pointer.click(200, 260)

        expect(field).not.toHaveFocus()
        expect(selectionStore.getState().element).toEqual(ELEMENT)
      })

      it('keeps the element on a click over empty canvas, and the next click clears it', () => {
        const canvas = setupWithElement()
        focusField()

        canvas.pointer.click(700, 550)

        expect(selectionStore.getState().element).toEqual(ELEMENT)

        canvas.pointer.click(700, 550)

        expect(selectedRefs()).toEqual([])
      })

      it('keeps the element on a click on another frame', () => {
        const canvas = setupWithElement()
        focusField()

        canvas.pointer.click(500, 200)

        expect(selectionStore.getState().element).toEqual(ELEMENT)
      })

      it('still moves the frame on a drag, keeping the element', () => {
        const canvas = setupWithElement()
        focusField()

        canvas.pointer.drag([200, 260], [240, 280])

        expect(canvas.writes[0]?.boxes[LEFT.ref]).toEqual({
          ...LEFT.box,
          x: 140,
          y: 120,
        })
        expect(selectionStore.getState().element).toEqual(ELEMENT)
      })

      it('selects and moves another frame a drag starts on', () => {
        const canvas = setupWithElement()
        focusField()

        canvas.pointer.drag([500, 200], [520, 220])

        expect(selectedRefs()).toEqual([RIGHT.ref])
        expect(canvas.writes[0]?.boxes[RIGHT.ref]).toEqual({
          ...RIGHT.box,
          x: 420,
          y: 120,
        })
      })
    })

    it('moves rather than resizes from a frame corner, whose handle is hidden', () => {
      const canvas = setupWithElement()

      canvas.pointer.drag([300, 300], [340, 320])

      expect(canvas.writes[0]?.boxes[LEFT.ref]).toEqual({
        ...LEFT.box,
        x: 140,
        y: 120,
      })
    })
  })

  describe('on a previewed frame', () => {
    afterEach(() => {
      endPreview([LEFT.ref, RIGHT.ref])
    })

    it('selects the frame through the width it is previewed at', () => {
      const canvas = setup([LEFT])
      detach = canvas.detach
      setPreview([LEFT.ref], 500)

      canvas.pointer.click(450, 150)

      expect(selectedRefs()).toEqual([LEFT.ref])
    })

    it('ends the preview on a move and writes the stored width', () => {
      const canvas = setup([LEFT])
      detach = canvas.detach
      setPreview([LEFT.ref], 500)

      canvas.pointer.drag([450, 150], [480, 175])

      expect(canvas.writes).toEqual([
        {
          page: PAGE,
          boxes: { [LEFT.ref]: { x: 130, y: 125, width: 200, height: 200 } },
          expected: { [LEFT.ref]: LEFT.box },
        },
      ])
      expect(previewOf(LEFT.ref)).toBeUndefined()
    })

    it('keeps the preview through a click', () => {
      const canvas = setup([LEFT])
      detach = canvas.detach
      setPreview([LEFT.ref], 500)

      canvas.pointer.click(450, 150)

      expect(previewOf(LEFT.ref)).toEqual({ width: 500 })
    })

    it('ends the preview on a resize from the drawn corner and resizes the stored box', () => {
      const canvas = setup([LEFT])
      detach = canvas.detach
      act(() => select(selectionStore, PAGE, [LEFT.ref]))
      setPreview([LEFT.ref], 500)

      canvas.pointer.drag([600, 300], [640, 320])

      expect(canvas.writes[0]?.boxes[LEFT.ref]).toEqual({
        x: 100,
        y: 100,
        width: 240,
        height: 220,
      })
      expect(previewOf(LEFT.ref)).toBeUndefined()
    })
  })
})
