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

function read(board: TempBoard, path: string): string {
  return readFileSync(join(board.root, path), 'utf8')
}

describe('installKit', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  it("copies the kit's folder into the project's assets/kits, samples included", async () => {
    board = writeBoard(PROJECT)

    await installKit(board.root, 'acme', findKit(board.root, 'sketch'))

    const kit = join(board.root, 'acme/assets/kits/sketch')
    expect(readdirSync(kit).sort()).toEqual([
      'kit',
      'kit.css',
      'kit.json',
      'kit.md',
      'tokens.css',
    ])
    expect(readdirSync(join(kit, 'kit')).sort()).toEqual([
      'layout.json',
      'parts.html',
      'sample.html',
    ])
    expect(read(board, 'acme/assets/kits/sketch/tokens.css')).toBe(
      readFileSync(join(shippedKitsDir(), 'sketch/tokens.css'), 'utf8'),
    )
  })

  it.each([
    ['a project sheet', 'acme/tokens.css'],
    ['a board sheet', 'tokens.css'],
  ])(
    'adds a kit where %s reaches the project and leaves that sheet untouched',
    async (_case, sheet) => {
      board = writeBoard({ ...PROJECT, [sheet]: ':root { --accent: red }\n' })

      await installKit(board.root, 'acme', findKit(board.root, 'clean'))

      expect(read(board, sheet)).toBe(':root { --accent: red }\n')
      expect(existsSync(join(board.root, 'acme/assets/kits/clean'))).toBe(true)
    },
  )

  it('writes no project sheet and no page', async () => {
    board = writeBoard(PROJECT)

    await installKit(board.root, 'acme', findKit(board.root, 'clean'))

    expect(readdirSync(join(board.root, 'acme')).sort()).toEqual([
      'assets',
      'home',
      'project.json',
    ])
  })

  it('adds a second kit beside the first', async () => {
    board = writeBoard(PROJECT)
    await installKit(board.root, 'acme', findKit(board.root, 'clean'))

    await installKit(board.root, 'acme', findKit(board.root, 'sketch'))

    expect(readdirSync(join(board.root, 'acme/assets/kits')).sort()).toEqual([
      'clean',
      'sketch',
    ])
  })

  it('answers the project, the kit, and the folder it wrote', async () => {
    board = writeBoard(PROJECT)

    const record = await installKit(
      board.root,
      'acme',
      findKit(board.root, 'clean'),
    )

    expect(record).toEqual({
      project: 'acme',
      kit: 'clean',
      written: [join(board.root, 'acme/assets/kits/clean')],
    })
  })

  it('adds a kit from a folder that carries no sample page', async () => {
    board = writeBoard({ ...PROJECT, ...FOLDER_KIT })

    await installKit(board.root, 'acme', {
      name: 'plain',
      path: join(board.root, 'kits/plain'),
    })

    expect(
      readdirSync(join(board.root, 'acme/assets/kits/plain')).sort(),
    ).toEqual(['kit.css', 'kit.json', 'kit.md', 'tokens.css'])
  })

  it.each([
    ['a project with no assets folder', {}, 'acme/assets'],
    [
      'a project holding assets and no kits',
      { 'acme/assets/logo.svg': '<svg />' },
      'acme/assets/kits',
    ],
    [
      'a project holding another kit',
      { 'acme/assets/kits/brand/kit.css': '' },
      'acme/assets/kits/clean',
    ],
  ])(
    'reports the topmost folder it made to the journal for %s, so one undo takes the install back',
    async (_case, files, made) => {
      board = writeBoard({ ...PROJECT, ...files })
      const { journal, calls } = recordingJournal(board.root)

      await installKit(board.root, 'acme', findKit(board.root, 'clean'), {
        journal,
      })

      expect(calls).toEqual([{ kind: 'created', path: made }])
    },
  )

  it.each([
    ['the same name', 'clean'],
    ['a name differing only in case', 'Clean'],
  ])(
    'refuses name-taken where the project holds a kit under %s, leaving it as it was',
    async (_case, held) => {
      board = writeBoard({
        ...PROJECT,
        [`acme/assets/kits/${held}/kit.css`]: '.kit-card { border: 0 }\n',
      })

      await expect(
        installKit(board.root, 'acme', findKit(board.root, 'clean')),
      ).rejects.toMatchObject({
        code: 'name-taken',
        details: { project: 'acme', kit: held },
      })
      expect(readdirSync(join(board.root, `acme/assets/kits/${held}`))).toEqual(
        ['kit.css'],
      )
    },
  )

  it('refuses invalid-name for a folder whose name no frame could name, writing nothing', async () => {
    board = writeBoard({
      ...PROJECT,
      'kits/my kit/kit.json':
        '{ "version": 1, "title": "Mine", "description": "" }\n',
      'kits/my kit/tokens.css': ':root {}\n',
    })

    await expect(
      installKit(board.root, 'acme', {
        name: 'my kit',
        path: join(board.root, 'kits/my kit'),
      }),
    ).rejects.toMatchObject({ code: 'invalid-name' })
    expect(existsSync(join(board.root, 'acme/assets'))).toBe(false)
  })

  it('refuses kit-invalid for a folder with no kit.json, writing nothing', async () => {
    board = writeBoard({ ...PROJECT, 'kits/empty/tokens.css': ':root {}\n' })

    await expect(
      installKit(board.root, 'acme', {
        name: 'empty',
        path: join(board.root, 'kits/empty'),
      }),
    ).rejects.toMatchObject({ code: 'kit-invalid' })
    expect(existsSync(join(board.root, 'acme/assets'))).toBe(false)
  })
})
