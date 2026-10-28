import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { captureResultSchema } from '@/shared/records/capture'

import { cli } from '../../../test/support/cli'
import { launchShellOrNull } from '../../../test/support/headless-shell'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'

// The writer stands in for the browser, so these cases run the verb's own
// parsing, resolution, and envelope with no browser installed.
vi.mock('@/server/capture/host', () => ({
  withFrameHost: (
    _root: string,
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
        scale,
      }: Parameters<typeof real.captureFrameImages>[1],
    ) =>
      frames.flatMap((frame) =>
        themes.map((theme) => ({
          ref: frame.ref,
          theme,
          path: real.frameImagePath(out, frame, theme, scale),
          width: frame.box.width,
          height: frame.box.height,
          scale,
        })),
      ),
    captureComposite: async (
      _browser: unknown,
      { page, themes, out, scale }: Parameters<typeof real.captureComposite>[1],
    ) =>
      themes.map((theme) => ({
        ref: page.ref,
        theme,
        path: real.compositeImagePath(out, page, theme, scale),
        width: 1,
        height: 1,
        scale,
      })),
  }
})

const shell = await launchShellOrNull()
await shell?.close()

const PAGE = {
  'studio/home/hero.html': '<p>Hello</p>',
  'studio/home/about.html': '<p>About</p>',
  'studio/home/secret.html': '<p>Hidden</p>',
  'studio/home/layout.json': JSON.stringify({
    version: 1,
    frames: {
      hero: { x: 0, y: 0, width: 400, height: 300, order: 0 },
      about: { x: 480, y: 0, width: 400, height: 300, order: 1 },
      secret: { x: 0, y: 400, width: 400, height: 300, order: 2, hidden: true },
    },
  }),
}

const HERO = {
  'studio/home/hero.html': '<p>Hello</p>',
  'studio/home/layout.json': JSON.stringify({
    version: 1,
    frames: { hero: { x: 0, y: 0, width: 400, height: 300, order: 0 } },
  }),
}

