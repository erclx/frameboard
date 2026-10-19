import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { recordingJournal } from '../../../test/support/recording-journal'
import { holdFrames, pasteFrames } from './paste'

describe('paste', () => {
  let board: FixtureBoard

  beforeEach(() => {
    board = copyFixtureBoard('basic')
  })

  afterEach(() => {
    board.cleanup()
  })

  const file = (path: string) => readFileSync(join(board.root, path), 'utf8')
  const layout = (page: string) =>
    JSON.parse(file(`${page}/layout.json`)).frames

  it('pastes onto its own page beside the source, offset by its width and the gap', async () => {
    const held = await holdFrames(board.root, ['webapp/home/hero'], {
      cwd: board.root,
    })

    const [pasted] = await pasteFrames(board.root, 'webapp/home', held, {
      cwd: board.root,
    })

    expect(pasted).toMatchObject({
      ref: 'webapp/home/hero-2',
      box: { x: 1520, y: 0, width: 1440, height: 900 },
      order: 2,
    })
    expect(file('webapp/home/hero-2.html')).toBe(file('webapp/home/hero.html'))
  })

  it("pastes into another project's page at the source's box, on top", async () => {
    const held = await holdFrames(board.root, ['webapp/home/about'], {
      cwd: board.root,
    })

    const [pasted] = await pasteFrames(board.root, 'marketing/launch', held, {
      cwd: board.root,
    })

    expect(pasted).toMatchObject({
      ref: 'marketing/launch/about',
      box: { x: 1520, y: 0, width: 390, height: 844 },
      order: 1,
    })
  })

  it('takes the next free name when the target page holds one by that name', async () => {
    const held = await holdFrames(board.root, ['webapp/home/hero'], {
      cwd: board.root,
    })
    writeFileSync(join(board.root, 'marketing/launch/hero.html'), 'agent')

    const [pasted] = await pasteFrames(board.root, 'marketing/launch', held, {
      cwd: board.root,
    })

    expect(pasted?.ref).toBe('marketing/launch/hero-2')
    expect(file('marketing/launch/hero.html')).toBe('agent')
  })

  it('keeps the bytes it held after the source is gone', async () => {
    const bytes = file('webapp/home/hero.html')
    const held = await holdFrames(board.root, ['webapp/home/hero'], {
      cwd: board.root,
    })
    writeFileSync(join(board.root, 'webapp/home/hero.html'), 'rewritten')

    await pasteFrames(board.root, 'marketing/launch', held, { cwd: board.root })

    expect(file('marketing/launch/hero.html')).toBe(bytes)
  })

  it('carries an unknown key on the held entry', async () => {
    const page = JSON.parse(file('webapp/home/layout.json'))
    page.frames.hero.tint = 'red'
    writeFileSync(
      join(board.root, 'webapp/home/layout.json'),
      JSON.stringify(page),
    )
    const held = await holdFrames(board.root, ['webapp/home/hero'], {
      cwd: board.root,
    })

    await pasteFrames(board.root, 'marketing/launch', held, { cwd: board.root })

    expect(layout('marketing/launch').hero).toMatchObject({ tint: 'red' })
  })

  it('reports each file it writes and each entry it sets to the journal', async () => {
    const held = await holdFrames(
      board.root,
      ['webapp/home/hero', 'webapp/home/about'],
      { cwd: board.root },
    )
    const { journal, calls } = recordingJournal(board.root)

    await pasteFrames(board.root, 'marketing/launch', held, {
      cwd: board.root,
      journal,
    })

    expect(calls).toEqual([
      { kind: 'created', path: 'marketing/launch/hero.html' },
      { kind: 'created', path: 'marketing/launch/about.html' },
      expect.objectContaining({
        kind: 'entry',
        frame: 'hero',
        before: undefined,
      }),
      expect.objectContaining({
        kind: 'entry',
        frame: 'about',
        before: undefined,
      }),
    ])
  })
})
