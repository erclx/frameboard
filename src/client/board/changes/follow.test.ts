import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { findAction, isEnabled } from '@/client/actions/registry'
import { createLiveStore } from '@/client/live/store'
import { createUnseenStore, receiveChanges } from '@/client/live/unseen'
import type { FrameChange } from '@/shared/records/changes'
import type { Claim } from '@/shared/records/claims'
import { boardOf, frameOf, pageOf } from '@/test/board'

import type { Box } from '../geometry/box'
import {
  attachCanvas,
  type CanvasControls,
  reportHandMove,
  reportZoom,
} from '../view'
import { follow, followStore, stopFollow, useFollowActions } from './follow'

const HOME_BOX = { x: 900, y: 40, width: 390, height: 844 }
const ABOUT_BOX = { x: 2000, y: 0, width: 390, height: 844 }

function change(
  frame: string,
  session: string,
  overrides: Partial<FrameChange> = {},
): FrameChange {
  return {
    id: `c-${frame}-${session}`,
    frame,
    at: '2026-10-19T12:00:00.000Z',
    hash: 'c'.repeat(64),
    author: { session, agent: 'claude', tag: `claude · ${session}` },
    elements: [1],
    removed: 0,
    whole: false,
    created: false,
    ...overrides,
  }
}

function claim(frame: string, session: string): Claim {
  return {
    frame,
    session,
    agent: 'claude',
    tag: `claude · ${session}`,
    claimedAt: '2026-10-19T12:00:00.000Z',
    expiresAt: '2026-10-19T12:05:00.000Z',
  }
}

const cleanups: (() => void)[] = []

afterEach(() => {
  stopFollow()
  for (const cleanup of cleanups.splice(0)) cleanup()
})

/** A board of two pages with the followed session listening, and a canvas on `page`. */
function setup(page = 'studio/home') {
  const live = createLiveStore()
  live.setState({
    board: boardOf(
      pageOf([frameOf('a', { box: HOME_BOX })]),
      pageOf(
        [
          frameOf('b', {
            ref: 'studio/about/b',
            page: 'about',
            box: ABOUT_BOX,
          }),
        ],
        'about',
      ),
    ),
    listeners: [
      { session: 's-1', tag: 'claude · s-1', since: '' },
      { session: 's-2', tag: 'codex · s-2', since: '' },
    ],
  })
  const unseen = createUnseenStore(null)
  const centered: { page: string; box: Box }[] = []
  const scales: (number | undefined)[] = []
  const visited: string[] = []
  const canvasOn = (ref: string) => {
    const controls: CanvasControls = {
      zoomBy: () => {},
      zoomTo: () => {},
      fit: () => {},
      fitTo: () => {},
      panBy: () => {},
      centerOn: (box, scale) => {
        centered.push({ page: ref, box })
        scales.push(scale)
      },
      visible: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    }
    const detach = attachCanvas(controls, ref)
    cleanups.push(detach)
    return detach
  }
  const detach = canvasOn(page)
  follow('s-1', { live, unseen, go: (url) => visited.push(url) })
  return { live, unseen, centered, scales, visited, canvasOn, detach }
}

describe('follow', () => {
  it('centers a frame the followed session changes on the page on screen', () => {
    const { unseen, centered } = setup()

    receiveChanges(unseen, [change('studio/home/a', 's-1')])

    expect(centered).toEqual([{ page: 'studio/home', box: HOME_BOX }])
  })

  it('leaves the view alone for a change by another session', () => {
    const { unseen, centered } = setup()

    receiveChanges(unseen, [change('studio/home/a', 's-2')])

    expect(centered).toEqual([])
  })

  it('centers a frame the followed session newly claims', () => {
    const { live, centered } = setup()

    live.setState({
      claims: { 'studio/home/a': claim('studio/home/a', 's-1') },
    })

    expect(centered).toEqual([{ page: 'studio/home', box: HOME_BOX }])
  })

  it('moves to the page of a change on another page, then centers it there', () => {
    const { unseen, centered, visited, canvasOn, detach } = setup()

    receiveChanges(unseen, [change('studio/about/b', 's-1')])
    expect(visited).toEqual(['/p/studio/about'])
    expect(centered).toEqual([])
    detach()
    canvasOn('studio/about')

    expect(centered).toEqual([{ page: 'studio/about', box: ABOUT_BOX }])
    expect(followStore.getState().session).toBe('s-1')
  })

  it('keeps the zoom it left with across a page switch', () => {
    const { unseen, scales, detach, canvasOn } = setup()
    reportZoom(0.5)
    cleanups.push(() => reportZoom(1))

    receiveChanges(unseen, [change('studio/about/b', 's-1')])
    detach()
    canvasOn('studio/about')

    expect(scales).toEqual([0.5])
  })

  it('centers at the zoom on screen for a change on the same page', () => {
    const { unseen, scales } = setup()

    receiveChanges(unseen, [change('studio/home/a', 's-1')])

    expect(scales).toEqual([undefined])
  })

  it('centers only the last of a batch of changes', () => {
    const { unseen, centered, visited } = setup()

    receiveChanges(unseen, [
      change('studio/about/b', 's-1', { id: 'c-1' }),
      change('studio/home/a', 's-1', { id: 'c-2' }),
    ])

    expect(visited).toEqual([])
    expect(centered).toEqual([{ page: 'studio/home', box: HOME_BOX }])
  })

  it('stops on a hand move and leaves the next change alone', () => {
    const { unseen, centered } = setup()

    reportHandMove()
    receiveChanges(unseen, [change('studio/home/a', 's-1')])

    expect(followStore.getState().session).toBeNull()
    expect(centered).toEqual([])
  })

  it('stops when the developer opens another page', () => {
    const { canvasOn, detach } = setup()

    detach()
    canvasOn('studio/about')

    expect(followStore.getState().session).toBeNull()
  })

  it('keeps following when Show moves to a change on another page', () => {
    const { live, canvasOn, detach } = setup()

    live.setState({ focus: 'studio/about/b' })
    detach()
    canvasOn('studio/about')

    expect(followStore.getState().session).toBe('s-1')
  })

  it('stops on a hand pick of another page after Show settled', () => {
    const { live, canvasOn, detach } = setup()
    live.setState({ focus: 'studio/about/b' })
    detach()
    const detachAbout = canvasOn('studio/about')
    live.setState({ focus: null })

    detachAbout()
    canvasOn('studio/home')

    expect(followStore.getState().session).toBeNull()
  })

  it('stops when the followed session stops listening', () => {
    const { live } = setup()

    live.setState({
      listeners: [{ session: 's-2', tag: 'codex · s-2', since: '' }],
    })

    expect(followStore.getState().session).toBeNull()
  })
})

describe('useFollowActions', () => {
  function listening(...sessions: string[]) {
    const live = createLiveStore()
    live.setState({
      listeners: sessions.map((session) => ({
        session,
        tag: `claude · ${session}`,
        since: '',
      })),
    })
    const { unmount } = renderHook(() => useFollowActions(live))
    cleanups.push(unmount)
    return live
  }

  it('follows the one listening session from the palette', () => {
    listening('s-1')
    const start = findAction('follow.start')

    const offered = start ? isEnabled(start) : false
    start?.run()

    expect([offered, start?.command?.hint?.(), followStore.getState()]).toEqual(
      [true, 'claude · s-1', { session: 's-1' }],
    )
  })

  it('offers nothing while two sessions listen', () => {
    listening('s-1', 's-2')
    const start = findAction('follow.start')

    expect(start ? isEnabled(start) : true).toBe(false)
  })
})
