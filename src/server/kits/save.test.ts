import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { recordingJournal } from '../../../test/support/recording-journal'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { installKit } from './install'
import { findKit, listKits } from './list'
import { saveKit } from './save'

const TWO_PROJECTS = {
  'acme/project.json': '{ "version": 1, "pages": [] }\n',
  'beta/project.json': '{ "version": 1, "pages": [] }\n',
}

function read(board: TempBoard, path: string): string {
  return readFileSync(join(board.root, path), 'utf8')
}

/** A project holding one project-wide kit, as an install before per-frame kits left it. */
const PROJECT_WIDE_KIT = {
  'acme/tokens.css': ':root { --accent: teal }\n',
  'acme/assets/kit/kit.json':
    '{ "version": 1, "title": "Sketch", "description": "Hand drawn", "preview": "sample" }\n',
  'acme/assets/kit/kit.css': '.kit-card { border: 2px solid }\n',
  'acme/kit/layout.json':
    '{ "version": 1, "frames": { "sample": { "x": 0, "y": 0, "width": 480, "height": 300, "order": 0 } } }\n',
  'acme/kit/sample.html': '<!doctype html><title>sample</title>\n',
}

describe('saveKit', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  it('saves a project that installs into another project unchanged', async () => {
    board = writeBoard({ ...TWO_PROJECTS, ...PROJECT_WIDE_KIT })

    await saveKit(board.root, 'acme', 'brainstorm')
    await installKit(board.root, 'beta', findKit(board.root, 'brainstorm'))

    const added = 'beta/assets/kits/brainstorm'
    expect(read(board, `${added}/tokens.css`)).toBe(
      read(board, 'acme/tokens.css'),
    )
    expect(read(board, `${added}/kit.css`)).toBe(
      read(board, 'acme/assets/kit/kit.css'),
    )
    expect(read(board, `${added}/kit/sample.html`)).toBe(
      read(board, 'acme/kit/sample.html'),
    )
  })

  it("lists the saved kit with the project's name and the installed kit's preview", async () => {
    board = writeBoard({ ...TWO_PROJECTS, ...PROJECT_WIDE_KIT })

    await saveKit(board.root, 'acme', 'brainstorm')

    expect((await listKits(board.root)).at(-1)).toEqual({
      name: 'brainstorm',
      title: 'brainstorm',
      description: 'Saved from acme',
      source: 'board',
      preview: { frame: 'sample', width: 480, height: 300 },
    })
  })

  it('saves a project with no kit page or kit files as its tokens and a stub note', async () => {
    board = writeBoard({
      ...TWO_PROJECTS,
      'acme/tokens.css': ':root { --accent: teal }\n',
    })

    await saveKit(board.root, 'acme', 'teal')

    expect(readdirSync(join(board.root, '.kits/teal')).sort()).toEqual([
      'kit.json',
      'kit.md',
      'tokens.css',
    ])
    expect(read(board, '.kits/teal/kit.md')).toContain('Saved from the acme')
  })

  it('saves the board sheet where the project has none of its own', async () => {
    board = writeBoard({
      ...TWO_PROJECTS,
      'tokens.css': ':root { --accent: plum }\n',
    })

    await saveKit(board.root, 'acme', 'plum')

    expect(read(board, '.kits/plum/tokens.css')).toBe(
      ':root { --accent: plum }\n',
    )
  })

  it('reports the saved kit to the journal', async () => {
    board = writeBoard({ ...TWO_PROJECTS, 'acme/tokens.css': ':root {}\n' })
    const { journal, calls } = recordingJournal(board.root)

    await saveKit(board.root, 'acme', 'mine', { journal })

    expect(calls).toEqual([{ kind: 'created', path: '.kits/mine' }])
  })

  it.each([
    ['a shipped kit', 'Sketch'],
    ['a saved kit', 'mine'],
  ])(
    'refuses name-taken for the name of %s, leaving it as it was',
    async (_case, name) => {
      board = writeBoard({
        ...TWO_PROJECTS,
        'acme/tokens.css': ':root { --accent: teal }\n',
        '.kits/mine/kit.json':
          '{ "version": 1, "title": "Mine", "description": "" }\n',
        '.kits/mine/tokens.css': ':root { --accent: red }\n',
      })

      await expect(saveKit(board.root, 'acme', name)).rejects.toMatchObject({
        code: 'name-taken',
      })
      expect(read(board, '.kits/mine/tokens.css')).toBe(
        ':root { --accent: red }\n',
      )
    },
  )

  it('refuses tokens-not-found for a project no sheet reaches, writing nothing', async () => {
    board = writeBoard(TWO_PROJECTS)

    await expect(saveKit(board.root, 'acme', 'bare')).rejects.toMatchObject({
      code: 'tokens-not-found',
    })
    expect(existsSync(join(board.root, '.kits'))).toBe(false)
  })

  it('refuses invalid-name for a name a folder cannot take', async () => {
    board = writeBoard({ ...TWO_PROJECTS, 'acme/tokens.css': ':root {}\n' })

    await expect(saveKit(board.root, 'acme', '../out')).rejects.toMatchObject({
      code: 'invalid-name',
    })
  })
})
