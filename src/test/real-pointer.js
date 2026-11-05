// Plain JavaScript with a hand-written `real-pointer.d.ts`, for the reason
// `motion.js` gives about letting tsc see `vitest/browser`.
import { userEvent } from 'vitest/browser'

/** Moves the real pointer over an element, since user-event's hover never reaches a `:hover` rule. */
export async function pointerOver(element) {
  await userEvent.hover(element)
  if (!element.matches(':hover')) throw new Error('the pointer did not land')
}

/** Moves the real pointer off an element, so a later render in the file starts unhovered. */
export async function pointerOff(element) {
  await userEvent.unhover(element)
}
