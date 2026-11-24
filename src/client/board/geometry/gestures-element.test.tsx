import '../../styles.css'

import { act } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { bindKeys, registerActions } from '@/client/actions/registry'

import type { GroupMember } from '../element/group'
import { heldOutline, holdOutline } from '../element/held'
import { carriedStore } from '../place/tool'
import {
  clear,
  type ElementKey,
  select,
  selectElement,
  selectElements,
  selectionStore,
} from '../selection'
import type { Box, Point } from './box'
import {
  LEFT,
  PAGE,
  pressEscape,
  RIGHT,
  selectedRefs,
  setup,
} from './gestures-harness'

/** Lets the frame's answers settle, since one macrotask drains every promise they resolve through. */
function answered(): Promise<void> {
  return new Promise((drained) => setTimeout(drained))
}

describe('attachGestures', () => {
  let detach = () => {}

  afterEach(() => {
    detach()
    clear(selectionStore)
    holdOutline(null)
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

    it('clears the carried mark and moves nothing when Esc cancels the carry', () => {
      const canvas = setupWithElement()

      canvas.pointer.down(200, 175)
      canvas.pointer.move(200, 260)
      pressEscape()
      const carried = carriedStore.getState().carried
      canvas.pointer.move(200, 300)
      canvas.pointer.up(200, 300)

      expect([carried, canvas.moves, canvas.writes]).toEqual([null, [], []])
    })

    describe('released over bare canvas', () => {
      const ghost = () => carriedStore.getState().ghost

      it('moves the element into a frame of its own where the drag drew it', () => {
        const canvas = setupWithElement()

        canvas.pointer.drag([200, 175], [350, 355])

        expect(canvas.extracts).toEqual([
          {
            page: PAGE,
            key: ELEMENT,
            box: { x: 300, y: 330, width: 100, height: 50 },
          },
        ])
        expect(canvas.moves).toEqual([])
      })

      it('draws the frame it would make while over bare canvas alone', () => {
        const canvas = setupWithElement()

        canvas.pointer.down(200, 175)
        canvas.pointer.move(210, 200)
        const inside = ghost()
        canvas.pointer.move(350, 355)
        const bare = ghost()
        canvas.pointer.move(500, 200)
        const over = ghost()
        canvas.pointer.move(350, 355)
        canvas.pointer.up(350, 355)

        expect(bare?.box).toEqual({ x: 300, y: 330, width: 100, height: 50 })
        expect([inside, over, ghost()]).toEqual([null, null, null])
      })

      it('keeps the outline of a carried element, which stays where it was', () => {
        const canvas = setupWithElement()

        canvas.pointer.down(200, 175)
        canvas.pointer.move(350, 355)
        const bare = canvas
          .part('[data-layer]')
          .hasAttribute('data-dragged-out')
        canvas.pointer.up(350, 355)

        expect(bare).toBe(false)
      })

      it('makes no frame released over another frame', () => {
        const canvas = setupWithElement()

        canvas.pointer.drag([200, 175], [500, 200])

        expect(canvas.extracts).toEqual([])
      })

      it('makes no frame over one the page hides', () => {
        const hidden = { ...RIGHT, ref: `${PAGE}/hidden`, hidden: true }
        const canvas = setup([LEFT], {
          elementBox: ELEMENT_BOX,
          hidden: [hidden],
        })
        detach = canvas.detach
        act(() => selectElement(selectionStore, PAGE, ELEMENT))

        canvas.pointer.drag([200, 175], [500, 200])

        expect(canvas.extracts).toEqual([])
      })

      it('makes no frame released over a panel, which hides the canvas under it', () => {
        const canvas = setupWithElement()

        canvas.pointer.down(200, 175)
        canvas.pointer.move(350, 355)
        canvas.pointer.up(350, 355, {}, canvas.part('[data-viewport]'))

        expect(canvas.extracts).toEqual([])
        expect(ghost()).toBeNull()
      })

      it('makes no frame when Esc cancels the drag', () => {
        const canvas = setupWithElement()

        canvas.pointer.down(200, 175)
        canvas.pointer.move(350, 355)
        pressEscape()
        const cleared = ghost()
        canvas.pointer.up(350, 355)

        expect([cleared, canvas.extracts]).toEqual([null, []])
      })

      it('makes no frame in a tab that may not write', () => {
        const canvas = setup(undefined, {
          elementBox: ELEMENT_BOX,
          canWrite: false,
        })
        detach = canvas.detach
        act(() => selectElement(selectionStore, PAGE, ELEMENT))

        canvas.pointer.drag([200, 175], [350, 355])

        expect([canvas.extracts, ghost()]).toEqual([[], null])
      })
    })

    describe('several elements', () => {
      const FIRST = { frame: LEFT.ref, index: 3, hash: 'a'.repeat(64) }
      const SECOND = { frame: LEFT.ref, index: 4, hash: 'a'.repeat(64) }
      const OUTLINES = [
        { index: 3, box: { x: 110, y: 110, width: 50, height: 30 } },
        { index: 4, box: { x: 110, y: 200, width: 50, height: 30 } },
      ]
      const held = () => selectionStore.getState().elements

      it('adds the element a Shift-click lands on', async () => {
        selectElement(selectionStore, PAGE, FIRST)
        const canvas = setup(undefined, { pick: () => SECOND })

        canvas.pointer.click(130, 210, { shiftKey: true })

        await vi.waitFor(() => expect(held()).toEqual([FIRST, SECOND]))
      })

      it('takes a held element out on a Shift-click, keeping the frame selected', async () => {
        selectElements(selectionStore, PAGE, [FIRST, SECOND])
        const canvas = setup(undefined, {
          pick: () => SECOND,
          outlines: OUTLINES,
        })

        canvas.pointer.click(130, 210, { shiftKey: true })

        await vi.waitFor(() => expect(held()).toEqual([FIRST]))
        expect(selectedRefs()).toEqual([LEFT.ref])
      })

      it('starts over in another frame on a Shift-click there', async () => {
        const elsewhere = { frame: RIGHT.ref, index: 3, hash: 'b'.repeat(64) }
        selectElements(selectionStore, PAGE, [FIRST, SECOND])
        const canvas = setup(undefined, { pick: () => elsewhere })

        canvas.pointer.click(450, 150, { shiftKey: true })

        await vi.waitFor(() => expect(held()).toEqual([elsewhere]))
        expect(selectedRefs()).toEqual([RIGHT.ref])
      })

      it('leaves the selection alone on a Shift-click holding no element', async () => {
        selectElement(selectionStore, PAGE, FIRST)
        const canvas = setup()

        canvas.pointer.click(250, 280, { shiftKey: true })
        await Promise.resolve()

        expect(held()).toEqual([FIRST])
        expect(selectedRefs()).toEqual([LEFT.ref])
      })

      it('selects every element a marquee from the bare body touches', async () => {
        select(selectionStore, PAGE, [LEFT.ref])
        const canvas = setup(undefined, {
          bare: () => true,
          inner: [
            { key: FIRST, box: OUTLINES[0]?.box as Box },
            { key: SECOND, box: OUTLINES[1]?.box as Box },
          ],
        })

        canvas.pointer.down(130, 130)
        await answered()
        canvas.pointer.move(280, 280)
        canvas.pointer.up(280, 280)
        await answered()

        expect(held()).toEqual([FIRST, SECOND])
        expect(canvas.writes).toEqual([])
      })

      it('starts no marquee from a press released before the frame answers', async () => {
        select(selectionStore, PAGE, [LEFT.ref])
        const canvas = setup(undefined, {
          bare: () => true,
          inner: [{ key: FIRST, box: OUTLINES[0]?.box as Box }],
        })

        canvas.pointer.drag([130, 130], [280, 280])
        await answered()

        expect(held()).toBeUndefined()
        expect(canvas.writes).toEqual([])
      })

      it('hides the rect and keeps the element selection when Esc cancels a marquee', async () => {
        selectElement(selectionStore, PAGE, FIRST)
        const canvas = setup(undefined, {
          bare: () => true,
          inner: [{ key: SECOND, box: OUTLINES[1]?.box as Box }],
        })

        canvas.pointer.down(250, 105)
        await answered()
        canvas.pointer.move(280, 280)
        pressEscape()
        const hidden = canvas.part('[data-marquee]').hidden
        canvas.pointer.up(280, 280)

        expect([hidden, held()]).toEqual([true, [FIRST]])
      })

      it('adds to the held elements on a Shift-marquee', async () => {
        const third = { frame: LEFT.ref, index: 5, hash: 'a'.repeat(64) }
        selectElements(selectionStore, PAGE, [FIRST, SECOND])
        const canvas = setup(undefined, {
          bare: () => true,
          outlines: OUTLINES,
          inner: [{ key: third, box: OUTLINES[0]?.box as Box }],
        })

        canvas.pointer.down(250, 105, { shiftKey: true })
        await answered()
        canvas.pointer.move(280, 280, { shiftKey: true })
        canvas.pointer.up(280, 280, { shiftKey: true })
        await answered()

        expect(held()).toEqual([FIRST, SECOND, third])
      })

      it('selects the frame alone on a marquee touching nothing', async () => {
        selectElement(selectionStore, PAGE, FIRST)
        const canvas = setup(undefined, { bare: () => true })

        canvas.pointer.down(250, 105)
        await answered()
        canvas.pointer.move(280, 130)
        canvas.pointer.up(280, 130)
        await answered()

        expect(selectionStore.getState().element).toBeNull()
        expect(selectedRefs()).toEqual([LEFT.ref])
      })

      it('copies the selected frame on an Alt-drag from its bare body', () => {
        select(selectionStore, PAGE, [LEFT.ref])
        const canvas = setup(undefined, { bare: () => true })

        canvas.pointer.drag([150, 150], [190, 210], { altKey: true })

        expect(canvas.duplicates).toHaveLength(1)
      })

      it('drops a Shift-click still waiting once a later press landed', async () => {
        selectElement(selectionStore, PAGE, FIRST)
        let answer: (key: ElementKey) => void = () => {}
        const canvas = setup(undefined, {
          pick: () =>
            new Promise<ElementKey>((resolve) => {
              answer = resolve
            }),
        })

        canvas.pointer.click(130, 210, { shiftKey: true })
        canvas.pointer.click(450, 150)
        answer(SECOND)
        // One macrotask drains every promise the pick's answer settles through.
        await new Promise((drained) => setTimeout(drained))

        expect(selectedRefs()).toEqual([RIGHT.ref])
        expect(held()).toBeUndefined()
      })

      it('moves the selected frame on a drag from an element it holds', () => {
        select(selectionStore, PAGE, [LEFT.ref])
        const canvas = setup(undefined, { bare: () => false })

        canvas.pointer.drag([150, 150], [170, 170])

        expect(canvas.writes).toHaveLength(1)
      })

      it('moves an unselected frame on a drag from its bare body', () => {
        const canvas = setup(undefined, { bare: () => true })

        canvas.pointer.drag([150, 150], [170, 170])

        expect(canvas.writes).toHaveLength(1)
      })

      const BOX = { kind: 'box', inset: { width: 0, height: 0 } } as const
      const FREE: GroupMember[] = [
        {
          index: 3,
          box: { x: 10, y: 10, width: 50, height: 30 },
          placed: { left: 10, top: 10 },
          read: BOX,
        },
        {
          index: 4,
          box: { x: 10, y: 100, width: 50, height: 30 },
          placed: { left: 10, top: 100 },
          read: BOX,
        },
      ]
      const GROUP = { x: 110, y: 110, width: 50, height: 120 }

      it('carries the pressed member alone while none of them is free', () => {
        selectElements(selectionStore, PAGE, [FIRST, SECOND])
        const inFlow = FREE.map((member) => ({ ...member, placed: null }))
        const canvas = setup(undefined, {
          outlines: OUTLINES,
          group: { box: GROUP, scales: false, members: inFlow },
        })

        canvas.pointer.drag([130, 120], [130, 260])

        expect(canvas.moves.map(({ key }) => key)).toEqual([FIRST])
        expect(held()).toEqual([FIRST])
      })

      it('moves every free member by the drag in one write, keeping the selection', async () => {
        selectElements(selectionStore, PAGE, [FIRST, SECOND])
        const canvas = setup(undefined, {
          outlines: OUTLINES,
          group: { box: GROUP, scales: false, members: FREE },
        })

        canvas.pointer.drag([130, 120], [150, 150])
        await Promise.resolve()

        expect(canvas.groupEdits[0]?.commits).toEqual([
          [
            {
              index: 3,
              declarations: [
                { property: 'left', value: '30px' },
                { property: 'top', value: '40px' },
              ],
            },
            {
              index: 4,
              declarations: [
                { property: 'left', value: '30px' },
                { property: 'top', value: '130px' },
              ],
            },
          ],
        ])
        expect(held()).toEqual([FIRST, SECOND])
        expect(canvas.moves).toEqual([])
      })

      it('moves the group on a drag from the bare space inside its box', async () => {
        selectElements(selectionStore, PAGE, [FIRST, SECOND])
        const canvas = setup(undefined, {
          outlines: OUTLINES,
          group: { box: GROUP, scales: false, members: FREE },
        })

        canvas.pointer.drag([130, 170], [140, 170])
        await Promise.resolve()

        expect(canvas.groupEdits[0]?.commits).toHaveLength(1)
        expect(canvas.writes).toEqual([])
      })

      it('puts every member back and writes nothing on Esc', () => {
        selectElements(selectionStore, PAGE, [FIRST, SECOND])
        const canvas = setup(undefined, {
          outlines: OUTLINES,
          group: { box: GROUP, scales: false, members: FREE },
        })

        canvas.pointer.down(130, 120)
        canvas.pointer.move(150, 150)
        pressEscape()
        canvas.pointer.up(150, 150)

        expect(canvas.groupEdits[0]).toMatchObject({
          cancelled: true,
          commits: [],
        })
      })

      it('moves nothing in a frame another session holds', () => {
        selectElements(selectionStore, PAGE, [FIRST, SECOND])
        const canvas = setup(undefined, {
          outlines: OUTLINES,
          group: { box: GROUP, scales: false, members: FREE, held: true },
        })

        canvas.pointer.drag([130, 120], [150, 150])

        expect([canvas.groupEdits, canvas.moves]).toEqual([[], []])
      })

      it('scales every member from a corner of the group box', async () => {
        selectElements(selectionStore, PAGE, [FIRST, SECOND])
        const canvas = setup(undefined, {
          outlines: OUTLINES,
          group: { box: GROUP, scales: true, members: FREE },
        })

        // The south-east corner, dragged to double the group's width.
        canvas.pointer.drag([160, 230], [210, 230])
        await Promise.resolve()

        const [commit] = canvas.groupEdits[0]?.commits ?? []
        expect(
          commit?.map(
            ({ declarations }) =>
              declarations.find(({ property }) => property === 'width')?.value,
          ),
        ).toEqual(['100px', '100px'])
      })

      it('takes no corner press on several while their box draws no marks', () => {
        selectElements(selectionStore, PAGE, [FIRST, SECOND])
        const canvas = setup(undefined, {
          outlines: OUTLINES,
          shape: 'free',
          group: { box: GROUP, scales: false, members: FREE },
        })

        expect(canvas.cursorOver(160, 230)).toBeNull()
      })

      it('shows the resize cursor over a corner of a box that scales', () => {
        selectElements(selectionStore, PAGE, [FIRST, SECOND])
        const canvas = setup(undefined, {
          outlines: OUTLINES,
          group: { box: GROUP, scales: true, members: FREE },
        })

        expect(canvas.cursorOver(160, 230)).not.toBeNull()
      })
    })

    it('adds to the elements on a Shift-click inside the element, keeping the frame', () => {
      const canvas = setupWithElement()

      canvas.pointer.click(200, 175, { shiftKey: true })

      expect(selectedRefs()).toEqual([LEFT.ref])
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

      function setupPlaced(live?: string, lands = true) {
        const canvas = setup(undefined, {
          elementBox: ELEMENT_BOX,
          placed: PLACED,
          live,
          lands,
        })
        detach = canvas.detach
        return canvas
      }

      it('holds the outline at the drop once released, until the frame reloads', () => {
        const canvas = setupPlaced()
        act(() => selectElement(selectionStore, PAGE, ELEMENT))

        canvas.pointer.drag([200, 175], [225, 155])

        expect(heldOutline()).toEqual({
          key: ELEMENT,
          box: { x: 175, y: 130, width: 100, height: 50 },
          read: null,
        })
      })

      it('puts the outline back at the start when the write is refused', async () => {
        const canvas = setupPlaced(undefined, false)
        act(() => selectElement(selectionStore, PAGE, ELEMENT))

        canvas.pointer.drag([200, 175], [225, 155])

        await expect.poll(() => heldOutline()).toBeNull()
        expect(canvas.placedMoves[0]?.commits).toEqual([{ left: 65, top: 10 }])
      })

      it('moves into a frame of its own released over bare canvas, writing no offsets', async () => {
        const canvas = setupPlaced()
        act(() => selectElement(selectionStore, PAGE, ELEMENT))

        canvas.pointer.drag([200, 175], [350, 355])

        expect(canvas.extracts).toEqual([
          {
            page: PAGE,
            key: ELEMENT,
            box: { x: 300, y: 330, width: 100, height: 50 },
          },
        ])
        expect(canvas.placedMoves[0]?.commits).toEqual([])
        await answered()
        expect([canvas.placedMoves[0]?.cancelled, heldOutline()]).toEqual([
          false,
          null,
        ])
      })

      it('hides its outline while the ghost of its frame draws there alone', () => {
        const canvas = setupPlaced()
        const layer = canvas.part('[data-layer]')
        act(() => selectElement(selectionStore, PAGE, ELEMENT))

        canvas.pointer.down(200, 175)
        canvas.pointer.move(225, 155)
        const inside = layer.hasAttribute('data-dragged-out')
        canvas.pointer.move(350, 355)
        const bare = layer.hasAttribute('data-dragged-out')
        canvas.pointer.up(350, 355)

        expect([inside, bare, layer.hasAttribute('data-dragged-out')]).toEqual([
          false,
          true,
          false,
        ])
      })

      it('goes back where it was when that move is refused', async () => {
        const canvas = setupPlaced(undefined, false)
        act(() => selectElement(selectionStore, PAGE, ELEMENT))

        canvas.pointer.drag([200, 175], [350, 355])
        await answered()

        expect([canvas.placedMoves[0]?.cancelled, heldOutline()]).toEqual([
          true,
          null,
        ])
      })

      it('holds nothing on a drag released where it started', () => {
        const canvas = setupPlaced()
        act(() => selectElement(selectionStore, PAGE, ELEMENT))

        canvas.pointer.down(200, 175)
        canvas.pointer.move(225, 155)
        canvas.pointer.move(200, 175)
        canvas.pointer.up(200, 175)

        expect([heldOutline(), canvas.placedMoves[0]?.cancelled]).toEqual([
          null,
          true,
        ])
      })

      it('marks the layer as carrying for the drag alone, clearing it on release', () => {
        const canvas = setupPlaced()
        const layer = canvas.part('[data-layer]')
        act(() => selectElement(selectionStore, PAGE, ELEMENT))

        canvas.pointer.down(200, 175)
        canvas.pointer.move(225, 155)
        const during = layer.hasAttribute('data-carrying')
        canvas.pointer.up(225, 155)

        expect([during, layer.hasAttribute('data-carrying')]).toEqual([
          true,
          false,
        ])
      })

      it('clears the carrying mark when Esc puts the drag back', () => {
        const canvas = setupPlaced()
        const layer = canvas.part('[data-layer]')
        act(() => selectElement(selectionStore, PAGE, ELEMENT))

        canvas.pointer.down(200, 175)
        canvas.pointer.move(225, 155)
        act(() => {
          dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        })

        expect(layer.hasAttribute('data-carrying')).toBe(false)
        canvas.pointer.up(225, 155)
      })

      it('holds nothing when Esc puts the drag back', () => {
        const canvas = setupPlaced()
        act(() => selectElement(selectionStore, PAGE, ELEMENT))

        canvas.pointer.down(200, 175)
        canvas.pointer.move(225, 155)
        act(() => {
          dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        })
        canvas.pointer.up(225, 155)

        expect(heldOutline()).toBeNull()
      })

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
            palette: false,
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

    describe('past its frame edge', () => {
      // LEFT's element 7, its right half past LEFT's right edge at x 300.
      const GHOST = {
        key: { frame: LEFT.ref, index: 7, hash: 'b'.repeat(64) },
        box: { x: 260, y: 150, width: 80, height: 40 },
      }

      it('selects the element on a press of its ghost outside the frame', () => {
        const canvas = setup(undefined, { ghost: GHOST })
        detach = canvas.detach
        act(() => select(selectionStore, PAGE, [LEFT.ref]))

        canvas.pointer.click(320, 170)

        expect(selectionStore.getState().element).toEqual(GHOST.key)
      })

      it('drags a placed element back from its ghost in the same press', () => {
        const canvas = setup(undefined, {
          ghost: GHOST,
          placed: { left: 160, top: 50 },
        })
        detach = canvas.detach
        act(() => select(selectionStore, PAGE, [LEFT.ref]))

        canvas.pointer.drag([320, 170], [220, 170])

        expect([
          canvas.placedMoves[0]?.key,
          canvas.placedMoves[0]?.commits,
          canvas.writes,
        ]).toEqual([GHOST.key, [{ left: 60, top: 50 }], []])
      })

      it('moves a ghost dragged on over bare canvas into a frame of its own', () => {
        const canvas = setup(undefined, {
          ghost: GHOST,
          placed: { left: 160, top: 50 },
        })
        detach = canvas.detach
        act(() => select(selectionStore, PAGE, [LEFT.ref]))

        canvas.pointer.drag([320, 170], [350, 370])

        expect(canvas.extracts).toMatchObject([
          { key: GHOST.key, box: { x: 290, y: 350, width: 80, height: 40 } },
        ])
      })

      it("leaves a press on the selected frame's corner to its resize", () => {
        // Its top past LEFT's top edge at y 100, over LEFT's NE corner at 300, 100.
        const canvas = setup(undefined, {
          ghost: { ...GHOST, box: { x: 260, y: 80, width: 80, height: 40 } },
        })
        detach = canvas.detach
        act(() => select(selectionStore, PAGE, [LEFT.ref]))

        canvas.pointer.drag([303, 98], [343, 98])

        expect([
          selectionStore.getState().element,
          canvas.writes[0]?.boxes[LEFT.ref]?.width,
        ]).toEqual([null, 240])
      })

      it('leaves a press on the part inside the frame to the frame', () => {
        const canvas = setup(undefined, { ghost: GHOST })
        detach = canvas.detach

        canvas.pointer.click(280, 170)

        expect([selectionStore.getState().element, selectedRefs()]).toEqual([
          null,
          [LEFT.ref],
        ])
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

      it('puts the preview back on Esc and writes nothing on release', () => {
        const canvas = setupWithShape()

        canvas.pointer.down(250, 200)
        canvas.pointer.move(290, 230)
        act(() => {
          dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        })
        canvas.pointer.up(290, 230)

        expect(canvas.resizes[0]?.cancelled).toBe(true)
        expect(canvas.resizes[0]?.commits).toEqual([])
      })
    })

    describe('that is text', () => {
      function setupWithText() {
        const canvas = setup(undefined, {
          elementBox: ELEMENT_BOX,
          shape: 'free',
          resizeRead: {
            kind: 'text',
            natural: null,
            hugsHeight: true,
            inset: { width: 0, height: 0 },
            sizing: null,
          },
        })
        detach = canvas.detach
        act(() => selectElement(selectionStore, PAGE, ELEMENT))
        return canvas
      }

      it('resizes from a corner, starting a text resize at the dragged width', () => {
        const canvas = setupWithText()

        canvas.pointer.drag([250, 200], [290, 230], { shiftKey: true })

        expect(canvas.resizes).toMatchObject([
          {
            kind: 'text',
            commits: [{ width: 140, height: 50 }],
          },
        ])
        expect(canvas.moves).toEqual([])
      })

      it('writes nothing on a drag that only moves up or down', () => {
        const canvas = setupWithText()

        canvas.pointer.drag([250, 200], [250, 260])

        expect(canvas.resizes[0]?.commits).toEqual([])
        expect(canvas.resizes[0]?.cancelled).toBe(true)
      })
    })

    describe('that is an image', () => {
      function setupWithImage() {
        const canvas = setup(undefined, {
          elementBox: ELEMENT_BOX,
          shape: 'free',
          resizeRead: {
            kind: 'media',
            natural: { width: 1, height: 1 },
            hugsHeight: false,
            inset: { width: 0, height: 0 },
            sizing: null,
          },
        })
        detach = canvas.detach
        act(() => selectElement(selectionStore, PAGE, ELEMENT))
        return canvas
      }

      it('writes both sides from a corner', () => {
        const canvas = setupWithImage()

        canvas.pointer.drag([250, 200], [290, 230])

        expect(canvas.resizes).toMatchObject([
          { kind: 'media', commits: [{ width: 140, height: 80 }] },
        ])
      })

      it('keeps its natural ratio while Shift is held', () => {
        const canvas = setupWithImage()

        canvas.pointer.drag([250, 200], [350, 210], { shiftKey: true })

        expect(canvas.resizes[0]?.commits).toEqual([
          { width: 200, height: 200 },
        ])
      })
    })

    it('carries an element that takes no resize on a drag from its corner', () => {
      const canvas = setupWithElement()

      canvas.pointer.drag([250, 200], [290, 230])

      expect(canvas.resizes).toEqual([])
      expect(canvas.moves).toMatchObject([{ key: ELEMENT }])
    })

    it('keeps the element on a click on its outline', () => {
      const canvas = setupWithElement()

      canvas.pointer.click(250, 175)

      expect(selectionStore.getState().element).toEqual(ELEMENT)
    })

    describe('a plain click in its frame', () => {
      const SIBLING = { ...ELEMENT, index: 6 }
      const element = () => selectionStore.getState().element
      // One macrotask drains every promise a pick's answer settles through.
      const drained = () => new Promise((done) => setTimeout(done))

      function setupPicking(
        pick: (at: Point) => ElementKey | null | Promise<ElementKey | null>,
      ) {
        const canvas = setup(undefined, { elementBox: ELEMENT_BOX, pick })
        detach = canvas.detach
        act(() => selectElement(selectionStore, PAGE, ELEMENT))
        return canvas
      }

      it('selects the sibling it lands on', async () => {
        const canvas = setupPicking(() => SIBLING)

        canvas.pointer.click(200, 260)

        await vi.waitFor(() => expect(element()).toEqual(SIBLING))
        expect(selectedRefs()).toEqual([LEFT.ref])
      })

      it('selects the frame on its bare body, where it lands on no element', async () => {
        const canvas = setupPicking(() => null)

        canvas.pointer.click(200, 260)

        await vi.waitFor(() => expect(element()).toBeNull())
        expect(selectedRefs()).toEqual([LEFT.ref])
      })

      it('selects the frame on its label strip, above every element', async () => {
        const canvas = setupPicking((at) =>
          at.y >= LEFT.box.y ? SIBLING : null,
        )

        canvas.pointer.click(150, 90)

        await vi.waitFor(() => expect(element()).toBeNull())
        expect(selectedRefs()).toEqual([LEFT.ref])
      })

      it('keeps the element inside its own box, away from its outline', async () => {
        const canvas = setupPicking(() => SIBLING)

        canvas.pointer.click(200, 175)
        await drained()

        expect(element()).toEqual(ELEMENT)
      })

      it('selects another frame on a click there, as before', async () => {
        const elsewhere = { frame: RIGHT.ref, index: 3, hash: 'b'.repeat(64) }
        const canvas = setupPicking(() => elsewhere)

        canvas.pointer.click(500, 200)
        await drained()

        expect(selectedRefs()).toEqual([RIGHT.ref])
        expect(element()).toBeNull()
      })

      it('drops a pick still waiting once a later press landed', async () => {
        let answer: (key: ElementKey) => void = () => {}
        const canvas = setupPicking(
          () =>
            new Promise<ElementKey>((resolve) => {
              answer = resolve
            }),
        )

        canvas.pointer.click(200, 260)
        canvas.pointer.click(450, 150)
        answer(SIBLING)
        await drained()

        expect(selectedRefs()).toEqual([RIGHT.ref])
        expect(element()).toBeNull()
      })
    })

    it('selects the frame and picks nothing on a click with no element selected', async () => {
      const canvas = setup(undefined, { pick: () => ELEMENT })
      detach = canvas.detach
      act(() => select(selectionStore, PAGE, [LEFT.ref]))

      canvas.pointer.click(200, 260)
      await new Promise((done) => setTimeout(done))

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
})
