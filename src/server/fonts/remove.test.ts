import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { installedFontFiles } from '../../../test/support/installed-font'
import { recordingJournal } from '../../../test/support/recording-journal'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { removeFont } from './remove'

describe('removeFont', () => {
  let board: TempBoard

  beforeEach(() => {
    board = writeBoard({
      'acme/project.json': '{ "version": 1 }\n',
      'acme/home/hero.html': '<h1 style="font-family: Lora">Hello</h1>\n',
      'acme/home/plain.html': '<h1 style="font-family: Geist">Hello</h1>\n',
      ...installedFontFiles('acme', 'lora', 'Lora'),
      ...installedFontFiles('acme', 'lato', 'Lato'),
      'acme/assets/fonts/brand/Brand.woff2': 'brand',
    })
  })

  afterEach(() => {
    board.cleanup()
  })

  function folder(id: string): string {
    return join(board.root, 'acme/assets/fonts', id)
  }

  it("takes the family's folder out and leaves the others", async () => {
    await removeFont(board.root, 'acme', 'lora')

    expect(existsSync(folder('lora'))).toBe(false)
    expect(existsSync(folder('lato'))).toBe(true)
  })

  it('answers the frames still drawing text in it', async () => {
    const removed = await removeFont(board.root, 'acme', 'lora')

    expect(removed).toEqual({
      version: 1,
      project: 'acme',
      id: 'lora',
      family: 'Lora',
      frames: ['acme/home/hero'],
    })
  })

  it('takes the folder out through a journal, so an undo brings it back', async () => {
    const { journal, calls } = recordingJournal(board.root)

    await removeFont(board.root, 'acme', 'lora', { journal })

    expect(calls).toEqual([{ kind: 'removed', path: 'acme/assets/fonts/lora' }])
  })

  it.each([
    ['a family the project lacks', 'inter'],
    ['a folder a project filled by hand', 'brand'],
    ['a path', '../kits'],
  ])('refuses font-not-found for %s, removing nothing', async (_case, id) => {
    const removing = removeFont(board.root, 'acme', id)

    await expect(removing).rejects.toMatchObject({
      code: 'font-not-found',
      details: { known: ['lato', 'lora'] },
    })
    expect(existsSync(folder('brand'))).toBe(true)
  })
})
