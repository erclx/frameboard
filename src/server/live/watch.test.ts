import { mkdirSync, renameSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { scanBoard } from '@/server/board/scan'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import {
  type BoardWatcher,
  createBatcher,
  ownReloadRefs,
  placedRefs,
  rekittedRefs,
  relistedRefs,
  reloadRefs,
  unmovedRefs,
  watchBoard,
} from './watch'

/** How long a test waits for the file system to report a write. */
const SEEN_MS = 5000

describe('createBatcher', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('closes a batch 50 ms after its last path', () => {
    vi.useFakeTimers()
    const batches: string[][] = []
    const batcher = createBatcher((paths) => batches.push(paths))

    batcher.add('a')
    vi.advanceTimersByTime(40)
    batcher.add('b')
    vi.advanceTimersByTime(49)
    expect(batches).toEqual([])

    vi.advanceTimersByTime(1)
    expect(batches).toEqual([['a', 'b']])
  })

  it('closes a busy batch 250 ms after its first path', () => {
    vi.useFakeTimers()
    const batches: string[][] = []
    const batcher = createBatcher((paths) => batches.push(paths))

    for (let ms = 0; ms < 250; ms += 25) {
      batcher.add(`path-${ms}`)
      vi.advanceTimersByTime(25)
    }

    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(10)
  })

  it('names a path once per batch', () => {
    vi.useFakeTimers()
    const batches: string[][] = []
    const batcher = createBatcher((paths) => batches.push(paths))

    batcher.add('a')
    batcher.add('a')
    vi.advanceTimersByTime(50)

    expect(batches).toEqual([['a']])
  })

  it('flushes nothing once cancelled', () => {
    vi.useFakeTimers()
    const batches: string[][] = []
    const batcher = createBatcher((paths) => batches.push(paths))

    batcher.add('a')
    batcher.cancel()
    vi.advanceTimersByTime(300)

    expect(batches).toEqual([])
  })
})

describe('reloadRefs', () => {
  let board: FixtureBoard

  beforeEach(() => {
    board = copyFixtureBoard('live')
  })

  afterEach(() => {
    board.cleanup()
  })

  async function refsFor(...paths: string[]) {
    const snapshot = await scanBoard(board.root)
    return reloadRefs(
      board.root,
      paths.map((path) => join(board.root, path)),
      snapshot,
    )
  }

  it('reloads the frame whose html changed', async () => {
    expect(await refsFor('studio/home/hero.html')).toEqual(['studio/home/hero'])
  })

  it('reloads every frame on a page when another file in its folder changed', async () => {
    expect(await refsFor('studio/home/styles.css')).toEqual([
      'studio/home/hero',
      'studio/home/mobile',
    ])
  })

  describe('a file under assets/', () => {
    const PROJECT = [
      'studio/home/hero',
      'studio/home/mobile',
      'studio/pricing/plans',
    ]

    it('reloads only the frame linking an image that changed', async () => {
      expect(await refsFor('studio/assets/dot.svg')).toEqual([
        'studio/home/hero',
      ])
    })

    it('reloads no frame for a new image no frame links', async () => {
      writeFileSync(join(board.root, 'studio/assets/lake.jpg'), 'jpg')

      expect(await refsFor('studio/assets/lake.jpg')).toEqual([])
    })

    it('reloads a frame showing the image as a background from its own style', async () => {
      writeFileSync(
        join(board.root, 'studio/pricing/plans.html'),
        '<div style="background: url(../assets/lake.jpg)"></div>',
      )

      expect(await refsFor('studio/assets/lake.jpg')).toEqual([
        'studio/pricing/plans',
      ])
    })

    it('reloads no frame for a license sidecar saved beside an image no frame links', async () => {
      expect(
        await refsFor(
          'studio/assets/lake.jpg',
          'studio/assets/lake.jpg.license.json',
        ),
      ).toEqual([])
    })

    it.each([
      ['a stylesheet', 'studio/assets/shared.css'],
      ['a script', 'studio/assets/menu.js'],
      ['a font', 'studio/assets/brand.woff2'],
      [
        "an installed font's record",
        'studio/assets/fonts/lora/font.license.json',
      ],
      ["an image inside a kit's folder", 'studio/assets/kits/clean/paper.png'],
    ])('reloads every frame in the project for %s', async (_case, path) => {
      expect(await refsFor(path)).toEqual(PROJECT)
    })
  })

  it.each([
    [
      'a layout file, since a move must not restart a frame',
      'studio/home/layout.json',
    ],
    ['a notes file', 'studio/home/notes.json'],
    ['the project file', 'studio/project.json'],
    ['a frame that no longer exists', 'studio/home/gone.html'],
  ])('reloads nothing for %s', async (_case, path) => {
    expect(await refsFor(path)).toEqual([])
  })

  it.each([
    ['an editor swap file', 'studio/home/hero.html.swap'],
    ['an atomic writer temp file', 'studio/home/hero.html.3f2a91c4'],
  ])('reloads only the frame saved through %s', async (_case, path) => {
    expect(await refsFor(path, 'studio/home/hero.html')).toEqual([
      'studio/home/hero',
    ])
  })

  it('names each frame once across a batch', async () => {
    expect(
      await refsFor('studio/home/hero.html', 'studio/home/styles.css'),
    ).toEqual(['studio/home/hero', 'studio/home/mobile'])
  })

  describe('token sheets', () => {
    const EVERY_FRAME = [
      'other/home/card',
      'studio/home/hero',
      'studio/home/mobile',
      'studio/pricing/plans',
    ]

    beforeEach(() => {
      mkdirSync(join(board.root, 'other/home'), { recursive: true })
      writeFileSync(join(board.root, 'other/home/card.html'), '<p>card</p>')
    })

    it("reloads every frame when the board's token sheet changed", async () => {
      expect(await refsFor('tokens.css')).toEqual(EVERY_FRAME)
    })

    it("reloads only the project's frames when its token sheet changed", async () => {
      expect(await refsFor('other/tokens.css')).toEqual(['other/home/card'])
    })

    it('reloads every frame when the --tokens sheet outside the board changed', async () => {
      const tokens = join(board.root, '../brand.css')

      const refs = reloadRefs(
        board.root,
        [tokens],
        await scanBoard(board.root),
        tokens,
      )

      expect(refs).toEqual(EVERY_FRAME)
    })

    it('names no frame as its own file once the --tokens sheet outside the board changed', async () => {
      const tokens = join(board.root, '../brand.css')

      const refs = ownReloadRefs(
        board.root,
        [tokens, join(board.root, 'studio/home/hero.html')],
        await scanBoard(board.root),
        tokens,
      )

      expect(refs).toEqual([])
    })

    it("reloads nothing for the board's own tokens.css while --tokens stands in for it", async () => {
      const refs = reloadRefs(
        board.root,
        [join(board.root, 'tokens.css')],
        await scanBoard(board.root),
        join(board.root, '../brand.css'),
      )

      expect(refs).toEqual([])
    })
  })
})

