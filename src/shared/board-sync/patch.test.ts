import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import type {
  FrameRecord,
  ListResult,
  PageRecord,
  ProjectRecord,
} from '@/shared/records/list'
import { boardOf, frameOf, pageOf } from '@/test/board'

import { applyPatch, type BoardPatch, patchBetween } from './patch'

const SEED = 2026
const RUNS = 1000

/** The patch as a tab reads it off the socket. */
function sent(held: ListResult, next: ListResult): BoardPatch {
  return JSON.parse(JSON.stringify(patchBetween(held, next))) as BoardPatch
}

/** Names few enough to meet again on the other board, some special to an object. */
const name = fc.constantFrom(
  'home',
  'about',
  '1',
  '10',
  '__proto__',
  'constructor',
)

const frameArbitrary = fc.record(
  {
    name,
    kit: fc.constantFrom('ink', 'paper'),
    order: fc.constantFrom(0, 1),
    modifiedAt: fc.constantFrom('a', 'b'),
  },
  { requiredKeys: ['name', 'order', 'modifiedAt'] },
)

const boardArbitrary: fc.Arbitrary<ListResult> = fc
  .uniqueArray(
    fc.record({
      name,
      title: fc.constantFrom(null, 'Studio'),
      pages: fc.uniqueArray(
        fc.record({
          name,
          index: fc.constantFrom(0, 1),
          frames: fc.uniqueArray(frameArbitrary, {
            selector: (frame) => frame.name,
            maxLength: 4,
          }),
        }),
        { selector: (page) => page.name, maxLength: 3 },
      ),
    }),
    { selector: (project) => project.name, maxLength: 3 },
  )
  .map((projects) => ({
    root: '/board',
    projects: projects.map((project) =>
      projectNamed(
        project.name,
        project.pages.map((page) =>
          pageNamed(project.name, page.name, page.frames, page.index),
        ),
        { title: project.title },
      ),
    ),
  }))

function pageNamed(
  project: string,
  page: string,
  frames: readonly (Partial<FrameRecord> & { name: string })[],
  index = 0,
): PageRecord {
  const ref = `${project}/${page}`
  return {
    ...pageOf(
      frames.map((frame) =>
        frameOf(frame.name, {
          ref: `${ref}/${frame.name}`,
          project,
          page,
          path: `/board/${ref}/${frame.name}.html`,
          ...frame,
        }),
      ),
      page,
    ),
    ref,
    project,
    path: `/board/${ref}`,
    index,
  }
}

function projectNamed(
  named: string,
  pages: PageRecord[],
  overrides: Partial<ProjectRecord> = {},
): ProjectRecord {
  const [project] = boardOf(...pages).projects
  if (!project) throw new Error('no project')
  return { ...project, name: named, path: `/board/${named}`, ...overrides }
}

/** A board of one project per entry, each page holding the frames named. */
function board(
  projects: Record<string, Record<string, readonly string[]>>,
): ListResult {
  return {
    root: '/board',
    projects: Object.entries(projects).map(([project, pages]) =>
      projectNamed(
        project,
        Object.entries(pages).map(([page, frames]) =>
          pageNamed(
            project,
            page,
            frames.map((frame) => ({ name: frame })),
          ),
        ),
      ),
    ),
  }
}

const STUDIO = board({
  studio: { home: ['hero', 'footer'], about: ['team'] },
  other: { p: ['a'] },
})

