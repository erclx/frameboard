import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { captureResultSchema } from '@/shared/records/capture'

import { cli } from '../../../test/support/cli'
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
vi.mock('@/server/capture/images', () => ({
  captureFrameImages: async (
    _browser: unknown,
    {
      frames,
      themes,
      out,
    }: {
      frames: {
        ref: string
        project: string
        page: string
        name: string
        box: { width: number; height: number }
      }[]
      themes: string[]
      out: string
    },
  ) =>
    frames.flatMap((frame) =>
      themes.map((theme) => ({
        ref: frame.ref,
        theme,
        path: join(
          out,
          frame.project,
          frame.page,
          `${frame.name}.${theme}.png`,
        ),
        width: frame.box.width,
        height: frame.box.height,
      })),
    ),
}))

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
        },
        {
          ref: 'studio/home/hero',
          theme: 'dark',
          path: join(board.root, 'shots/studio/home/hero.dark.png'),
          width: 400,
          height: 300,
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
})
