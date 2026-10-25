import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { registerActions } from '@/client/actions/registry'
import { clear, selectionStore } from '@/client/board/selection'
import { attachCanvas, type CanvasControls } from '@/client/board/view'
import { createLiveStore } from '@/client/live/store'
import type { ListResult } from '@/shared/records/list'
import { boardOf, frameOf, pageOf } from '@/test/board'

import {
  boardTargets,
  jumpToFrame,
  jumpToPage,
  jumpToProject,
  showAndJumpToFrame,
} from './targets'

const HERO = frameOf('hero')
const SECRET = frameOf('secret', { hidden: true })
const PRICING = frameOf('pricing', {
  ref: 'studio/plans/pricing',
  page: 'plans',
})

const BOARD = boardOf(pageOf([HERO, SECRET]), pageOf([PRICING], 'plans'))

const CANVAS: CanvasControls = {
  zoomBy: () => {},
  zoomTo: () => {},
  fit: () => {},
  fitTo: () => {},
  panBy: () => {},
  centerOn: () => {},
}

const ATLAS_GLOBE = frameOf('globe', {
  ref: 'atlas/index/globe',
  project: 'atlas',
  page: 'index',
})

/** BOARD with a second project, `atlas`, listed ahead of `studio`. */
function twoProjects(): ListResult {
  const [studio] = BOARD.projects
  if (!studio) throw new Error('The board has no project')
  return {
    ...BOARD,
    projects: [
      {
        ...studio,
        name: 'atlas',
        pages: [
          {
            ...pageOf([ATLAS_GLOBE], 'index'),
            ref: 'atlas/index',
            project: 'atlas',
          },
        ],
      },
      studio,
    ],
  }
}

describe('boardTargets', () => {
  it('lists the open project’s frames with their project and page', () => {
    expect(boardTargets(BOARD, 'studio').frames).toEqual([
      { ref: HERO.ref, label: 'hero', hint: 'studio / home' },
      { ref: SECRET.ref, label: 'secret', hint: 'studio / home', hidden: true },
      { ref: PRICING.ref, label: 'pricing', hint: 'studio / plans' },
    ])
  })

  it('lists the open project’s pages with their project', () => {
    expect(boardTargets(BOARD, 'studio').pages).toEqual([
      { ref: 'studio/home', label: 'home', hint: 'studio' },
      { ref: 'studio/plans', label: 'plans', hint: 'studio' },
    ])
  })

  it('lists every project’s frames, the open project’s first', () => {
    expect(
      boardTargets(twoProjects(), 'studio').frames.map((target) => target.ref),
    ).toEqual([HERO.ref, SECRET.ref, PRICING.ref, ATLAS_GLOBE.ref])
  })

  it('lists every project’s pages, the open project’s first', () => {
    expect(
      boardTargets(twoProjects(), 'studio').pages.map((target) => target.ref),
    ).toEqual(['studio/home', 'studio/plans', 'atlas/index'])
  })

  it('lists every project', () => {
    expect(boardTargets(BOARD, 'studio').projects).toEqual([
      { ref: 'studio', label: 'studio' },
    ])
  })

  it('lists projects alone with no project open', () => {
    const { frames, pages, projects } = boardTargets(BOARD, null)

    expect([frames, pages, projects.length]).toEqual([[], [], 1])
  })
})

describe('jumps', () => {
  const cleanups: (() => void)[] = []
  let zooms = 0

  beforeEach(() => {
    zooms = 0
    cleanups.push(
      registerActions([
        {
          id: 'view.zoomToSelection',
          label: 'Zoom to selection',
          group: 'view',
          run: () => {
            zooms += 1
          },
        },
      ]),
    )
    history.pushState(null, '', '/p/studio/home')
  })

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.()
    clear(selectionStore)
    history.pushState(null, '', '/')
  })

  it('opens a project’s board', () => {
    jumpToProject('studio')

    expect(location.pathname).toBe('/p/studio')
  })

  it('opens a page', () => {
    jumpToPage('studio/plans')

    expect(location.pathname).toBe('/p/studio/plans')
  })

  it('selects a frame on another page and zooms once that page’s canvas attaches', () => {
    const first = attachCanvas(CANVAS, 'studio/home')
    cleanups.push(first)

    jumpToFrame(PRICING.ref)
    const beforeAttach = zooms
    // The route change remounts the canvas, which detaches the old one first.
    first()
    cleanups.push(attachCanvas(CANVAS, 'studio/home'))

    expect({
      path: location.pathname,
      selection: selectionStore.getState(),
      zoomsBefore: beforeAttach,
      zoomsAfter: zooms,
    }).toEqual({
      path: '/p/studio/plans',
      selection: { page: 'studio/plans', frames: [PRICING.ref], element: null },
      zoomsBefore: 0,
      zoomsAfter: 1,
    })
  })

  it('zooms at once to a frame on the page already shown', () => {
    cleanups.push(attachCanvas(CANVAS, 'studio/home'))

    jumpToFrame(HERO.ref)

    expect([selectionStore.getState().frames, zooms]).toEqual([[HERO.ref], 1])
  })

  describe('a hidden frame', () => {
    const shownBoard = boardOf(
      pageOf([HERO, { ...SECRET, hidden: false }]),
      pageOf([PRICING], 'plans'),
    )

    it('shows the frame and waits for the board holding it shown to jump', async () => {
      cleanups.push(attachCanvas(CANVAS, 'studio/home'))
      const store = createLiveStore()
      store.setState({ board: BOARD })
      const shows: string[][] = []
      const writes = {
        flagFrames: async (refs: readonly string[]) => {
          shows.push([...refs])
          return []
        },
      }

      const done = showAndJumpToFrame(SECRET.ref, store, writes)
      await Promise.resolve()
      const zoomsWhileHidden = zooms
      store.setState({ board: shownBoard })
      await done

      expect({
        shows,
        zoomsWhileHidden,
        zooms,
        frames: selectionStore.getState().frames,
      }).toEqual({
        shows: [[SECRET.ref]],
        zoomsWhileHidden: 0,
        zooms: 1,
        frames: [SECRET.ref],
      })
    })

    it('jumps nowhere when the frame is gone before the board shows it', async () => {
      cleanups.push(attachCanvas(CANVAS, 'studio/home'))
      const store = createLiveStore()
      store.setState({ board: BOARD })
      const writes = { flagFrames: async () => [] }

      const done = showAndJumpToFrame(SECRET.ref, store, writes)
      await Promise.resolve()
      store.setState({ board: boardOf(pageOf([HERO])) })
      await done

      expect([zooms, selectionStore.getState().frames]).toEqual([0, []])
    })
  })

  it('zooms once for the latest jump when the first never saw its canvas', () => {
    const first = attachCanvas(CANVAS, 'studio/home')
    jumpToFrame(PRICING.ref)

    jumpToFrame(HERO.ref)
    first()
    cleanups.push(attachCanvas(CANVAS, 'studio/home'))

    expect([selectionStore.getState().frames, zooms]).toEqual([[HERO.ref], 1])
  })
})
