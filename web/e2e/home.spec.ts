import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

test('home page loads', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/.+/)
})

test('reduced motion reaches the page', async ({ page }) => {
  await page.goto('/')
  const isReduced = await page.evaluate(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  expect(isReduced).toBe(true)
})

test.describe('hero picture', () => {
  const heroPicture = (page: Page) =>
    expect.poll(() =>
      page
        .locator('#hero img')
        // Chromium reports an empty currentSrc while a swapped picture loads, so this polls past it.
        .evaluate((img: HTMLImageElement) =>
          img.currentSrc.replace(location.origin, ''),
        ),
    )

  test('a dark reader with motion gets the dark loop', async ({ page }) => {
    await page.emulateMedia({
      colorScheme: 'dark',
      reducedMotion: 'no-preference',
    })

    await page.goto('/')

    await heroPicture(page).toBe('/hero-loop-dark.webp')
  })

  test('a light reader with motion gets the light loop', async ({ page }) => {
    await page.emulateMedia({
      colorScheme: 'light',
      reducedMotion: 'no-preference',
    })

    await page.goto('/')

    await heroPicture(page).toBe('/hero-loop.webp')
  })

  test('a dark reduced-motion reader gets the dark still', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })

    await page.goto('/')

    await heroPicture(page).toBe('/hero-still-dark.png')
  })

  test('a light reduced-motion reader gets the light still', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })

    await page.goto('/')

    await heroPicture(page).toBe('/hero-still.png')
  })

  // jsdom selects no source, so only a browser shows a matching source beating the pause.
  test('pause holds a dark reader on the dark still and play brings the loop back', async ({
    page,
  }) => {
    await page.emulateMedia({
      colorScheme: 'dark',
      reducedMotion: 'no-preference',
    })
    await page.goto('/')
    await heroPicture(page).toBe('/hero-loop-dark.webp')

    await page.getByRole('button', { name: 'Pause' }).click()
    await heroPicture(page).toBe('/hero-still-dark.png')

    await page.getByRole('button', { name: 'Play' }).click()
    await heroPicture(page).toBe('/hero-loop-dark.webp')
  })
})

test.describe('social card meta', () => {
  test('the dark card a switch would publish answers as a 1200 × 630 PNG', async ({
    request,
  }) => {
    const response = await request.get('/og-image-dark.png')
    const png = await response.body()

    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('image/png')
    expect({
      width: png.readUInt32BE(16),
      height: png.readUInt32BE(20),
    }).toEqual({ width: 1200, height: 630 })
  })

  test('og:image is absolute and answers with a PNG at its declared size', async ({
    page,
    request,
  }) => {
    await page.goto('/')
    const head = page.locator('head')
    const [image, width, height] = await Promise.all([
      head.locator('meta[property="og:image"]').getAttribute('content'),
      head.locator('meta[property="og:image:width"]').getAttribute('content'),
      head.locator('meta[property="og:image:height"]').getAttribute('content'),
    ])
    expect(image).toBeTruthy()
    const imageUrl = new URL(image ?? '')

    // The absolute URL names the deployed origin, so fetch its path from the server under test.
    const response = await request.get(imageUrl.pathname)
    const png = await response.body()

    expect(imageUrl.protocol).toMatch(/^https?:$/)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('image/png')
    // A PNG's IHDR chunk carries width and height as big-endian integers at bytes 16 and 20.
    expect({
      width: png.readUInt32BE(16),
      height: png.readUInt32BE(20),
    }).toEqual({
      width: 1200,
      height: 630,
    })
    expect({ width: Number(width), height: Number(height) }).toEqual({
      width: 1200,
      height: 630,
    })
  })

  test('the card carries alt text and asks for the large twitter card', async ({
    page,
  }) => {
    await page.goto('/')
    const head = page.locator('head')

    await expect(head.locator('meta[property="og:image:alt"]')).toHaveAttribute(
      'content',
      /\S/,
    )
    await expect(head.locator('meta[name="twitter:card"]')).toHaveAttribute(
      'content',
      'summary_large_image',
    )
  })
})
