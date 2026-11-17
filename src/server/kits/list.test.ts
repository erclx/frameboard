import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { findKit, listKits, readKit, shippedKitsDir } from './list'

const SAVED_KIT = {
  '.kits/mine/kit.json':
    '{ "version": 1, "title": "Mine", "description": "Saved from acme" }\n',
  '.kits/mine/tokens.css': ':root { --accent: red }\n',
}

describe('listKits', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  it('lists the shipped kits in picker order with their preview size', async () => {
    board = writeBoard({})

    const kits = await listKits(board.root)

    expect(kits).toEqual([
      {
        name: 'clean',
        title: 'Clean',
        description: 'The starter look',
        source: 'shipped',
        preview: { frame: 'sample', width: 480, height: 300 },
      },
      expect.objectContaining({ name: 'sketch', title: 'Sketch' }),
      expect.objectContaining({ name: 'wireframe', title: 'Wireframe' }),
    ])
  })

  it("lists the board's saved kits after the shipped ones", async () => {
    board = writeBoard(SAVED_KIT)

    const kits = await listKits(board.root)

    expect(kits.at(-1)).toEqual({
      name: 'mine',
      title: 'Mine',
      description: 'Saved from acme',
      source: 'board',
      preview: null,
    })
  })

  it.each([
    ['a kit.json that does not parse', { '.kits/bad/kit.json': '{ nope' }],
    [
      'a sample page whose layout does not parse',
      {
        '.kits/bad/kit.json':
          '{ "version": 1, "title": "Bad", "description": "", "preview": "sample" }\n',
        '.kits/bad/tokens.css': ':root {}\n',
        '.kits/bad/kit/sample.html': '<p>sample</p>\n',
        '.kits/bad/kit/layout.json': '{ nope',
      },
    ],
  ])(
    'still lists the shipped kits beside a saved kit holding %s',
    async (_case, files) => {
      board = writeBoard(files)

      const kits = await listKits(board.root)

      expect(kits.map((kit) => kit.name)).toEqual([
        'clean',
        'sketch',
        'wireframe',
      ])
    },
  )

  it('leaves out a folder in the kits folder holding no kit.json', async () => {
    board = writeBoard({ '.kits/stray/tokens.css': ':root {}\n' })

    const kits = await listKits(board.root)

    expect(kits.map((kit) => kit.name)).toEqual([
      'clean',
      'sketch',
      'wireframe',
    ])
  })
})

describe('findKit', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  it('finds a shipped kit before a saved kit of the same name', () => {
    board = writeBoard({
      '.kits/sketch/kit.json':
        '{ "version": 1, "title": "Mine", "description": "" }\n',
    })

    const kit = findKit(board.root, 'sketch')

    expect(kit).toEqual({
      name: 'sketch',
      source: 'shipped',
      path: join(shippedKitsDir(), 'sketch'),
    })
  })

  it('finds a kit saved into the board', () => {
    board = writeBoard(SAVED_KIT)

    expect(findKit(board.root, 'mine').source).toBe('board')
  })

  it.each([['missing'], ['../escape']])(
    'refuses kit-not-found for %s',
    (name) => {
      board = writeBoard({})

      expect(() => findKit(board.root, name)).toThrow(
        expect.objectContaining({ code: 'kit-not-found' }),
      )
    },
  )
})

describe('readKit', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  it('refuses kit-invalid for a kit.json that does not parse', async () => {
    board = writeBoard({ 'kit/kit.json': '{ nope', 'kit/tokens.css': '' })

    await expect(
      readKit({ name: 'kit', source: 'board', path: join(board.root, 'kit') }),
    ).rejects.toMatchObject({ code: 'kit-invalid' })
  })

  it('refuses kit-invalid for a kit with no token sheet', async () => {
    board = writeBoard({
      'kit/kit.json': '{ "version": 1, "title": "Kit", "description": "" }\n',
    })

    await expect(
      readKit({ name: 'kit', source: 'board', path: join(board.root, 'kit') }),
    ).rejects.toMatchObject({ code: 'kit-invalid' })
  })
})

describe('shippedKitsDir', () => {
  it('reads the kits folder beside a built bundle', () => {
    expect(shippedKitsDir('file:///pkg/dist/cli.js')).toBe('/pkg/dist/kits')
  })
})
