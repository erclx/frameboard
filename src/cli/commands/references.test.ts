import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  referencesCheckSchema,
  referencesSyncSchema,
} from '@/shared/records/references'

import { cli } from '../../../test/support/cli'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'

// The writer stands in for the browser, so these cases run the verb's own
// folder rules with no browser installed. Each PNG holds the frame's theme.
vi.mock('@/server/capture/host', () => ({
  withFrameHost: (
    _root: unknown,
    _purpose: string,
    run: (browser: unknown, baseUrl: string) => Promise<unknown>,
  ) => run({}, 'http://127.0.0.1:1'),
}))
vi.mock('@/server/capture/images', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/server/capture/images')>()
  return {
    ...real,
    captureFrameImages: async (
      _browser: unknown,
      {
        frames,
        themes,
        out,
        width,
      }: Parameters<typeof real.captureFrameImages>[1],
    ) =>
      frames.flatMap((frame) =>
        [frame.box, ...frame.widths]
          .filter((view) => width === undefined || view.width === width)
          .flatMap((view) =>
            themes.map((theme) => {
              const linked =
                view.width === frame.box.width ? undefined : view.width
              const path = real.frameImagePath(
                out,
                frame,
                theme,
                1,
                undefined,
                linked,
              )
              mkdirSync(dirname(path), { recursive: true })
              // A linked width's PNG names its width, so a case can tell it apart.
              writeFileSync(path, linked ? `${theme}@${linked}` : theme)
              return {
                ref: frame.ref,
                theme,
                path,
                width: view.width,
                height: view.height,
                scale: 1,
              }
            }),
          ),
      ),
  }
})

function placed(...frames: string[]): string {
  return JSON.stringify({
    version: 1,
    frames: Object.fromEntries(
      frames.map((name, order) => [
        name,
        { x: 0, y: 0, width: 400, height: 300, order },
      ]),
    ),
  })
}

const TWO_PROJECTS = {
  'design/home/grid.html':
    '<link rel="stylesheet" href="../assets/kit.css"><img src="../assets/icon.svg">',
  'design/home/layout.json': placed('grid'),
  'design/assets/kit.css': '@font-face { src: url("face.woff2") }',
  'design/assets/face.woff2': 'face',
  'design/assets/icon.svg': 'design icon',
  'design/assets/unused.png': 'unused',
  'launch/page/landing.html': '<img src="../assets/icon.svg">',
  'launch/page/layout.json': placed('landing'),
  'launch/assets/icon.svg': 'launch icon',
}

const FRAMES = {
  frames: {
    'home/grid': 'design/home/grid',
    'landing/page': 'launch/page/landing',
  },
}

const SYNCED = [
  'assets/design/face.woff2',
  'assets/design/icon.svg',
  'assets/design/kit.css',
  'assets/launch/icon.svg',
  'home/grid-dark.png',
  'home/grid-light.png',
  'home/grid.html',
  'landing/page-dark.png',
  'landing/page-light.png',
  'landing/page.html',
]

