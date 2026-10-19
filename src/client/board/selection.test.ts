import { describe, expect, it } from 'vitest'

import { createLiveStore, receiveBoard } from '@/client/live/store'
import { boardOf, frameOf, pageOf } from '@/test/board'

import { createModeStore } from './mode'
import {
  awaitHash,
  awaitingHash,
  clear,
  createSelectionStore,
  followSelection,
  pruneSelection,
  rememberHash,
  select,
  selectElement,
  type SelectionStore,
  settleRefused,
  toggle,
} from './selection'

const HERO = 'studio/home/hero'
const ABOUT = 'studio/home/about'

describe('select', () => {
  it('replaces the selection with the frames named on the page', () => {
    const store = createSelectionStore()
    select(store, 'studio/home', [HERO])

    select(store, 'studio/home', [ABOUT])

    expect(store.getState()).toEqual({
      page: 'studio/home',
      frames: [ABOUT],
      element: null,
    })
  })
})

const HEADLINE = { frame: HERO, index: 6, hash: 'a'.repeat(64) }

describe('selectElement', () => {
  it('selects the element and its frame alone', () => {
    const store = createSelectionStore()
    select(store, 'studio/home', [HERO, ABOUT])

    selectElement(store, 'studio/home', HEADLINE)

    expect(store.getState()).toEqual({
      page: 'studio/home',
      frames: [HERO],
      element: HEADLINE,
    })
  })

  it.each([
    ['select', (store: SelectionStore) => select(store, 'studio/home', [HERO])],
    ['toggle', (store: SelectionStore) => toggle(store, 'studio/home', ABOUT)],
    ['clear', (store: SelectionStore) => clear(store)],
  ])('is reset by %s', (_case, act) => {
    const store = createSelectionStore()
    selectElement(store, 'studio/home', HEADLINE)

    act(store)

    expect(store.getState().element).toBeNull()
  })

  it.each([
    ['leaves the board', boardOf(pageOf([frameOf('about')]))],
    [
      'is hidden',
      boardOf(pageOf([frameOf('hero', { hidden: true }), frameOf('about')])),
    ],
  ])('is pruned when its frame %s', (_case, board) => {
    const store = createSelectionStore()
    selectElement(store, 'studio/home', HEADLINE)

    pruneSelection(store, board)

    expect(store.getState()).toEqual({ page: null, frames: [], element: null })
  })

  it('stays when the next board still shows its frame', () => {
    const store = createSelectionStore()
    selectElement(store, 'studio/home', HEADLINE)

    pruneSelection(store, boardOf(pageOf([frameOf('hero')])))

    expect(store.getState().element).toEqual(HEADLINE)
  })
})

describe('toggle', () => {
  it('adds a frame not yet selected', () => {
    const store = createSelectionStore()
    select(store, 'studio/home', [HERO])

    toggle(store, 'studio/home', ABOUT)

    expect(store.getState().frames).toEqual([HERO, ABOUT])
  })

  it('takes out a selected frame and leaves no page once empty', () => {
    const store = createSelectionStore()
    select(store, 'studio/home', [HERO])

    toggle(store, 'studio/home', HERO)

    expect(store.getState()).toEqual({ page: null, frames: [], element: null })
  })

  it('starts over on a frame from another page', () => {
    const store = createSelectionStore()
    select(store, 'studio/home', [HERO])

    toggle(store, 'studio/pricing', 'studio/pricing/plans')

    expect(store.getState()).toEqual({
      page: 'studio/pricing',
      frames: ['studio/pricing/plans'],
      element: null,
    })
  })
})

describe('clear', () => {
  it('empties the selection', () => {
    const store = createSelectionStore()
    select(store, 'studio/home', [HERO, ABOUT])

    clear(store)

    expect(store.getState()).toEqual({ page: null, frames: [], element: null })
  })
})