describe('patchBetween and applyPatch', () => {
  it('give the second board from the first, for any two', () => {
    fc.assert(
      fc.property(boardArbitrary, boardArbitrary, (held, next) => {
        expect(applyPatch(held, sent(held, next))).toStrictEqual(next)
      }),
      { seed: SEED, numRuns: RUNS },
    )
  })

  it.each<[string, ListResult]>([
    [
      'a project added',
      board({
        new: { p: ['a'] },
        studio: { home: ['hero', 'footer'], about: ['team'] },
        other: { p: ['a'] },
      }),
    ],
    ['a project removed', board({ other: { p: ['a'] } })],
    [
      'projects reordered',
      { ...STUDIO, projects: STUDIO.projects.toReversed() },
    ],
    [
      'a page added and one removed',
      board({
        studio: { home: ['hero', 'footer'], contact: ['form'] },
        other: { p: ['a'] },
      }),
    ],
    [
      'pages reordered',
      board({
        studio: { about: ['team'], home: ['hero', 'footer'] },
        other: { p: ['a'] },
      }),
    ],
    [
      'a frame added and one removed',
      board({
        studio: { home: ['hero', 'pricing'], about: ['team'] },
        other: { p: ['a'] },
      }),
    ],
    [
      'frames reordered',
      board({
        studio: { home: ['footer', 'hero'], about: ['team'] },
        other: { p: ['a'] },
      }),
    ],
    [
      'a frame moved to another page',
      board({
        studio: { home: ['hero'], about: ['team', 'footer'] },
        other: { p: ['a'] },
      }),
    ],
    ['a board moved on disk', { ...STUDIO, root: '/elsewhere' }],
  ])('carry %s', (_, next) => {
    expect(applyPatch(STUDIO, sent(STUDIO, next))).toEqual(next)
  })

  it('carry a key that appears on a frame, a page, and a project', () => {
    const page = pageNamed('studio', 'home', [{ name: 'hero', kit: 'ink' }])
    const next: ListResult = {
      root: '/board',
      projects: [
        projectNamed('studio', [{ ...page, transition: { name: 'fade' } }], {
          title: 'Studio',
        }),
      ],
    }

    expect(applyPatch(STUDIO, sent(STUDIO, next))?.projects[0]).toMatchObject({
      title: 'Studio',
      pages: [{ transition: { name: 'fade' }, frames: [{ kit: 'ink' }] }],
    })
  })

  it('carry a key that goes absent', () => {
    const held = boardOf(
      pageOf([frameOf('hero', { kit: 'ink', device: 'phone' })]),
    )
    const next = boardOf(pageOf([frameOf('hero')]))

    const frame = applyPatch(held, sent(held, next))?.projects[0]?.pages[0]
      ?.frames[0]

    expect(frame).toStrictEqual(frameOf('hero'))
  })

  it('carry a key no type names', () => {
    const next = structuredClone(STUDIO)
    Object.assign(next.projects[0]?.pages[0]?.frames[0] ?? {}, { spin: 2 })

    expect(applyPatch(STUDIO, sent(STUDIO, next))).toEqual(next)
  })
})

describe('patchBetween', () => {
  it('lists names alone between two equal boards', () => {
    expect(patchBetween(STUDIO, structuredClone(STUDIO))).toEqual({
      root: '/board',
      projects: ['studio', 'other'],
    })
  })

  it('names the frames of a changed page that held still', () => {
    const next = structuredClone(STUDIO)
    const hero = next.projects[0]?.pages[0]?.frames[0]
    if (hero) hero.order = 7

    expect(patchBetween(STUDIO, next)).toMatchObject({
      projects: [
        {
          name: 'studio',
          pages: [
            { name: 'home', frames: [{ name: 'hero', order: 7 }, 'footer'] },
            'about',
          ],
        },
        'other',
      ],
    })
  })

  it('takes under 4 KB for one frame of a 1,000-frame board', () => {
    const names = (prefix: string, count: number) =>
      Array.from({ length: count }, (_, at) => `${prefix}-${at}`)
    const held = board(
      Object.fromEntries(
        names('project', 5).map((project) => [
          project,
          Object.fromEntries(
            names('page', 5).map((page) => [page, names('frame', 40)]),
          ),
        ]),
      ),
    )
    const next = structuredClone(held)
    const moved = next.projects[2]?.pages[3]?.frames[20]
    if (moved) moved.modifiedAt = '2026-11-25T00:00:00.000Z'

    expect(JSON.stringify(sent(held, next)).length).toBeLessThan(4096)
  })
})

describe('applyPatch', () => {
  it('keeps every untouched record by identity', () => {
    const next = structuredClone(STUDIO)
    const hero = next.projects[0]?.pages[0]?.frames[0]
    if (hero) hero.order = 7

    const applied = applyPatch(STUDIO, sent(STUDIO, next))

    const [held, after] = [STUDIO.projects, applied?.projects ?? []]
    expect({
      footer: after[0]?.pages[0]?.frames[1] === held[0]?.pages[0]?.frames[1],
      about: after[0]?.pages[1] === held[0]?.pages[1],
      other: after[1] === held[1],
    }).toEqual({ footer: true, about: true, other: true })
  })

  it('answers a new board for a patch that changes nothing', () => {
    const applied = applyPatch(STUDIO, sent(STUDIO, STUDIO))

    expect(applied).toEqual(STUDIO)
    expect(applied).not.toBe(STUDIO)
  })

  const [studio] = STUDIO.projects
  const [home] = studio?.pages ?? []
  if (!studio || !home) throw new Error('no page')

  it.each<[string, BoardPatch]>([
    ['a project', { root: '/board', projects: ['gone'] }],
    [
      'a page',
      { root: '/board', projects: [{ ...studio, pages: ['home', 'gone'] }] },
    ],
    [
      'a frame',
      {
        root: '/board',
        projects: [{ ...studio, pages: [{ ...home, frames: ['gone'] }] }],
      },
    ],
    [
      'a page of a project not held',
      {
        root: '/board',
        projects: [{ ...studio, name: 'gone', pages: ['home'] }],
      },
    ],
  ])('answers null for a patch naming %s not held', (_, patch) => {
    expect(applyPatch(STUDIO, patch)).toBeNull()
  })
})