describe('ownReloadRefs', () => {
  let board: FixtureBoard

  beforeEach(() => {
    board = copyFixtureBoard('live')
  })

  afterEach(() => {
    board.cleanup()
  })

  async function ownFor(...paths: string[]) {
    const snapshot = await scanBoard(board.root)
    return ownReloadRefs(
      board.root,
      paths.map((path) => join(board.root, path)),
      snapshot,
    )
  }

  it('names a frame whose own file was the only change reaching it', async () => {
    expect(
      await ownFor('studio/home/hero.html', 'studio/pricing/plans.html'),
    ).toEqual(['studio/home/hero', 'studio/pricing/plans'])
  })

  it.each([
    ['the board token sheet', 'tokens.css'],
    ["the project's token sheet", 'studio/tokens.css'],
    ['an asset', 'studio/assets/dot.svg'],
    ['another file in its page folder', 'studio/home/styles.css'],
  ])('leaves out a frame %s also reached', async (_case, path) => {
    expect(await ownFor('studio/home/hero.html', path)).toEqual([])
  })

  it('keeps a frame on another page than the one a page file reached', async () => {
    expect(
      await ownFor('studio/pricing/plans.html', 'studio/home/styles.css'),
    ).toEqual(['studio/pricing/plans'])
  })
})

