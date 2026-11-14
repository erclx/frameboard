/**
 * The transitions present mode draws between slides, in the order the
 * inspector lists them. The list is the board's own. A project adds its
 * own as stylesheets under `assets/transitions/`, each named by its stem,
 * and a name in neither reads as no transition.
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

/** A transition's name as a person reads it: a built-in's label, and a project's own as written. */
export function transitionLabel(name: string): string {
  const builtIn = transitionNameOf(name)
  return builtIn ? TRANSITION_LABELS[builtIn] : name
}

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
  /** A built-in name or one of the project's own. */
  name: string
  direction?: Direction
  ms?: number
}

/** The transition present mode draws, with every default filled in. */
export interface ResolvedTransition {
  name: string
  /** Null for a transition that takes none. */
  direction: Direction | null
  ms: number
}

export function takesDirection(name: string): boolean {
  return (DIRECTED as readonly string[]).includes(name)
}

/** The folder under a project's `assets/` holding its own transitions, one stylesheet each. */
export const TRANSITIONS_FOLDER = 'transitions'

export const TRANSITION_FILE_EXTENSION = '.css'

/** The two layers a transition animates, which name the keyframes a project's file holds. */
export const TRANSITION_ROLES = ['enter', 'leave'] as const

export type TransitionRole = (typeof TRANSITION_ROLES)[number]

/** The word `frame transition` takes to clear an override, so no transition is named it. */
export const SAME_AS_PAGE_WORD = 'page'

const OWN_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const OWN_NAME_MAX_LENGTH = 64

/**
 * Whether a project's transition may take `name`: lowercase kebab case, and
 * neither a built-in nor `page`, so a file never shadows what the board draws.
 */
export function isOwnTransitionName(name: string): boolean {
  return (
    name.length <= OWN_NAME_MAX_LENGTH &&
    OWN_NAME_PATTERN.test(name) &&
    name !== SAME_AS_PAGE_WORD &&
    transitionNameOf(name) === null
  )
}

/**
 * The name the board gives one of a project's keyframes in its own document.
 * It carries the project, with every character outside letters, digits, and
 * dashes spelled as its code, so two projects holding the same file never
 * share a name. An own name holds no doubled dash, which keeps the pair apart.
 */
export function ownKeyframesName(
  project: string,
  name: string,
  role: TransitionRole,
): string {
  const spelled = project.replace(
    /[^A-Za-z0-9-]/g,
    (character) => `_${character.codePointAt(0)?.toString(16)}_`,
  )
  return `fb-own-${spelled}--${name}-${role}`
}

export function transitionNameOf(value: unknown): TransitionName | null {
  return TRANSITIONS.find((name) => name === value) ?? null
}

/**
 * A stored transition as a reader takes it, or null for anything but an
 * object naming a built-in transition or one of `own`, the names the
 * project holds. A direction or a duration no reader understands reads as
 * absent, so it falls to the default rather than hiding the transition, and
 * so does a direction on a transition taking none of the project's own.
 */
export function transitionOf(
  value: unknown,
  own: readonly string[] = [],
): Transition | null {
  return readTransition(value, (name) => own.includes(name))
}

/**
 * A stored transition as a writer keeps it: `transitionOf`, counting any
 * name shaped like a project's own whether or not its file is there. A
 * layout write never drops an entry's transition because its file is
 * missing or refused for now.
 */
export function storedTransitionOf(value: unknown): Transition | null {
  return readTransition(value, isOwnTransitionName)
}

function readTransition(
  value: unknown,
  isOwn: (name: string) => boolean,
): Transition | null {
  if (typeof value !== 'object' || value === null) return null
  const held = value as Record<string, unknown>
  const builtIn = transitionNameOf(held.name)
  const name =
    builtIn ??
    (typeof held.name === 'string' && isOwn(held.name) ? held.name : null)
  if (!name) return null
  const direction = builtIn
    ? DIRECTIONS.find((candidate) => candidate === held.direction)
    : undefined
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