describe('references sync', () => {
  let board: TempBoard
  let parent: string
  let folder: string

  beforeEach(() => {
    parent = realpathSync(mkdtempSync(join(tmpdir(), 'frameboard-refs-')))
    folder = join(parent, 'refs')
    mkdirSync(folder)
  })

  afterEach(() => {
    board.cleanup()
    rmSync(parent, { recursive: true, force: true })
  })

  function hold(path: string, contents: string) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), contents)
  }

  function sync(...flags: string[]) {
    return cli(['references', 'sync', folder, ...flags, '--json'], {
      cwd: board.root,
    })
  }

  it('fills the folder with each frame and its project assets', async () => {
    board = writeBoard(TWO_PROJECTS)
    hold('frames.json', JSON.stringify(FRAMES))

    const run = await sync()

    expect(run.exitCode).toBe(0)
    expect(referencesSyncSchema.parse(run.json().data)).toEqual({
      folder,
      written: SYNCED,
      removed: [],
    })
    expect(readFileSync(join(folder, 'home/grid.html'), 'utf8')).toContain(
      '../assets/design/kit.css',
    )
  })

  describe('on a frame with linked widths', () => {
    const WIDE = {
      'design/home/grid.html': '<p>grid</p>',
      'design/home/layout.json': JSON.stringify({
        version: 1,
        frames: {
          grid: {
            x: 0,
            y: 0,
            width: 1440,
            height: 900,
            order: 0,
            widths: [
              { width: 834, height: 1194 },
              { width: 390, height: 844 },
            ],
          },
        },
      }),
    }

    it("files a frame's own width under a ref naming no width", async () => {
      board = writeBoard(WIDE)
      hold(
        'frames.json',
        JSON.stringify({ frames: { 'home/grid': 'design/home/grid' } }),
      )

      await sync()

      expect(readFileSync(join(folder, 'home/grid-light.png'), 'utf8')).toBe(
        'light',
      )
    })

    it('files the width a ref names after @', async () => {
      board = writeBoard(WIDE)
      hold(
        'frames.json',
        JSON.stringify({
          frames: {
            'home/grid': 'design/home/grid',
            'home/grid-tablet': 'design/home/grid@834',
          },
        }),
      )

      await sync()

      expect(
        readFileSync(join(folder, 'home/grid-tablet-dark.png'), 'utf8'),
      ).toBe('dark@834')
    })
  })

  it('keeps two projects holding one asset name apart', async () => {
    board = writeBoard(TWO_PROJECTS)
    hold('frames.json', JSON.stringify(FRAMES))

    await sync()

    expect(readFileSync(join(folder, 'assets/design/icon.svg'), 'utf8')).toBe(
      'design icon',
    )
    expect(readFileSync(join(folder, 'assets/launch/icon.svg'), 'utf8')).toBe(
      'launch icon',
    )
  })

  it('removes a file below the first level and keeps a top-level one', async () => {
    board = writeBoard(TWO_PROJECTS)
    hold('frames.json', JSON.stringify(FRAMES))
    hold('index.md', '# Mine')
    hold('old/gone.png', 'old')

    const run = await sync()

    expect(referencesSyncSchema.parse(run.json().data).removed).toEqual([
      'old/gone.png',
    ])
    expect(existsSync(join(folder, 'old'))).toBe(false)
    expect(readFileSync(join(folder, 'index.md'), 'utf8')).toBe('# Mine')
  })

  describe('--check', () => {
    it('passes a synced folder, whose top-level files are not stray', async () => {
      board = writeBoard(TWO_PROJECTS)
      hold('frames.json', JSON.stringify(FRAMES))
      hold('index.md', '# Mine')
      await sync()

      const run = await sync('--check')

      expect(run.exitCode).toBe(0)
      expect(referencesCheckSchema.parse(run.json().data)).toEqual({
        folder,
        changed: [],
        missing: [],
        stray: [],
        pngDiffers: [],
      })
    })

    it('exits 14 naming what differs, and writes nothing', async () => {
      board = writeBoard(TWO_PROJECTS)
      hold('frames.json', JSON.stringify(FRAMES))
      await sync()
      hold('home/grid.html', '<p>by hand</p>')
      rmSync(join(folder, 'landing/page.html'))
      hold('home/stray.png', 'stray')

      const run = await sync('--check')

      expect(run.exitCode).toBe(14)
      const { error } = run.json()
      expect(error?.code).toBe('references-stale')
      expect(referencesCheckSchema.parse(error?.details)).toEqual({
        folder,
        changed: ['home/grid.html'],
        missing: ['landing/page.html'],
        stray: ['home/stray.png'],
        pngDiffers: [],
      })
      expect(readFileSync(join(folder, 'home/grid.html'), 'utf8')).toBe(
        '<p>by hand</p>',
      )
      expect(existsSync(join(folder, 'landing/page.html'))).toBe(false)
    })

    it('passes a folder differing only in PNG bytes, warning on them', async () => {
      board = writeBoard(TWO_PROJECTS)
      hold('frames.json', JSON.stringify(FRAMES))
      await sync()
      hold('home/grid-dark.png', 'another browser build')

      const run = await sync('--check')

      expect(run.exitCode).toBe(0)
      expect(referencesCheckSchema.parse(run.json().data).pngDiffers).toEqual([
        'home/grid-dark.png',
      ])
    })

    it('leaves no capture in the board', async () => {
      board = writeBoard(TWO_PROJECTS)
      hold('frames.json', JSON.stringify(FRAMES))

      await sync('--check')

      expect(readdirSync(board.root)).not.toContain('.run')
    })
  })

  describe('refusals', () => {
    it('refuses usage for a missing folder argument', async () => {
      board = writeBoard(TWO_PROJECTS)

      const run = await cli(['references', 'sync', '--json'], {
        cwd: board.root,
      })

      expect(run.exitCode).toBe(2)
      expect(run.json().error?.code).toBe('usage')
    })

    it('refuses usage for a folder holding no frames.json', async () => {
      board = writeBoard(TWO_PROJECTS)

      const run = await sync()

      expect(run.exitCode).toBe(2)
      expect(run.json().error?.code).toBe('usage')
    })

    it('refuses a malformed map, leaving the folder as it was', async () => {
      board = writeBoard(TWO_PROJECTS)
      hold('frames.json', '{ frames')
      hold('old/kept.png', 'old')

      const run = await sync()

      expect(run.exitCode).toBe(5)
      expect(run.json().error?.code).toBe('frame-map-invalid')
      expect(existsSync(join(folder, 'old/kept.png'))).toBe(true)
    })

    it('refuses frame-not-found listing every missing ref, leaving the folder as it was', async () => {
      board = writeBoard(TWO_PROJECTS)
      hold(
        'frames.json',
        JSON.stringify({
          frames: {
            'home/grid': 'design/home/grid',
            'home/a': 'design/home/gone-a',
            'home/b': 'design/home/gone-b',
          },
        }),
      )
      hold('old/kept.png', 'old')

      const run = await sync()

      expect(run.exitCode).toBe(3)
      const { error } = run.json()
      expect(error?.code).toBe('frame-not-found')
      expect(error?.details).toEqual({
        missing: ['design/home/gone-a', 'design/home/gone-b'],
      })
      expect(existsSync(join(folder, 'old/kept.png'))).toBe(true)
    })

    it('refuses frame-not-found for a width the frame does not show at', async () => {
      board = writeBoard(TWO_PROJECTS)
      hold(
        'frames.json',
        JSON.stringify({ frames: { 'home/grid': 'design/home/grid@390' } }),
      )

      const run = await sync()

      expect(run.json().error?.details).toEqual({
        missing: ['design/home/grid@390'],
      })
    })

    it('refuses a frame the formatter cannot parse, leaving the folder as it was', async () => {
      board = writeBoard({
        ...TWO_PROJECTS,
        'design/home/grid.html':
          '<div style="font-family:Geist,"DejaVu Sans",sans-serif">x</div>',
      })
      hold('frames.json', JSON.stringify(FRAMES))
      hold('old/kept.png', 'old')

      const run = await sync()

      expect(run.exitCode).toBe(10)
      expect(run.json().error?.code).toBe('format-refused')
      expect(existsSync(join(folder, 'old/kept.png'))).toBe(true)
    })
  })
})