describe('watchBoard', { timeout: SEEN_MS + 2000 }, () => {
  let board: FixtureBoard
  let watcher: BoardWatcher
  let batches: string[][]

  beforeEach(async () => {
    board = copyFixtureBoard('live')
    watcher = await watchBoard(board.root)
    batches = []
    watcher.onBatch((paths) => batches.push(paths))
  })

  afterEach(async () => {
    await watcher.close()
    board.cleanup()
  })

  // Rewrites until seen, since macOS reports late events and load can lose a create.
  it('reports each write in a batch', async () => {
    const hero = join(board.root, 'studio/home/hero.html')
    const styles = join(board.root, 'studio/home/styles.css')

    await expect
      .poll(
        () => {
          writeFileSync(hero, '<p>one</p>')
          writeFileSync(styles, 'p {}')
          return batches.flat()
        },
        { timeout: SEEN_MS },
      )
      .toEqual(expect.arrayContaining([hero, styles]))
  })

  it('reports a frame saved through a temp file and a rename as that frame', async () => {
    const frame = join(board.root, 'studio/home/hero.html')

    await expect
      .poll(
        () => {
          writeFileSync(`${frame}.swap`, '<p>saved</p>')
          renameSync(`${frame}.swap`, frame)
          return batches.flat()
        },
        { timeout: SEEN_MS },
      )
      .toContain(frame)
  })

  it('ignores the run folder, dot-named paths, locks, and temp files', async () => {
    const ignored = [
      join(board.root, '.run/address.json'),
      join(board.root, 'studio/home/.draft.html'),
      join(board.root, 'studio/home/layout.json.lock'),
      join(board.root, 'studio/home/hero.html.tmp'),
    ]
    mkdirSync(join(board.root, '.run'), { recursive: true })
    for (const path of ignored) writeFileSync(path, '{}')
    // Its batch arriving means every earlier event was reported or dropped.
    const sentinel = join(board.root, 'studio/home/sentinel.txt')

    await expect
      .poll(
        () => {
          writeFileSync(sentinel, 'x')
          return batches.flat()
        },
        { timeout: SEEN_MS },
      )
      .toContain(sentinel)
    expect(batches.flat().filter((path) => ignored.includes(path))).toEqual([])
  })

  it('reports a write to the claims file in the run folder', async () => {
    mkdirSync(join(board.root, '.run'), { recursive: true })
    const claims = join(board.root, '.run/claims.json')

    await expect
      .poll(
        () => {
          writeFileSync(claims, '{ "version": 1, "claims": [] }')
          return batches.flat()
        },
        { timeout: SEEN_MS },
      )
      .toContain(claims)
  })

  it('ignores the rest of the run folder beside the claims file', async () => {
    mkdirSync(join(board.root, '.run/captures'), { recursive: true })
    writeFileSync(join(board.root, '.run/claims.json'), '{}')
    await expect
      .poll(() => batches.flat(), { timeout: SEEN_MS })
      .toContain(join(board.root, '.run/claims.json'))
    batches = []

    writeFileSync(join(board.root, '.run/address.json'), '{}')
    writeFileSync(join(board.root, '.run/.gitignore'), '*')
    writeFileSync(join(board.root, '.run/captures/hero.png'), 'x')
    writeFileSync(join(board.root, '.run/claims.json.lock'), 'x')
    const sentinel = join(board.root, 'studio/home/sentinel.txt')

    await expect
      .poll(
        () => {
          writeFileSync(sentinel, 'x')
          return batches.flat()
        },
        { timeout: SEEN_MS },
      )
      .toContain(sentinel)
    // macOS can report the claims write again after the reset above
    const claims = join(board.root, '.run/claims.json')
    const reported = batches.flat().filter((path) => path !== claims)
    expect(new Set(reported)).toEqual(new Set([sentinel]))
  })

  it('keeps reporting to later listeners when one throws', async () => {
    const after: string[][] = []
    watcher.onBatch(() => {
      throw new Error('a check that broke')
    })
    watcher.onBatch((paths) => after.push(paths))

    writeFileSync(join(board.root, 'studio/home/hero.html'), '<p>three</p>')

    await expect.poll(() => after.length, { timeout: SEEN_MS }).toBe(1)
  })

  it('stops reporting to a listener that unsubscribed', async () => {
    const late: string[][] = []
    const unsubscribe = watcher.onBatch((paths) => late.push(paths))
    unsubscribe()

    writeFileSync(join(board.root, 'studio/home/hero.html'), '<p>two</p>')

    await expect.poll(() => batches.length, { timeout: SEEN_MS }).toBe(1)
    expect(late).toEqual([])
  })
})

describe('watchBoard with a sheet outside the board', () => {
  let board: FixtureBoard
  let watcher: BoardWatcher

  afterEach(async () => {
    await watcher.close()
    board.cleanup()
  })

  it('reports a write to the outside sheet in the board batches', async () => {
    board = copyFixtureBoard('live')
    const tokens = join(board.root, '../brand.css')
    writeFileSync(tokens, ':root {}')
    watcher = await watchBoard(board.root, [tokens])
    const batches: string[][] = []
    watcher.onBatch((paths) => batches.push(paths))

    writeFileSync(tokens, ':root { --fg: teal }')

    await expect
      .poll(() => batches.flat(), { timeout: SEEN_MS })
      .toContain(tokens)
  })
})

