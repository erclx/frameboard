import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Action } from '@/client/actions/registry'
import { createLiveStore } from '@/client/live/store'
import type { ElementTree, TreeElement } from '@/shared/records/elements'
import { frameOf } from '@/test/board'

import { createModeStore } from '../mode'
import {
  createSelectionStore,
  select,
  selectElement,
  selectSection,
} from '../selection'
import { geometryActions, NUDGE_REST_MS } from './actions'
import type { Box } from './box'

const PAGE = 'studio/home'
const A = frameOf('a', { box: { x: 0, y: 0, width: 100, height: 100 } })
const B = frameOf('b', { box: { x: 300, y: 50, width: 100, height: 100 } })
const C = frameOf('c', { box: { x: 500, y: 20, width: 100, height: 100 } })
const LOCKED = frameOf('locked', {
  box: { x: 0, y: 400, width: 100, height: 100 },
  locked: true,
})

interface Write {
  boxes: Readonly<Record<string, Box>>
  expected: Readonly<Record<string, Box>>
}

function setup(frames = [A, B, C, LOCKED]) {
  const selection = createSelectionStore()
  const mode = createModeStore(1280)
  const live = createLiveStore()
  live.setState({ canWrite: true })
  const writes: Write[] = []
  /** The page each write named, in order. */
  const pages: string[] = []
  /** The height writes asked for, in order. */
  const fits: unknown[] = []
  const view = { page: PAGE }
  const tree: { held: ElementTree | null } = { held: null }
  const actions = geometryActions({
    page: () => view.page,
    frames: () => frames,
    treeOf: () => tree.held,
    selection,
    mode,
    live,
    hold: () => {},
    write: async (page, boxes, expected) => {
      writes.push({ boxes, expected })
      pages.push(page)
      return true
    },
    height: async (refs, heightMode, expected) => {
      fits.push({ refs, mode: heightMode, expected })
      return [frameOf('a')]
    },
  })
  const action = (id: string): Action => {
    const found = actions.find((candidate) => candidate.id === id)
    if (!found) throw new Error(`no action ${id}`)
    return found
  }
  return {
    tree,
    selection,
    mode,
    live,
    writes,
    pages,
    fits,
    view,
    action,
    actions,
  }
}

