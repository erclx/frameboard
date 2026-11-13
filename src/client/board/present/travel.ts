import type { ResolvedTransition } from '@/shared/present-transition'

/** The transition one step draws, with the way it travels. */
export interface Travel {
  transition: ResolvedTransition
  /** Whether the step went back, which plays a directed transition the other way. */
  back: boolean
}

/** A cut, which draws no leaving layer at all. */
export const CUT: Travel = {
  transition: { name: 'none', direction: null, ms: 0 },
  back: false,
}

/** Whether the reader asked for less motion, read at each step rather than once. */
export function prefersReducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * The transition a step draws, a cut under reduced motion. Going forward a
 * slide arrives with its own transition, and going back the slide leaving
 * takes back the one it arrived with, so each pair of slides reads the same
 * both ways.
 */
export function travelOf(
  transition: ResolvedTransition,
  back: boolean,
  reduced: boolean,
): Travel {
  if (reduced || transition.name === 'none' || transition.ms <= 0) return CUT
  return { transition, back }
}
