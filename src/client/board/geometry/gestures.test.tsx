import '../../styles.css'

import { act, render } from '@testing-library/react'
import { Profiler } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import type { FrameRecord } from '@/shared/records/list'
import { frameOf } from '@/test/board'

import { createModeStore } from '../mode'
import { endPreview, previewOf, setPreview } from '../preview/store'
import { clear, select, selectElement, selectionStore } from '../selection'
import type { Box } from './box'
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
  }: {
    canWrite?: boolean
    onCommit?: () => void
    elementBox?: Box
    /** A findings badge drawn in the label strip above a frame, at a canvas box. */
    badge?: { ref: string; box: Box }
    /** A button drawn in the label strip above a frame, at a canvas box. */
    control?: { box: Box; onClick: () => void }
    /** A compared frame's split divider, at a canvas box. */
    divider?: Box
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
  const view = render(
    <Profiler id="canvas" onRender={onCommit}>
      <div
        data-viewport
        className="relative overflow-hidden"
        style={{ width: 800, height: 600 }}
      >
        <div data-layer className="absolute top-0 left-0 origin-top-left">
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
            />
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
    { viewport, layer: part('[data-layer]'), page: PAGE, frames: () => frames },
    {
      selection: selectionStore,
      mode,
      canWrite: () => canWrite,
      write: async (page, boxes, expected) => {
        writes.push({ page, boxes, expected })
        return true
      },
      duplicate: async (refs, offset) => {
        duplicates.push({ refs, offset })
        return []
      },
      openFindings: (ref) => opened.push(ref),
      splitAt: (clientX) => splits.push(clientX - origin.left),
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

    it('moves nothing on a drag from the outline and keeps the element', () => {
      const canvas = setupWithElement()

      canvas.pointer.drag([200, 150], [240, 190])

      expect(canvas.writes).toEqual([])
      expect(selectionStore.getState().element).toEqual(ELEMENT)
    })

    it.each([
      [150, 150],
      [250, 150],
      [150, 200],
      [250, 200],
    ] as const)(
      'moves nothing on a drag from the corner mark at %i, %i',
      (x, y) => {
        const canvas = setupWithElement()

        canvas.pointer.drag([x, y], [x + 40, y + 30])

        expect(canvas.writes).toEqual([])
        expect(selectionStore.getState().element).toEqual(ELEMENT)
      },
    )

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
