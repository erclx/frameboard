// Plain JavaScript with a hand-written `focus-ring.d.ts`, for the reason
// `motion.js` gives about letting tsc see `vitest/browser`.
import { userEvent } from 'vitest/browser'

import { ringContrastOnPage } from './contrast'

/**
 * An element's focus ring contrast once the keyboard focuses it, since
 * user-event's keys are untrusted and never reach a `:focus-visible` rule. A
 * real Shift press turns the focus already on the element keyboard focus. It
 * blurs after, so a later render in the file starts unfocused.
 */
export async function ringFocused(element) {
  element.focus()
  await userEvent.keyboard('{Shift}')
  if (!element.matches(':focus-visible')) {
    throw new Error('the focus is not keyboard focus')
  }
  const contrast = ringContrastOnPage(element)
  element.blur()
  return contrast
}
