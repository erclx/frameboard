import { expect, test } from '@playwright/test'

// Headed browsers request /favicon.ico unless the page declares an icon, and the
// server has none until the favicon set lands, so the shell declares an empty one.
test('board shell declares an icon so the browser requests no favicon', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('link[rel="icon"]')).toHaveCount(1)
})