describe('unmovedRefs', () => {
  let board: FixtureBoard

  beforeEach(() => {
    board = copyFixtureBoard('live')
  })

  afterEach(() => {
    board.cleanup()
  })

  const MOVED = ['studio/start/hero', 'studio/start/mobile']
  const at = (path: string) => join(board.root, path)

  function renameHome() {
    renameSync(at('studio/home'), at('studio/start'))
    return { from: at('studio/home'), path: at('studio/start'), at: Date.now() }
  }

  it('drops a frame that only moved with the folder the board renamed', async () => {
    const last = await scanBoard(board.root)
    const moved = renameHome()

    expect(
      unmovedRefs(MOVED, await scanBoard(board.root), [moved], last),
    ).toEqual([])
  })

  it('keeps a frame written after the folder moved', async () => {
    const last = await scanBoard(board.root)
    const moved = renameHome()
    const later = new Date(Date.now() + 1000)
    utimesSync(at('studio/start/hero.html'), later, later)

    expect(
      unmovedRefs(MOVED, await scanBoard(board.root), [moved], last),
    ).toEqual(['studio/start/hero'])
  })

  it('keeps a frame written before the move that the last board never showed', async () => {
    const last = await scanBoard(board.root)
    const written = new Date(Date.now() + 1000)
    utimesSync(at('studio/home/hero.html'), written, written)
    const moved = renameHome()

    expect(
      unmovedRefs(MOVED, await scanBoard(board.root), [moved], last),
    ).toEqual(['studio/start/hero'])
  })

  it('keeps every moved frame when no board was sent before the move', async () => {
    const moved = renameHome()

    expect(
      unmovedRefs(MOVED, await scanBoard(board.root), [moved], null),
    ).toEqual(MOVED)
  })

  it('keeps a frame in a sibling folder whose name only starts the same', async () => {
    const last = await scanBoard(board.root)
    const moved = {
      from: at('studio/pricing'),
      path: at('studio/hom'),
      at: Date.now(),
    }

    expect(
      unmovedRefs(
        ['studio/home/hero'],
        await scanBoard(board.root),
        [moved],
        last,
      ),
    ).toEqual(['studio/home/hero'])
  })
})

describe('placedRefs', () => {
  let board: FixtureBoard

  beforeEach(() => {
    board = copyFixtureBoard('live')
  })

  afterEach(() => {
    board.cleanup()
  })

  const at = (path: string) => join(board.root, path)

  function writeHomeLayout(frames: Record<string, object>) {
    writeFileSync(
      at('studio/home/layout.json'),
      JSON.stringify({
        version: 1,
        frames: {
          hero: { x: 0, y: 0, width: 1440, height: 900, order: 0 },
          mobile: { x: 1520, y: 0, width: 390, height: 844, order: 1 },
          ...frames,
        },
      }),
    )
  }

  const TALL = { x: 1990, y: 0, width: 1440, height: 900, order: 2 }
  const homeLayout = () => [at('studio/home/layout.json')]

  it('names a hugging frame written first and placed after', async () => {
    writeFileSync(at('studio/home/tall.html'), '<main>Tall</main>')
    const previous = await scanBoard(board.root)
    writeHomeLayout({ tall: { ...TALL, hugHeight: true } })

    expect(
      placedRefs(previous, await scanBoard(board.root), homeLayout()),
    ).toEqual(['studio/home/tall'])
  })

  it('names a hugging frame written and placed in one batch', async () => {
    const previous = await scanBoard(board.root)
    writeFileSync(at('studio/home/tall.html'), '<main>Tall</main>')
    writeHomeLayout({ tall: { ...TALL, hugWidth: true } })

    expect(
      placedRefs(previous, await scanBoard(board.root), homeLayout()),
    ).toEqual(['studio/home/tall'])
  })

  it('leaves out a hugging frame that only moved', async () => {
    writeHomeLayout({ tall: { ...TALL, hugHeight: true } })
    writeFileSync(at('studio/home/tall.html'), '<main>Tall</main>')
    const previous = await scanBoard(board.root)
    writeHomeLayout({ tall: { ...TALL, x: 4000, hugHeight: true } })

    expect(
      placedRefs(previous, await scanBoard(board.root), homeLayout()),
    ).toEqual([])
  })

  it('leaves out a newly placed frame fixed on both axes', async () => {
    writeFileSync(at('studio/home/tall.html'), '<main>Tall</main>')
    const previous = await scanBoard(board.root)
    writeHomeLayout({ tall: TALL })

    expect(
      placedRefs(previous, await scanBoard(board.root), homeLayout()),
    ).toEqual([])
  })

  it('leaves out a hugging frame a page rename carried', async () => {
    writeHomeLayout({ tall: { ...TALL, hugHeight: true } })
    writeFileSync(at('studio/home/tall.html'), '<main>Tall</main>')
    const previous = await scanBoard(board.root)
    renameSync(at('studio/home'), at('studio/start'))

    expect(
      placedRefs(previous, await scanBoard(board.root), [at('studio/start')]),
    ).toEqual([])
  })

  it('names a newly placed hugging frame on any page given no paths', async () => {
    writeFileSync(at('studio/home/tall.html'), '<main>Tall</main>')
    const previous = await scanBoard(board.root)
    writeHomeLayout({ tall: { ...TALL, hugHeight: true } })

    expect(placedRefs(previous, await scanBoard(board.root))).toEqual([
      'studio/home/tall',
    ])
  })

  it('names a hugging frame an earlier scan saw placed but no batch measured', async () => {
    writeFileSync(at('studio/home/tall.html'), '<main>Tall</main>')
    writeHomeLayout({ tall: { ...TALL, hugHeight: true } })
    const previous = await scanBoard(board.root)

    expect(
      placedRefs(previous, await scanBoard(board.root), homeLayout(), [
        'studio/home/tall',
      ]),
    ).toEqual(['studio/home/tall'])
  })

  it('leaves out a frame still unplaced', async () => {
    const previous = await scanBoard(board.root)
    writeFileSync(at('studio/home/tall.html'), '<main>Tall</main>')

    expect(
      placedRefs(previous, await scanBoard(board.root), homeLayout()),
    ).toEqual([])
  })
})

