import { describe, expect, it } from 'vitest'

import { applyPatch, patchBetween } from '@/shared/board-sync/patch'
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
  renamedRef,
} from './store'

function boardWith(...names: string[]): ListResult {
  return {
    root: '/board',
    projects: [
      {
        name: 'studio',
        path: '/board/studio',
        modifiedAt: '2026-10-15T00:00:00.000Z',
        title: null,
        createdAt: null,
        group: null,
        archived: false,
        projectFileError: null,
        transitions: [],
        checksOff: [],
        kits: [],
        pages: [
          {
            ref: 'studio/home',
            project: 'studio',
            name: 'home',
            path: '/board/studio/home',
            index: 0,
            layoutError: null,
            sections: [],
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
              scroll: false,
              widths: [],
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

  it('keeps every equal project, page, and frame record and still sends a new board', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero', 'about'))
    const before = store.getState().board

    receiveBoard(store, structuredClone(boardWith('hero', 'about')))

    const after = store.getState().board
    expect([
      after === before,
      after?.projects === before?.projects,
      after?.projects[0]?.pages[0]?.frames[1] ===
        before?.projects[0]?.pages[0]?.frames[1],
    ]).toEqual([false, true, true])
  })

  it('keeps every record a patch names by identity', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero', 'about'))
    const before = store.getState().board
    if (!before) throw new Error('no board')
    const next = boardWith('hero', 'about')
    const moved = next.projects[0]?.pages[0]?.frames[0]
    if (moved) moved.box = { ...moved.box, x: 40 }

    const patched = applyPatch(before, patchBetween(before, next))
    if (!patched) throw new Error('the patch does not apply')
    receiveBoard(store, patched)

    const after = store.getState().board
    expect(after).toEqual(next)
    expect(after?.projects[0]?.pages[0]?.frames[1]).toBe(
      before.projects[0]?.pages[0]?.frames[1],
    )
  })

  it('replaces a changed frame, its page, and its project, and keeps its sibling', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero', 'about'))
    const before = store.getState().board?.projects[0]
    const next = boardWith('hero', 'about')
    const moved = next.projects[0]?.pages[0]?.frames[0]
    if (moved) moved.box = { ...moved.box, x: 40 }

    receiveBoard(store, next)

    const after = store.getState().board?.projects[0]
    expect([
      after === before,
      after?.pages[0] === before?.pages[0],
      after?.pages[0]?.frames[0] === before?.pages[0]?.frames[0],
      after?.pages[0]?.frames[0]?.box.x,
      after?.pages[0]?.frames[1] === before?.pages[0]?.frames[1],
    ]).toEqual([false, false, false, 40, true])
  })

  it('keeps the open project whole when another is added ahead of it', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))
    const before = store.getState().board?.projects[0]
    const next = boardWith('hero')
    const other = structuredClone(next.projects[0])
    if (other) next.projects.unshift({ ...other, name: 'atlas' })

    receiveBoard(store, next)

    const after = store.getState().board
    expect([after?.projects.length, after?.projects[1] === before]).toEqual([
      2,
      true,
    ])
  })

  it('replaces a frame when only a key its type does not name changed', () => {
    const store = createLiveStore()
    const held = boardWith('hero')
    Object.assign(held.projects[0]?.pages[0]?.frames[0] ?? {}, { spin: 1 })
    receiveBoard(store, held)
    const before = store.getState().board?.projects[0]?.pages[0]?.frames[0]
    const next = boardWith('hero')
    Object.assign(next.projects[0]?.pages[0]?.frames[0] ?? {}, { spin: 2 })

    receiveBoard(store, next)

    const after = store.getState().board?.projects[0]?.pages[0]?.frames[0]
    expect([after === before, after]).toEqual([
      false,
      expect.objectContaining({ spin: 2 }),
    ])
  })

  it('replaces a frame that lost an optional key', () => {
    const store = createLiveStore()
    const held = boardWith('hero')
    Object.assign(held.projects[0]?.pages[0]?.frames[0] ?? {}, { kit: 'ink' })
    receiveBoard(store, held)

    receiveBoard(store, boardWith('hero'))

    expect(
      store.getState().board?.projects[0]?.pages[0]?.frames[0]?.kit,
    ).toBeUndefined()
  })

  it('takes the new order of frames that are each unchanged', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero', 'about'))

    receiveBoard(store, boardWith('about', 'hero'))

    expect(
      store.getState().board?.projects[0]?.pages[0]?.frames.map((f) => f.name),
    ).toEqual(['about', 'hero'])
  })

  it('keeps the frames left when one ahead of them is removed', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero', 'about'))
    const before = store.getState().board?.projects[0]?.pages[0]?.frames[1]

    receiveBoard(store, boardWith('about'))

    const after = store.getState().board?.projects[0]?.pages[0]?.frames
    expect([after?.length, after?.[0] === before]).toEqual([1, true])
  })

  it('drops a frame removed from the end of its page', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero', 'about'))

    receiveBoard(store, boardWith('hero'))

    expect(
      store.getState().board?.projects[0]?.pages[0]?.frames.map((f) => f.name),
    ).toEqual(['hero'])
  })

  it('keeps each keyed map whole when the board drops none of its keys', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))
    receiveReload(store, ['studio/home/hero'], ['studio/home/hero'])
    receiveFindings(store, { 'studio/home/hero': [] })
    receiveNotes(store, 'studio/home', [])
    receiveClaims(store, [
      {
        frame: 'studio/home/hero',
        session: 's-1',
        agent: 'claude',
        tag: 'claude · s-1',
        claimedAt: '2026-10-19T10:00:00.000Z',
        expiresAt: '2026-10-19T10:05:00.000Z',
      },
    ])
    const before = store.getState()

    receiveBoard(store, boardWith('hero'))

    const after = store.getState()
    expect({
      reloads: after.reloads === before.reloads,
      kept: after.kept === before.kept,
      findings: after.findings === before.findings,
      notes: after.notes === before.notes,
      claims: after.claims === before.claims,
    }).toEqual({
      reloads: true,
      kept: true,
      findings: true,
      notes: true,
      claims: true,
    })
  })

  it('drops the counter of a frame the board no longer holds', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero', 'about'))
    receiveReload(store, ['studio/home/hero', 'studio/home/about'])

    receiveBoard(store, boardWith('hero'))

    expect(store.getState().reloads).toEqual({ 'studio/home/hero': 1 })
  })

  it('keeps a reservation on a frame not listed yet and drops a plain claim on one gone', () => {
    const store = createLiveStore()
    const held = {
      session: 's-1',
      agent: 'claude',
      tag: 'claude · s-1',
      claimedAt: '2026-10-19T10:00:00.000Z',
      expiresAt: '2026-10-19T10:05:00.000Z',
    }
    receiveBoard(store, boardWith('hero', 'about'))
    receiveClaims(store, [
      { ...held, frame: 'studio/home/about' },
      {
        ...held,
        frame: 'studio/home/pricing',
        box: { x: 0, y: 0, width: 400, height: 300 },
      },
    ])

    receiveBoard(store, boardWith('hero'))

    expect(Object.keys(store.getState().claims)).toEqual([
      'studio/home/pricing',
    ])
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

  it('counts a kept reload as kept while its reload count still rises', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero', 'about'))

    receiveReload(
      store,
      ['studio/home/hero', 'studio/home/about'],
      ['studio/home/hero'],
    )

    const { reloads, kept } = store.getState()
    expect(reloads).toEqual({ 'studio/home/hero': 1, 'studio/home/about': 1 })
    expect(kept).toEqual({ 'studio/home/hero': 1 })
  })

  it('drops the kept count of a frame the board no longer holds', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero', 'about'))
    receiveReload(store, ['studio/home/about'], ['studio/home/about'])

    receiveBoard(store, boardWith('hero'))

    expect(store.getState().kept).toEqual({})
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

  it('renames on the board it holds', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))

    receiveRename(store, 'studio/home', 'studio/start')

    expect(pageRefs(store)).toEqual(['studio/start'])
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

  it('drops a stamp a page gone before the rename left under the new name', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))
    receiveThumbnails(store, 'light', { 'studio/start/hero': 'r-0-1x1' })

    receiveRename(store, 'studio/home', 'studio/start')

    expect(store.getState().thumbnails.light).toEqual({})
  })

  it('leaves a sibling page whose name only starts the same', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))
    receiveReload(store, ['studio/home/hero'])

    receiveRename(store, 'studio/hom', 'studio/start')

    expect(pageRefs(store)).toEqual(['studio/home'])
    expect(store.getState().reloads).toEqual({ 'studio/home/hero': 1 })
  })

  it('carries a renamed frame findings and thumbnails to its new ref alone', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero', 'footer'))
    receiveFindings(store, { 'studio/home/hero': [], 'studio/home/footer': [] })
    receiveThumbnails(store, 'light', { 'studio/home/hero': 'r-0-390x844' })

    receiveRename(store, 'studio/home/hero', 'studio/home/lead')

    const state = store.getState()
    expect(Object.keys(state.findings).sort()).toEqual([
      'studio/home/footer',
      'studio/home/lead',
    ])
    expect(state.thumbnails.light).toEqual({
      'studio/home/lead': 'r-0-390x844',
    })
  })

  it('gives a renamed frame a new identity, so it loads from its new file', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))

    receiveRename(store, 'studio/home/hero', 'studio/home/lead')

    expect(identityOf(store.getState().aliases, 'studio/home/lead')).toBe(
      'studio/home/lead',
    )
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

