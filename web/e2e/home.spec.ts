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

test.describe('social card meta', () => {
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
