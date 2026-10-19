import { describe, expect, it } from 'vitest'

import type { FrameChange } from '@/shared/records/changes'
import type { ListResult } from '@/shared/records/list'

import {
  createUnseenStore,
  markSeen,
  nextUnseen,
  pruneUnseen,
  receiveChanges,
  SEEN_KEY,
  unseenUnder,
} from './unseen'

function change(
  frame: string,
  hash: string,
  overrides: Partial<FrameChange> = {},
): FrameChange {
  return {
    id: `c-${frame}-${hash}`,
    frame,
    at: '2026-10-19T12:00:00.000Z',
    hash,
    author: null,
    elements: [5],
    removed: 0,
    whole: false,
    created: false,
    ...overrides,
  }
}

function memoryStorage(seed: Record<string, string> = {}) {
  const items = new Map(Object.entries(seed))
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    items,
  }
}

const throwing = {
  getItem: (): string | null => {
    throw new Error('blocked')
  },
  setItem: (): void => {
    throw new Error('blocked')
  },
}

function boardWith(...refs: string[]): ListResult {
  const pages = new Map<string, string[]>()
  for (const ref of refs) {
    const [project, page, name] = ref.split('/') as [string, string, string]
    const key = `${project}/${page}`
    pages.set(key, [...(pages.get(key) ?? []), name])
  }
  const projects = new Map<string, ListResult['projects'][number]['pages']>()
  for (const [key, names] of pages) {
    const [project, page] = key.split('/') as [string, string]
    projects.set(project, [
      ...(projects.get(project) ?? []),
      {
        ref: key,
        project,
        name: page,
        path: `/board/${key}`,
        index: 0,
        layoutError: null,
        frames: names.map((name) => ({
          ref: `${key}/${name}`,
          project,
          page,
          name,
          path: `/board/${key}/${name}.html`,
          box: { x: 0, y: 0, width: 390, height: 844 },
          order: 0,
          hidden: false,
          locked: false,
          placed: true,
          modifiedAt: '2026-10-19T12:00:00.000Z',
        })),
      },
    ])
  }
  return {
    root: '/board',
    projects: [...projects].map(([name, list]) => ({
      name,
      path: `/board/${name}`,
      modifiedAt: '2026-10-19T12:00:00.000Z',
      createdAt: null,
      projectFileError: null,
      pages: list,
    })),
  }
}

describe('receiveChanges', () => {
  it('marks the frame a change names', () => {
    const store = createUnseenStore(memoryStorage())

    receiveChanges(store, [change('studio/home/hero', 'h1')])

    expect(Object.keys(store.getState().unseen)).toEqual(['studio/home/hero'])
  })

  it('keeps the newer change of a frame written twice', () => {
    const store = createUnseenStore(memoryStorage())

    receiveChanges(store, [change('studio/home/hero', 'h1')])
    receiveChanges(store, [change('studio/home/hero', 'h2')])

    expect(store.getState().unseen['studio/home/hero']?.hash).toBe('h2')
  })

  it('drops a replayed change whose hash was seen', () => {
    const storage = memoryStorage({
      [SEEN_KEY]: JSON.stringify({ 'studio/home/hero': 'h1' }),
    })
    const store = createUnseenStore(storage)

    receiveChanges(store, [change('studio/home/hero', 'h1')])

    expect(store.getState().unseen).toEqual({})
  })

  it('marks a seen frame again on a newer change', () => {
    const store = createUnseenStore(memoryStorage())
    receiveChanges(store, [change('studio/home/hero', 'h1')])
    markSeen(store, 'studio/home/hero')

    receiveChanges(store, [change('studio/home/hero', 'h2')])

    expect(store.getState().unseen['studio/home/hero']?.hash).toBe('h2')
  })
})

describe('markSeen', () => {
  it('clears the mark and keeps the hash it saw across a reload', () => {
    const storage = memoryStorage()
    const store = createUnseenStore(storage)
    receiveChanges(store, [change('studio/home/hero', 'h1')])

    markSeen(store, 'studio/home/hero')
    const reloaded = createUnseenStore(storage)
    receiveChanges(reloaded, [change('studio/home/hero', 'h1')])

    expect(store.getState().unseen).toEqual({})
    expect(reloaded.getState().unseen).toEqual({})
  })

  it('works for the tab while storage throws', () => {
    const store = createUnseenStore(throwing)
    receiveChanges(store, [
      change('studio/home/hero', 'h1'),
      change('studio/home/about', 'a1'),
    ])

    markSeen(store, 'studio/home/hero')

    expect(Object.keys(store.getState().unseen)).toEqual(['studio/home/about'])
  })
})

describe('unseenUnder', () => {
  it('counts the unseen frames on a page and in a project', () => {
    const store = createUnseenStore(memoryStorage())
    receiveChanges(store, [
      change('studio/home/hero', 'h1'),
      change('studio/home/about', 'a1'),
      change('studio/pricing/plans', 'p1'),
      change('shop/home/cart', 'c1'),
    ])
    const { unseen } = store.getState()

    expect(unseenUnder(unseen, 'studio/home')).toBe(2)
    expect(unseenUnder(unseen, 'studio')).toBe(3)
    expect(unseenUnder(unseen, 'shop/pricing')).toBe(0)
  })

  it('never counts a project whose name starts another', () => {
    const store = createUnseenStore(memoryStorage())
    receiveChanges(store, [change('studio-2/home/hero', 'h1')])

    expect(unseenUnder(store.getState().unseen, 'studio')).toBe(0)
  })
})

describe('pruneUnseen', () => {
  it('drops the mark of a frame the board no longer holds', () => {
    const store = createUnseenStore(memoryStorage())
    receiveChanges(store, [
      change('studio/home/hero', 'h1'),
      change('studio/home/gone', 'g1'),
    ])

    pruneUnseen(store, boardWith('studio/home/hero'))

    expect(Object.keys(store.getState().unseen)).toEqual(['studio/home/hero'])
  })
})

describe('nextUnseen', () => {
  it('steps through the changes in the order they landed and wraps', () => {
    const store = createUnseenStore(memoryStorage())
    receiveChanges(store, [
      change('studio/pricing/plans', 'p1', { at: '2026-10-19T12:00:02.000Z' }),
      change('studio/home/hero', 'h1', { at: '2026-10-19T12:00:01.000Z' }),
    ])
    const { unseen } = store.getState()

    expect(nextUnseen(unseen, null)?.frame).toBe('studio/home/hero')
    expect(nextUnseen(unseen, 'studio/home/hero')?.frame).toBe(
      'studio/pricing/plans',
    )
    expect(nextUnseen(unseen, 'studio/pricing/plans')?.frame).toBe(
      'studio/home/hero',
    )
  })
})
