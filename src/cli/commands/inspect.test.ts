import { afterEach, describe, expect, it, vi } from 'vitest'

import { cli } from '../../../test/support/cli'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'

// The headless shell is absent, so the real launcher's refusal is what the
// verb surfaces.
vi.mock('playwright-core', () => ({
  chromium: {
    launch: async () => {
      throw new Error("Executable doesn't exist")
    },
  },
}))

const HERO = {
  'studio/home/hero.html': '<p>Hello</p>',
  'studio/home/layout.json': JSON.stringify({
    version: 1,
    frames: { hero: { x: 0, y: 0, width: 400, height: 300, order: 0 } },
  }),
}

describe('inspect', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  function inspect(args: string[]) {
    return cli(['inspect', ...args, '--json'], { cwd: board.root })
  }

  it('refuses a theme that is neither light nor dark', async () => {
    board = writeBoard(HERO)

    const run = await inspect(['home/hero', '--theme', 'both'])

    expect(run.exitCode).toBe(2)
    expect(run.json().error?.code).toBe('usage')
  })

  it('refuses a frame ref that names no frame, exiting 3', async () => {
    board = writeBoard(HERO)

    const run = await inspect(['home/missing'])

    expect(run.exitCode).toBe(3)
    expect(run.json().error?.code).toBe('frame-not-found')
  })

  it('refuses browser-not-found with the install command, exiting 9', async () => {
    board = writeBoard(HERO)

    const run = await inspect(['home/hero'])

    expect(run.exitCode).toBe(9)
    expect(run.json().error).toMatchObject({
      code: 'browser-not-found',
      message: expect.stringContaining('install chromium-headless-shell'),
    })
  })
})
