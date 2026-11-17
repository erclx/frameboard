import '../../styles.css'

import { act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SectionRecord } from '@/shared/records/list'
import { frameOf } from '@/test/board'

import { holdOutline } from '../element/held'
import {
  clear,
  type ElementKey,
  select,
  selectElement,
  selectionStore,
  selectSection,
} from '../selection'
import { attachCanvas } from '../view'
import type { Box } from './box'
import { REVEAL_DELAY_MS } from './gestures'
import {
  LEFT,
  LOCKED,
  PAGE,
  pressEscape,
  RIGHT,
  selectedRefs,
  setup,
} from './gestures-harness'

describe('attachGestures', () => {
  let detach = () => {}

  afterEach(() => {
    detach()
    clear(selectionStore)
    holdOutline(null)
  })

  it('starts no gesture while Space is held for a pan', () => {
    const canvas = setup()
    detach = canvas.detach
    canvas.mode.setState({ spacePan: true })

    canvas.pointer.drag([150, 150], [190, 210])

    expect([selectedRefs(), canvas.writes]).toEqual([[], []])
  })

  // First in the file, since d3-drag swallows the click after a drag's tick.
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

  describe('the cursor over a corner mark', () => {
    const SECTION: SectionRecord = {
      name: 'flow',
      box: { x: 60, y: 60, width: 300, height: 300 },
      order: 0,
      frames: ['left'],
    }
    const ELEMENT: ElementKey = { frame: LEFT.ref, index: 3, hash: 'abc' }
    const ELEMENT_BOX = { x: 150, y: 150, width: 100, height: 40 }

    it.each([
      ['se', 300, 300, 'nwse-resize'],
      ['nw', 100, 100, 'nwse-resize'],
      ['ne', 300, 100, 'nesw-resize'],
      ['sw', 100, 300, 'nesw-resize'],
    ] as const)(
      'takes the %s handle of a selected frame',
      (_, x, y, cursor) => {
        const canvas = setup()
        detach = canvas.detach
        act(() => select(selectionStore, PAGE, [LEFT.ref]))

        expect(canvas.cursorOver(x, y)).toBe(cursor)
      },
    )

    it('answers nothing off the marks', () => {
      const canvas = setup()
      detach = canvas.detach
      act(() => select(selectionStore, PAGE, [LEFT.ref]))

      expect(canvas.cursorOver(200, 200)).toBeNull()
    })

    it('answers nothing over an unselected frame', () => {
      const canvas = setup()
      detach = canvas.detach
      act(() => select(selectionStore, PAGE, [LEFT.ref]))

      expect(canvas.cursorOver(600, 300)).toBeNull()
    })

    it('takes the mark of an element that resizes', () => {
      const canvas = setup(undefined, {
        elementBox: ELEMENT_BOX,
        shape: 'free',
      })
      detach = canvas.detach
      act(() => selectElement(selectionStore, PAGE, ELEMENT))

      expect(canvas.cursorOver(250, 190)).toBe('nwse-resize')
    })

    it('answers nothing over the corner of an element that takes no resize, as a rotated one does', () => {
      const canvas = setup(undefined, { elementBox: ELEMENT_BOX })
      detach = canvas.detach
      act(() => selectElement(selectionStore, PAGE, ELEMENT))

      expect(canvas.cursorOver(250, 190)).toBeNull()
    })

    it("leaves the frame's handle out while an element inside is selected", () => {
      const canvas = setup(undefined, {
        elementBox: ELEMENT_BOX,
        shape: 'free',
      })
      detach = canvas.detach
      act(() => selectElement(selectionStore, PAGE, ELEMENT))

      expect(canvas.cursorOver(300, 300)).toBeNull()
    })

    it('takes the corner of a selected section', () => {
      const canvas = setup(undefined, { sections: [SECTION] })
      detach = canvas.detach
      act(() => selectSection(selectionStore, PAGE, 'flow'))

      expect(canvas.cursorOver(360, 60)).toBe('nesw-resize')
    })

    it('answers nothing over a section corner while it is unselected', () => {
      const canvas = setup(undefined, { sections: [SECTION] })
      detach = canvas.detach

      expect(canvas.cursorOver(360, 60)).toBeNull()
    })

    it('answers nothing over the handle of a locked frame, which never resizes', () => {
      const canvas = setup()
      detach = canvas.detach
      act(() => select(selectionStore, PAGE, [LOCKED.ref]))

      expect(canvas.cursorOver(300, 500)).toBeNull()
    })

    it('answers nothing in a tab that cannot write', () => {
      const canvas = setup(undefined, { canWrite: false })
      detach = canvas.detach
      act(() => select(selectionStore, PAGE, [LEFT.ref]))

      expect(canvas.cursorOver(300, 300)).toBeNull()
    })

    it('leaves an armed tool its own cursor', () => {
      const canvas = setup()
      detach = canvas.detach
      act(() => select(selectionStore, PAGE, [LEFT.ref]))
      canvas.mode.setState({ tool: 'frame' })

      expect(canvas.cursorOver(300, 300)).toBeNull()
    })

    it('leaves held Space its own cursor', () => {
      const canvas = setup()
      detach = canvas.detach
      act(() => select(selectionStore, PAGE, [LEFT.ref]))
      canvas.mode.setState({ spacePan: true })

      expect(canvas.cursorOver(300, 300)).toBeNull()
    })

    it('leaves a label control over the corner to its click', () => {
      const canvas = setup(undefined, {
        control: {
          box: { x: 290, y: 90, width: 20, height: 20 },
          onClick: () => {},
        },
      })
      detach = canvas.detach
      act(() => select(selectionStore, PAGE, [LEFT.ref]))

      expect(canvas.cursorOver(300, 100)).toBeNull()
    })

    it('leaves a card drawn over the corner its own cursor, since a press there reaches no mark', () => {
      const canvas = setup()
      detach = canvas.detach
      act(() => select(selectionStore, PAGE, [LEFT.ref]))

      expect(
        canvas.cursorOver(300, 300, canvas.part('[data-notes-layer]')),
      ).toBeNull()
    })

    it('holds through a resize drag that outruns the mark, until release', () => {
      const canvas = setup()
      detach = canvas.detach
      act(() => select(selectionStore, PAGE, [LEFT.ref]))

      canvas.pointer.down(300, 300)
      canvas.pointer.move(380, 360)
      const during = canvas.cursorOver(380, 360)
      canvas.pointer.up(380, 360)

      expect(during).toBe('nwse-resize')
      expect(canvas.cursorOver(700, 500)).toBeNull()
    })

    it('holds through a drag of a section corner', () => {
      const canvas = setup(undefined, { sections: [SECTION] })
      detach = canvas.detach
      act(() => selectSection(selectionStore, PAGE, 'flow'))

      canvas.pointer.down(360, 360)
      canvas.pointer.move(420, 400)
      const during = canvas.cursorOver(420, 400)
      canvas.pointer.up(420, 400)

      expect(during).toBe('nwse-resize')
    })

    it("stays off while a marquee crosses a selected frame's handle", () => {
      const canvas = setup()
      detach = canvas.detach
      act(() => select(selectionStore, PAGE, [LEFT.ref]))

      canvas.pointer.down(50, 50)
      canvas.pointer.move(100, 100)
      const during = canvas.cursorOver(100, 100)
      canvas.pointer.up(100, 100)

      expect(during).toBeNull()
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

    it('opens on the first press while an inspector scrub track holds focus, since a track holds no edit to leave', () => {
      const { pointer, opened } = setup(undefined, { badge: BADGE })
      const panel = document.createElement('aside')
      panel.dataset.inspector = ''
      const track = document.createElement('input')
      track.type = 'range'
      panel.append(track)
      document.body.append(panel)
      track.focus()

      pointer.click(150, 88)
      panel.remove()

      expect(opened).toEqual([LEFT.ref])
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

  describe('on a section', () => {
    // Holds LEFT alone, and every offset below stays outside the snap.
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
      const above = {
        ...FLOW,
        box: { x: 390, y: 80, width: 300, height: 300 },
      }
      const canvas = setup(undefined, { sections: [above] })
      detach = canvas.detach

      canvas.pointer.click(400, 88)

      expect([selectedRefs(), selectionStore.getState().section]).toEqual([
        [],
        'flow',
      ])
    })

    it('leaves a press on a frame over its name to the frame', () => {
      const under = {
        ...FLOW,
        box: { x: 390, y: 90, width: 300, height: 300 },
      }
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

    describe('when Esc cancels it', () => {
      it('puts a move back with its frames and writes nothing on release', () => {
        const canvas = setup(undefined, { sections: [FLOW] })
        detach = canvas.detach

        canvas.pointer.down(...NAME)
        canvas.pointer.move(95, 88)
        pressEscape()
        canvas.pointer.up(95, 88)

        const style = (selector: string) => canvas.part(selector).style
        expect([
          style('[data-section="flow"]').left,
          style('[data-section="flow"]').top,
          style(`[data-frame="${LEFT.ref}"]`).left,
          style(`[data-frame="${LEFT.ref}"]`).top,
          canvas.writes,
        ]).toEqual(['60px', '60px', '100px', '100px', []])
      })

      it('puts the pins and guides of a move back, with the button still down', () => {
        const canvas = setup(undefined, { sections: [FLOW] })
        detach = canvas.detach

        canvas.pointer.down(...NAME)
        canvas.pointer.move(107, 68)
        const guided = canvas.part('[data-guides]').childElementCount
        pressEscape()

        expect(guided).toBeGreaterThan(0)
        expect([
          canvas.part(`[data-note-frame="${LEFT.ref}"]`).style.translate,
          canvas.part('[data-guides]').childElementCount,
        ]).toEqual(['', 0])
        canvas.pointer.up(107, 68)
      })

      it('puts a corner resize back and writes nothing on release', () => {
        const canvas = setup(undefined, { sections: [FLOW] })
        detach = canvas.detach
        act(() => selectSection(selectionStore, PAGE, 'flow'))

        canvas.pointer.down(360, 360)
        canvas.pointer.move(380, 375)
        pressEscape()
        canvas.pointer.up(380, 375)

        const section = canvas.part('[data-section="flow"]').style
        expect([section.width, section.height, canvas.writes]).toEqual([
          '300px',
          '300px',
          [],
        ])
      })
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

    describe('when Esc cancels the marquee', () => {
      it('hides the rect and keeps the selection', () => {
        const canvas = setup()
        detach = canvas.detach
        select(selectionStore, PAGE, [RIGHT.ref])

        canvas.pointer.down(50, 50)
        canvas.pointer.move(180, 150)
        pressEscape()
        const hidden = canvas.part('[data-marquee]').hidden
        canvas.pointer.up(180, 150)

        expect([hidden, selectedRefs()]).toEqual([true, [RIGHT.ref]])
      })

      it('keeps the prior selection of a Shift-marquee', () => {
        const canvas = setup()
        detach = canvas.detach
        select(selectionStore, PAGE, [RIGHT.ref])

        canvas.pointer.down(50, 50, { shiftKey: true })
        canvas.pointer.move(180, 150, { shiftKey: true })
        pressEscape()
        canvas.pointer.up(180, 150, { shiftKey: true })

        expect(selectedRefs()).toEqual([RIGHT.ref])
      })
    })

    it('selects nothing while the Note tool is picked', () => {
      const canvas = setup()
      detach = canvas.detach
      canvas.mode.setState({ tool: 'note' })

      canvas.pointer.click(150, 150)

      expect(selectedRefs()).toEqual([])
    })
  })

  describe('revealing the clicked frame', () => {
    afterEach(() => {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
    })

    /** A view showing the canvas up to x 500, so RIGHT sits half outside it, under a panel. */
    function watchView(visible: Box = { x: 0, y: 0, width: 500, height: 600 }) {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const centered: Box[] = []
      const stop = attachCanvas(
        {
          zoomBy: () => {},
          zoomTo: () => {},
          fit: () => {},
          fitTo: () => {},
          panBy: () => {},
          centerOn: (box) => centered.push(box),
          visible: () => visible,
        },
        PAGE,
      )
      return { centered, stop }
    }

    it('centers a frame partly out of view once the double-click window passes', () => {
      const canvas = setup()
      const view = watchView()
      detach = () => {
        canvas.detach()
        view.stop()
      }

      canvas.pointer.click(450, 150)
      const before = [...view.centered]
      vi.advanceTimersByTime(REVEAL_DELAY_MS)

      expect(before).toEqual([])
      expect(view.centered).toEqual([RIGHT.box])
    })

    it('leaves the view put on a double-click, which picks through it', () => {
      const canvas = setup()
      const view = watchView()
      detach = () => {
        canvas.detach()
        view.stop()
      }

      canvas.pointer.click(450, 150)
      canvas.pointer.click(450, 150)
      vi.advanceTimersByTime(REVEAL_DELAY_MS)

      expect(view.centered).toEqual([])
    })

    it('leaves the view put on a click on the frame already selected', () => {
      const canvas = setup()
      const view = watchView()
      detach = () => {
        canvas.detach()
        view.stop()
      }
      select(selectionStore, PAGE, [RIGHT.ref])

      canvas.pointer.click(450, 150)
      vi.advanceTimersByTime(REVEAL_DELAY_MS)

      expect(view.centered).toEqual([])
    })

    it('never fits a frame larger than the view', () => {
      const canvas = setup()
      const view = watchView({ x: 0, y: 0, width: 150, height: 600 })
      detach = () => {
        canvas.detach()
        view.stop()
      }

      canvas.pointer.click(120, 150)
      vi.advanceTimersByTime(REVEAL_DELAY_MS)

      expect(view.centered).toEqual([])
    })

    it('leaves the view put for a frame wholly in view', () => {
      const canvas = setup()
      const view = watchView()
      detach = () => {
        canvas.detach()
        view.stop()
      }

      canvas.pointer.click(150, 150)
      vi.advanceTimersByTime(REVEAL_DELAY_MS)

      expect(view.centered).toEqual([])
    })

    it('leaves the view put on a Shift-click', () => {
      const canvas = setup()
      const view = watchView()
      detach = () => {
        canvas.detach()
        view.stop()
      }

      canvas.pointer.click(450, 150, { shiftKey: true })
      vi.advanceTimersByTime(REVEAL_DELAY_MS)

      expect(view.centered).toEqual([])
    })

    it('leaves the view put on a marquee', () => {
      const canvas = setup()
      const view = watchView()
      detach = () => {
        canvas.detach()
        view.stop()
      }

      canvas.pointer.drag([50, 50], [450, 150])
      vi.advanceTimersByTime(REVEAL_DELAY_MS)

      expect(view.centered).toEqual([])
    })

    it('leaves the view put on a drag that starts on a frame', () => {
      const canvas = setup()
      const view = watchView()
      detach = () => {
        canvas.detach()
        view.stop()
      }

      canvas.pointer.drag([450, 150], [470, 170])
      vi.advanceTimersByTime(REVEAL_DELAY_MS)

      expect(view.centered).toEqual([])
    })
  })
})
