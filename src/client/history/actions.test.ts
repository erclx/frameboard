import { render, renderHook, screen } from '@testing-library/react'
import { act, createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { isEnabled, useActions, useCommands } from '@/client/actions/registry'
import { dropWaiting } from '@/client/board/claims/waiting'
import { holdBoxes, withPending } from '@/client/board/geometry/write'
import {
  createSelectionStore,
  select,
  selectElement,
} from '@/client/board/selection'
import { Toaster } from '@/client/components/ui/toast'
import {
  createLiveStore,
  type LiveStore,
  receiveAccess,
  receiveClaims,
  receiveHistory,
} from '@/client/live/store'
import type { StepAnswer } from '@/client/live/structure'
import { BoardWriteError } from '@/client/live/write'
import type { ElementTree } from '@/shared/records/elements'
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
  hugWidth: false,
  hugHeight: false,
  placed: true,
  modifiedAt: '2026-10-19T00:00:00.000Z',
}

/** The file index of a hero element at `position` under `body`, past the four elements of `head`. */
const at = (position: number) => position + 4

/** A hero tree at `hash` holding one child of `body` per `tag` or `tag:name`, in index order. */
function treeOf(hash: string, elements: string[]): ElementTree {
  return {
    ref: HERO.ref,
    hash,
    elements: elements.map((element, position) => {
      const [tag = '', name = tag] = element.split(':')
      return {
        index: at(position),
        parent: null,
        tag,
        name,
        textOnly: false,
        layout: 'block',
        round: false,
        placed: false,
      }
    }),
  }
}

