import { VIEWER_TAG } from './model-viewer'
import {
  STEP_ATTRIBUTES,
  STEP_DELAY_MS,
  STEP_DURATION_MS,
  STEP_EFFECTS,
  STEP_MS,
  STEP_STARTS,
  type StepEffect,
  type StepStart,
} from './present-transition'

/** A step's attributes as the file writes them, null where absent, the last three absent from an older page. */
export interface StepAttributes {
  step: string | null
  effect: string | null
  start: string | null
  duration?: string | null
  delay?: string | null
  play?: string | null
}

/** One step as a walk reads it, every default filled in. */
export interface Step {
  number: number
  effect: StepEffect
  /** As written, which the first step of a slide and one sharing a number do not start by. */
  start: StepStart
  /** Held by an Appear step too, which runs none of it. */
  durationMs: number
  delayMs: number
  /** Whether a clip starts as the step appears, so false on an element holding none. */
  plays: boolean
}

/** A step in its press, with how it starts and how long past the press. */
export interface PressStep<T> {
  of: T
  step: Step
  start: StepStart
  waitMs: number
}

/** The elements whose clip a step can start. */
const PLAYABLE_TAGS: readonly string[] = ['video', VIEWER_TAG]

/** Whether a step on a `tag` element can start a clip, by its lowercase tag. */
export function canPlayStep(tag: string): boolean {
  return PLAYABLE_TAGS.includes(tag)
}

/** The step attributes `read` answers, an absent one as null. */
export function stepAttributes(
  read: (name: string) => string | null | undefined,
): StepAttributes {
  return {
    step: read(STEP_ATTRIBUTES.step) ?? null,
    effect: read(STEP_ATTRIBUTES.effect) ?? null,
    start: read(STEP_ATTRIBUTES.start) ?? null,
    duration: read(STEP_ATTRIBUTES.duration) ?? null,
    delay: read(STEP_ATTRIBUTES.delay) ?? null,
    play: read(STEP_ATTRIBUTES.play) ?? null,
  }
}

/** The step an element holds, null for a number that is no positive integer, every other bad value reading as its default. */
export function stepOf(tag: string, held: StepAttributes): Step | null {
  const number = wholeNumber(held.step)
  if (number === null || number < 1) return null
  return {
    number,
    effect: STEP_EFFECTS.find((effect) => effect === held.effect) ?? 'appear',
    start: STEP_STARTS.find((start) => start === held.start) ?? 'click',
    durationMs: within(STEP_DURATION_MS, held.duration) ?? STEP_MS,
    delayMs: within(STEP_DELAY_MS, held.delay) ?? 0,
    plays: typeof held.play === 'string' && canPlayStep(tag),
  }
}

function wholeNumber(value: string | null | undefined): number | null {
  const trimmed = value?.trim() ?? ''
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null
}

function within(
  range: { min: number; max: number },
  value: string | null | undefined,
): number | null {
  const ms = wholeNumber(value)
  return ms !== null && ms >= range.min && ms <= range.max ? ms : null
}

/** How long a step's entrance runs, which is none for Appear. */
export function entranceMs(step: Step): number {
  return step.effect === 'appear' ? 0 : step.durationMs
}

/**
 * Steps in document order as one group per press with gaps closed. A with or
 * after step, or one sharing a number, joins the press before it, With last
 * counting from that step's start without its delay, After last from its end.
 */
export function groupSteps<T>(
  steps: readonly { of: T; step: Step }[],
): PressStep<T>[][] {
  const groups: PressStep<T>[][] = []
  let last: { step: Step; startMs: number } | null = null
  for (const { of, step } of steps.toSorted(byNumber)) {
    const shares = last?.step.number === step.number
    const start: StepStart =
      last === null
        ? 'click'
        : shares && step.start === 'click'
          ? 'with'
          : step.start
    const startMs: number =
      last === null || start === 'click'
        ? 0
        : start === 'with'
          ? last.startMs
          : last.startMs + last.step.delayMs + entranceMs(last.step)
    const placed = { of, step, start, waitMs: startMs + step.delayMs }
    const group = groups.at(-1)
    if (group && start !== 'click') group.push(placed)
    else groups.push([placed])
    last = { step, startMs }
  }
  return groups
}

function byNumber(a: { step: Step }, b: { step: Step }): number {
  return a.step.number - b.step.number
}

/** One attribute a reorder writes on one step's element. */
export interface StepWrite<T> {
  of: T
  name: string
  value: string
}

/**
 * What moving a step between places in walk order writes: each row numbered
 * from 1, and the start it plays by where equal numbers or being first held
 * it in place of the one written.
 */
export function reorderSteps<T>(
  steps: readonly { of: T; step: Step }[],
  from: number,
  to: number,
): StepWrite<T>[] {
  const rows = groupSteps(steps).flat()
  const [moved] = rows.splice(from, 1)
  if (!moved) return []
  rows.splice(to, 0, moved)
  return rows.flatMap(({ of, step, start }, at) => {
    const writes: StepWrite<T>[] = []
    if (step.number !== at + 1) {
      writes.push({ of, name: STEP_ATTRIBUTES.step, value: String(at + 1) })
    }
    // The first row starts on the press by its place, whatever it holds.
    if (at > 0 && start !== step.start) {
      writes.push({ of, name: STEP_ATTRIBUTES.start, value: start })
    }
    return writes
  })
}
