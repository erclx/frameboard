import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, type Locator, test } from '@playwright/test'

import { cli } from '../../test/support/cli'
import { type BoardServer, serveBoard } from '../support/board-server'

const UNDO = 'ControlOrMeta+KeyZ'

/** Picks a guide option through the card that wraps its radio, the way a pointer reaches it. */
async function choose(radio: Locator): Promise<void> {
  await radio.locator('xpath=..').click()
  await expect(radio).toBeChecked()
}

/** Whether `inner`'s box on screen lies wholly within `outer`'s. */
async function inside(inner: Locator, outer: Locator): Promise<boolean> {
  const [a, b] = await Promise.all([inner.boundingBox(), outer.boundingBox()])
  if (!a || !b) return false
  return (
    a.x >= b.x &&
    a.y >= b.y &&
    a.x + a.width <= b.x + b.width &&
    a.y + a.height <= b.y + b.height
  )
}

test.describe('a new board guided to its first frame', () => {
  let parent: string
  let root: string
  let server: BoardServer

  const at = (path: string) => join(root, path)

  test.beforeEach(async () => {
    parent = mkdtempSync(join(tmpdir(), 'frameboard-guide-'))
    root = join(parent, 'board')
    server = await serveBoard(root)
  })

  test.afterEach(async () => {
    await server.stop()
    rmSync(parent, { recursive: true, force: true })
  })

  test('writes each answer to files, and undo takes them back in turn', async ({
    page,
  }) => {
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/untitled/page-1`)
    const guide = page.getByRole('region', { name: 'Set up your board' })

    await guide.getByRole('textbox').fill('Acme mobile')
    await guide.getByRole('button', { name: 'Next' }).click()
    await expect(page).toHaveURL(/\/p\/acme-mobile\/page-1$/)
    await choose(guide.getByRole('radio', { name: /Desktop/ }))
    await guide.getByRole('button', { name: 'Next' }).click()
    await choose(guide.getByRole('radio', { name: 'Green' }))
    await guide.getByRole('button', { name: 'Next' }).click()
    await choose(guide.getByRole('radio', { name: /start myself/ }))
    await guide.getByRole('button', { name: 'Finish' }).click()

    await expect(guide).toBeHidden()
    await expect
      .poll(() => readdirSync(at('acme-mobile/page-1')))
      .toContain('desktop.html')
    expect(existsSync(at('acme-mobile/tokens.css'))).toBe(true)
    expect(existsSync(at('untitled'))).toBe(false)
    await expect
      .poll(() =>
        inside(
          page.locator('[data-frame="acme-mobile/page-1/desktop"]'),
          page.locator('[data-canvas]'),
        ),
      )
      .toBe(true)

    await page.keyboard.press('Escape')
    await page.keyboard.press(UNDO)
    await expect
      .poll(() => existsSync(at('acme-mobile/page-1/desktop.html')))
      .toBe(false)
    await page.keyboard.press(UNDO)
    await expect
      .poll(() => existsSync(at('acme-mobile/tokens.css')))
      .toBe(false)
    await page.keyboard.press(UNDO)
    await expect.poll(() => existsSync(at('untitled/page-1'))).toBe(true)
  })

  test("fits the agent's first frame wholly inside the canvas", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/untitled/page-1`)
    const guide = page.getByRole('region', { name: 'Set up your board' })

    await guide.getByRole('textbox').fill('Acme web')
    await guide.getByRole('button', { name: 'Next' }).click()
    await choose(guide.getByRole('radio', { name: /Desktop/ }))
    await guide.getByRole('button', { name: 'Next' }).click()
    await guide.getByRole('button', { name: 'Next' }).click()
    await choose(guide.getByRole('radio', { name: /My agent/ }))
    await guide.getByRole('button', { name: 'Finish' }).click()
    await expect(guide).toBeHidden()

    await cli(['frame', 'add', 'acme-web/page-1/home', '--size', 'desktop'], {
      cwd: root,
    })

    const canvas = await page.locator('[data-canvas]').boundingBox()
    const frame = page.locator('[data-frame="acme-web/page-1/home"]')
    await expect(frame).toBeVisible()
    await expect
      .poll(async () => {
        const box = await frame.boundingBox()
        return (
          canvas !== null &&
          box !== null &&
          box.x >= canvas.x &&
          box.y >= canvas.y &&
          box.x + box.width <= canvas.x + canvas.width &&
          box.y + box.height <= canvas.y + canvas.height
        )
      })
      .toBe(true)
  })
})