describe('pruneSelection', () => {
  it('drops a frame the next board no longer holds', () => {
    const store = createSelectionStore()
    select(store, 'studio/home', [HERO, ABOUT])

    pruneSelection(store, boardOf(pageOf([frameOf('hero')])))

    expect(store.getState().frames).toEqual([HERO])
  })

  it('drops a frame the next board hides', () => {
    const store = createSelectionStore()
    select(store, 'studio/home', [HERO, ABOUT])

    pruneSelection(
      store,
      boardOf(pageOf([frameOf('hero'), frameOf('about', { hidden: true })])),
    )

    expect(store.getState().frames).toEqual([HERO])
  })

  it('clears once the selected page is gone', () => {
    const store = createSelectionStore()
    select(store, 'studio/home', [HERO])

    pruneSelection(store, boardOf(pageOf([frameOf('hero')], 'pricing')))

    expect(store.getState()).toEqual({ page: null, frames: [], element: null })
  })
})

describe('followSelection', () => {
  function setup() {
    const store = createSelectionStore()
    const live = createLiveStore()
    const mode = createModeStore(1280)
    receiveBoard(live, boardOf(pageOf([frameOf('hero'), frameOf('about')])))
    return { store, live, mode }
  }

  it('clears a selection from another page when a canvas mounts', () => {
    const { store, live, mode } = setup()
    select(store, 'studio/pricing', ['studio/pricing/plans'])

    const stop = followSelection(store, 'studio/home', live, mode)

    expect(store.getState().frames).toEqual([])
    stop()
  })

  it('keeps a selection on the page the canvas shows', () => {
    const { store, live, mode } = setup()
    select(store, 'studio/home', [HERO])

    const stop = followSelection(store, 'studio/home', live, mode)

    expect(store.getState().frames).toEqual([HERO])
    stop()
  })

  it('clears when Play starts', () => {
    const { store, live, mode } = setup()
    const stop = followSelection(store, 'studio/home', live, mode)
    select(store, 'studio/home', [HERO])

    mode.setState({ mode: 'play' })

    expect(store.getState().frames).toEqual([])
    stop()
  })

  it('prunes on each board the server sends', () => {
    const { store, live, mode } = setup()
    const stop = followSelection(store, 'studio/home', live, mode)
    select(store, 'studio/home', [HERO, ABOUT])

    receiveBoard(live, boardOf(pageOf([frameOf('about')])))

    expect(store.getState().frames).toEqual([ABOUT])
    stop()
  })
})

describe('awaitHash', () => {
  it('holds one frame’s check while its write is in flight', () => {
    const done = awaitHash(HERO)

    expect([awaitingHash(HERO), awaitingHash(ABOUT)]).toEqual([true, false])
    done()
    expect(awaitingHash(HERO)).toBe(false)
  })

  it('holds every frame’s check for a write that may answer any', () => {
    const done = awaitHash(null)

    expect([awaitingHash(HERO), awaitingHash(ABOUT)]).toEqual([true, true])
    done()
    expect(awaitingHash(ABOUT)).toBe(false)
  })

  it('ends a hold once however often its end is called', () => {
    const first = awaitHash(HERO)
    const second = awaitHash(HERO)

    first()
    first()

    expect(awaitingHash(HERO)).toBe(true)
    second()
    expect(awaitingHash(HERO)).toBe(false)
  })
})

describe('awaitingHash for bytes the board wrote', () => {
  it('keeps a frame showing bytes one of its own writes left it at', () => {
    rememberHash('studio/home/kept', 'd'.repeat(64))

    expect(awaitingHash('studio/home/kept', 'd'.repeat(64))).toBe(true)
  })

  it('drops a frame showing bytes no write of its own left', () => {
    rememberHash('studio/home/kept', 'd'.repeat(64))

    expect(awaitingHash('studio/home/kept', 'e'.repeat(64))).toBe(false)
  })
})

describe('settleRefused', () => {
  const KEY = { frame: HERO, index: 3, hash: 'a'.repeat(64) }

  it('drops the element once its frame shows other bytes', () => {
    const store = createSelectionStore()
    selectElement(store, 'studio/home', KEY)

    settleRefused(store, () => 'b'.repeat(64))

    expect(store.getState()).toMatchObject({ frames: [HERO], element: null })
  })

  it('keeps the element while its frame still shows the bytes it names', () => {
    const store = createSelectionStore()
    selectElement(store, 'studio/home', KEY)

    settleRefused(store, () => KEY.hash)

    expect(store.getState().element).toEqual(KEY)
  })

  it('keeps the element while no live frame shows it', () => {
    const store = createSelectionStore()
    selectElement(store, 'studio/home', KEY)

    settleRefused(store, () => null)

    expect(store.getState().element).toEqual(KEY)
  })
})
