import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { checkResultSchema } from '@/shared/records/check'

import { cli } from '../../test/support/cli'
import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'
import { liveCanvas, liveLayer } from '../support/canvas'

const HOME = '/p/studio/home'

/** Marks every live frame's window, so a reload shows as a frame that lost its mark. */
function markFrames(page: Page): Promise<void> {
  return page.evaluate(() => {
    for (const iframe of document.querySelectorAll('iframe')) {
      ;(iframe.contentWindow as unknown as { mark?: boolean }).mark = true
    }
  })
}

function marks(page: Page): Promise<Record<string, boolean>> {
  return page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>('[data-frame]')].map(
        (frame) => [
          frame.dataset.frame ?? '',
          Boolean(
            (
              frame.querySelector('iframe')?.contentWindow as unknown as {
                mark?: boolean
              } | null
            )?.mark,
          ),
        ],
      ),
    ),
  )
}

function framesLoaded(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    [...document.querySelectorAll('iframe')].every(
      (iframe) =>
        iframe.contentDocument?.readyState === 'complete' &&
        iframe.contentDocument.body !== null,
    ),
  )
}

test.describe('the live board', () => {
  let board: FixtureBoard
  let server: BoardServer

  test.beforeEach(async ({ page }) => {
    board = copyFixtureBoard('live')
    server = await serveBoard(board.root)
    await page.goto(`${server.url}${HOME}`)
    await expect(page.locator('[data-layer] iframe')).toHaveCount(2)
    await expect.poll(() => framesLoaded(page)).toBe(true)
    await markFrames(page)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('reloads a changed frame alone and keeps the view', async ({ page }) => {
    const layer = liveLayer(page)
    await liveCanvas(page).hover()
    await page.mouse.wheel(120, 80)
    const view = await layer.evaluate((element) => element.style.transform)

    writeFileSync(
      join(board.root, 'studio/home/hero.html'),
      '<!doctype html><title>hero</title><h1>Studio, edited</h1>',
    )

    await expect
      .poll(() => marks(page))
      .toEqual({ 'studio/home/hero': false, 'studio/home/mobile': true })
    await expect(
      page.frameLocator('iframe[title="hero"]').getByRole('heading'),
    ).toHaveText('Studio, edited')
    expect(await layer.evaluate((element) => element.style.transform)).toBe(
      view,
    )
  })

  test("reloads every frame on a page when its folder's stylesheet changes", async ({
    page,
  }) => {
    writeFileSync(
      join(board.root, 'studio/home/styles.css'),
      'h1 { color: red }',
    )

    await expect
      .poll(() => marks(page))
      .toEqual({ 'studio/home/hero': false, 'studio/home/mobile': false })
  })

  test('reads the new bytes of an asset the frame already loaded once it changes', async ({
    page,
  }) => {
    const dot = page.frameLocator('iframe[title="hero"]').getByRole('img')
    // A fetch in the default mode reads the HTTP cache the image load filled,
    // so a freshness lifetime on the asset would answer the old bytes here.
    // The write reloads the frame, which can tear down a read in flight, so a
    // torn read answers null and the poll asks again.
    const served = () =>
      dot
        .evaluate(async (img: HTMLImageElement) =>
          (await fetch(img.src)).text(),
        )
        .catch(() => null)
    const asset = join(board.root, 'studio/assets/dot.svg')
    await expect.poll(served).toBe(readFileSync(asset, 'utf8'))
    const edited =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4"/></svg>'

    writeFileSync(asset, edited)

    await expect.poll(served).toBe(edited)
  })

  test('adds a new frame and removes a deleted one with no navigation', async ({
    page,
  }) => {
    await page.evaluate(() => {
      ;(window as unknown as { stayed?: boolean }).stayed = true
    })

    writeFileSync(
      join(board.root, 'studio/home/pricing-card.html'),
      '<!doctype html><title>card</title><p>card</p>',
    )
    rmSync(join(board.root, 'studio/home/mobile.html'))

    await expect(page.locator('[data-frame]')).toHaveCount(2)
    await expect(
      page.locator('[data-frame="studio/home/pricing-card"]'),
    ).toBeVisible()
    await expect(page.locator('[data-frame="studio/home/mobile"]')).toHaveCount(
      0,
    )
    expect(
      await page.evaluate(
        () => (window as unknown as { stayed?: boolean }).stayed,
      ),
    ).toBe(true)
  })

  test('marks a frame with check findings and clears the mark on a fix', async ({
    page,
  }) => {
    const hero = page.locator('[data-frame="studio/home/hero"]')
    const frame = join(board.root, 'studio/home/hero.html')
    await expect(
      hero.getByRole('button', { name: '2 check findings' }),
    ).toBeVisible()

    writeFileSync(
      frame,
      '<!doctype html><title>hero</title><style>body { font-family: Geist }</style><h1>Studio</h1>',
    )
    await expect(hero.getByRole('img')).toHaveCount(0)

    writeFileSync(frame, '<!doctype html><title>hero</title><h1>Studio</h1>')
    await expect(
      hero.getByRole('button', { name: '1 check finding' }),
    ).toBeVisible()
  })

  test('turns a rule off for the project from a finding card, and check agrees', async ({
    page,
  }) => {
    const hero = page.locator('[data-frame="studio/home/hero"]')
    const checked = async () => {
      const run = await cli(['check', 'studio/home/hero', '--json'], {
        cwd: board.root,
      })
      const { data, error } = run.json()
      return checkResultSchema
        .parse(data ?? error?.details)
        .findings.map((finding) => finding.rule)
    }
    const before = await checked()
    expect(before).toHaveLength(2)
    const [rule] = before
    // A reading tab draws no button, so the tab redeems a write ticket first.
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}${HOME}`)

    // The hit layer above the badge takes the press and opens its list.
    await hero
      .getByRole('button', { name: '2 check findings' })
      .click({ force: true })
    const list = page.getByRole('dialog', { name: /findings? on hero/ })
    await list
      .getByRole('button', { name: `Turn off in studio, ${rule}` })
      .click()

    await expect(
      hero.getByRole('button', { name: '1 check finding' }),
    ).toBeVisible()
    expect(await checked()).toEqual(before.slice(1))

    // Undo is a board key, which waits until the list has let go of focus.
    await page.keyboard.press('Escape')
    await expect(list).toBeHidden()
    await page.keyboard.press('ControlOrMeta+z')

    await expect(
      hero.getByRole('button', { name: '2 check findings' }),
    ).toBeVisible()
    expect(await checked()).toEqual(before)
  })

  test('marks a frame resized so its content clips, and clears it on a fit', async ({
    page,
  }) => {
    // Its two static findings are what it carries before the resize.
    const mobile = page.locator('[data-frame="studio/home/mobile"]')
    const before = mobile.getByRole('button', { name: '2 check findings' })
    await expect(before).toBeVisible()

    // A resize writes layout.json alone, so the browser checker reads the box.
    await cli(['frame', 'resize', 'home/mobile', '--height', '20', '--json'], {
      cwd: board.root,
    })
    const clipped = mobile.getByRole('button', { name: '3 check findings' })
    await expect(clipped).toBeVisible()
    // The hit layer above the badge takes the press and opens its list.
    await clipped.click({ force: true })
    await expect(
      page.getByRole('dialog', { name: '3 findings on mobile' }),
    ).toContainText(/px tall in its 20 px/)
    await page.keyboard.press('Escape')

    await cli(['frame', 'fit', 'home/mobile', '--json'], { cwd: board.root })
    await expect(before).toBeVisible()
  })
})
