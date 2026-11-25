import { execFile } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { expect, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'

const CLI = resolve('dist/cli.js')
const run = promisify(execFile)

/** A 1 by 1 PNG, small enough to inline and real enough to decode. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

test.describe('assets tab', () => {
  let board: FixtureBoard
  let server: BoardServer

  test.beforeEach(async () => {
    board = copyFixtureBoard('basic')
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('journey: a dropped file lands in assets, copies a path a frame resolves, and links clean', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: new URL(server.url).origin,
    })
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    await page.getByRole('tab', { name: 'Assets' }).click()
    await expect(page.getByText('assets/ · 0 files')).toBeVisible()

    await page.evaluate(
      (bytes) => {
        const transfer = new DataTransfer()
        transfer.items.add(
          new File([new Uint8Array(bytes)], 'Hero Shot.png', {
            type: 'image/png',
          }),
        )
        document.querySelector('[aria-busy]')?.dispatchEvent(
          new DragEvent('drop', {
            dataTransfer: transfer,
            bubbles: true,
            cancelable: true,
          }),
        )
      },
      [...PNG],
    )

    await expect(page.getByText('assets/ · 1 file')).toBeVisible()
    const stored = join(board.root, 'webapp/assets/Hero-Shot.png')
    expect(readFileSync(stored).equals(PNG)).toBe(true)

    await page
      .getByRole('button', { name: /Copy path of Hero-Shot.png/ })
      .click()
    await expect(page.getByText('Copied')).toBeVisible()
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toBe('../assets/Hero-Shot.png')

    const frame = new URL('/frames/webapp/home/hero.html', server.url)
    const resolved = new URL(copied, frame)
    expect(resolved.pathname).toBe('/frames/webapp/assets/Hero-Shot.png')
    const served = await fetch(resolved)
    expect(Buffer.from(await served.arrayBuffer()).equals(PNG)).toBe(true)

    writeFileSync(
      join(board.root, 'webapp/home/gallery.html'),
      `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>gallery</title></head><body><img src="${copied}" alt="" /></body></html>`,
    )
    const { stdout } = await run('node', [
      CLI,
      'check',
      'webapp/home/gallery',
      '--root',
      board.root,
      '--json',
    ])
    const findings: { rule?: string; id?: string }[] =
      JSON.parse(stdout).data.findings
    expect(findings.filter((f) => (f.rule ?? f.id) === 'missing-file')).toEqual(
      [],
    )
  })
})

test.describe('assets tab Find', () => {
  let board: FixtureBoard
  let server: BoardServer

  test.beforeEach(async () => {
    board = copyFixtureBoard('basic')
    server = await serveBoard(board.root, [], {
      NODE_OPTIONS: [
        `--import=${resolve('e2e/support/openverse-stub.mjs')}`,
        `--import=${resolve('e2e/support/polyhaven-stub.mjs')}`,
      ].join(' '),
    })
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('journey: a found image saves with its license, and another inserts into the selected frame', async ({
    page,
  }) => {
    const assets = join(board.root, 'webapp/assets')
    const hero = join(board.root, 'webapp/home/hero.html')
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    await page.getByRole('button', { name: 'Select hero' }).click()
    await page.getByRole('tab', { name: 'Assets' }).click()
    await page.getByRole('button', { name: 'Find…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Find media' })
    const field = dialog.getByRole('searchbox', { name: 'Search free images' })
    await field.fill('house')
    await field.press('Enter')
    const results = dialog.getByRole('list', { name: 'Results' })
    await expect(results.getByRole('listitem')).toHaveCount(5)
    await expect(
      results.getByRole('listitem').filter({ hasText: 'Plan house' }),
    ).toContainText('PNG')

    await expect(
      dialog.getByRole('heading', { name: 'Glass house' }),
    ).toBeVisible()
    await dialog.getByRole('button', { name: 'Save to assets' }).click()
    await expect(
      dialog.getByRole('button', { name: 'Saved to assets' }),
    ).toBeVisible()
    expect(readFileSync(join(assets, 'house.png')).byteLength).toBeGreaterThan(
      0,
    )
    expect(
      JSON.parse(readFileSync(join(assets, 'house.png.license.json'), 'utf8')),
    ).toMatchObject({ origin: 'found', id: 'glass', license: 'cc0' })

    await results.getByRole('button', { name: /Cabin house/ }).click()
    await dialog.getByRole('button', { name: 'Insert into hero' }).click()

    await expect(dialog).toBeHidden()
    await expect(page.getByRole('button', { name: 'Find…' })).toBeFocused()
    await expect
      .poll(() => readFileSync(hero, 'utf8'), { timeout: 10_000 })
      .toContain('src="../assets/house-2.png"')
    expect(existsSync(join(assets, 'house-2.png.license.json'))).toBe(true)
  })

  test('journey: a found model inserts into the selected frame, saving once as a GLB placed as a model', async ({
    page,
  }) => {
    const assets = join(board.root, 'webapp/assets')
    const hero = join(board.root, 'webapp/home/hero.html')
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    await page.getByRole('button', { name: 'Select hero' }).click()
    await page.keyboard.press('ControlOrMeta+k')
    await page.getByRole('combobox').fill('find media')
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: 'Find media' })
    await dialog.getByRole('button', { name: 'Kind: Images' }).click()
    await page.getByRole('menuitemradio', { name: 'Models' }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menuitemradio')).toHaveCount(0)
    const field = dialog.getByRole('searchbox', { name: 'Search free models' })
    await field.fill('stool')
    await field.press('Enter')
    const results = dialog.getByRole('list', { name: 'Results' })
    await expect(results.getByRole('listitem')).toHaveCount(1)
    await expect(results).toContainText('2.7k tris · CC0')

    await dialog.getByRole('button', { name: 'Insert into hero' }).click()

    await expect(dialog).toBeHidden()
    await expect
      .poll(() => readFileSync(hero, 'utf8'), { timeout: 10_000 })
      .toMatch(/<model-viewer[^>]*src="\.\.\/assets\/stool\.glb"/)
    expect(
      JSON.parse(readFileSync(join(assets, 'stool.glb.license.json'), 'utf8')),
    ).toMatchObject({ source: 'polyhaven', id: 'wooden_stool_01', size: '1k' })
    await page.getByRole('button', { name: 'Find…' }).click()
    await expect(
      dialog.getByRole('button', { name: 'Saved to assets' }),
    ).toBeVisible()
  })
})
