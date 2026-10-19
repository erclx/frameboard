import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { registerActions } from '@/client/actions/registry'
import { clear, selectionStore } from '@/client/board/selection'
import { attachCanvas, type CanvasControls } from '@/client/board/view'
import { boardOf, frameOf, pageOf } from '@/test/board'

import { boardTargets, jumpToFrame, jumpToPage, jumpToProject } from './targets'

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
}

describe('boardTargets', () => {
  it('lists the open project’s shown frames with their page', () => {
    expect(boardTargets(BOARD, 'studio').frames).toEqual([
      { ref: HERO.ref, label: 'hero', hint: 'home' },
      { ref: PRICING.ref, label: 'pricing', hint: 'plans' },
    ])
  })

  it('lists the open project’s pages', () => {
    expect(boardTargets(BOARD, 'studio').pages).toEqual([
      { ref: 'studio/home', label: 'home' },
      { ref: 'studio/plans', label: 'plans' },
    ])
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
    const first = attachCanvas(CANVAS)
    cleanups.push(first)

    jumpToFrame(PRICING.ref)
    const beforeAttach = zooms
    // The route change remounts the canvas, which detaches the old one first.
    first()
    cleanups.push(attachCanvas(CANVAS))

    expect({
      path: location.pathname,
      selection: selectionStore.getState(),
      zoomsBefore: beforeAttach,
      zoomsAfter: zooms,
    }).toEqual({
      path: '/p/studio/plans',
      selection: { page: 'studio/plans', frames: [PRICING.ref] },
      zoomsBefore: 0,
      zoomsAfter: 1,
    })
  })

  it('zooms at once to a frame on the page already shown', () => {
    cleanups.push(attachCanvas(CANVAS))

    jumpToFrame(HERO.ref)

    expect([selectionStore.getState().frames, zooms]).toEqual([[HERO.ref], 1])
  })

  it('zooms once for the latest jump when the first never saw its canvas', () => {
    const first = attachCanvas(CANVAS)
    jumpToFrame(PRICING.ref)

    jumpToFrame(HERO.ref)
    first()
    cleanups.push(attachCanvas(CANVAS))

    expect([selectionStore.getState().frames, zooms]).toEqual([[HERO.ref], 1])
  })
})
