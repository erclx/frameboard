import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { duplicateFrame, moveFrame, readFrame, setFrameFlag } from './frames'

describe("a frame's showOverflow flag", () => {
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

  it('lands on the layout entry and reads back on the record', async () => {
    const root = open()

    const shown = await setFrameFlag(root, HERO, 'showOverflow', {
      cwd: root,
      on: true,
    })

    expect(shown.showOverflow).toBe(true)
    expect(layout().frames.hero).toMatchObject({ showOverflow: true })
  })

  it('clears the key once the frame clips again', async () => {
    const root = open()
    setHero(root, { showOverflow: true })

    const clipped = await setFrameFlag(root, HERO, 'showOverflow', {
      cwd: root,
      on: false,
    })

    expect(clipped).not.toHaveProperty('showOverflow')
    expect(layout().frames.hero).not.toHaveProperty('showOverflow')
  })

  it('gives a frame never switched no key on another write', async () => {
    const root = open()

    const moved = await moveFrame(root, HERO, { cwd: root, x: 40 })

    expect(moved).not.toHaveProperty('showOverflow')
    expect(layout().frames.hero).not.toHaveProperty('showOverflow')
  })

  it('keeps the flag through a move and a duplicate', async () => {
    const root = open()
    setHero(root, { showOverflow: true })

    const moved = await moveFrame(root, HERO, { cwd: root, x: 40 })
    const copied = await duplicateFrame(root, HERO, { cwd: root })

    expect(moved.showOverflow).toBe(true)
    expect(copied.showOverflow).toBe(true)
  })

  it('keeps the flag beside the locked one', async () => {
    const root = open()
    setHero(root, { showOverflow: true })

    const locked = await setFrameFlag(root, HERO, 'locked', {
      cwd: root,
      on: true,
    })

    expect(locked).toMatchObject({ locked: true, showOverflow: true })
  })

  it('reads a value that is not true as clipped and leaves it as written', async () => {
    const root = open()
    setHero(root, { showOverflow: 'yes' })

    await moveFrame(root, HERO, { cwd: root, x: 40 })
    const frame = await readFrame(root, HERO, { cwd: root })

    expect(frame).not.toHaveProperty('showOverflow')
    expect(layout().frames.hero).toMatchObject({ showOverflow: 'yes' })
  })
})
