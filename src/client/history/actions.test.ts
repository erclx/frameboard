import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { isEnabled, useActions, useCommands } from '@/client/actions/registry'
import { holdBoxes, withPending } from '@/client/board/geometry/write'
import {
  createLiveStore,
  type LiveStore,
  receiveAccess,
  receiveHistory,
} from '@/client/live/store'
import type { StepAnswer } from '@/client/live/structure'
import { BoardWriteError } from '@/client/live/write'
import type { FrameRecord } from '@/shared/records/list'

import { type HistoryDeps, registerHistoryActions } from './actions'

const HERO: FrameRecord = {
  ref: 'studio/home/hero',
  project: 'studio',
  page: 'home',
  name: 'hero',
  path: '/board/studio/home/hero.html',
  box: { x: 0, y: 0, width: 1440, height: 900 },
  order: 0,
  hidden: false,
  locked: false,
  placed: true,
  modifiedAt: '2026-10-19T00:00:00.000Z',
}

describe('registerHistoryActions', () => {
  let unregister: (() => void) | undefined

  afterEach(() => {
    unregister?.()
  })

  function register(
    store: LiveStore,
    deps: Partial<HistoryDeps> = {},
  ): { undo: () => void; redo: () => void } {
    unregister = registerHistoryActions({
      store,
      navigate: () => {},
      notify: () => {},
      calls: {
        undo: async () => ({ page: null, frames: [] }),
        redo: async () => ({ page: null, frames: [] }),
      },
      ...deps,
    })
    const { result } = renderHook(() => useActions(['edit.undo', 'edit.redo']))
    return {
      undo: () => result.current[0]?.run(),
      redo: () => result.current[1]?.run(),
    }
  }

  function writableWith(undo: number, redo: number): LiveStore {
    const store = createLiveStore()
    receiveAccess(store, true)
    receiveHistory(store, { undo, redo })
    return store
  }

  it('lights Undo and Redo from the server counts', () => {
    const store = writableWith(1, 0)
    register(store)

    const { result } = renderHook(() => useActions(['edit.undo', 'edit.redo']))

    expect(result.current.map((action) => action && isEnabled(action))).toEqual(
      [true, false],
    )
  })

  it('keeps Undo off in a tab that cannot write', () => {
    const store = writableWith(2, 0)
    receiveAccess(store, false)
    register(store)

    const { result } = renderHook(() => useActions(['edit.undo']))

    expect(result.current[0] && isEnabled(result.current[0])).toBe(false)
  })

  it('lists Undo and Redo in the command palette while they are lit', () => {
    register(writableWith(1, 1))

    const { result } = renderHook(() => useCommands())

    expect(result.current.map((action) => action.id)).toEqual(
      expect.arrayContaining(['edit.undo', 'edit.redo']),
    )
  })

  it('binds Undo to Cmd+Z and Redo to Cmd+Shift+Z', () => {
    register(writableWith(0, 0))

    const { result } = renderHook(() => useActions(['edit.undo', 'edit.redo']))

    expect(result.current.map((action) => action?.keys)).toEqual([
      ['$mod+KeyZ'],
      ['$mod+Shift+KeyZ'],
    ])
  })

  it('raises a toast with the server reason when an undo is refused', async () => {
    const notify = vi.fn()
    const { undo } = register(writableWith(1, 0), {
      notify,
      calls: {
        undo: async () => {
          throw new BoardWriteError(
            'undo-overtaken',
            'An agent changed hero after your edit, so that step was dropped.',
          )
        },
        redo: async () => ({ page: null, frames: [] }),
      },
    })

    act(undo)

    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith({
        title: 'Undo skipped',
        description:
          'An agent changed hero after your edit, so that step was dropped.',
      }),
    )
  })

  it('raises a toast for a refusal other than an overtaken step', async () => {
    const notify = vi.fn()
    const { undo } = register(writableWith(1, 0), {
      notify,
      calls: {
        undo: async () => {
          throw new BoardWriteError(
            'lock-timeout',
            'Another writer held the layout for more than 2000 ms.',
          )
        },
        redo: async () => ({ page: null, frames: [] }),
      },
    })

    act(undo)

    await vi.waitFor(() =>
      expect(notify).toHaveBeenCalledWith({
        title: 'Undo skipped',
        description: 'Another writer held the layout for more than 2000 ms.',
      }),
    )
  })

  it('drops the pending box of a frame an undo moved back', async () => {
    holdBoxes({ [HERO.ref]: { ...HERO.box, x: 400 } })
    let answered: () => void = () => {}
    const done = new Promise<void>((resolve) => (answered = resolve))
    const { undo } = register(writableWith(1, 0), {
      calls: {
        undo: async (): Promise<StepAnswer> => {
          answered()
          return { page: null, frames: [HERO.ref] }
        },
        redo: async () => ({ page: null, frames: [] }),
      },
    })

    act(undo)
    await done

    await vi.waitFor(() => expect(withPending([HERO])[0]?.box.x).toBe(0))
  })

  it('follows a rename undo to the restored page', async () => {
    const navigate = vi.fn()
    const { undo } = register(writableWith(1, 0), {
      navigate,
      calls: {
        undo: async () => ({ page: 'studio/home', frames: [] }),
        redo: async () => ({ page: null, frames: [] }),
      },
    })

    act(undo)

    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/p/studio/home'),
    )
  })
})
