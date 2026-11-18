import '../../styles.css'

import { act, renderHook } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { bindKeys, registerActions } from '@/client/actions/registry'

import { holdOutline } from '../element/held'
import { usePinCorners } from '../pin-corner'
import { endPreview, previewOf, setPreview } from '../preview/store'
import { clear, select, selectionStore } from '../selection'
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

    it('leaves the layer unmarked, since no element outline carries', () => {
      const canvas = setup()
      detach = canvas.detach
      const layer = canvas.part('[data-layer]')

      canvas.pointer.down(150, 150)
      canvas.pointer.move(180, 175)

      expect(layer.hasAttribute('data-carrying')).toBe(false)
      canvas.pointer.up(180, 175)
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

    describe('when Esc cancels it', () => {
      const element = { x: 120, y: 120, width: 20, height: 20 }

      it('puts the frame back and writes nothing on release', () => {
        const canvas = setup()
        detach = canvas.detach

        canvas.pointer.down(150, 150)
        canvas.pointer.move(180, 175)
        pressEscape()
        canvas.pointer.up(180, 175)

        const left = canvas.part(`[data-frame="${LEFT.ref}"]`)
        expect([left.style.left, left.style.top, canvas.writes]).toEqual([
          '100px',
          '100px',
          [],
        ])
      })

      it('puts back every selected frame and pin at the press, with the button still down', () => {
        const canvas = setup()
        detach = canvas.detach
        act(() => select(selectionStore, PAGE, [LEFT.ref, RIGHT.ref]))

        canvas.pointer.down(150, 150)
        canvas.pointer.move(150, 200)
        pressEscape()

        expect([
          canvas.part(`[data-frame="${LEFT.ref}"]`).style.top,
          canvas.part(`[data-frame="${RIGHT.ref}"]`).style.top,
          canvas.part(`[data-note-frame="${LEFT.ref}"]`).style.translate,
          canvas.part(`[data-note-frame="${RIGHT.ref}"]`).style.translate,
        ]).toEqual(['100px', '100px', '', ''])
        canvas.pointer.up(150, 200)
      })

      it('puts the drawn selection and the element outline back at the press', () => {
        const canvas = setup(undefined, { elementBox: element })
        detach = canvas.detach
        act(() => select(selectionStore, PAGE, [LEFT.ref]))

        canvas.pointer.down(150, 150)
        canvas.pointer.move(180, 175)
        pressEscape()

        expect([
          canvas.part('[data-selection]').style.transform,
          canvas.part('[data-element-selection]').style.transform,
          canvas.part('[data-move-chip]').hidden,
        ]).toEqual(['', '', true])
        canvas.pointer.up(180, 175)
      })

      it('clears a snap guide at the press', () => {
        const canvas = setup()
        detach = canvas.detach

        canvas.pointer.down(150, 150)
        canvas.pointer.move(150 + 103, 150)
        pressEscape()

        expect(canvas.part('[data-guides]').childElementCount).toBe(0)
        canvas.pointer.up(150 + 103, 150)
      })

      it('lands no copy of an Alt-drag', () => {
        const canvas = setup()
        detach = canvas.detach

        canvas.pointer.down(150, 150, { altKey: true })
        canvas.pointer.move(190, 210, { altKey: true })
        pressEscape()
        canvas.pointer.up(190, 210, { altKey: true })

        expect([canvas.duplicates, canvas.writes]).toEqual([[], []])
      })

      it('stays cancelled through more movement before release', () => {
        const canvas = setup()
        detach = canvas.detach

        canvas.pointer.down(150, 150)
        canvas.pointer.move(180, 175)
        pressEscape()
        canvas.pointer.move(260, 240)
        dispatchEvent(new KeyboardEvent('keydown', { key: 'Control' }))
        canvas.pointer.up(260, 240)

        expect([
          canvas.part(`[data-frame="${LEFT.ref}"]`).style.left,
          canvas.writes,
        ]).toEqual(['100px', []])
      })

      it('keeps the selection from the first Esc and hands the second to the key registry', async () => {
        const canvas = setup()
        detach = canvas.detach
        const ran: string[] = []
        const unregister = registerActions([
          {
            id: 'test.escape',
            label: 'Escape',
            group: 'selection',
            palette: false,
            keys: ['Escape'],
            run: () => ran.push('escape'),
          },
        ])
        const unbind = bindKeys(window)

        canvas.pointer.down(150, 150)
        canvas.pointer.move(180, 175)
        await userEvent.keyboard('{Escape}')
        const afterFirst = [...ran]
        await userEvent.keyboard('{Escape}')
        const afterSecond = [...ran]
        canvas.pointer.up(180, 175)
        unbind()
        unregister()

        expect([afterFirst, afterSecond, selectedRefs()]).toEqual([
          [],
          ['escape'],
          [LEFT.ref],
        ])
      })

      it('leaves Esc to the key registry before the press becomes a drag', async () => {
        const canvas = setup()
        detach = canvas.detach
        const ran: string[] = []
        const unregister = registerActions([
          {
            id: 'test.escape',
            label: 'Escape',
            group: 'selection',
            palette: false,
            keys: ['Escape'],
            run: () => ran.push('escape'),
          },
        ])
        const unbind = bindKeys(window)

        canvas.pointer.down(150, 150)
        await userEvent.keyboard('{Escape}')
        canvas.pointer.up(150, 150)
        unbind()
        unregister()

        expect([ran, selectedRefs()]).toEqual([['escape'], [LEFT.ref]])
      })

      it('leaves Esc to the key registry on a locked frame', async () => {
        const canvas = setup()
        detach = canvas.detach
        const ran: string[] = []
        const unregister = registerActions([
          {
            id: 'test.escape',
            label: 'Escape',
            group: 'selection',
            palette: false,
            keys: ['Escape'],
            run: () => ran.push('escape'),
          },
        ])
        const unbind = bindKeys(window)

        canvas.pointer.down(150, 450)
        canvas.pointer.move(250, 480)
        await userEvent.keyboard('{Escape}')
        canvas.pointer.up(250, 480)
        unbind()
        unregister()

        expect([ran, canvas.writes]).toEqual([['escape'], []])
      })
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

      expect(canvas.part('[data-move-chip]')).toHaveTextContent('240 × 220')
      expect(canvas.part('[data-chip]')).not.toBeVisible()
      canvas.pointer.up(60, 80)
    })

    it('keeps the resting chip and its controls once the drag ends', () => {
      const canvas = setup()
      detach = canvas.detach
      act(() => select(selectionStore, PAGE, [LEFT.ref]))

      canvas.pointer.down(100, 100)
      canvas.pointer.move(60, 80)
      canvas.pointer.up(60, 80)

      expect(canvas.part('[data-move-chip]')).not.toBeVisible()
      expect(canvas.part('[data-chip]')).toBeVisible()
      expect(
        canvas.part('[data-chip] [aria-label="Next frame"]'),
      ).toBeInTheDocument()
    })

    describe('when Esc cancels it', () => {
      it('puts the frame back and writes nothing on release', () => {
        const canvas = setup()
        detach = canvas.detach
        act(() => select(selectionStore, PAGE, [LEFT.ref]))

        canvas.pointer.down(100, 100)
        canvas.pointer.move(60, 80)
        pressEscape()
        canvas.pointer.up(60, 80)

        const left = canvas.part(`[data-frame="${LEFT.ref}"]`)
        expect([
          left.style.left,
          left.style.top,
          left.style.width,
          left.style.height,
          canvas.writes,
        ]).toEqual(['100px', '100px', '200px', '200px', []])
      })

      // No write lands, so React has no new prop to redraw the overlay from.
      it('leaves the drawn selection and its chip at the start size after release', () => {
        const canvas = setup()
        detach = canvas.detach
        act(() => select(selectionStore, PAGE, [LEFT.ref]))

        canvas.pointer.down(100, 100)
        canvas.pointer.move(60, 80)
        pressEscape()
        canvas.pointer.up(60, 80)

        const drawn = canvas.part('[data-selection]')
        expect([
          drawn.style.left,
          drawn.style.top,
          drawn.style.width,
          drawn.style.height,
        ]).toEqual(['100px', '100px', '200px', '200px'])
        expect(canvas.part('[data-move-chip]')).not.toBeVisible()
        expect(canvas.part('[data-chip]')).toHaveTextContent(LEFT.name)
      })

      it('puts back each frame, outline, and pin of several at the press', () => {
        const canvas = setup()
        detach = canvas.detach
        act(() => select(selectionStore, PAGE, [LEFT.ref, RIGHT.ref]))

        canvas.pointer.down(600, 300)
        canvas.pointer.move(700, 300)
        pressEscape()

        expect([
          canvas.part(`[data-frame="${RIGHT.ref}"]`).style.left,
          canvas.part(`[data-frame="${RIGHT.ref}"]`).style.width,
          canvas.part(`[data-outline="${RIGHT.ref}"]`).style.left,
          canvas.part(`[data-note-frame="${LEFT.ref}"]`).style.translate,
          canvas.part(`[data-note-frame="${RIGHT.ref}"]`).style.translate,
        ]).toEqual(['400px', '200px', '300px', '', ''])
        canvas.pointer.up(700, 300)
      })

      it.each([
        ['a free frame', LEFT, 300, 300],
        ['a locked frame', LOCKED, 300, 500],
      ] as const)(
        "leaves Esc to the key registry on %s's corner pressed but not dragged",
        async (_name, frame, x, y) => {
          const canvas = setup()
          detach = canvas.detach
          act(() => select(selectionStore, PAGE, [frame.ref]))
          const ran: string[] = []
          const unregister = registerActions([
            {
              id: 'test.escape',
              label: 'Escape',
              group: 'selection',
              palette: false,
              keys: ['Escape'],
              run: () => ran.push('escape'),
            },
          ])
          const unbind = bindKeys(window)

          canvas.pointer.down(x, y)
          await userEvent.keyboard('{Escape}')
          canvas.pointer.up(x, y)
          unbind()
          unregister()

          expect([ran, canvas.writes]).toEqual([['escape'], []])
        },
      )
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
        // Follows the pinned element's corner, as the notes layer does.
        const pins = renderHook(() =>
          usePinCorners(
            canvas.part('[data-layer]'),
            new Map([[LEFT.ref, [3]]]),
          ),
        )
        // The board draws an element's pin at its corner, 20 px in from LEFT's right edge.
        Object.assign(pin(canvas, LEFT.ref).style, {
          left: '280px',
          top: '110px',
        })
        act(() => select(selectionStore, PAGE, [LEFT.ref]))

        canvas.pointer.down(300, 100)
        canvas.pointer.move(340, 80)

        // The frame pushes the corner once it reflows, a frame after the drag drew.
        await expect
          .poll(() => pin(canvas, LEFT.ref).style.translate)
          .toBe('40px -20px')
        canvas.pointer.up(340, 80)
        pins.unmount()
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

    it('puts a move Esc cancels back at the stored box, with the preview ended', () => {
      const canvas = setup([LEFT])
      detach = canvas.detach
      setPreview([LEFT.ref], 500)

      canvas.pointer.down(450, 150)
      canvas.pointer.move(480, 175)
      pressEscape()
      canvas.pointer.up(480, 175)

      const left = canvas.part(`[data-frame="${LEFT.ref}"]`)
      expect([left.style.left, left.style.width, canvas.writes]).toEqual([
        '100px',
        '200px',
        [],
      ])
      expect(previewOf(LEFT.ref)).toBeUndefined()
    })

    it('keeps the overlay at the previewed width on Esc at a corner pressed but not dragged', () => {
      const canvas = setup([LEFT])
      detach = canvas.detach
      act(() => {
        setPreview([LEFT.ref], 500)
        select(selectionStore, PAGE, [LEFT.ref])
      })
      const before = canvas.part('[data-selection]').style.width

      canvas.pointer.down(600, 300)
      pressEscape()
      canvas.pointer.up(600, 300)

      expect([
        before,
        canvas.part('[data-selection]').style.width,
        previewOf(LEFT.ref),
      ]).toEqual(['500px', '500px', { width: 500 }])
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
