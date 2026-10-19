import { execFile } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { expect, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../test/support/fixture-board'
import { type BoardServer, serveBoard } from './support/board-server'

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
