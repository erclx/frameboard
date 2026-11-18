// Plain JavaScript with a hand-written `focus-ring.d.ts`, for the reason
// `motion.js` gives about letting tsc see `vitest/browser`.
import { userEvent } from 'vitest/browser'

import { ringContrastOnPage } from './contrast'

/**
 * Focuses an element as the keyboard does, since user-event's keys are
 * untrusted and never reach a `:focus-visible` rule. A real Shift press turns
 * the focus already on the element keyboard focus.
 */
export async function keyboardFocus(element) {
  element.focus()
  await userEvent.keyboard('{Shift}')
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