describe('capture', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  function capture(args: string[]) {
    return cli(['capture', ...args, '--json'], { cwd: board.root })
  }

  it('returns one image per theme in a capture record', async () => {
    board = writeBoard(HERO)

    const run = await capture(['home/hero', '--out', 'shots'])

    expect(run.exitCode).toBe(0)
    expect(captureResultSchema.parse(run.json().data)).toEqual({
      images: [
        {
          ref: 'studio/home/hero',
          theme: 'light',
          path: join(board.root, 'shots/studio/home/hero.light.png'),
          width: 400,
          height: 300,
          scale: 1,
        },
        {
          ref: 'studio/home/hero',
          theme: 'dark',
          path: join(board.root, 'shots/studio/home/hero.dark.png'),
          width: 400,
          height: 300,
          scale: 1,
        },
      ],
    })
  })

  it("lands images in the board's ignored .run/captures/ with no --out", async () => {
    board = writeBoard(HERO)

    const run = await capture(['home/hero', '--theme', 'light'])

    expect(run.json().data).toMatchObject({
      images: [
        { path: join(board.root, '.run/captures/studio/home/hero.light.png') },
      ],
    })
    expect(readFileSync(join(board.root, '.run/.gitignore'), 'utf8')).toBe(
      '*\n',
    )
  })

  it('refuses frame-not-found, exit 3, for a frame the page lacks', async () => {
    board = writeBoard(HERO)

    const run = await capture(['home/missing'])

    expect(run.exitCode).toBe(3)
    expect(run.json().error?.code).toBe('frame-not-found')
    expect(existsSync(join(board.root, '.run'))).toBe(false)
  })

  it('refuses a theme outside light, dark, and both as usage', async () => {
    board = writeBoard(HERO)

    const run = await capture(['home/hero', '--theme', 'sepia'])

    expect(run.exitCode).toBe(2)
    expect(run.json().error?.code).toBe('usage')
  })

  it('names a scaled image with its scale and keeps the layout box', async () => {
    board = writeBoard(HERO)

    const run = await capture([
      'home/hero',
      '--theme',
      'light',
      '--scale',
      '2',
      '--out',
      'shots',
    ])

    expect(captureResultSchema.parse(run.json().data).images).toEqual([
      {
        ref: 'studio/home/hero',
        theme: 'light',
        path: join(board.root, 'shots/studio/home/hero.light@2x.png'),
        width: 400,
        height: 300,
        scale: 2,
      },
    ])
  })

  it('names a scaled composite with its scale', async () => {
    board = writeBoard(PAGE)

    const run = await capture([
      '--page',
      'home',
      '--composite',
      '--theme',
      'dark',
      '--scale',
      '3',
      '--out',
      'shots',
    ])

    expect(run.json().data).toMatchObject({
      images: [{ path: join(board.root, 'shots/studio/home.dark@3x.png') }],
    })
  })

  it.each(['0', '4', '1.5', '2x'])(
    'refuses a scale of %s as usage',
    async (scale) => {
      board = writeBoard(HERO)

      const run = await capture(['home/hero', '--scale', scale])

      expect(run.exitCode).toBe(2)
      expect(run.json().error?.code).toBe('usage')
    },
  )

  it('captures every visible frame of a page with --page, leaving hidden ones out', async () => {
    board = writeBoard(PAGE)

    const run = await capture(['--page', 'home', '--theme', 'light'])

    expect(run.exitCode).toBe(0)
    expect(
      captureResultSchema
        .parse(run.json().data)
        .images.map((image) => image.ref),
    ).toEqual(['studio/home/hero', 'studio/home/about'])
  })

  it('reads a two-part --page as a project and page', async () => {
    board = writeBoard(PAGE)

    const run = await capture(['--page', 'studio/home', '--theme', 'light'])

    expect(run.exitCode).toBe(0)
  })

  it('writes one composite per theme with --composite', async () => {
    board = writeBoard(PAGE)

    const run = await capture([
      '--page',
      'home',
      '--composite',
      '--out',
      'shots',
    ])

    expect(run.json().data).toEqual({
      images: [
        expect.objectContaining({
          ref: 'studio/home',
          theme: 'light',
          path: join(board.root, 'shots/studio/home.light.png'),
        }),
        expect.objectContaining({
          ref: 'studio/home',
          theme: 'dark',
          path: join(board.root, 'shots/studio/home.dark.png'),
        }),
      ],
    })
  })

  it('captures nothing from a page holding only hidden frames', async () => {
    board = writeBoard({
      'studio/home/secret.html': '<p>Hidden</p>',
      'studio/home/layout.json': JSON.stringify({
        version: 1,
        frames: {
          secret: {
            x: 0,
            y: 0,
            width: 400,
            height: 300,
            order: 0,
            hidden: true,
          },
        },
      }),
    })

    const run = await capture(['--page', 'home', '--composite'])

    expect(run.exitCode).toBe(0)
    expect(run.json().data).toEqual({ images: [] })
    expect(existsSync(join(board.root, '.run'))).toBe(false)
  })

  it('refuses a frame ref and --page together as usage', async () => {
    board = writeBoard(PAGE)

    const run = await capture(['home/hero', '--page', 'home'])

    expect(run.exitCode).toBe(2)
    expect(run.json().error?.code).toBe('usage')
  })

  it('refuses neither a frame ref nor --page as usage', async () => {
    board = writeBoard(PAGE)

    const run = await capture([])

    expect(run.exitCode).toBe(2)
    expect(run.json().error?.code).toBe('usage')
  })

  it('refuses --composite with no --page as usage', async () => {
    board = writeBoard(PAGE)

    const run = await capture(['home/hero', '--composite'])

    expect(run.exitCode).toBe(2)
    expect(run.json().error?.code).toBe('usage')
  })
})

// Skipped where the headless shell is not installed, as on the unit job.
describe.skipIf(shell === null)('capture from source', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  // A child process, since the mocks above stand in for the browser in this
  // file only. Caveat, since Geist can pass as an installed font and prove
  // nothing.
  it('loads a bundled face when the CLI runs from source', () => {
    board = writeBoard({
      'studio/home/hero.html': '<p style="font-family: Caveat">Hello</p>',
      'studio/home/layout.json': HERO['studio/home/layout.json'],
    })

    const run = spawnSync(
      'bun',
      [
        fileURLToPath(new URL('../index.ts', import.meta.url)),
        'capture',
        'studio/home/hero',
        '--theme',
        'light',
        '--json',
      ],
      { cwd: board.root, encoding: 'utf8' },
    )

    expect(JSON.parse(run.stdout).ok).toBe(true)
  }, 60_000)

  it('writes a 2x image at twice the layout box', () => {
    board = writeBoard(HERO)

    const run = spawnSync(
      'bun',
      [
        fileURLToPath(new URL('../index.ts', import.meta.url)),
        'capture',
        'studio/home/hero',
        '--theme',
        'light',
        '--scale',
        '2',
        '--json',
      ],
      { cwd: board.root, encoding: 'utf8' },
    )
    const [image] = captureResultSchema.parse(
      JSON.parse(run.stdout).data,
    ).images
    const bytes = readFileSync(image?.path ?? '')

    // A PNG's IHDR chunk holds its width and height at bytes 16 and 20.
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([800, 600])
  }, 60_000)
})
