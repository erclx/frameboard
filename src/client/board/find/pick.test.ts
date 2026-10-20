import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { registerActions } from '@/client/actions/registry'
import type { FindHit } from '@/shared/records/find'

import { clear, selectionStore } from '../selection'
import { attachCanvas, type CanvasControls } from '../view'
import { pickHit } from './pick'

const HASH = 'a'.repeat(64)

function hit(extra: Partial<FindHit> = {}): FindHit {
  return {
    kind: 'text',
    page: 'onboarding',
    frame: 'welcome',
    ref: 'studio/onboarding/welcome',
    index: 5,
    hash: HASH,
    name: 'Get started',
    snippet: 'Get started',
    ...extra,
  }
}

const CANVAS: CanvasControls = {
  zoomBy: () => {},
  zoomTo: () => {},
  fit: () => {},
  fitTo: () => {},
  panBy: () => {},
}

describe('pickHit', () => {
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

  it('selects a text hit’s element on another page and zooms once its canvas attaches', () => {
    const first = attachCanvas(CANVAS)

    pickHit('studio', hit())
    first()
    cleanups.push(attachCanvas(CANVAS))

    expect({
      path: location.pathname,
      selection: selectionStore.getState(),
      zooms,
    }).toEqual({
      path: '/p/studio/onboarding',
      selection: {
        page: 'studio/onboarding',
        frames: ['studio/onboarding/welcome'],
        element: { frame: 'studio/onboarding/welcome', index: 5, hash: HASH },
      },
      zooms: 1,
    })
  })

  it('selects a frame hit’s frame alone', () => {
    cleanups.push(attachCanvas(CANVAS))

    pickHit(
      'studio',
      hit({ kind: 'frame', index: null, hash: null, snippet: null }),
    )

    expect(selectionStore.getState()).toEqual({
      page: 'studio/onboarding',
      frames: ['studio/onboarding/welcome'],
      element: null,
    })
  })
})
