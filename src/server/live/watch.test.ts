import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
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
  reloadRefs,
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

  it('reloads every frame in the project when an asset changed', async () => {
    expect(await refsFor('studio/assets/dot.svg')).toEqual([
      'studio/home/hero',
      'studio/home/mobile',
      'studio/pricing/plans',
    ])
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

describe('watchBoard', () => {
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

  it('reports each write in a batch', async () => {
    writeFileSync(join(board.root, 'studio/home/hero.html'), '<p>one</p>')
    writeFileSync(join(board.root, 'studio/home/styles.css'), 'p {}')

    await expect
      .poll(() => [...new Set(batches.flat())].sort(), { timeout: SEEN_MS })
      .toEqual([
        join(board.root, 'studio/home/hero.html'),
        join(board.root, 'studio/home/styles.css'),
      ])
  })

  it('reports a frame saved through a temp file and a rename as that frame', async () => {
    const frame = join(board.root, 'studio/home/hero.html')
    writeFileSync(`${frame}.swap`, '<p>saved</p>')
    renameSync(`${frame}.swap`, frame)

    await expect
      .poll(() => batches.flat(), { timeout: SEEN_MS })
      .toContain(frame)
  })

  it('ignores the run folder, dot-named paths, locks, and temp files', async () => {
    mkdirSync(join(board.root, '.run'), { recursive: true })
    writeFileSync(join(board.root, '.run/address.json'), '{}')
    writeFileSync(join(board.root, 'studio/home/.draft.html'), 'x')
    writeFileSync(join(board.root, 'studio/home/layout.json.lock'), 'x')
    writeFileSync(join(board.root, 'studio/home/hero.html.tmp'), 'x')
    // A watched write after the ignored ones, so its batch arriving means
    // every earlier event has been reported or dropped. Under load the
    // watcher can lose a create that lands beside other writes in one folder,
    // so each poll writes it again until it is seen.
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
    expect(new Set(batches.flat())).toEqual(new Set([sentinel]))
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
