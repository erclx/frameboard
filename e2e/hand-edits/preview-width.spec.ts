import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'

const HERO = '[data-frame="studio/home/hero"]'

test.describe('previewing a frame at another width', () => {
  let board: FixtureBoard
  let server: BoardServer

  const layout = () =>
    readFileSync(join(board.root, 'studio/home/layout.json'), 'utf8')

  test.beforeEach(async () => {
    board = copyFixtureBoard('live')
    server = await serveBoard(board.root)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('leaves the layout file byte-identical through every preset and a typed width', async ({
    page,
  }) => {
    const before = layout()
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/studio/home`)
    const hero = page.locator(HERO)
    const box = await hero.boundingBox()
    if (!box) throw new Error('The hero has no box on screen')
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    // An enabled field is the server granting this tab writes, so a write
    // the preview sent would land rather than be refused.
    await expect(
      page.getByRole('textbox', { name: 'X position' }),
    ).toBeEnabled()
    // Every box write goes through this route, so a preview reaching the
    // layout would show here as the click that sent it.
    const writes: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/frames/')) {
        writes.push(`${request.method()} ${request.url()}`)
      }
    })

    await page
      .getByRole('button', { name: 'Preview at phone width, 390' })
      .click()
    await expect(hero).toHaveCSS('width', '390px')
    await page
      .getByRole('button', { name: 'Preview at tablet width, 834' })
      .click()
    await expect(hero).toHaveCSS('width', '834px')
    await page
      .getByRole('button', { name: 'Preview at desktop width, 1440' })
      .click()
    await expect(hero).toHaveCSS('width', '1440px')
    const field = page.getByRole('textbox', { name: 'Preview width' })
    await field.fill('500')
    await field.press('Enter')
    await expect(hero).toHaveCSS('width', '500px')
    await page.getByRole('button', { name: 'End preview' }).click()
    await expect(hero).toHaveCSS('width', '1440px')

    // Nothing is awaited here but the absence of a write, and a held box edit
    // sends only once the keys rest for 300 ms, so the window outlasts that
    // rest before the assertion reads it.
    await page.waitForTimeout(1000)
    expect(writes).toEqual([])
    expect(layout()).toBe(before)
  })
})
