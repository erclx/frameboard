import { expect, type Page } from '@playwright/test'

/** A laid-out label or chip is one line when it stands under two of its font sizes. */
const ONE_LINE_EM = 2

/**
 * Opens the `?` sheet at 1440 wide and expects every label and chip in it on
 * one line. Returns the width of each column, so a spec can pin the grid.
 */
export async function openSheetAtDesktop(page: Page): Promise<{
  first: number
  second: number
  third: number | undefined
}> {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.keyboard.press('Shift+Slash')
  const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' })
  await expect(sheet).toBeVisible()

  const cells = await sheet.locator('li > span, li kbd').evaluateAll((nodes) =>
    nodes.map((node) => ({
      text: node.textContent ?? '',
      height: node.getBoundingClientRect().height,
      fontSize: parseFloat(getComputedStyle(node).fontSize),
    })),
  )
  expect(cells.length).toBeGreaterThan(0)
  const wrapped = cells.filter(
    (cell) => cell.height >= cell.fontSize * ONE_LINE_EM,
  )
  expect(wrapped.map((cell) => cell.text)).toEqual([])

  // With the label and chips unable to wrap, a row too wide for its column
  // keeps one line and spills past it, which no height reads.
  const spilled = await sheet
    .locator('li')
    .evaluateAll((rows) =>
      rows
        .filter((row) => row.scrollWidth > row.clientWidth)
        .map((row) => row.textContent ?? ''),
    )
  expect(spilled).toEqual([])

  const [first, second, third] = await sheet
    .locator('section')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().width),
    )
  if (first === undefined || second === undefined) {
    throw new Error('The sheet drew fewer than two columns')
  }
  return { first, second, third }
}