describe('geometryActions', () => {
  describe('command', () => {
    const NAMED = [
      'selection.all',
      'arrange.alignLeft',
      'arrange.alignCenter',
      'arrange.alignRight',
      'arrange.alignTop',
      'arrange.alignMiddle',
      'arrange.alignBottom',
      'arrange.distributeHorizontal',
      'arrange.distributeVertical',
      'frame.fitHeight',
    ]

    it('lists select all, Fit height, and the arranges in the palette', () => {
      const { action } = setup()

      expect(NAMED.filter((id) => !action(id).command)).toEqual([])
    })

    it('leaves the keys a person never runs by name out of the palette', () => {
      const { actions } = setup()

      const listed = actions
        .filter((action) => action.command && !NAMED.includes(action.id))
        .map((action) => action.id)

      expect(listed).toEqual([])
    })
  })

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  describe('Esc', () => {
    it('clears a selection in Edit', () => {
      const { selection, action } = setup()
      select(selection, PAGE, [A.ref])

      action('selection.clear').run()

      expect(selection.getState().frames).toEqual([])
    })

    it('clears a selected section', () => {
      const { selection, action } = setup()
      selectSection(selection, PAGE, 'flow')

      action('selection.clear').run()

      expect(selection.getState().section).toBeUndefined()
    })

    it('stands aside with nothing selected', () => {
      const { action } = setup()

      expect(action('selection.clear').enabled?.()).toBe(false)
    })

    it('stands aside in Play, where Esc exits Play', () => {
      const { selection, mode, action } = setup()
      select(selection, PAGE, [A.ref])

      mode.setState({ mode: 'play' })

      expect(action('selection.clear').enabled?.()).toBe(false)
    })

    it('stands aside with a tool armed, which Esc returns to Move first', () => {
      const { selection, mode, action } = setup()
      select(selection, PAGE, [A.ref])

      mode.setState({ tool: 'text' })

      expect(action('selection.clear').enabled?.()).toBe(false)
    })
  })

  it('selects every shown frame on the page on Cmd+A', () => {
    const { selection, action } = setup()

    action('selection.all').run()

    expect(selection.getState()).toMatchObject({
      page: PAGE,
      frames: [A.ref, B.ref, C.ref, LOCKED.ref],
    })
  })

  describe('Select all with an element selected', () => {
    const HASH = 'a'.repeat(64)
    const row = (index: number, parent: number | null): TreeElement => ({
      index,
      parent,
      tag: 'div',
      name: 'div',
      textOnly: false,
      layout: 'block',
      round: false,
      placed: false,
    })
    const TREE: ElementTree = {
      ref: A.ref,
      hash: HASH,
      elements: [row(3, null), row(4, 3), row(5, 3), row(6, 3), row(7, null)],
    }

    it('selects its siblings, leaving it the last picked', () => {
      const { selection, tree, action } = setup()
      tree.held = TREE
      const picked = { frame: A.ref, index: 5, hash: HASH }
      selectElement(selection, PAGE, picked)

      action('selection.all').run()

      expect(selection.getState().element).toEqual(picked)
      expect(selection.getState().elements?.map(({ index }) => index)).toEqual([
        4, 6, 5,
      ])
      expect(selection.getState().frames).toEqual([A.ref])
    })

    it('leaves the selection alone while the tree reads other bytes', () => {
      const { selection, tree, action } = setup()
      tree.held = { ...TREE, hash: 'b'.repeat(64) }
      const picked = { frame: A.ref, index: 5, hash: HASH }
      selectElement(selection, PAGE, picked)

      action('selection.all').run()

      expect(selection.getState().elements).toEqual([picked])
    })
  })

  describe('Fit height', () => {
    it('fits the one selected frame through the height write, from its drawn box', () => {
      const { selection, fits, action } = setup()
      select(selection, PAGE, [A.ref])

      action('frame.fitHeight').run()

      expect(fits).toEqual([
        { refs: [A.ref], mode: 'fit', expected: { [A.ref]: A.box } },
      ])
    })

    it.each([
      ['two frames', [A.ref, B.ref]],
      ['a locked frame', [LOCKED.ref]],
      ['no frame', []],
    ])('stands aside for %s', (_label, refs) => {
      const { selection, action } = setup()
      select(selection, PAGE, refs)

      expect(action('frame.fitHeight').enabled?.()).toBe(false)
    })

    it('stands aside while the tab cannot write', () => {
      const { selection, live, action } = setup()
      select(selection, PAGE, [A.ref])

      live.setState({ canWrite: false })

      expect(action('frame.fitHeight').enabled?.()).toBe(false)
    })
  })

  describe('nudging', () => {
    it('writes a run of nudges once the keys rest', () => {
      const { selection, writes, action } = setup()
      select(selection, PAGE, [A.ref])

      action('frame.nudgeRight').run()
      action('frame.nudgeRight').run()
      action('frame.nudgeDownFar').run()
      const before = writes.length
      vi.advanceTimersByTime(NUDGE_REST_MS)

      expect(before).toBe(0)
      expect(writes).toEqual([
        {
          boxes: { [A.ref]: { x: 2, y: 10, width: 100, height: 100 } },
          expected: { [A.ref]: A.box },
        },
      ])
    })

    it('writes the open run before a frame added to the selection nudges', () => {
      const { selection, writes, action } = setup()
      select(selection, PAGE, [A.ref])

      action('frame.nudgeRight').run()
      select(selection, PAGE, [A.ref, B.ref])
      action('frame.nudgeRight').run()
      vi.advanceTimersByTime(NUDGE_REST_MS)

      expect(writes).toEqual([
        {
          boxes: { [A.ref]: { ...A.box, x: 1 } },
          expected: { [A.ref]: A.box },
        },
        {
          boxes: {
            [A.ref]: { ...A.box, x: 1 },
            [B.ref]: { ...B.box, x: 301 },
          },
          expected: { [A.ref]: A.box, [B.ref]: B.box },
        },
      ])
    })

    it('names the page the run started on when the page changes before it rests', () => {
      const { selection, pages, view, action } = setup()
      select(selection, PAGE, [A.ref])

      action('frame.nudgeRight').run()
      view.page = 'studio/pricing'
      vi.advanceTimersByTime(NUDGE_REST_MS)

      expect(pages).toEqual([PAGE])
    })

    it('resizes on Cmd with an arrow, never under 1 px', () => {
      const { selection, writes, action } = setup([
        frameOf('thin', { box: { x: 0, y: 0, width: 1, height: 10 } }),
      ])
      select(selection, PAGE, ['studio/home/thin'])

      action('frame.resizeLeft').run()
      action('frame.resizeDown').run()
      vi.advanceTimersByTime(NUDGE_REST_MS)

      expect(writes[0]?.boxes).toEqual({
        'studio/home/thin': { x: 0, y: 0, width: 1, height: 11 },
      })
    })

    it('repeats the nudges and resizes while a key is held, and nothing else', () => {
      const { actions } = setup()

      const repeating = actions
        .filter((action) => action.repeat)
        .map((action) => action.id)

      expect(repeating).toEqual([
        'frame.nudgeLeft',
        'frame.nudgeLeftFar',
        'frame.resizeLeft',
        'frame.nudgeRight',
        'frame.nudgeRightFar',
        'frame.resizeRight',
        'frame.nudgeUp',
        'frame.nudgeUpFar',
        'frame.resizeUp',
        'frame.nudgeDown',
        'frame.nudgeDownFar',
        'frame.resizeDown',
      ])
    })

    it('stands aside while a locked frame is selected', () => {
      const { selection, action } = setup()
      select(selection, PAGE, [A.ref, LOCKED.ref])

      expect(action('frame.nudgeLeft').enabled?.()).toBe(false)
    })

    it('stands aside while the tab may not write', () => {
      const { selection, live, action } = setup()
      select(selection, PAGE, [A.ref])

      live.setState({ canWrite: false })

      expect(action('frame.nudgeLeft').enabled?.()).toBe(false)
    })
  })

  describe('arranging', () => {
    it('aligns two frames to the left in one write of the frames that move', () => {
      const { selection, writes, action } = setup()
      select(selection, PAGE, [A.ref, B.ref])

      action('arrange.alignLeft').run()

      expect(writes).toEqual([
        {
          boxes: { [B.ref]: { ...B.box, x: 0 } },
          expected: { [B.ref]: B.box },
        },
      ])
    })

    it('needs two frames to align and three to distribute', () => {
      const { selection, action } = setup()
      select(selection, PAGE, [A.ref, B.ref])

      expect(action('arrange.alignTop').enabled?.()).toBe(true)
      expect(action('arrange.distributeHorizontal').enabled?.()).toBe(false)
    })

    it('distributes three frames evenly', () => {
      const { selection, writes, action } = setup()
      select(selection, PAGE, [A.ref, B.ref, C.ref])

      action('arrange.distributeHorizontal').run()

      expect(writes[0]?.boxes).toEqual({ [B.ref]: { ...B.box, x: 250 } })
    })

    it('binds the aligns by code, so Alt on a Mac still reaches them', () => {
      const { action } = setup()

      expect(action('arrange.alignLeft').keys).toEqual(['Alt+KeyA'])
    })
  })
})
