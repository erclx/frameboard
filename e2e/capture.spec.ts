import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { expect, type Page, test } from '@playwright/test'

const CLI = resolve('dist/cli.js')
const ROOT = resolve('test/fixtures/boards/capture')
const run = promisify(execFile)

interface Image {
  ref: string
  theme: 'light' | 'dark'
  path: string
  width: number
  height: number
}

interface Envelope {
  ok: boolean
  data?: { images: Image[] } & Record<string, unknown>
  error?: { code: string; message: string; details: Record<string, unknown> }
}

/** Runs the built CLI on the capture fixture, resolving its exit code and envelope. */
async function frameboard(
  args: string[],
  root = ROOT,
): Promise<{ exitCode: number; envelope: Envelope }> {
  try {
    const { stdout } = await run('node', [
      CLI,
      ...args,
      '--root',
      root,
      '--json',
    ])
    return { exitCode: 0, envelope: JSON.parse(stdout) }
  } catch (error) {
    const failed = error as { code: number; stdout: string }
    return { exitCode: failed.code, envelope: JSON.parse(failed.stdout) }
  }
}

/** The RGB of one pixel of a PNG on disk, decoded by the test's own browser. */
async function pixelAt(page: Page, path: string, x: number, y: number) {
  const base64 = readFileSync(path).toString('base64')
  return page.evaluate(
    async ({ base64, x, y }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${base64}`
      await image.decode()
      const canvas = new OffscreenCanvas(image.width, image.height)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('No 2d context.')
      context.drawImage(image, 0, 0)
      const [r, g, b] = context.getImageData(x, y, 1, 1).data
      return { r, g, b, width: image.width, height: image.height }
    },
    { base64, x, y },
  )
}

test.describe('capture', () => {
  let out: string

  test.beforeEach(() => {
    out = mkdtempSync(join(tmpdir(), 'frameboard-capture-'))
  })

  test.afterEach(() => {
    rmSync(out, { recursive: true, force: true })
  })

  test('captures a frame in both themes, each with its own fill', async ({
    page,
  }) => {
    const { exitCode, envelope } = await frameboard([
      'capture',
      'home/hero',
      '--out',
      out,
    ])

    expect(exitCode).toBe(0)
    const images = envelope.data?.images ?? []
    expect(images.map(({ theme, path }) => ({ theme, path }))).toEqual([
      { theme: 'light', path: join(out, 'studio/home/hero.light.png') },
      { theme: 'dark', path: join(out, 'studio/home/hero.dark.png') },
    ])
    expect(
      await pixelAt(page, join(out, 'studio/home/hero.light.png'), 2, 2),
    ).toEqual({
      r: 255,
      g: 255,
      b: 255,
      width: 400,
      height: 300,
    })
    expect(
      await pixelAt(page, join(out, 'studio/home/hero.dark.png'), 2, 2),
    ).toEqual({
      r: 17,
      g: 17,
      b: 17,
      width: 400,
      height: 300,
    })
  })

  test('captures the one theme asked for', async () => {
    const { envelope } = await frameboard([
      'capture',
      'home/hero',
      '--theme',
      'dark',
      '--out',
      out,
    ])

    expect(envelope.data?.images.map((image) => image.theme)).toEqual(['dark'])
    expect(existsSync(join(out, 'studio/home/hero.light.png'))).toBe(false)
  })

  test('font: refuses a frame naming an absent family, writing no file', async () => {
    const { exitCode, envelope } = await frameboard([
      'capture',
      'fonts/brand',
      '--out',
      out,
    ])

    expect(exitCode).toBe(10)
    expect(envelope.error).toMatchObject({
      code: 'font-missing',
      details: { ref: 'studio/fonts/brand', family: 'Brand', element: 7 },
    })
    expect(existsSync(join(out, 'studio'))).toBe(false)
  })

  test('font: captures a frame loading Geist from its assets', async () => {
    const { exitCode } = await frameboard([
      'capture',
      'home/geist',
      '--out',
      out,
    ])

    expect(exitCode).toBe(0)
    expect(existsSync(join(out, 'studio/home/geist.dark.png'))).toBe(true)
  })

  test('font: captures a frame naming only generic families', async () => {
    const { exitCode } = await frameboard([
      'capture',
      'fonts/plain',
      '--out',
      out,
    ])

    expect(exitCode).toBe(0)
  })
})
