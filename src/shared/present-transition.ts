/**
 * The transitions present mode draws between slides, in the order the
 * inspector lists them. The list is the board's own and a project adds
 * none yet, so a name outside it reads as no transition.
 */
export const TRANSITIONS = [
  'none',
  'fade',
  'slide',
  'push',
  'zoom',
  'flip',
  'dissolve',
] as const

export type TransitionName = (typeof TRANSITIONS)[number]

export const TRANSITION_LABELS = {
  none: 'None',
  fade: 'Fade',
  slide: 'Slide',
  push: 'Push',
  zoom: 'Zoom',
  flip: 'Flip',
  dissolve: 'Dissolve',
} as const satisfies Record<TransitionName, string>

/** The way a directed transition moves the incoming slide, as a slide tool's effect options name it. */
export const DIRECTIONS = ['left', 'right', 'up', 'down'] as const

export type Direction = (typeof DIRECTIONS)[number]

/** The transitions that take a direction. The rest ignore one. */
export const DIRECTED = [
  'slide',
  'push',
] as const satisfies readonly TransitionName[]

export const DEFAULT_DIRECTION: Direction = 'left'

export const DEFAULT_TRANSITION_MS = 500

/** The shortest and longest transition a record holds, so a typo never freezes a talk. */
export const TRANSITION_MS = { min: 100, max: 5000 } as const

/**
 * A transition as `layout.json` stores it, on a page's `present` key or on a
 * frame's entry. `direction` and `ms` are absent when left at their default.
 */
export interface Transition {
  name: TransitionName
  direction?: Direction
  ms?: number
}

/** The transition present mode draws, with every default filled in. */
export interface ResolvedTransition {
  name: TransitionName
  /** Null for a transition that takes none. */
  direction: Direction | null
  ms: number
}

export function takesDirection(name: TransitionName): boolean {
  return (DIRECTED as readonly TransitionName[]).includes(name)
}

export function transitionNameOf(value: unknown): TransitionName | null {
  return TRANSITIONS.find((name) => name === value) ?? null
}

/**
 * A stored transition as a reader takes it, or null for anything but an
 * object naming a known transition. A direction or a duration no reader
 * understands reads as absent, so it falls to the default rather than
 * hiding the transition.
 */
export function transitionOf(value: unknown): Transition | null {
  if (typeof value !== 'object' || value === null) return null
  const held = value as Record<string, unknown>
  const name = transitionNameOf(held.name)
  if (!name) return null
  const direction = DIRECTIONS.find((candidate) => candidate === held.direction)
  const ms = msOf(held.ms)
  return {
    name,
    ...(direction ? { direction } : {}),
    ...(ms === undefined ? {} : { ms }),
  }
}

function msOf(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined
  if (value < TRANSITION_MS.min || value > TRANSITION_MS.max) return undefined
  return value
}

/**
 * The transition a slide arrives with: its frame's override when it holds
 * one, else its page's, else none. An override with no duration takes the
 * page's, so a deck keeps one pace while one slide changes its look.
 */
export function resolveTransition(
  page: Transition | null | undefined,
  frame: Transition | null | undefined,
): ResolvedTransition {
  const chosen = frame ?? page
  if (!chosen) return { name: 'none', direction: null, ms: 0 }
  return {
    name: chosen.name,
    direction: takesDirection(chosen.name)
      ? (chosen.direction ?? DEFAULT_DIRECTION)
      : null,
    ms:
      chosen.name === 'none'
        ? 0
        : (chosen.ms ?? page?.ms ?? DEFAULT_TRANSITION_MS),
  }
}

/**
 * The attributes marking an element as a step of its slide. Present mode
 * alone reads them, so the file shows every step everywhere else.
 */
export const STEP_ATTRIBUTES = {
  step: 'data-step',
  effect: 'data-step-effect',
  start: 'data-step-start',
} as const

/** The entrances a step takes, a slide tool's first five. */
export const STEP_EFFECTS = ['appear', 'fade', 'fly', 'wipe', 'zoom'] as const

export type StepEffect = (typeof STEP_EFFECTS)[number]

export const STEP_EFFECT_LABELS = {
  appear: 'Appear',
  fade: 'Fade in',
  fly: 'Fly in',
  wipe: 'Wipe',
  zoom: 'Zoom',
} as const satisfies Record<StepEffect, string>

/**
 * When a step shows: on its own press, with the step before it, or right
 * after the step before it finishes.
 */
export const STEP_STARTS = ['click', 'with', 'after'] as const

export type StepStart = (typeof STEP_STARTS)[number]

export const STEP_START_LABELS = {
  click: 'On click',
  with: 'With previous',
  after: 'After previous',
} as const satisfies Record<StepStart, string>
