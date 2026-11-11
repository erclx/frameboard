import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { landReserved } from './land'
import { readClaims, reserve } from './store'

const NOW = new Date('2026-10-19T10:00:00.000Z')
const HOLDER = { session: 'sess-a', agent: 'claude', tag: 'claude · a' }
const BOX = {
  x: 3000,
  y: 200,
  width: 400,
  height: 300,
  hugWidth: false,
  hugHeight: true,
}

describe('landReserved', () => {
  let board: FixtureBoard

  beforeEach(() => {
    board = copyFixtureBoard('basic')
  })

  afterEach(() => {
    board.cleanup()
  })

  function layout(): {
    frames: Record<string, Record<string, unknown>>
  } {
    return JSON.parse(
      readFileSync(join(board.root, 'webapp/home/layout.json'), 'utf8'),
    )
  }

  function write(name: string): void {
    writeFileSync(
      join(board.root, `webapp/home/${name}.html`),
      '<!doctype html><title>x</title>',
    )
  }

  it('places a landed file at its reserved box on top, and the claim drops the box', async () => {
    await reserve(
      board.root,
      HOLDER,
      [{ frame: 'webapp/home/pricing', box: BOX }],
      NOW,
    )
    write('pricing')

    const landed = await landReserved(board.root, NOW)

    expect(landed).toEqual(['webapp/home/pricing'])
    expect(layout().frames.pricing).toMatchObject({
      x: 3000,
      y: 200,
      width: 400,
      height: 300,
      order: 2,
      hugWidth: false,
      hugHeight: true,
    })
    const [held] = await readClaims(board.root, NOW)
    expect(held).toMatchObject({ frame: 'webapp/home/pricing' })
    expect(held?.box).toBeUndefined()
    expect(held?.set).toEqual(expect.any(String))
  })

  it('leaves a reservation whose file is not written yet as it was', async () => {
    await reserve(
      board.root,
      HOLDER,
      [{ frame: 'webapp/home/pricing', box: BOX }],
      NOW,
    )

    const landed = await landReserved(board.root, NOW)

    expect(landed).toEqual([])
    expect(layout().frames.pricing).toBeUndefined()
    expect((await readClaims(board.root, NOW))[0]?.box).toEqual(BOX)
  })

  it('keeps an entry the page already holds, dropping the box alone', async () => {
    await reserve(
      board.root,
      HOLDER,
      [{ frame: 'webapp/home/pricing', box: BOX }],
      NOW,
    )
    write('pricing')
    const placed = { x: 10, y: 20, width: 30, height: 40, order: 2 }
    const file = layout()
    file.frames.pricing = { ...placed, hidden: false, locked: false }
    writeFileSync(
      join(board.root, 'webapp/home/layout.json'),
      JSON.stringify(file),
    )

    await landReserved(board.root, NOW)

    expect(layout().frames.pricing).toMatchObject(placed)
    expect((await readClaims(board.root, NOW))[0]?.box).toBeUndefined()
  })
})
