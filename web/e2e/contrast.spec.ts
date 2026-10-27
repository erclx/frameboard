import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// Contrast is computed from the colors the browser actually paints, so this
// is the one layer that sees a token, an opacity, and the theme together.
for (const colorScheme of ['light', 'dark'] as const) {
  test(`every text color reads 4.5:1 in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/')
    // Both wait on scripts: the Copy label unhides and the inactive steps dim.
    await expect(
      page.getByRole('button', { name: 'Copy' }).last(),
    ).toBeVisible()
    await expect(page.locator('[data-walk][data-ready]')).toHaveCount(1)

    const results = await new AxeBuilder({ page })
      .withRules(['color-contrast'])
      .analyze()

    expect(results.violations).toEqual([])
  })
}