describe('renamedRef', () => {
  it('follows a page through its rename', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))
    const previous = store.getState()

    receiveRename(store, 'studio/home', 'studio/start')

    expect(renamedRef(previous, store.getState(), 'studio/home')).toBe(
      'studio/start',
    )
  })

  it('follows a page through its project rename and its undo', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))
    receiveRename(store, 'studio', 'atelier')
    const previous = store.getState()

    receiveRename(store, 'atelier', 'studio')

    expect(renamedRef(previous, store.getState(), 'atelier/home')).toBe(
      'studio/home',
    )
  })

  it('reads no rename for a page another write removed', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))
    const previous = store.getState()

    receiveBoard(store, { ...boardWith('hero'), projects: [] })

    expect(renamedRef(previous, store.getState(), 'studio/home')).toBeNull()
  })
})

describe('a name renamed away and taken again', () => {
  /** The board with one more page in `studio`, holding the same frames. */
  function withPage(board: ListResult, name: string): ListResult {
    return {
      ...board,
      projects: board.projects.map((project) => {
        const [first] = project.pages
        if (!first) return project
        const added = {
          ...first,
          ref: `studio/${name}`,
          name,
          path: `/board/studio/${name}`,
          frames: first.frames.map((frame) => ({
            ...frame,
            ref: `studio/${name}/${frame.name}`,
            page: name,
          })),
        }
        return { ...project, pages: [...project.pages, added] }
      }),
    }
  }

  it('gives a new page under the old name an identity of its own', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))
    receiveRename(store, 'studio/home', 'studio/start')
    const renamed = store.getState().board
    if (!renamed) throw new Error('No board after the rename')

    receiveBoard(store, withPage(renamed, 'home'))

    const { aliases } = store.getState()
    expect(identityOf(aliases, 'studio/home/hero')).toBe('studio/home/hero')
    expect(identityOf(aliases, 'studio/start/hero')).toBe('studio/start/hero')
  })

  it('gives a new project under the old name an identity of its own', () => {
    const store = createLiveStore()
    receiveBoard(store, boardWith('hero'))
    receiveRename(store, 'studio', 'atelier')
    const renamed = store.getState().board
    if (!renamed) throw new Error('No board after the rename')

    receiveBoard(store, {
      ...renamed,
      projects: [...renamed.projects, ...boardWith('hero').projects],
    })

    const { aliases } = store.getState()
    expect(identityOf(aliases, 'atelier/home')).toBe('atelier/home')
    expect(identityOf(aliases, 'studio/home')).toBe('studio/home')
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
