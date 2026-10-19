import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Action } from '@/client/actions/registry'
import { createLiveStore } from '@/client/live/store'
import { frameOf } from '@/test/board'

import { createModeStore } from '../mode'
import { createSelectionStore, select } from '../selection'
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
  const view = { page: PAGE }
  const actions = geometryActions({
    page: () => view.page,
    frames: () => frames,
    selection,
    mode,
    live,
    hold: () => {},
    write: async (page, boxes, expected) => {
      writes.push({ boxes, expected })
      pages.push(page)
      return true
    },
  })
  const action = (id: string): Action => {
    const found = actions.find((candidate) => candidate.id === id)
    if (!found) throw new Error(`no action ${id}`)
    return found
  }
  return { selection, mode, live, writes, pages, view, action }
}

describe('geometryActions', () => {
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
  })

  it('selects every shown frame on the page on Cmd+A', () => {
    const { selection, action } = setup()

    action('selection.all').run()

    expect(selection.getState()).toEqual({
      page: PAGE,
      frames: [A.ref, B.ref, C.ref, LOCKED.ref],
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
