import { cpSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Claim } from '@/shared/records/claims'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { scanBoard } from '../board/scan'
import type { Step } from '../history/stack'
import { createChangeTracker } from './tracker'

const NOW = new Date('2026-10-19T12:00:00.000Z')

function claimOn(frame: string): Claim {
  return {
    frame,
    session: 's-1',
    agent: 'claude',
    tag: 'claude · basic',
    claimedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
  }
}

function stepOn(frames: string[], page: Step['page'] = null): Step {
  return { id: 1, changes: [], page, frames }
}

describe('createChangeTracker', () => {
  let board: FixtureBoard
  let tracker: ReturnType<typeof createChangeTracker>

  beforeEach(async () => {
    board = copyFixtureBoard('basic')
    tracker = createChangeTracker(board.root, { now: () => NOW })
    await tracker.prime(await scanBoard(board.root))
  })

  afterEach(() => {
    board.cleanup()
  })

  const at = (path: string) => join(board.root, path)
  const hero = () => readFileSync(at('webapp/home/hero.html'), 'utf8')

  async function batch(paths: string[], claims: Claim[] = []) {
    return tracker.update(await scanBoard(board.root), paths.map(at), claims)
  }

  it("marks an agent's write with its claim's author", async () => {
    writeFileSync(
      at('webapp/home/hero.html'),
      hero().replace('>hero</h1>', '>Hi</h1>'),
    )

    const changes = await batch(
      ['webapp/home/hero.html'],
      [claimOn('webapp/home/hero')],
    )

    expect(changes).toMatchObject([
      {
        frame: 'webapp/home/hero',
        at: NOW.toISOString(),
        author: { session: 's-1', agent: 'claude', tag: 'claude · basic' },
        elements: [5],
        removed: 0,
        whole: false,
        created: false,
      },
    ])
  })

  it('marks a write to an unclaimed frame with no author', async () => {
    writeFileSync(
      at('webapp/home/hero.html'),
      hero().replace('>hero</h1>', '>Hi</h1>'),
    )

    const [change] = await batch(['webapp/home/hero.html'])

    expect(change?.author).toBeNull()
  })

  it('carries the hash the write left the file at', async () => {
    writeFileSync(at('webapp/home/hero.html'), '<p>one</p>')

    const [change] = await batch(['webapp/home/hero.html'])
    const [again] = await batch(['webapp/home/hero.html'])
    writeFileSync(at('webapp/home/hero.html'), '<p>two</p>')
    const [next] = await batch(['webapp/home/hero.html'])

    expect(again).toBeUndefined()
    expect(next?.hash).not.toBe(change?.hash)
  })

  it('marks nothing for a hand write the history told it of', async () => {
    writeFileSync(
      at('webapp/home/hero.html'),
      hero().replace('>hero</h1>', '>Hi</h1>'),
    )

    await tracker.own(stepOn(['webapp/home/hero']))
    const changes = await batch(['webapp/home/hero.html'])

    expect(changes).toEqual([])
  })

  it('marks nothing for a page renamed on disk', async () => {
    renameSync(at('webapp/home'), at('webapp/start'))

    const changes = await batch([
      'webapp/home/hero.html',
      'webapp/home/about.html',
      'webapp/start/hero.html',
      'webapp/start/about.html',
    ])

    expect(changes).toEqual([])
  })

  it('marks nothing for a page duplicate the history told it of', async () => {
    cpSync(at('webapp/home'), at('webapp/home-copy'), { recursive: true })

    await tracker.own(stepOn([], { before: null, after: 'webapp/home-copy' }))
    const changes = await batch([
      'webapp/home-copy/hero.html',
      'webapp/home-copy/about.html',
    ])

    expect(changes).toEqual([])
  })

  it('marks nothing for an asset write', async () => {
    writeFileSync(at('webapp/tokens.css'), ':root { --space: 2px; }')

    const changes = await batch(['webapp/tokens.css'])

    expect(changes).toEqual([])
  })

  it('marks a new frame as created and whole', async () => {
    writeFileSync(at('webapp/home/pricing.html'), '<h1>Pricing</h1>')

    const changes = await batch(['webapp/home/pricing.html'])

    expect(changes).toMatchObject([
      { frame: 'webapp/home/pricing', created: true, whole: true },
    ])
  })

  it('marks a new frame and a written one landing in one batch', async () => {
    writeFileSync(at('webapp/home/pricing.html'), '<h1>Pricing</h1>')
    writeFileSync(
      at('webapp/home/hero.html'),
      hero().replace('>hero</h1>', '>Hi</h1>'),
    )

    const changes = await batch([
      'webapp/home/pricing.html',
      'webapp/home/hero.html',
    ])

    expect(changes.map((change) => change.frame).sort()).toEqual([
      'webapp/home/hero',
      'webapp/home/pricing',
    ])
  })

  it('reports a rewrite of the whole frame as whole', async () => {
    writeFileSync(
      at('webapp/home/hero.html'),
      '<section><h2>a</h2><ul><li>b</li><li>c</li></ul></section>',
    )

    const [change] = await batch(['webapp/home/hero.html'])

    expect(change?.whole).toBe(true)
  })

  it('keeps every change in the log in the order it landed', async () => {
    writeFileSync(at('webapp/home/hero.html'), '<p>one</p>')
    await batch(['webapp/home/hero.html'])
    writeFileSync(at('webapp/home/about.html'), '<p>two</p>')
    await batch(['webapp/home/about.html'])

    expect(tracker.log().map((change) => change.frame)).toEqual([
      'webapp/home/hero',
      'webapp/home/about',
    ])
  })
})
