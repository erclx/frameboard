// Plain JavaScript with a hand-written `focus-ring.d.ts`, for the reason
// `motion.js` gives about letting tsc see `vitest/browser`.
import { vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { ringContrastOnPage } from './contrast'

/**
 * Focuses an element as the keyboard does, since user-event's keys are
 * untrusted and never reach a `:focus-visible` rule. A real Shift press turns
 * the focus already on the element keyboard focus.
 *
 * Vitest's provider looks the tester iframe up for a key press and throws
 * after one second when a loaded machine has not attached it yet, so the press
 * settles on the frame being there.
 */
export async function keyboardFocus(element) {
  element.focus()
  await vi.waitFor(() => userEvent.keyboard('{Shift}'), { timeout: 5000 })
  if (!element.matches(':focus-visible')) {
    throw new Error('the focus is not keyboard focus')
  }
}

/**
 * An element's focus ring contrast once the keyboard focuses it. It blurs
 * after, so a later render in the file starts unfocused.
 */
export async function ringFocused(element) {
  await keyboardFocus(element)
  const contrast = ringContrastOnPage(element)
  element.blur()
  return contrast
}
