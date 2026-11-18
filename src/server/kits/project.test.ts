import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { scanProject } from '../board/scan'
import { projectKitNames } from './project'

const FRAME = '<!doctype html><title>frame</title>\n'

function entry(kit?: unknown): object {
  return { x: 0, y: 0, width: 100, height: 100, order: 0, kit }
}

/** A project with three frames on two pages, each naming the kit given for it. */
function project(kits: Record<'hero' | 'pricing' | 'about', unknown>) {
  return {
    'acme/project.json': '{ "version": 1, "pages": ["home", "more"] }\n',
    'acme/home/hero.html': FRAME,
    'acme/home/pricing.html': FRAME,
    'acme/more/about.html': FRAME,
    'acme/home/layout.json': JSON.stringify({
      version: 1,
      frames: { hero: entry(kits.hero), pricing: entry(kits.pricing) },
    }),
    'acme/more/layout.json': JSON.stringify({
      version: 1,
      frames: { about: entry(kits.about) },
    }),
  }
}

const PLAIN = { hero: undefined, pricing: undefined, about: undefined }

const SKETCH = {
  'acme/assets/kits/sketch/kit.json':
    '{ "version": 1, "title": "Sketch", "description": "Hand drawn" }\n',
  'acme/assets/kits/sketch/tokens.css': ':root { --accent: teal }\n',
}

describe('a project’s kits', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  it('lists each added kit by name with its title and the frames naming it across pages', async () => {
    board = writeBoard({
      ...project({ hero: 'sketch', pricing: undefined, about: 'sketch' }),
      ...SKETCH,
      'acme/assets/kits/wireframe/kit.json':
        '{ "version": 1, "title": "Wireframe", "description": "Greys" }\n',
    })

    const { kits } = await scanProject(board.root, 'acme')

    expect(kits).toEqual([
      { name: 'sketch', title: 'Sketch', frameCount: 2 },
      { name: 'wireframe', title: 'Wireframe', frameCount: 0 },
    ])
  })

  it('lists none for a project with no kits folder', async () => {
    board = writeBoard(project(PLAIN))

    const { kits } = await scanProject(board.root, 'acme')

    expect(kits).toEqual([])
  })

  it('leaves out a kit a frame names that the project does not hold', async () => {
    board = writeBoard({
      ...project({ hero: 'brand', pricing: undefined, about: undefined }),
      ...SKETCH,
    })

    const { kits } = await scanProject(board.root, 'acme')

    expect(kits).toEqual([{ name: 'sketch', title: 'Sketch', frameCount: 0 }])
  })

  it.each([
    ['no kit.json', {}],
    ['a kit.json that does not parse', { 'kit.json': '{ nope' }],
    ['a kit.json with no title', { 'kit.json': '{ "version": 1 }' }],
    ['a kit.json with a blank title', { 'kit.json': '{ "title": "  " }' }],
  ])(
    'titles a hand-built kit holding %s by its folder',
    async (_label, files) => {
      board = writeBoard({
        ...project(PLAIN),
        'acme/assets/kits/brand/kit.css': '.kit-card { border: 0 }\n',
        ...Object.fromEntries(
          Object.entries(files).map(([name, contents]) => [
            `acme/assets/kits/brand/${name}`,
            contents,
          ]),
        ),
      })

      const { kits } = await scanProject(board.root, 'acme')

      expect(kits).toEqual([{ name: 'brand', title: 'brand', frameCount: 0 }])
    },
  )

  it('skips a file, a dot folder, and a folder no frame could name', async () => {
    board = writeBoard({
      ...project(PLAIN),
      ...SKETCH,
      'acme/assets/kits/notes.txt': 'not a kit\n',
      'acme/assets/kits/.cache/kit.css': '',
      'acme/assets/kits/my kit/kit.css': '',
    })

    const names = await projectKitNames(join(board.root, 'acme'))

    expect(names).toEqual(['sketch'])
  })
})
