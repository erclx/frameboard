import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findAction, isEnabled } from '@/client/actions/registry'
import { liveStore, receiveBoard } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import { boardOf, pageOf } from '@/test/board'

import { newPageName, usePageActions } from './page-actions'

describe('newPageName', () => {
  it('counts on from the pages there are', () => {
    expect(newPageName(['home', 'pricing'])).toBe('page-3')
  })

  it('skips a name a page holds in any case', () => {
    expect(newPageName(['home', 'Page-3'])).toBe('page-4')
  })

  it('names the first page of an empty project page-1', () => {
    expect(newPageName([])).toBe('page-1')
  })
})

describe('moving a page', () => {
  const THREE = boardOf(
    { ...pageOf([], 'home'), index: 0 },
    { ...pageOf([], 'pricing'), index: 1 },
    { ...pageOf([], 'about'), index: 2 },
  )

  /** The page actions on `page`, answering every write and recording what was sent. */
  function onPage(page: string) {
    const sent: { path: string; body: unknown }[] = []
    const calls = createStructure(async (path, init) => {
      sent.push({ path: String(path), body: JSON.parse(String(init?.body)) })
      return Response.json({ ok: true, data: {} })
    })
    const hook = renderHook(() => usePageActions('studio', page, calls))
    cleanups.push(hook.unmount)
    return sent
  }

  const enabled = (id: string) => {
    const action = findAction(id)
    return action ? isEnabled(action) : false
  }

  const cleanups: (() => void)[] = []

  beforeEach(() => {
    receiveBoard(liveStore, THREE)
    liveStore.setState({ canWrite: true })
  })

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.()
    liveStore.setState({ canWrite: false, board: null })
  })

  it('moves the page on the canvas up one place', async () => {
    const sent = onPage('pricing')

    findAction('page.moveUp')?.run()

    await expect
      .poll(() => sent)
      .toEqual([
        { path: '/api/page/move', body: { ref: 'studio/pricing', index: 0 } },
      ])
  })

  it('moves the page on the canvas down one place', async () => {
    const sent = onPage('pricing')

    findAction('page.moveDown')?.run()

    await expect
      .poll(() => sent)
      .toEqual([
        { path: '/api/page/move', body: { ref: 'studio/pricing', index: 2 } },
      ])
  })

  it('moves the first page nowhere up', () => {
    onPage('home')

    expect([enabled('page.moveUp'), enabled('page.moveDown')]).toEqual([
      false,
      true,
    ])
  })

  it('moves the last page nowhere down', () => {
    onPage('about')

    expect([enabled('page.moveUp'), enabled('page.moveDown')]).toEqual([
      true,
      false,
    ])
  })
})

describe('stepping between pages', () => {
  const cleanups: (() => void)[] = []

  beforeEach(() => {
    receiveBoard(
      liveStore,
      boardOf(
        { ...pageOf([], 'home'), index: 0 },
        { ...pageOf([], 'pricing'), index: 1 },
        { ...pageOf([], 'about'), index: 2 },
      ),
    )
    history.pushState(null, '', '/p/studio/pricing')
  })

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.()
    liveStore.setState({ board: null })
    history.pushState(null, '', '/')
  })

  function onPage(page: string) {
    cleanups.push(renderHook(() => usePageActions('studio', page)).unmount)
  }

  it.each([
    ['page.next', '/p/studio/about'],
    ['page.previous', '/p/studio/home'],
  ])('opens the page %s reaches, in a tab that cannot write', (id, path) => {
    onPage('pricing')

    findAction(id)?.run()

    expect(location.pathname).toBe(path)
  })

  it('steps nowhere past the last page', () => {
    onPage('about')

    expect(
      ['page.next', 'page.previous'].map((id) => {
        const action = findAction(id)
        return action ? isEnabled(action) : false
      }),
    ).toEqual([false, true])
  })
})
