import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

// The values the landing drive settled in its prototype. Each width carries
// the gap between sections, the bar's height, and where the walkthrough pins,
// or null where its block is taller than the window and does not pin.
const WIDTHS = [
  { width: 1440, height: 900, gap: 192, bar: 64, pin: 136 },
  { width: 834, height: 900, gap: 128, bar: 64, pin: null },
  { width: 390, height: 844, gap: 96, bar: 56, pin: 64 },
] as const

// The box each section's content fills, top to bottom, so the space between
// one box's bottom and the next one's top is the section gap.
const SECTION_CONTENT = [
  '#hero [data-film]',
  '#walkthrough [data-track]',
  '#close > .wrap',
]

async function box(page: Page, selector: string) {
  const found = await page.locator(selector).boundingBox()
  if (!found) throw new Error(`${selector} has no box`)
  return found
}

async function scrollTrackToPin(page: Page): Promise<void> {
  await page.evaluate(() => {
    const track = document.querySelector('[data-track]')
    if (!track) throw new Error('no walkthrough track')
    const top = track.getBoundingClientRect().top + window.scrollY
    window.scrollTo(0, top + 600)
  })
}

for (const size of WIDTHS) {
  test.describe(`landing at ${size.width} wide`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('sections sit the settled gap apart', async ({ page }) => {
      await page.goto('/')
      const boxes = await Promise.all(
        SECTION_CONTENT.map((selector) => box(page, selector)),
      )
      expect(boxes).toHaveLength(SECTION_CONTENT.length)

      const gaps = boxes
        .slice(1)
        .map((next, index) =>
          Math.round(next.y - (boxes[index].y + boxes[index].height)),
        )

      expect(gaps).toEqual(gaps.map(() => size.gap))
    })

    test('the bar stays fixed at its height while the page scrolls', async ({
      page,
    }) => {
      await page.goto('/')
      await page.evaluate(() => window.scrollTo(0, 2000))
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(2000)

      const bar = await box(page, '[data-bar]')

      expect({ y: bar.y, height: bar.height }).toEqual({
        y: 0,
        height: size.bar,
      })
      await expect(page.locator('[data-bar]')).toHaveAttribute(
        'data-scrolled',
        '',
      )
    })

    test('the page never scrolls sideways', async ({ page }) => {
      await page.goto('/')

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      )

      expect(overflow).toBe(0)
    })

    if (size.pin === null) {
      test('the walkthrough stays in the flow where it cannot pin', async ({
        page,
      }) => {
        await page.goto('/')
        await scrollTrackToPin(page)

        await expect(page.locator('[data-pinned]')).not.toHaveAttribute(
          'data-pin',
        )
      })
    } else {
      const pin = size.pin
      test('the walkthrough pins at the bar plus a quarter of the free space', async ({
        page,
      }) => {
        await page.goto('/')
        await expect(page.locator('[data-pinned]')).toHaveAttribute(
          'data-pin',
          '',
        )
        await scrollTrackToPin(page)

        await expect
          .poll(async () => Math.round((await box(page, '[data-pinned]')).y))
          .toBe(pin)
      })
    }

    test('a focused step scrolls clear of the bar', async ({ page }) => {
      await page.goto('/')
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      const first = page.locator('[data-walk] li button').first()

      await first.focus()

      await expect
        .poll(async () => (await first.boundingBox())?.y ?? -1)
        .toBeGreaterThanOrEqual(size.bar)
    })
  })
}
