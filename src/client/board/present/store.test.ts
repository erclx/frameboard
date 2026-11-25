import { afterEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import { boardOf, frameOf, pageOf } from '@/test/board'

import type { Box } from '../geometry/box'
import { select, selectionStore } from '../selection'
import { attachCanvas } from '../view'
import { leavePresenting, presentStore, startPresenting } from './store'

const HERO_BOX = { x: 5000, y: 0, width: 390, height: 844 }

const cleanups: (() => void)[] = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  leavePresenting()
  selectionStore.setState({ page: null, frames: [] })
  liveStore.setState({ board: null })
})

/** `studio/home` presenting its hero, which sits out of view, over a canvas on `canvasPage`. */
function presentOver(canvasPage: string | null) {
  const home = pageOf([frameOf('hero', { box: HERO_BOX })])
  const about = pageOf(
    [frameOf('team', { ref: 'studio/about/team', page: 'about' })],
    'about',
  )
  liveStore.setState({ board: boardOf(home, about) })
  startPresenting(home)
  const centered: Box[] = []
  if (canvasPage !== null) {
    const detach = attachCanvas(
      {
        zoomBy: () => {},
        zoomTo: () => {},
        fit: () => {},
        fitTo: () => {},
        panBy: () => {},
        centerOn: (box) => centered.push(box),
        visible: () => ({ x: 0, y: 0, width: 800, height: 600 }),
      },
      canvasPage,
    )
    cleanups.push(detach)
  }
  return { centered }
}

describe('leavePresenting', () => {
  it("selects and reveals the presented frame over its own page's canvas", () => {
    const { centered } = presentOver('studio/home')

    leavePresenting()

    expect(selectionStore.getState()).toMatchObject({
      page: 'studio/home',
      frames: ['studio/home/hero'],
    })
    expect(centered).toEqual([HERO_BOX])
  })

  it("keeps the selection and view of another page's canvas", () => {
    const { centered } = presentOver('studio/about')
    select(selectionStore, 'studio/about', ['studio/about/team'])

    leavePresenting()

    expect(selectionStore.getState()).toMatchObject({
      page: 'studio/about',
      frames: ['studio/about/team'],
    })
    expect(centered).toEqual([])
  })

  it("ends presenting over another page's canvas", () => {
    presentOver('studio/about')

    leavePresenting()

    expect(presentStore.getState().page).toBeNull()
  })

  it('selects the presented frame with no canvas mounted', () => {
    presentOver(null)

    leavePresenting()

    expect(selectionStore.getState().frames).toEqual(['studio/home/hero'])
  })
})
