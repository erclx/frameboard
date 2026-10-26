import { describe, expect, it } from 'vitest'

import type { Finding } from '@/shared/records/check'
import type { Claim } from '@/shared/records/claims'
import type { ListResult } from '@/shared/records/list'
import type { BoardNote } from '@/shared/records/notes'

import {
  createLiveStore,
  identityOf,
  type LiveStore,
  receiveAccess,
  receiveBoard,
  receiveClaims,
  receiveDisconnect,
  receiveFindings,
  receiveHistory,
  receiveListeners,
  receiveNotes,
  receiveReload,
  receiveRename,
  receiveThumbnails,
} from './store'

function boardWith(...names: string[]): ListResult {
  return {
    root: '/board',
    projects: [
      {
        name: 'studio',
        path: '/board/studio',
        modifiedAt: '2026-10-15T00:00:00.000Z',
        createdAt: null,
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
              hugWidth: false,
              hugHeight: false,
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

describe('receiveAccess', () => {
  it('starts read-only and follows the server answer', () => {
    const store = createLiveStore()
    expect(store.getState().canWrite).toBe(false)

    receiveAccess(store, true)
    expect(store.getState().canWrite).toBe(true)

    receiveAccess(store, false)
    expect(store.getState().canWrite).toBe(false)
  })

  it('marks the answer known until the socket drops', () => {
    const store = createLiveStore()
    expect(store.getState().accessKnown).toBe(false)

    receiveAccess(store, false)
    expect(store.getState().accessKnown).toBe(true)

    receiveDisconnect(store)
    expect(store.getState().accessKnown).toBe(false)
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

function themeFinding(frame: string): Finding {
  return {
    rule: 'theme',
    severity: 'error',
    frame,
    path: `${frame}.html`,
    message: 'One theme alone.',
    location: null,
  }
}

describe('receiveFindings', () => {
  it('replaces the findings of the frames named and keeps the rest', () => {
    const store = createLiveStore()
    receiveFindings(store, {
      'studio/home/hero': [themeFinding('studio/home/hero')],
      'studio/home/about': [themeFinding('studio/home/about')],
    })

    receiveFindings(store, { 'studio/home/hero': [] })

    expect(store.getState().findings).toEqual({
      'studio/home/hero': [],
      'studio/home/about': [themeFinding('studio/home/about')],
    })
  })

  it('drops the findings of a frame the board no longer holds', () => {
    const store = createLiveStore()
    receiveFindings(store, {
      'studio/home/hero': [themeFinding('studio/home/hero')],
      'studio/home/about': [themeFinding('studio/home/about')],
    })

    receiveBoard(store, boardWith('hero'))

    expect(Object.keys(store.getState().findings)).toEqual(['studio/home/hero'])
  })
})

function boardNote(id: string): BoardNote {
  return {
    id,
    number: 1,
    frame: 'hero',
    anchor: null,
    text: 'Tighten the header',
    from: 'developer',
    author: null,
    session: null,
    to: null,
    state: 'open',
    thread: null,
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-19T10:00:00.000Z',
    element: null,
  }
}

describe('receiveNotes', () => {
  it("replaces one page's notes and keeps the others", () => {
    const store = createLiveStore()
    receiveNotes(store, 'studio/home', [boardNote('n_1')])
    receiveNotes(store, 'studio/pricing', [boardNote('n_2')])

    receiveNotes(store, 'studio/home', [])

    expect(store.getState().notes).toEqual({
      'studio/home': [],
      'studio/pricing': [boardNote('n_2')],
    })
  })

  it('drops the notes of a page the board no longer holds', () => {
    const store = createLiveStore()
    receiveNotes(store, 'studio/home', [boardNote('n_1')])
    receiveNotes(store, 'studio/gone', [boardNote('n_2')])

    receiveBoard(store, boardWith('hero'))

    expect(Object.keys(store.getState().notes)).toEqual(['studio/home'])
  })
})

describe('receiveDisconnect', () => {
  it('clears the notes and the listeners until the next hello', () => {
    const store = createLiveStore()
    receiveNotes(store, 'studio/home', [boardNote('n_1')])
    receiveListeners(store, [
      { session: 's', tag: 'claude · app', since: '2026-10-19T10:00:00.000Z' },
    ])
    receiveAccess(store, true)

    receiveDisconnect(store)

    expect(store.getState()).toMatchObject({
      notes: {},
      listeners: [],
      canWrite: false,
      connected: false,
    })
  })

  it('zeroes the history counts so Undo never stays lit', () => {
    const store = createLiveStore()
    receiveHistory(store, { undo: 3, redo: 1 })

    receiveDisconnect(store)

    expect(store.getState().history).toEqual({ undo: 0, redo: 0 })
  })
})

describe('receiveHistory', () => {
  it('starts at zero and follows the server counts', () => {
    const store = createLiveStore()
    expect(store.getState().history).toEqual({ undo: 0, redo: 0 })

    receiveHistory(store, { undo: 2, redo: 0 })

    expect(store.getState().history).toEqual({ undo: 2, redo: 0 })
  })
})

function claimOn(frame: string, session = 'sess-a'): Claim {
  return {
    frame,
    session,
    agent: 'claude',
    tag: 'claude · studio',
    claimedAt: '2026-10-19T10:00:00.000Z',
    expiresAt: '2026-10-19T10:05:00.000Z',
  }
}

describe('receiveClaims', () => {
  it('keys each claim by the frame it holds', () => {
    const store = createLiveStore()

    receiveClaims(store, [claimOn('studio/home/hero')])

    expect(store.getState().claims).toEqual({
      'studio/home/hero': claimOn('studio/home/hero'),
    })
  })

  it('replaces every claim, so one released or expired clears', () => {
    const store = createLiveStore()
    receiveClaims(store, [
      claimOn('studio/home/hero'),
      claimOn('studio/home/about'),
    ])

    receiveClaims(store, [claimOn('studio/home/about')])

    expect(Object.keys(store.getState().claims)).toEqual(['studio/home/about'])
  })

  it('drops the claim of a frame the board no longer holds', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero', 'about'))
    receiveClaims(store, [
      claimOn('studio/home/hero'),
      claimOn('studio/home/about'),
    ])

    receiveBoard(store, boardWith('hero'))

    expect(Object.keys(store.getState().claims)).toEqual(['studio/home/hero'])
  })

  it('clears the claims on disconnect until the next hello', () => {
    const store = createLiveStore()
    receiveClaims(store, [claimOn('studio/home/hero')])

    receiveDisconnect(store)

    expect(store.getState().claims).toEqual({})
  })
})

describe('receiveThumbnails', () => {
  it('merges each stamp into its theme, leaving the other frames', () => {
    const store = createLiveStore()
    receiveThumbnails(store, 'light', { 'studio/home/hero': 'r-0-390x844' })

    receiveThumbnails(store, 'light', { 'studio/home/about': 'r-0-390x844' })

    expect(store.getState().thumbnails).toEqual({
      light: {
        'studio/home/hero': 'r-0-390x844',
        'studio/home/about': 'r-0-390x844',
      },
      dark: {},
    })
  })

  it('keeps the themes apart, so a light capture never shows in dark', () => {
    const store = createLiveStore()

    receiveThumbnails(store, 'dark', { 'studio/home/hero': 'r-0-390x844' })

    expect(store.getState().thumbnails.light).toEqual({})
  })

  it('deletes the stamp of a frame marked stale with null', () => {
    const store = createLiveStore()
    receiveThumbnails(store, 'light', {
      'studio/home/hero': 'r-0-390x844',
      'studio/home/about': 'r-0-390x844',
    })

    receiveThumbnails(store, 'light', { 'studio/home/hero': null })

    expect(store.getState().thumbnails.light).toEqual({
      'studio/home/about': 'r-0-390x844',
    })
  })

  it('clears every stamp on disconnect, since a restarted server holds none', () => {
    const store = createLiveStore()
    receiveThumbnails(store, 'light', { 'studio/home/hero': 'r-0-390x844' })

    receiveDisconnect(store)

    expect(store.getState().thumbnails).toEqual({ light: {}, dark: {} })
  })
})

describe('receiveRename', () => {
  const pageRefs = (store: LiveStore) =>
    store
      .getState()
      .board?.projects.flatMap((project) =>
        project.pages.map((page) => page.ref),
      )

  it('renames a page on the board it holds, frames and paths included', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))

    receiveRename(store, 'studio/home', 'studio/start')

    const page = store.getState().board?.projects[0]?.pages[0]
    expect(page).toMatchObject({
      ref: 'studio/start',
      name: 'start',
      path: '/board/studio/start',
    })
    expect(page?.frames[0]).toMatchObject({
      ref: 'studio/start/hero',
      page: 'start',
      path: '/board/studio/start/hero.html',
    })
  })

  it('renames a project on the board it holds, pages and frames included', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))

    receiveRename(store, 'studio', 'atelier')

    const project = store.getState().board?.projects[0]
    expect(project).toMatchObject({ name: 'atelier', path: '/board/atelier' })
    expect(project?.pages[0]).toMatchObject({
      ref: 'atelier/home',
      project: 'atelier',
      path: '/board/atelier/home',
    })
    expect(project?.pages[0]?.frames[0]).toMatchObject({
      ref: 'atelier/home/hero',
      project: 'atelier',
      path: '/board/atelier/home/hero.html',
    })
  })

  it('carries each frame counter to its new ref, so the frame does not reload', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))
    receiveReload(store, ['studio/home/hero'])

    receiveRename(store, 'studio/home', 'studio/start')

    expect(store.getState().reloads).toEqual({ 'studio/start/hero': 1 })
  })

  it('carries findings, claims, notes, and thumbnails to the new refs', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))
    receiveFindings(store, { 'studio/home/hero': [] })
    receiveClaims(store, [claimOn('studio/home/hero')])
    receiveNotes(store, 'studio/home', [boardNote('n1')])
    receiveThumbnails(store, 'light', { 'studio/home/hero': 'r-0-390x844' })

    receiveRename(store, 'studio', 'atelier')

    const state = store.getState()
    expect(Object.keys(state.findings)).toEqual(['atelier/home/hero'])
    expect(Object.keys(state.claims)).toEqual(['atelier/home/hero'])
    expect(Object.keys(state.notes)).toEqual(['atelier/home'])
    expect(state.thumbnails.light).toEqual({
      'atelier/home/hero': 'r-0-390x844',
    })
  })

  it('leaves a sibling page whose name only starts the same', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))
    receiveReload(store, ['studio/home/hero'])

    receiveRename(store, 'studio/hom', 'studio/start')

    expect(pageRefs(store)).toEqual(['studio/home'])
    expect(store.getState().reloads).toEqual({ 'studio/home/hero': 1 })
  })

  it('ignores a rename the board already carries', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))
    receiveRename(store, 'studio/home', 'studio/start')
    const { board, aliases } = store.getState()

    receiveRename(store, 'studio/home', 'studio/start')

    expect(store.getState().board).toBe(board)
    expect(store.getState().aliases).toBe(aliases)
  })
})

describe('identityOf', () => {
  it('reads a ref no rename touched as itself', () => {
    expect(identityOf({}, 'studio/home/hero')).toBe('studio/home/hero')
  })

  it('keeps a page and its frames the same through a chain of renames', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))

    receiveRename(store, 'studio/home', 'studio/start')
    receiveRename(store, 'studio/start', 'studio/intro')

    const { aliases } = store.getState()
    expect(identityOf(aliases, 'studio/intro')).toBe('studio/home')
    expect(identityOf(aliases, 'studio/intro/hero')).toBe('studio/home/hero')
  })

  it('keeps a renamed page the same when its project is renamed after it', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))

    receiveRename(store, 'studio/home', 'studio/start')
    receiveRename(store, 'studio', 'atelier')

    expect(identityOf(store.getState().aliases, 'atelier/start/hero')).toBe(
      'studio/home/hero',
    )
  })

  it('reads a rename and its undo back as the page it started as', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))

    receiveRename(store, 'studio', 'atelier')
    receiveRename(store, 'atelier', 'studio')

    const { aliases } = store.getState()
    expect(identityOf(aliases, 'studio/home')).toBe('studio/home')
    expect(aliases).toEqual({})
  })
})
