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
import { undo } from '../support/history'

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
    await undo(page)
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
    await undo(page)
    await expect.poll(read).not.toContain('>Welcome</h1>')
    await undo(page)
    await expect.poll(read).not.toContain('box-shadow')
    await undo(page)
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

    await undo(page)
    await expect.poll(read).not.toContain('scale')
    await undo(page)
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
    await undo(page)
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

  test('a color picked and then the headline’s Layers row dragged at once keeps both the fill and the new order', async ({
    page,
  }) => {
    const elements = page.getByRole('list', { name: 'Elements of hero' })
    await expect(elements).toBeVisible()
    await page.getByRole('button', { name: 'Fill color' }).click()
    const area = page.getByRole('slider', { name: 'Saturation and brightness' })
    const field = await area.boundingBox()
    if (!field) throw new Error('the picker’s area has no box on screen')
    await page.mouse.move(field.x + field.width - 4, field.y + 4)
    await page.mouse.down()
    await page.mouse.move(field.x + field.width - 2, field.y + 2)
    await page.mouse.up()
    const caption = elements.getByRole('button', {
      name: 'Caption',
      exact: true,
    })
    const below = await caption.boundingBox()
    if (!below) throw new Error('the Caption row has no box on screen')

    await elements
      .getByRole('button', { name: 'Headline', exact: true })
      .dragTo(caption, {
        targetPosition: { x: below.width / 2, y: below.height - 2 },
      })

    await expect
      .poll(() => {
        const html = read()
        return (
          html.indexOf('data-name="Caption"') <
          html.indexOf('data-name="Headline"')
        )
      })
      .toBe(true)
    expect(read()).toMatch(
      /<h1 data-name="Headline" style="color: #[0-9a-f]{6}">/,
    )
    await expect(page.getByText('Nothing moved')).toHaveCount(0)
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

test.describe('showing a selected frame at another width by hand', () => {
  let board: FixtureBoard
  let server: BoardServer

  const heroWidths = () =>
    JSON.parse(
      readFileSync(join(board.root, 'webapp/home/layout.json'), 'utf8'),
    ).frames.hero.widths

  test.beforeEach(async ({ page }) => {
    board = copyFixtureBoard('basic')
    server = await serveBoard(board.root)
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('a width added from the inspector lands in layout.json and draws its box, and one undo removes both', async ({
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
    const linked = page.locator(
      `[data-linked-frame="${HERO}"][data-linked-width="834"]`,
    )
    await expect(linked).toHaveCount(0)

    await page.getByRole('button', { name: 'Add a width' }).click()
    await page.getByRole('menuitem', { name: /^Tablet/ }).click()

    await expect.poll(heroWidths).toEqual([{ width: 834, height: 1194 }])
    await expect(linked).toBeVisible()
    await expect(
      page
        .getByRole('group', { name: 'Also shows at' })
        .getByRole('button', { name: 'Remove 834' }),
    ).toBeVisible()

    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await expect.poll(heroWidths).toBeUndefined()
    await expect(linked).toHaveCount(0)
  })
})

test.describe('exporting a selected frame', () => {
  let board: FixtureBoard
  let server: BoardServer

  test.beforeEach(async ({ page }) => {
    board = copyFixtureBoard('basic')
    server = await serveBoard(board.root)
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('export saves the frame at 1x in light, named for its scale and theme', async ({
    page,
  }) => {
    const headline = page
      .frameLocator(`[data-frame="${HERO}"] iframe`)
      .locator('h1')
    await expect(headline).toBeVisible()
    // As above, a click before the canvas fits lands beside the frame.
    await expect(async () => {
      await headline.click()
      await expect(
        page.getByRole('button', { name: 'Export 2 files' }),
      ).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Export scale' }).click()
    await page.getByRole('menuitemradio', { name: '1x' }).click()
    await page.getByRole('button', { name: 'Export theme' }).click()
    await page.getByRole('menuitemradio', { name: 'Light' }).click()
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export 1 file' }).click()
    const download = await downloading

    expect(download.suggestedFilename()).toBe('hero.light@1x.png')
    const bytes = readFileSync(await download.path())
    // A PNG's IHDR chunk holds its width and height at bytes 16 and 20.
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([
      1440, 900,
    ])
  })
})

test.describe('the colors a selected frame uses', () => {
  let board: FixtureBoard
  let server: BoardServer

  test.beforeEach(async ({ page }) => {
    board = copyFixtureBoard('basic')
    server = await serveBoard(board.root)
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('Selection colors follows Export, and pressing a row puts its color on the clipboard', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: new URL(server.url).origin,
    })
    const headline = page
      .frameLocator(`[data-frame="${HERO}"] iframe`)
      .locator('h1')
    await expect(headline).toBeVisible()
    // As above, a click before the canvas fits lands beside the frame.
    await expect(async () => {
      await headline.click()
      await expect(
        page.getByRole('button', { name: 'Export 2 files' }),
      ).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 10_000 })
    const colors = page.getByRole('region', { name: /^Selection colors/ })
    await expect(colors).toBeVisible()

    const order = await page
      .getByRole('complementary', { name: 'Inspector' })
      .getByRole('region')
      .evaluateAll((regions) =>
        regions.map((region) => region.getAttribute('aria-labelledby')),
      )
    expect(order.slice(-2)).toEqual([
      'inspector-export',
      'inspector-selection-colors',
    ])

    const row = colors.getByRole('button', { name: /^Copy / }).first()
    const label = (await row.getAttribute('aria-label')) ?? ''
    expect(label).toMatch(/^Copy (#|var\()/)
    await row.click()

    await expect(
      page.getByText(label.replace(/^Copy/, 'Copied'), { exact: true }),
    ).toBeVisible()
    const copied = await page.evaluate(() => navigator.clipboard.readText())
    expect(copied).toBe(label.replace(/^Copy /, ''))
  })

  test('Select on a raw color outlines each element using it and the header names them', async ({
    page,
  }) => {
    const path = join(board.root, `${HERO}.html`)
    writeFileSync(
      path,
      readFileSync(path, 'utf8')
        .replace(
          '<h1 data-name="Headline">',
          '<h1 data-name="Headline" style="color: #4f46e5">',
        )
        .replace(
          '<p data-name="Caption">',
          '<p data-name="Caption" style="border: 1px solid #4f46e5">',
        ),
    )
    const headline = page
      .frameLocator(`[data-frame="${HERO}"] iframe`)
      .locator('h1')
    await expect(headline).toHaveCSS('color', 'rgb(79, 70, 229)')
    await expect(async () => {
      await headline.click()
      await expect(
        page.getByRole('button', { name: 'Export 2 files' }),
      ).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 10_000 })

    const row = page
      .getByRole('region', { name: /^Selection colors/ })
      .getByRole('listitem')
      .filter({ hasText: '4f46e5' })
    await row.hover()
    await row.getByRole('button', { name: /^Select 2 elements/ }).click()

    await expect(page.locator('[data-element-selection]')).toHaveCount(2)
    await expect(
      page.getByRole('heading', { name: '2 elements' }),
    ).toBeVisible()
    await expect(page.getByText('using 4f46e5')).toBeVisible()
  })
})

test.describe('setting the flow of one row a shared rule styles', () => {
  // canon-allow-embedded: the frame this spec drives, kept beside the element names the test reads
  const ROWS = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>about</title>
    <style>
      .row { display: flex; gap: 4px; padding: 24px }
    </style>
  </head>
  <body>
    <div class="row" data-name="First"><span>a</span><span>b</span></div>
    <div class="row" data-name="Second"><span>c</span><span>d</span></div>
    <div class="row" data-name="Third"><span>e</span><span>f</span></div>
  </body>
</html>
`
  const ABOUT = 'webapp/home/about'
  let board: FixtureBoard
  let server: BoardServer

  const read = () => readFileSync(join(board.root, `${ABOUT}.html`), 'utf8')

  test.beforeEach(async ({ page }) => {
    board = copyFixtureBoard('basic')
    writeFileSync(join(board.root, `${ABOUT}.html`), ROWS)
    server = await serveBoard(board.root)
    await page.goto(await server.ticketUrl())
    await page.goto(`${server.url}/p/webapp/home`)
  })

  test.afterEach(async () => {
    await server.stop()
    board.cleanup()
  })

  test('a gap on one row writes its start tag alone, and one undo restores it', async ({
    page,
  }) => {
    const second = page
      .frameLocator(`[data-frame="${ABOUT}"] iframe`)
      .locator('[data-name="Second"]')
    await expect(second).toBeVisible()
    // A click inside the row's padding, clear of its spans, selects the row itself.
    await expect(async () => {
      const box = await second.boundingBox()
      if (!box) throw new Error('the row has no box on screen')
      await page.keyboard.down('Meta')
      await page.mouse.click(box.x + 3, box.y + 3)
      await page.keyboard.up('Meta')
      await expect(page.getByText(/shared by 3 elements/)).toBeVisible({
        timeout: 1000,
      })
    }).toPass({ timeout: 10_000 })

    const gap = page.getByRole('textbox', { name: 'Gap', exact: true })
    await expect(gap).toHaveValue('4')
    await gap.fill('16')
    await gap.press('Enter')

    await expect.poll(read).not.toBe(ROWS)
    expect(changedLines(ROWS, read())).toEqual([
      '    <div class="row" data-name="Second" style="gap: 16px"><span>c</span><span>d</span></div>',
    ])

    await gap.blur()
    await undo(page)
    await expect.poll(read).toBe(ROWS)
  })
})
