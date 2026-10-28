import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'
import { type BoardServer, serveBoard } from '../support/board-server'

const HERO = 'webapp/home/hero'

/** The lines two versions of a file differ on, which a hand edit keeps to the edited element's. */
function changedLines(before: string, after: string): string[] {
  const was = before.split('\n')
  const now = after.split('\n')
  expect(now).toHaveLength(was.length)
  return now.filter((line, index) => line !== was[index])
}

test.describe('editing a selected element by hand', () => {
  let board: FixtureBoard
  let server: BoardServer
  let original: string

  const path = () => join(board.root, `${HERO}.html`)
  const read = () => readFileSync(path(), 'utf8')

  test.beforeEach(async ({ page }) => {
    board = copyFixtureBoard('basic')
    original = read()
    server = await serveBoard(board.root)
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
    await selectHeadline(page)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  /** Cmd-clicks the hero's headline and waits for its sections. */
  async function selectHeadline(page: Page): Promise<void> {
    const headline = page
      .frameLocator(`[data-frame="${HERO}"] iframe`)
      .locator('h1')
    await expect(headline).toBeVisible()
    // The canvas fits the page to the window once its frames have loaded, so
    // a click read off the box before that lands beside the headline.
    await expect(async () => {
      const box = await headline.boundingBox()
      if (!box) throw new Error('the headline has no box on screen')
      await page.keyboard.down('Meta')
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      await page.keyboard.up('Meta')
      await expect(
        page.getByRole('heading', { name: 'Appearance' }),
      ).toBeVisible({
        timeout: 1000,
      })
    }).toPass({ timeout: 10_000 })
  }

  test('each edit writes the headline’s span alone, and undo restores the bytes', async ({
    page,
  }) => {
    const headline = original.split('\n').find((line) => line.includes('<h1'))
    const opacity = page.getByRole('textbox', { name: 'Opacity', exact: true })
    await opacity.fill('50')
    await opacity.press('Enter')

    await expect.poll(read).not.toBe(original)
    expect(changedLines(original, read())).toEqual([
      headline?.replace(
        '<h1 data-name="Headline">',
        '<h1 data-name="Headline" style="opacity: 0.5">',
      ),
    ])

    // Cmd+Z in a field undoes its typing, so the board's undo takes focus off it.
    await opacity.blur()
    await page.keyboard.press('ControlOrMeta+KeyZ')
    await expect.poll(read).toBe(original)
    await expect(
      page.getByRole('heading', { name: 'Appearance' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Fill token' }).click()
    await page
      .getByRole('list', { name: 'Fill tokens' })
      .getByRole('button', { name: 'accent' })
      .click()
    await expect.poll(read).toContain('color: var(--accent)')

    await page.getByRole('button', { name: 'Shadow' }).click()
    await page.getByRole('menuitem', { name: 'shadow-sm' }).click()
    await expect.poll(read).toContain('box-shadow: var(--shadow-sm)')

    const text = page.getByRole('textbox', { name: 'Text' })
    await text.fill('Welcome')
    await text.press('ControlOrMeta+Enter')
    await expect.poll(read).toContain('>Welcome</h1>')
    expect(changedLines(original, read())).toHaveLength(1)

    await text.blur()
    await page.keyboard.press('ControlOrMeta+KeyZ')
    await expect.poll(read).not.toContain('>Welcome</h1>')
    await page.keyboard.press('ControlOrMeta+KeyZ')
    await expect.poll(read).not.toContain('box-shadow')
    await page.keyboard.press('ControlOrMeta+KeyZ')
    await expect.poll(read).toBe(original)
  })

  test('a rotate and a flip land in the headline’s span, and undo restores the bytes', async ({
    page,
  }) => {
    const headline = original.split('\n').find((line) => line.includes('<h1'))
    await page.getByRole('button', { name: 'Rotate 90°' }).click()
    await expect.poll(read).toContain('rotate: 90deg')

    // The frame reloads after the rotate, so the flip reads the written angle back.
    await expect(
      page.getByRole('textbox', { name: 'Rotation', exact: true }),
    ).toHaveValue('90°')
    await page.getByRole('button', { name: 'Flip horizontal' }).click()

    await expect.poll(read).toContain('scale: -1 1')
    expect(changedLines(original, read())).toEqual([
      headline?.replace(
        '<h1 data-name="Headline">',
        '<h1 data-name="Headline" style="rotate: 90deg; scale: -1 1">',
      ),
    ])

    await page.keyboard.press('ControlOrMeta+KeyZ')
    await expect.poll(read).not.toContain('scale')
    await page.keyboard.press('ControlOrMeta+KeyZ')
    await expect.poll(read).toBe(original)
  })

  test('a family and a named weight picked in Typography land in the headline’s span', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Font family' }).click()
    await page.getByRole('menuitemradio', { name: 'Geist Mono' }).click()
    await expect.poll(read).toContain("font-family: 'Geist Mono'")

    const weight = page.getByRole('button', { name: 'Font weight' })
    // The frame reloads after the family write, and the weights offered follow its face.
    await expect(page.getByRole('button', { name: 'Font family' })).toHaveText(
      'Geist Mono',
    )
    await weight.click()
    await page.getByRole('menuitemradio', { name: /^Medium/ }).click()

    await expect.poll(read).toContain('font-weight: 500')
    expect(changedLines(original, read())).toHaveLength(1)
  })

  test('undo on a focused toast runs the board undo, not the browser one', async ({
    page,
  }) => {
    const text = page.getByRole('textbox', { name: 'Text' })
    await text.press('ControlOrMeta+KeyA')
    await text.pressSequentially('Welcome home')
    await text.press('Tab')
    await expect.poll(read).toContain('>Welcome home</h1>')

    // Copying raises a toast, which takes focus as a dialog. The board's
    // undo runs there, so Chromium never undoes the last field edited.
    await page.mouse.move(0, 0)
    await page.keyboard.press('ControlOrMeta+Shift+KeyC')
    const toast = page.getByRole('dialog').filter({ hasText: /copy|Copied/i })
    await expect(toast).toBeVisible()
    // Base UI pauses a toast's timer on hover, so it outlasts the press.
    await toast.hover()
    await toast.focus()
    await page.keyboard.press('ControlOrMeta+KeyZ')
    await expect.poll(read).toBe(original)

    // A blur commit sends its request in the blur handler itself, so the
    // requests recorded once the blur returns are all it will ever send.
    const edits: string[] = []
    page.on('request', (request) => {
      if (request.url().endsWith('/api/frames/edit')) edits.push(request.url())
    })
    await text.focus()
    await text.blur()
    expect(edits).toEqual([])
    expect(read()).toBe(original)
  })

  /** Settles once the server keeps the source the agent's write replaced, which a stale edit is found again from. */
  async function keptSource(request: APIRequestContext): Promise<void> {
    const at = createHash('sha256').update(original).digest('hex')
    await expect
      .poll(
        async () =>
          (
            await request.get(`${server.url}/frames/${HERO}.html?at=${at}`)
          ).status(),
        { timeout: 10_000 },
      )
      .toBe(200)
  }

  test('an edit made from bytes an agent has since replaced lands past the agent’s other element', async ({
    page,
    request,
  }) => {
    // Hold the frame's reload, so the board still names the bytes it showed
    // when the agent's write lands, as it does mid-flight.
    await page.route(
      (url) => url.pathname.startsWith('/frames/'),
      () => {},
    )
    writeFileSync(path(), original.replace('Caption', 'Byline'))
    await keptSource(request)

    const opacity = page.getByRole('textbox', { name: 'Opacity', exact: true })
    await opacity.fill('50')
    await opacity.press('Enter')

    await expect
      .poll(read)
      .toContain('<h1 data-name="Headline" style="opacity: 0.5">')
    expect(read()).toContain('Byline')
    await expect(page.getByText('Edit not saved')).toHaveCount(0)
  })

  test('an edit made from bytes whose element an agent has since changed is refused', async ({
    page,
    request,
  }) => {
    await page.route(
      (url) => url.pathname.startsWith('/frames/'),
      () => {},
    )
    const agent = original.replace(
      '<h1 data-name="Headline">',
      '<h1 data-name="Headline" class="agent">',
    )
    writeFileSync(path(), agent)
    await keptSource(request)

    const opacity = page.getByRole('textbox', { name: 'Opacity', exact: true })
    await opacity.fill('50')
    await opacity.press('Enter')

    await expect(page.getByText('Edit not saved')).toBeVisible()
    await expect(opacity).toHaveValue('100%')
    expect(read()).toBe(agent)
  })

  /** Drags the hero by a point clear of the headline, from wherever focus sits. */
  async function dragHero(page: Page): Promise<void> {
    const frame = await page.locator(`[data-frame="${HERO}"]`).boundingBox()
    if (!frame) throw new Error('the hero has no box on screen')
    const from = {
      x: frame.x + frame.width * 0.8,
      y: frame.y + frame.height * 0.85,
    }
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 80, from.y + 40, { steps: 8 })
    await page.mouse.up()
  }

  const layout = () =>
    readFileSync(join(board.root, 'webapp/home/layout.json'), 'utf8')

  for (const commit of ['Enter', 'a press on the canvas'] as const) {
    test(`the first drag after an edit applied by ${commit} keeps the element`, async ({
      page,
    }) => {
      const before = layout()
      const opacity = page.getByRole('textbox', {
        name: 'Opacity',
        exact: true,
      })
      await opacity.fill('50')
      if (commit === 'Enter') await opacity.press('Enter')

      await dragHero(page)

      await expect.poll(read).toContain('opacity: 0.5')
      await expect.poll(layout).not.toBe(before)
      // The drop the guard is for came with the frame's reload, so the
      // selection is read only once the frame shows the written bytes.
      await expect(
        page.frameLocator(`[data-frame="${HERO}"] iframe`).locator('h1'),
      ).toHaveAttribute('style', /opacity: 0\.5/)
      await expect(
        page.getByRole('heading', { name: 'Appearance' }),
      ).toBeVisible()
      await expect(
        page.getByRole('textbox', { name: 'Opacity', exact: true }),
      ).toHaveValue('50%')
    })
  }
})

test.describe('filling a selected frame by hand', () => {
  let board: FixtureBoard
  let server: BoardServer
  let original: string

  const path = () => join(board.root, `${HERO}.html`)
  const read = () => readFileSync(path(), 'utf8')

  test.beforeEach(async ({ page }) => {
    board = copyFixtureBoard('basic')
    original = read()
    server = await serveBoard(board.root)
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('a token picked for the frame’s Fill lands on its body, and undo restores the bytes', async ({
    page,
  }) => {
    const headline = page
      .frameLocator(`[data-frame="${HERO}"] iframe`)
      .locator('h1')
    await expect(headline).toBeVisible()
    // As for the headline above, a click before the canvas fits lands beside the frame.
    await expect(async () => {
      await headline.click()
      await expect(
        page.getByRole('button', { name: 'Rename frame hero' }),
      ).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Fill token' }).click()
    await page
      .getByRole('list', { name: 'Fill tokens' })
      .getByRole('button', { name: 'accent' })
      .click()

    await expect.poll(read).toContain('background-color: var(--accent)')
    const [, body = ''] = /<body([^>]*)>/.exec(read()) ?? []
    expect(body).toContain('background-color: var(--accent)')
    expect(read().split('<h1')[1]).toBe(original.split('<h1')[1])

    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect.poll(read).toBe(original)
  })
})
