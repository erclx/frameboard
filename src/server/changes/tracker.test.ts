import { cpSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Claim } from '@/shared/records/claims'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { scanBoard } from '../board/scan'
import { moveElement } from '../edit/insert'
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

function stepOn(
  frames: string[],
  page: Step['page'] = null,
  changes: Step['changes'] = [],
): Step {
  return { id: 1, changes, page, frames }
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

  it('withdraws a held change the history then tells it wrote', async () => {
    writeFileSync(
      at('webapp/home/hero.html'),
      hero().replace('>hero</h1>', '>Hi</h1>'),
    )
    const held = await batch(['webapp/home/hero.html'])

    await tracker.own(
      stepOn(['webapp/home/hero'], null, [
        {
          kind: 'element',
          path: at('webapp/home/hero.html'),
          ref: 'webapp/home/hero',
          span: {
            scope: 'element',
            index: 5,
            count: 8,
            before: '<h1 data-name="Headline">hero</h1>',
            after: '<h1 data-name="Headline">Hi</h1>',
          },
        },
      ]),
    )

    expect(held).toHaveLength(1)
    expect(tracker.settle(held)).toEqual([])
    expect(tracker.log()).toEqual([])
  })

  it('withdraws a held change the history then tells it placed an element in', async () => {
    const markup = '<p data-name="Text">Text</p>'
    writeFileSync(
      at('webapp/home/hero.html'),
      hero().replace('<h1', `${markup}<h1`),
    )
    const held = await batch(['webapp/home/hero.html'])

    await tracker.own(
      stepOn(['webapp/home/hero'], null, [
        {
          kind: 'inserted',
          path: at('webapp/home/hero.html'),
          ref: 'webapp/home/hero',
          span: {
            markup,
            index: 5,
            count: 9,
            placement: { parent: 4, before: 5 },
            parent: { tagName: 'body', tag: '<body>' },
            next: '<h1 data-name="Headline">',
            lead: '',
          },
          present: 'after',
        },
      ]),
    )

    expect(tracker.settle(held)).toEqual([])
  })

  it('withdraws a held change the history then tells it moved an element in', async () => {
    const moved = moveElement(hero(), 5, { parent: 4, before: null })
    if (!moved.ok) throw new Error(moved.detail)
    writeFileSync(at('webapp/home/hero.html'), moved.html)
    const held = await batch(['webapp/home/hero.html'])

    await tracker.own(
      stepOn(['webapp/home/hero'], null, [
        {
          kind: 'relocated',
          path: at('webapp/home/hero.html'),
          ref: 'webapp/home/hero',
          span: moved.span,
        },
      ]),
    )

    expect(tracker.settle(held)).toEqual([])
  })

  it('keeps a held change when the step only moved its frame', async () => {
    writeFileSync(
      at('webapp/home/hero.html'),
      hero().replace('>hero</h1>', '>Hi</h1>'),
    )
    const held = await batch(['webapp/home/hero.html'])

    await tracker.own(
      stepOn(['webapp/home/hero'], null, [
        {
          kind: 'entry',
          layout: at('webapp/home/layout.json'),
          frame: 'hero',
          before: undefined,
          after: undefined,
        },
      ]),
    )

    expect(tracker.settle(held).map((change) => change.frame)).toEqual([
      'webapp/home/hero',
    ])
  })

  it('keeps a held change when a page step names its page', async () => {
    writeFileSync(
      at('webapp/home/hero.html'),
      hero().replace('>hero</h1>', '>Hi</h1>'),
    )
    const held = await batch(['webapp/home/hero.html'])
    cpSync(at('webapp/home'), at('webapp/home-copy'), { recursive: true })

    await tracker.own(
      stepOn([], { before: 'webapp/home', after: 'webapp/home-copy' }, [
        {
          kind: 'path',
          path: at('webapp/home-copy'),
          present: 'after',
          hash: 'h',
          slot: at('.trash/1'),
        },
      ]),
    )

    expect(tracker.settle(held).map((change) => change.frame)).toEqual([
      'webapp/home/hero',
    ])
  })

  it('logs a held change nothing withdrew once it settles', async () => {
    writeFileSync(
      at('webapp/home/hero.html'),
      hero().replace('>hero</h1>', '>Hi</h1>'),
    )
    const held = await batch(['webapp/home/hero.html'])

    const settled = tracker.settle(held)

    expect(settled.map((change) => change.frame)).toEqual(['webapp/home/hero'])
    expect(tracker.log()).toEqual(settled)
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

  it('keeps every settled change in the log in the order it landed', async () => {
    writeFileSync(at('webapp/home/hero.html'), '<p>one</p>')
    tracker.settle(await batch(['webapp/home/hero.html']))
    writeFileSync(at('webapp/home/about.html'), '<p>two</p>')
    tracker.settle(await batch(['webapp/home/about.html']))

    expect(tracker.log().map((change) => change.frame)).toEqual([
      'webapp/home/hero',
      'webapp/home/about',
    ])
  })
})

describe('the versions an agent write replaced', () => {
  let board: FixtureBoard
  let tracker: ReturnType<typeof createChangeTracker>

  beforeEach(async () => {
    board = copyFixtureBoard('basic')
    tracker = createChangeTracker(board.root, { now: () => NOW, logCap: 2 })
    await tracker.prime(await scanBoard(board.root))
  })

  afterEach(() => {
    board.cleanup()
  })

  const at = (path: string) => join(board.root, path)

  async function write(path: string, source: string) {
    writeFileSync(at(path), source)
    return tracker.update(await scanBoard(board.root), [at(path)], [])
  }

  it('keeps the source a write replaced under the hash it had', async () => {
    const original = readFileSync(at('webapp/home/hero.html'), 'utf8')

    const [change] = tracker.settle(
      await write('webapp/home/hero.html', '<p>one</p>'),
    )

    expect(change?.before).toEqual(expect.any(String))
    expect(tracker.version('webapp/home/hero', change?.before ?? '')).toBe(
      original,
    )
  })

  it('names no before for a created frame', async () => {
    const [change] = tracker.settle(
      await write('webapp/home/pricing.html', '<h1>Pricing</h1>'),
    )

    expect(change?.created).toBe(true)
    expect(change).not.toHaveProperty('before')
  })

  it('answers no version under another frame', async () => {
    const [change] = tracker.settle(
      await write('webapp/home/hero.html', '<p>one</p>'),
    )

    expect(
      tracker.version('webapp/home/about', change?.before ?? ''),
    ).toBeNull()
  })

  it('keeps no version for a write the history told it of', async () => {
    const original = readFileSync(at('webapp/home/hero.html'), 'utf8')
    const held = await write(
      'webapp/home/hero.html',
      original.replace('>hero</h1>', '>Hi</h1>'),
    )
    await tracker.own(
      stepOn(['webapp/home/hero'], null, [
        {
          kind: 'element',
          path: at('webapp/home/hero.html'),
          ref: 'webapp/home/hero',
          span: {
            scope: 'element',
            index: 5,
            count: 8,
            before: '<h1 data-name="Headline">hero</h1>',
            after: '<h1 data-name="Headline">Hi</h1>',
          },
        },
      ]),
    )

    tracker.settle(held)

    expect(
      tracker.version('webapp/home/hero', held[0]?.before ?? ''),
    ).toBeNull()
  })

  it('drops a version once no logged change names it', async () => {
    const [first] = tracker.settle(
      await write('webapp/home/hero.html', '<p>one</p>'),
    )
    tracker.settle(await write('webapp/home/hero.html', '<p>two</p>'))
    tracker.settle(await write('webapp/home/hero.html', '<p>three</p>'))

    expect(tracker.version('webapp/home/hero', first?.before ?? '')).toBeNull()
    expect(tracker.version('webapp/home/hero', first?.hash ?? '')).toBe(
      '<p>one</p>',
    )
  })
})