describe('relistedRefs', () => {
  let board: FixtureBoard

  beforeEach(() => {
    board = copyFixtureBoard('live')
  })

  afterEach(() => {
    board.cleanup()
  })

  function writeHero(hero: object) {
    writeFileSync(
      join(board.root, 'studio/home/layout.json'),
      JSON.stringify({
        version: 1,
        frames: {
          hero: { x: 0, y: 0, width: 1440, height: 900, order: 0, ...hero },
          mobile: { x: 1520, y: 0, width: 390, height: 844, order: 1 },
        },
      }),
    )
  }

  const PHONE = [{ width: 390, height: 844 }]

  it('names a hugging frame given a new linked width', async () => {
    writeHero({ hugHeight: true })
    const previous = await scanBoard(board.root)
    writeHero({ hugHeight: true, widths: PHONE })

    expect(relistedRefs(previous, await scanBoard(board.root))).toEqual([
      'studio/home/hero',
    ])
  })

  it('leaves out a frame whose linked widths only took a measured height', async () => {
    writeHero({ hugHeight: true, widths: PHONE })
    const previous = await scanBoard(board.root)
    writeHero({ hugHeight: true, widths: [{ width: 390, height: 2400 }] })

    expect(relistedRefs(previous, await scanBoard(board.root))).toEqual([])
  })

  it('leaves out a frame holding a fixed height', async () => {
    writeHero({})
    const previous = await scanBoard(board.root)
    writeHero({ widths: PHONE })

    expect(relistedRefs(previous, await scanBoard(board.root))).toEqual([])
  })
})

describe('rekittedRefs', () => {
  let board: FixtureBoard

  beforeEach(() => {
    board = copyFixtureBoard('live')
  })

  afterEach(() => {
    board.cleanup()
  })

  function writeHero(hero: object) {
    writeFileSync(
      join(board.root, 'studio/home/layout.json'),
      JSON.stringify({
        version: 1,
        frames: {
          hero: { x: 0, y: 0, width: 1440, height: 900, order: 0, ...hero },
          mobile: { x: 1520, y: 0, width: 390, height: 844, order: 1 },
        },
      }),
    )
  }

  it('names a frame given a kit', async () => {
    writeHero({})
    const previous = await scanBoard(board.root)
    writeHero({ kit: 'sketch' })

    expect(rekittedRefs(previous, await scanBoard(board.root))).toEqual([
      'studio/home/hero',
    ])
  })

  it('names a frame whose kit was taken off', async () => {
    writeHero({ kit: 'sketch' })
    const previous = await scanBoard(board.root)
    writeHero({})

    expect(rekittedRefs(previous, await scanBoard(board.root))).toEqual([
      'studio/home/hero',
    ])
  })

  it('leaves out a frame that only moved', async () => {
    writeHero({ kit: 'sketch' })
    const previous = await scanBoard(board.root)
    writeHero({ kit: 'sketch', x: 40 })

    expect(rekittedRefs(previous, await scanBoard(board.root))).toEqual([])
  })
})
