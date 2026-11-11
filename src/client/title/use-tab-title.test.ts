import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { liveStore, receiveNotes } from '@/client/live/store'
import {
  createUnseenStore,
  markAllSeen,
  markRepliesSeen,
  receiveChanges,
  SEEN_KEY,
  SEEN_REPLIES_KEY,
  SEEN_SHOWS_KEY,
  unseenReplies,
  unseenStore,
} from '@/client/live/unseen'
import type { FrameChange } from '@/shared/records/changes'
import type { BoardNote } from '@/shared/records/notes'

import { useTabTitle } from './use-tab-title'

function change(frame: string): FrameChange {
  return {
    id: `c-${frame}`,
    frame,
    at: '2026-10-19T12:00:00.000Z',
    hash: 'c'.repeat(64),
    author: { session: 's-1', agent: 'claude', tag: 'claude · studio' },
    elements: [4],
    removed: 0,
    whole: false,
    created: false,
  }
}

function note(fields: Partial<BoardNote> & Pick<BoardNote, 'id'>): BoardNote {
  return {
    number: null,
    frame: 'hero',
    anchor: null,
    text: 'Done.',
    from: 'agent',
    author: null,
    session: 's-1',
    to: null,
    state: 'open',
    thread: 'n_root',
    createdAt: '2026-10-19T16:12:00.000Z',
    updatedAt: '2026-10-19T16:12:00.000Z',
    element: null,
    ...fields,
  }
}

const root = note({
  id: 'n_root',
  number: 1,
  from: 'developer',
  thread: null,
  text: 'Tighten the header',
})

function renderAt(path: string) {
  const memory = memoryLocation({ path })
  return renderHook(() => useTabTitle(), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(Router, { hook: memory.hook, children }),
  })
}

afterEach(() => {
  act(() => {
    unseenStore.setState({
      unseen: {},
      seen: {},
      shows: {},
      cursor: null,
      replies: {},
    })
    liveStore.setState({ notes: {} })
  })
  for (const key of [SEEN_KEY, SEEN_SHOWS_KEY, SEEN_REPLIES_KEY])
    window.localStorage.removeItem(key)
})

describe('useTabTitle', () => {
  it('leads the project title with the count of unseen changes', () => {
    act(() =>
      receiveChanges(unseenStore, [
        change('landing-v2/home/hero'),
        change('landing-v2/home/faq'),
        change('landing-v2/pricing/plans'),
      ]),
    )

    renderAt('/p/landing-v2/home')

    expect(document.title).toBe('(3) landing-v2 · Frameboard')
  })

  it('drops the count once every change is marked seen', () => {
    act(() => receiveChanges(unseenStore, [change('landing-v2/home/hero')]))
    renderAt('/p/landing-v2/home')

    act(() => markAllSeen(unseenStore))

    expect(document.title).toBe('landing-v2 · Frameboard')
  })

  it('counts an agent reply until its thread is seen', () => {
    renderAt('/p/studio/home')

    act(() =>
      receiveNotes(liveStore, 'studio/home', [root, note({ id: 'n_reply' })]),
    )
    expect(document.title).toBe('(1) studio · Frameboard')

    act(() => markRepliesSeen(unseenStore, [root, note({ id: 'n_reply' })]))
    expect(document.title).toBe('studio · Frameboard')
  })

  it('counts a reply landing after its thread was seen', () => {
    const first = note({ id: 'n_first' })
    act(() => markRepliesSeen(unseenStore, [root, first]))
    renderAt('/p/studio/home')

    act(() =>
      receiveNotes(liveStore, 'studio/home', [
        root,
        first,
        note({ id: 'n_second', updatedAt: '2026-10-19T16:20:00.000Z' }),
      ]),
    )

    expect(document.title).toBe('(1) studio · Frameboard')
  })

  it('reads the app name bare on home with nothing unseen', () => {
    renderAt('/')

    expect(document.title).toBe('Frameboard')
  })

  it('counts the whole board on home', () => {
    act(() => {
      receiveChanges(unseenStore, [change('landing-v2/home/hero')])
      receiveNotes(liveStore, 'studio/home', [root, note({ id: 'n_reply' })])
    })

    renderAt('/')

    expect(document.title).toBe('(2) Frameboard')
  })
})

describe('markRepliesSeen', () => {
  it('clears the count when storage refuses the write', () => {
    const store = createUnseenStore({
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    const thread = [root, note({ id: 'n_reply' })]

    markRepliesSeen(store, thread)

    expect(
      unseenReplies({ 'studio/home': thread }, store.getState().replies),
    ).toBe(0)
  })

  it('counts no reply from the developer', () => {
    const thread = [root, note({ id: 'n_mine', from: 'developer' })]

    expect(unseenReplies({ 'studio/home': thread }, {})).toBe(0)
  })
})
