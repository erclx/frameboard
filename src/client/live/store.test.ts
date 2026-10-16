import { describe, expect, it } from 'vitest'

import type { ListResult } from '@/shared/records/list'

import { createLiveStore, receiveBoard, receiveReload } from './store'

function boardWith(...names: string[]): ListResult {
  return {
    root: '/board',
    projects: [
      {
        name: 'studio',
        path: '/board/studio',
        modifiedAt: '2026-10-15T00:00:00.000Z',
        projectFileError: null,
        pages: [
          {
            ref: 'studio/home',
            project: 'studio',
            name: 'home',
            path: '/board/studio/home',
            index: 0,
            layoutError: null,
            frames: names.map((name) => ({
              ref: `studio/home/${name}`,
              project: 'studio',
              page: 'home',
              name,
              path: `/board/studio/home/${name}.html`,
              box: { x: 0, y: 0, width: 390, height: 844 },
              order: 0,
              hidden: false,
              locked: false,
              placed: true,
              modifiedAt: '2026-10-15T00:00:00.000Z',
            })),
          },
        ],
      },
    ],
  }
}

describe('receiveBoard', () => {
  it('replaces the board', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))

    receiveBoard(store, boardWith('hero', 'about'))

    expect(
      store.getState().board?.projects[0]?.pages[0]?.frames.map((f) => f.name),
    ).toEqual(['hero', 'about'])
  })

  it('drops the counter of a frame the board no longer holds', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero', 'about'))
    receiveReload(store, ['studio/home/hero', 'studio/home/about'])

    receiveBoard(store, boardWith('hero'))

    expect(store.getState().reloads).toEqual({ 'studio/home/hero': 1 })
  })
})

describe('receiveReload', () => {
  it('bumps only the named frames, once per message', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero', 'about'))

    receiveReload(store, ['studio/home/hero'])
    receiveReload(store, ['studio/home/hero'])

    expect(store.getState().reloads).toEqual({ 'studio/home/hero': 2 })
  })
})
