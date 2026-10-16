import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { scanBoard } from '@/server/board/scan'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { type BoardWatcher, reloadRefs, watchBoard } from './watch'

/** How long a test waits to be sure no batch arrives, well past the 250 ms ceiling. */
const QUIET_MS = 600

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

  it('names each frame once across a batch', async () => {
    expect(
      await refsFor('studio/home/hero.html', 'studio/home/styles.css'),
    ).toEqual(['studio/home/hero', 'studio/home/mobile'])
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

  it('gathers writes close together into one batch', async () => {
    writeFileSync(join(board.root, 'studio/home/hero.html'), '<p>one</p>')
    writeFileSync(join(board.root, 'studio/home/styles.css'), 'p {}')

    await expect.poll(() => batches.length).toBe(1)
    expect(batches[0]?.sort()).toEqual([
      join(board.root, 'studio/home/hero.html'),
      join(board.root, 'studio/home/styles.css'),
    ])
  })

  it('reports a frame saved through a temp file and a rename as that frame', async () => {
    const frame = join(board.root, 'studio/home/hero.html')
    writeFileSync(`${frame}.swap`, '<p>saved</p>')
    renameSync(`${frame}.swap`, frame)

    await expect.poll(() => batches.flat()).toContain(frame)
  })

  it('ignores the run folder, dot-named paths, locks, and temp files', async () => {
    mkdirSync(join(board.root, '.run'), { recursive: true })
    writeFileSync(join(board.root, '.run/address.json'), '{}')
    writeFileSync(join(board.root, 'studio/home/.draft.html'), 'x')
    writeFileSync(join(board.root, 'studio/home/layout.json.lock'), 'x')
    writeFileSync(join(board.root, 'studio/home/hero.html.tmp'), 'x')

    await new Promise((resolve) => setTimeout(resolve, QUIET_MS))

    expect(batches).toEqual([])
  })

  it('stops reporting to a listener that unsubscribed', async () => {
    const late: string[][] = []
    const unsubscribe = watcher.onBatch((paths) => late.push(paths))
    unsubscribe()

    writeFileSync(join(board.root, 'studio/home/hero.html'), '<p>two</p>')

    await expect.poll(() => batches.length).toBe(1)
    expect(late).toEqual([])
  })
})
