import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { moveFrame, readFrame, setFrameDevice } from './frames'

describe("a phone frame's island", () => {
  let board: FixtureBoard

  afterEach(() => {
    board.cleanup()
  })

  function open(): string {
    board = copyFixtureBoard('basic')
    return board.root
  }

  function layout() {
    return JSON.parse(
      readFileSync(join(board.root, 'webapp/home/layout.json'), 'utf8'),
    )
  }

  function setHero(root: string, flags: object): void {
    const page = layout()
    Object.assign(page.frames.hero, flags)
    writeFileSync(join(root, 'webapp/home/layout.json'), JSON.stringify(page))
  }

  const HERO = 'webapp/home/hero'

  it('writes the wide island on a phone and clears the key for the compact one', async () => {
    const root = open()
    setHero(root, { width: 390, showDevice: true })

    const wide = await setFrameDevice(root, HERO, undefined, {
      cwd: root,
      island: 'wide',
    })
    const written = layout().frames.hero
    const compact = await setFrameDevice(root, HERO, undefined, {
      cwd: root,
      island: 'compact',
    })

    expect(wide).toMatchObject({ device: 'phone', island: 'wide' })
    expect(written).toMatchObject({ showDevice: true, island: 'wide' })
    expect(compact).not.toHaveProperty('island')
    expect(layout().frames.hero).not.toHaveProperty('island')
  })

  it('keeps the wide island through a move', async () => {
    const root = open()
    setHero(root, { width: 390, showDevice: true, island: 'wide' })

    const moved = await moveFrame(root, HERO, { cwd: root, x: 40 })

    expect(moved.island).toBe('wide')
    expect(layout().frames.hero).toMatchObject({ island: 'wide' })
  })

  it('reads an island no reader knows as compact', async () => {
    const root = open()
    setHero(root, { width: 390, showDevice: true, island: 'huge' })

    const hero = await readFrame(root, HERO, { cwd: root })

    expect(hero).not.toHaveProperty('island')
  })

  it('refuses an island on a frame whose width names no phone', async () => {
    const root = open()

    await expect(
      setFrameDevice(root, HERO, undefined, { cwd: root, island: 'wide' }),
    ).rejects.toMatchObject({ code: 'usage' })
  })
})