/** Answers the picked tree at hash `a` and `after` at hash `b`. */
function treesFrom(before: ElementTree | null, after: ElementTree | null) {
  return async (_ref: string, hash: string) =>
    hash === 'a'.repeat(64) ? before : after
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
      treeAt: async () => null,
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

  it('binds Redo to Ctrl+Y as well off a Mac', () => {
    register(writableWith(0, 0), { mac: false })

    const { result } = renderHook(() => useActions(['edit.redo']))

    expect(result.current[0]?.keys).toEqual(['$mod+Shift+KeyZ', 'Control+KeyY'])
  })

  it('binds Undo to Cmd+Z and Redo to Cmd+Shift+Z on a Mac', () => {
    register(writableWith(0, 0), { mac: true })

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

  describe('the refusal toast', () => {
    afterEach(() => {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
    })

    it('leaves on its own once 5 seconds pass', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      render(createElement(Toaster))
      const { undo } = register(writableWith(1, 0), {
        notify: undefined,
        calls: {
          undo: async () => {
            throw new BoardWriteError('undo-overtaken', 'Hero changed since.')
          },
          redo: async () => ({ page: null, frames: [] }),
        },
      })

      act(undo)
      await screen.findByText('Hero changed since.')
      act(() => {
        // The test page starts unfocused, and a blurred window pauses toasts.
        window.dispatchEvent(new FocusEvent('focus'))
        vi.advanceTimersByTime(5100)
      })

      await vi.waitFor(() =>
        expect(screen.queryByText('Hero changed since.')).toBeNull(),
      )
    })
  })

  describe('a step naming a frame another session holds', () => {
    const CLAIM = {
      frame: HERO.ref,
      session: 'sess-a',
      agent: 'claude',
      tag: 'claude · visual-style',
      claimedAt: '2026-10-19T10:00:00.000Z',
      expiresAt: '2099-10-19T10:05:00.000Z',
    }
    const refusal = () =>
      new BoardWriteError('frame-claimed', 'claude is editing hero.', CLAIM)

    afterEach(() => {
      dropWaiting()
    })

    it('waits on a frame-claimed refusal, then undoes once the claim drops', async () => {
      const store = writableWith(1, 0)
      store.setState({ connected: true })
      const notify = vi.fn()
      const undoCall = vi
        .fn<() => Promise<StepAnswer>>()
        .mockRejectedValueOnce(refusal())
        .mockResolvedValueOnce({ page: null, frames: [HERO.ref] })
      const { undo } = register(store, {
        notify,
        calls: {
          undo: undoCall,
          redo: async () => ({ page: null, frames: [] }),
        },
      })

      act(undo)
      await vi.waitFor(() => expect(undoCall).toHaveBeenCalledTimes(1))
      // Lets the refusal reach its wait before the claim shows.
      await new Promise((resolve) => setTimeout(resolve, 0))
      receiveClaims(store, [CLAIM])
      expect(undoCall).toHaveBeenCalledTimes(1)
      receiveClaims(store, [])

      await vi.waitFor(() => expect(undoCall).toHaveBeenCalledTimes(2))
      expect(notify).not.toHaveBeenCalled()
    })

    it('drops a waiting undo once a newer step lands, so it never undoes that one', async () => {
      const store = writableWith(1, 0)
      store.setState({ connected: true })
      const undoCall = vi
        .fn<() => Promise<StepAnswer>>()
        .mockRejectedValueOnce(refusal())
        .mockResolvedValueOnce({ page: null, frames: [] })
      const { undo } = register(store, {
        calls: {
          undo: undoCall,
          redo: async () => ({ page: null, frames: [] }),
        },
      })
      act(undo)
      await vi.waitFor(() => expect(undoCall).toHaveBeenCalledTimes(1))
      await new Promise((resolve) => setTimeout(resolve, 0))
      receiveClaims(store, [CLAIM])

      receiveHistory(store, { undo: 2, redo: 0 })
      receiveClaims(store, [])

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(undoCall).toHaveBeenCalledTimes(1)
    })

    it('drops a waiting undo on Esc without sending it again or raising a toast', async () => {
      const store = writableWith(1, 0)
      store.setState({ connected: true })
      const notify = vi.fn()
      const undoCall = vi
        .fn<() => Promise<StepAnswer>>()
        .mockRejectedValueOnce(refusal())
      const { undo } = register(store, {
        notify,
        calls: {
          undo: undoCall,
          redo: async () => ({ page: null, frames: [] }),
        },
      })
      act(undo)
      await vi.waitFor(() => expect(undoCall).toHaveBeenCalledTimes(1))
      await new Promise((resolve) => setTimeout(resolve, 0))
      receiveClaims(store, [CLAIM])

      dropWaiting()
      receiveClaims(store, [])

      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(undoCall).toHaveBeenCalledTimes(1)
      expect(notify).not.toHaveBeenCalled()
    })
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

  it('keeps the selected element through an undo of its hand edit', async () => {
    const selection = createSelectionStore()
    const element = { frame: HERO.ref, index: at(1), hash: 'a'.repeat(64) }
    selectElement(selection, 'studio/home', element)
    const { undo } = register(writableWith(1, 0), {
      selection,
      treeAt: treesFrom(
        treeOf('a'.repeat(64), ['h1', 'div']),
        treeOf('b'.repeat(64), ['h1', 'div']),
      ),
      calls: {
        undo: async () => ({
          page: null,
          frames: [HERO.ref],
          hashes: { [HERO.ref]: 'b'.repeat(64) },
        }),
        redo: async () => ({ page: null, frames: [] }),
      },
    })

    act(undo)

    await vi.waitFor(() =>
      expect(selection.getState().element).toEqual({
        ...element,
        hash: 'b'.repeat(64),
      }),
    )
  })

  it('selects the frame when an undo removes the selected element it placed', async () => {
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', {
      frame: HERO.ref,
      index: at(2),
      hash: 'a'.repeat(64),
    })
    const { undo } = register(writableWith(1, 0), {
      selection,
      treeAt: treesFrom(
        treeOf('a'.repeat(64), ['h1', 'div', 'div']),
        treeOf('b'.repeat(64), ['h1', 'div']),
      ),
      calls: {
        undo: async () => ({
          page: null,
          frames: [HERO.ref],
          hashes: { [HERO.ref]: 'b'.repeat(64) },
        }),
        redo: async () => ({ page: null, frames: [] }),
      },
    })

    act(undo)

    await vi.waitFor(() =>
      expect(selection.getState()).toMatchObject({
        frames: [HERO.ref],
        element: null,
      }),
    )
  })

  it('selects the frame when a placement before the selected element undoes, though its index survives', async () => {
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', {
      frame: HERO.ref,
      index: at(1),
      hash: 'a'.repeat(64),
    })
    const { undo } = register(writableWith(1, 0), {
      selection,
      treeAt: treesFrom(
        treeOf('a'.repeat(64), ['h1', 'div', 'p']),
        treeOf('b'.repeat(64), ['h1', 'p']),
      ),
      calls: {
        undo: async () => ({
          page: null,
          frames: [HERO.ref],
          hashes: { [HERO.ref]: 'b'.repeat(64) },
        }),
        redo: async () => ({ page: null, frames: [] }),
      },
    })

    act(undo)

    await vi.waitFor(() =>
      expect(selection.getState()).toMatchObject({
        frames: [HERO.ref],
        element: null,
      }),
    )
  })

  it('selects the frame rather than an element a redo placed back', async () => {
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', {
      frame: HERO.ref,
      index: at(1),
      hash: 'a'.repeat(64),
    })
    const { redo } = register(writableWith(0, 1), {
      selection,
      treeAt: treesFrom(
        treeOf('a'.repeat(64), ['h1', 'div']),
        treeOf('b'.repeat(64), ['h1', 'div', 'div']),
      ),
      calls: {
        undo: async () => ({ page: null, frames: [] }),
        redo: async () => ({
          page: null,
          frames: [HERO.ref],
          hashes: { [HERO.ref]: 'b'.repeat(64) },
        }),
      },
    })

    act(redo)

    await vi.waitFor(() =>
      expect(selection.getState()).toMatchObject({
        frames: [HERO.ref],
        element: null,
      }),
    )
  })

  it('keeps the selected element through an undo that changes its own text', async () => {
    const selection = createSelectionStore()
    const element = { frame: HERO.ref, index: at(0), hash: 'a'.repeat(64) }
    selectElement(selection, 'studio/home', element)
    const { undo } = register(writableWith(1, 0), {
      selection,
      treeAt: treesFrom(
        treeOf('a'.repeat(64), ['h1:Welcome', 'div:Row']),
        treeOf('b'.repeat(64), ['h1:Hello', 'div:Row']),
      ),
      calls: {
        undo: async () => ({
          page: null,
          frames: [HERO.ref],
          hashes: { [HERO.ref]: 'b'.repeat(64) },
        }),
        redo: async () => ({ page: null, frames: [] }),
      },
    })

    act(undo)

    await vi.waitFor(() =>
      expect(selection.getState().element).toEqual({
        ...element,
        hash: 'b'.repeat(64),
      }),
    )
  })

  it('selects the frame when an undone move puts a sibling under the selected index', async () => {
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', {
      frame: HERO.ref,
      index: at(2),
      hash: 'a'.repeat(64),
    })
    const { undo } = register(writableWith(1, 0), {
      selection,
      treeAt: treesFrom(
        treeOf('a'.repeat(64), ['div:Two', 'div:Three', 'div:One']),
        treeOf('b'.repeat(64), ['div:One', 'div:Two', 'div:Three']),
      ),
      calls: {
        undo: async () => ({
          page: null,
          frames: [HERO.ref],
          hashes: { [HERO.ref]: 'b'.repeat(64) },
        }),
        redo: async () => ({ page: null, frames: [] }),
      },
    })

    act(undo)

    await vi.waitFor(() =>
      expect(selection.getState()).toMatchObject({
        frames: [HERO.ref],
        element: null,
      }),
    )
  })

  it('selects the frame when the tree the element was picked from cannot be read', async () => {
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', {
      frame: HERO.ref,
      index: at(1),
      hash: 'a'.repeat(64),
    })
    const { undo } = register(writableWith(1, 0), {
      selection,
      treeAt: treesFrom(null, treeOf('b'.repeat(64), ['h1', 'div'])),
      calls: {
        undo: async () => ({
          page: null,
          frames: [HERO.ref],
          hashes: { [HERO.ref]: 'b'.repeat(64) },
        }),
        redo: async () => ({ page: null, frames: [] }),
      },
    })

    act(undo)

    await vi.waitFor(() =>
      expect(selection.getState()).toMatchObject({
        frames: [HERO.ref],
        element: null,
      }),
    )
  })

  it('selects the frame when the tree for the answered bytes cannot be read', async () => {
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', {
      frame: HERO.ref,
      index: at(1),
      hash: 'a'.repeat(64),
    })
    const { undo } = register(writableWith(1, 0), {
      selection,
      treeAt: treesFrom(treeOf('a'.repeat(64), ['h1', 'div']), null),
      calls: {
        undo: async () => ({
          page: null,
          frames: [HERO.ref],
          hashes: { [HERO.ref]: 'b'.repeat(64) },
        }),
        redo: async () => ({ page: null, frames: [] }),
      },
    })

    act(undo)

    await vi.waitFor(() =>
      expect(selection.getState()).toMatchObject({
        frames: [HERO.ref],
        element: null,
      }),
    )
  })

  it('leaves a selection the user changed while the tree loaded', async () => {
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', {
      frame: HERO.ref,
      index: at(1),
      hash: 'a'.repeat(64),
    })
    let answer: (tree: ElementTree) => void = () => {}
    const asked = vi.fn()
    const picked = { frame: HERO.ref, index: at(0), hash: 'a'.repeat(64) }
    const { undo } = register(writableWith(1, 0), {
      selection,
      treeAt: async (_ref, hash) => {
        if (hash === 'a'.repeat(64)) return treeOf(hash, ['h1', 'div'])
        asked()
        return new Promise((resolve) => (answer = resolve))
      },
      calls: {
        undo: async () => ({
          page: null,
          frames: [HERO.ref],
          hashes: { [HERO.ref]: 'b'.repeat(64) },
        }),
        redo: async () => ({ page: null, frames: [] }),
      },
    })
    act(undo)
    await vi.waitFor(() => expect(asked).toHaveBeenCalled())

    selectElement(selection, 'studio/home', picked)
    answer(treeOf('b'.repeat(64), ['h1']))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(selection.getState().element).toEqual(picked)
  })

  it('leaves the selection as it is for an undo answering no hashes', async () => {
    const selection = createSelectionStore()
    const element = { frame: HERO.ref, index: 5, hash: 'a'.repeat(64) }
    selectElement(selection, 'studio/home', element)
    holdBoxes({ [HERO.ref]: { ...HERO.box, x: 400 } })
    const { undo } = register(writableWith(1, 0), {
      selection,
      calls: {
        undo: async () => ({ page: null, frames: [HERO.ref] }),
        redo: async () => ({ page: null, frames: [] }),
      },
    })

    act(undo)
    // The pending box drops as the answer is followed.
    await vi.waitFor(() => expect(withPending([HERO])[0]?.box.x).toBe(0))

    expect(selection.getState().element).toEqual(element)
  })

  it('selects nothing when no element was selected', async () => {
    const selection = createSelectionStore()
    select(selection, 'studio/home', [HERO.ref])
    holdBoxes({ [HERO.ref]: { ...HERO.box, x: 400 } })
    const { undo } = register(writableWith(1, 0), {
      selection,
      calls: {
        undo: async () => ({
          page: null,
          frames: [HERO.ref],
          hashes: { [HERO.ref]: 'b'.repeat(64) },
        }),
        redo: async () => ({ page: null, frames: [] }),
      },
    })

    act(undo)
    await vi.waitFor(() => expect(withPending([HERO])[0]?.box.x).toBe(0))

    expect(selection.getState().element).toBeNull()
  })
})
