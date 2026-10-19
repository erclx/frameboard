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

  test('page: writes one PNG per visible frame, leaving the hidden one out', async () => {
    const { exitCode, envelope } = await frameboard([
      'capture',
      '--page',
      'home',
      '--theme',
      'light',
      '--out',
      out,
    ])

    expect(exitCode).toBe(0)
    expect(envelope.data?.images.map((image) => image.path)).toEqual([
      join(out, 'studio/home/hero.light.png'),
      join(out, 'studio/home/geist.light.png'),
    ])
    expect(existsSync(join(out, 'studio/home/hidden.light.png'))).toBe(false)
  })

  test('page: places each frame of a composite at its layout offset', async ({
    page,
  }) => {
    const { envelope } = await frameboard([
      'capture',
      '--page',
      'home',
      '--composite',
      '--theme',
      'light',
      '--out',
      out,
    ])
    const path = join(out, 'studio/home.light.png')

    expect(envelope.data?.images).toEqual([
      { ref: 'studio/home', theme: 'light', path, width: 880, height: 400 },
    ])
    // hero sits at 0,0 and geist at 480,120, each shifted 40 px in.
    expect(await pixelAt(page, path, 42, 42)).toMatchObject({
      r: 255,
      g: 255,
      b: 255,
    })
    expect(await pixelAt(page, path, 522, 162)).toMatchObject({
      r: 244,
      g: 244,
      b: 245,
    })
  })

  test('page: leaves the hidden frame out of the composite', async ({
    page,
  }) => {
    await frameboard([
      'capture',
      '--page',
      'home',
      '--composite',
      '--theme',
      'dark',
      '--out',
      out,
    ])
    const path = join(out, 'studio/home.dark.png')

    // The hidden frame's magenta would fill 0,400 shifted in, past the bounds.
    expect((await pixelAt(page, path, 0, 0)).height).toBe(400)
    expect(await pixelAt(page, path, 42, 398)).not.toMatchObject({
      r: 255,
      g: 0,
      b: 255,
    })
  })

  test('page: refuses the whole page when one frame lacks a font, writing nothing', async () => {
    const { exitCode, envelope } = await frameboard([
      'capture',
      '--page',
      'fonts',
      '--out',
      out,
    ])

    expect(exitCode).toBe(10)
    expect(envelope.error?.code).toBe('font-missing')
    expect(existsSync(join(out, 'studio'))).toBe(false)
  })
})
