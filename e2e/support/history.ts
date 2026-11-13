import { expect, type Page } from '@playwright/test'

const UNDO = 'ControlOrMeta+KeyZ'

/**
 * Presses undo once Undo lights, which the server's history message does when
 * a step is recorded, so a press never lands before the board counts the step.
 */
export async function undo(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Undo' })).not.toHaveAttribute(
    'aria-disabled',
  )
  await page.keyboard.press(UNDO)
}

/**
 * Presses undo on the home view, which draws no toolbar. The command palette
 * lists Undo only once the board counts a step, so the wait reads it there.
 */
export async function undoAtHome(page: Page): Promise<void> {
  await page.keyboard.press('ControlOrMeta+KeyK')
  const palette = page.getByRole('dialog', { name: 'Command palette' })
  await expect(palette.getByRole('option', { name: /^Undo/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(palette).toBeHidden()
  await page.keyboard.press(UNDO)
}
