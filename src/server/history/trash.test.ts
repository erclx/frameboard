import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { emptyTrash, takeOut, trashSlot } from './trash'

describe('trash', () => {
  let board: FixtureBoard

  beforeEach(() => {
    board = copyFixtureBoard('basic')
  })

  afterEach(() => {
    board.cleanup()
  })

  it('takes a folder out into its slot and gives it back byte for byte', async () => {
    const page = join(board.root, 'webapp/home')
    const bytes = readFileSync(join(page, 'notes.json'))
    const slot = trashSlot(board.root, 3, 0)

    await takeOut(page, slot)
    expect(existsSync(page)).toBe(false)
    renameSync(slot, page)

    expect(readFileSync(join(page, 'notes.json'))).toEqual(bytes)
  })

  it('keeps the slot under the board run folder', () => {
    expect(trashSlot(board.root, 3, 1)).toBe(join(board.root, '.run/trash/3/1'))
  })

  it('empties every slot and leaves the rest of the run folder', async () => {
    mkdirSync(join(board.root, '.run'), { recursive: true })
    writeFileSync(join(board.root, '.run/address.json'), '{}')
    await takeOut(join(board.root, 'webapp/home'), trashSlot(board.root, 1, 0))

    await emptyTrash(board.root)

    expect(existsSync(join(board.root, '.run/trash'))).toBe(false)
    expect(existsSync(join(board.root, '.run/address.json'))).toBe(true)
  })

  it('empties a board with no trash without failing', async () => {
    await expect(emptyTrash(board.root)).resolves.toBeUndefined()
  })
})
