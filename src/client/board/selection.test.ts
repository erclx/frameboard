import { describe, expect, it } from 'vitest'

import { createLiveStore, receiveBoard } from '@/client/live/store'
import { boardOf, frameOf, pageOf } from '@/test/board'

import { createModeStore } from './mode'
import {
  clear,
  createSelectionStore,
  followSelection,
  pruneSelection,
  select,
  toggle,
} from './selection'

const HERO = 'studio/home/hero'
const ABOUT = 'studio/home/about'

describe('select', () => {
  it('replaces the selection with the frames named on the page', () => {
    const store = createSelectionStore()
    select(store, 'studio/home', [HERO])

    select(store, 'studio/home', [ABOUT])

    expect(store.getState()).toEqual({ page: 'studio/home', frames: [ABOUT] })
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

    expect(store.getState()).toEqual({ page: null, frames: [] })
  })

  it('starts over on a frame from another page', () => {
    const store = createSelectionStore()
    select(store, 'studio/home', [HERO])

    toggle(store, 'studio/pricing', 'studio/pricing/plans')

    expect(store.getState()).toEqual({
      page: 'studio/pricing',
      frames: ['studio/pricing/plans'],
    })
  })
})

describe('clear', () => {
  it('empties the selection', () => {
    const store = createSelectionStore()
    select(store, 'studio/home', [HERO, ABOUT])

    clear(store)

    expect(store.getState()).toEqual({ page: null, frames: [] })
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

    expect(store.getState()).toEqual({ page: null, frames: [] })
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
