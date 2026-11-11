// Plain JavaScript with a hand-written `real-pointer.d.ts`, for the reason
// `motion.js` gives about letting tsc see `vitest/browser`.
import { userEvent } from 'vitest/browser'

/** Moves the real pointer over an element, since user-event's hover never reaches a `:hover` rule. */
export async function pointerOver(element) {
  await userEvent.hover(element)
  if (!element.matches(':hover')) throw new Error('the pointer did not land')
}

/**
 * Clicks an element with the real pointer, which the browser's `:focus-visible`
 * heuristic reads as a pointer press. It presses even where an open popup's
 * backdrop covers the element, as an outside press to dismiss one does.
 */
export async function realClick(element) {
  await userEvent.click(element, { force: true })
}

/** Moves the real pointer off an element, so a later render in the file starts unhovered. */
export async function pointerOff(element) {
  await userEvent.unhover(element)
}
