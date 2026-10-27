// Plain JavaScript with a hand-written `motion.d.ts`, since letting tsc see
// `vitest/browser` merges its own jest-dom matcher types into `Assertion`,
// which narrows `toHaveTextContent` and breaks every RegExp call to it.
import { cdp } from 'vitest/browser'

/** Emulates `prefers-reduced-motion: reduce` in the test browser, or clears it. */
export async function emulateReducedMotion(on) {
  await cdp().send('Emulation.setEmulatedMedia', {
    features: on ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [],
  })
}
