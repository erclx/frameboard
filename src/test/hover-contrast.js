// Plain JavaScript with a hand-written `hover-contrast.d.ts`, for the reason
// `motion.js` gives about letting tsc see `vitest/browser`.
import { userEvent } from 'vitest/browser'

import { contrastOnPage } from './contrast'

/**
 * An element's contrast under the real pointer, since user-event's hover fires
 * events and never reaches a `:hover` rule. It waits out any transition and
 * moves the pointer away after, so a later render in the file starts unhovered.
 */
export async function contrastHovered(element) {
  await userEvent.hover(element)
  if (!element.matches(':hover')) throw new Error('the pointer did not land')
  await Promise.all(element.getAnimations().map((motion) => motion.finished))
  const contrast = contrastOnPage(element)
  await userEvent.unhover(element)
  return contrast
}
