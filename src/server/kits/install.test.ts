import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { recordingJournal } from '../../../test/support/recording-journal'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { installKit } from './install'
import { findKit, shippedKitsDir } from './list'

const PROJECT = {
  'acme/project.json': '{ "version": 1, "pages": ["home"] }\n',
  'acme/home/layout.json': '{ "version": 1, "frames": {} }\n',
}

const FOLDER_KIT = {
  'kits/plain/kit.json':
    '{ "version": 1, "title": "Plain", "description": "From a folder" }\n',
  'kits/plain/tokens.css': ':root { --accent: teal }\n',
  'kits/plain/kit.css': '.kit-card { border: 1px solid }\n',
  'kits/plain/kit.md': '# Plain\n',
}

describe('installKit', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  it("writes the kit's token sheet as the project's", async () => {
    board = writeBoard(PROJECT)

    await installKit(board.root, 'acme', findKit(board.root, 'sketch'))

    expect(readFileSync(join(board.root, 'acme/tokens.css'), 'utf8')).toBe(
      readFileSync(join(shippedKitsDir(), 'sketch/tokens.css'), 'utf8'),
    )
  })

  it('puts every other kit file under assets/kit and the samples on a kit page', async () => {
    board = writeBoard(PROJECT)

    await installKit(board.root, 'acme', findKit(board.root, 'sketch'))

    expect(readdirSync(join(board.root, 'acme/assets/kit')).sort()).toEqual([
      'kit.css',
      'kit.json',
      'kit.md',
    ])
    expect(readdirSync(join(board.root, 'acme/kit')).sort()).toEqual([
      'layout.json',
      'parts.html',
      'sample.html',
    ])
  })

  it('answers the project, the kit, and every path it wrote', async () => {
    board = writeBoard(PROJECT)

    const record = await installKit(
      board.root,
      'acme',
      findKit(board.root, 'clean'),
    )

    expect(record).toEqual({
      project: 'acme',
      kit: 'clean',
      written: [
        join(board.root, 'acme/tokens.css'),
        join(board.root, 'acme/assets/kit'),
        join(board.root, 'acme/kit'),
      ],
    })
  })

  it('installs a kit from a folder that carries no sample page', async () => {
    board = writeBoard({ ...PROJECT, ...FOLDER_KIT })

    const record = await installKit(board.root, 'acme', {
      name: 'plain',
      path: join(board.root, 'kits/plain'),
    })

    expect(record.written).toHaveLength(2)
    expect(existsSync(join(board.root, 'acme/assets/kit/kit.css'))).toBe(true)
    expect(existsSync(join(board.root, 'acme/kit'))).toBe(false)
  })

  it('reports each write to the journal so one undo takes the install back', async () => {
    board = writeBoard(PROJECT)
    const { journal, calls } = recordingJournal(board.root)

    await installKit(board.root, 'acme', findKit(board.root, 'clean'), {
      journal,
    })

    expect(calls).toEqual([
      { kind: 'created', path: 'acme/tokens.css' },
      { kind: 'created', path: 'acme/assets' },
      { kind: 'created', path: 'acme/kit' },
    ])
  })

  it.each([
    ['a project sheet', 'acme/tokens.css'],
    ['a board sheet', 'tokens.css'],
  ])(
    'refuses tokens-exist where %s reaches the project, writing nothing',
    async (_case, sheet) => {
      board = writeBoard({ ...PROJECT, [sheet]: ':root { --accent: red }\n' })

      await expect(
        installKit(board.root, 'acme', findKit(board.root, 'clean')),
      ).rejects.toMatchObject({ code: 'tokens-exist' })
      expect(existsSync(join(board.root, 'acme/assets'))).toBe(false)
    },
  )

  it('refuses name-taken where the project already has a kit page, writing nothing', async () => {
    board = writeBoard({
      ...PROJECT,
      'acme/kit/layout.json': '{ "version": 1, "frames": {} }\n',
    })

    await expect(
      installKit(board.root, 'acme', findKit(board.root, 'clean')),
    ).rejects.toMatchObject({ code: 'name-taken' })
    expect(existsSync(join(board.root, 'acme/tokens.css'))).toBe(false)
  })

  it('refuses kit-invalid for a folder with no kit.json, writing nothing', async () => {
    board = writeBoard({ ...PROJECT, 'kits/empty/tokens.css': ':root {}\n' })

    await expect(
      installKit(board.root, 'acme', {
        name: 'empty',
        path: join(board.root, 'kits/empty'),
      }),
    ).rejects.toMatchObject({ code: 'kit-invalid' })
    expect(existsSync(join(board.root, 'acme/tokens.css'))).toBe(false)
  })
})
