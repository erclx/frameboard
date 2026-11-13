import {
  STEP_ATTRIBUTES,
  STEP_EFFECTS,
  STEP_STARTS,
  type StepEffect,
  type StepStart,
} from '@/shared/present-transition'

/** One element a press reveals, with its entrance and how long after the press it starts. */
export interface StepItem {
  element: Element
  effect: StepEffect
  delayMs: number
}

/** The elements one press reveals together. */
export type StepGroup = StepItem[]

/** How long one step's entrance runs. Appear runs none. */
export const STEP_MS = 400

/** The board's own marks in a presented document, so nothing it writes lands on a key the file uses. */
const SHOWN = 'data-frameboard-step'
const DELAY = '--frameboard-step-delay'
const STYLE_ID = 'frameboard-present-steps'

/**
 * The style hiding a step not yet revealed and playing each effect as one
 * is. It keeps the hidden step's room, so revealing one moves nothing else,
 * and under reduced motion every step appears with no movement.
 */
// canon-allow-embedded: interpolates the step attribute, length, and delay names, and is injected into the presented document as text
const STEP_STYLE = `
[${SHOWN}='hidden'] { visibility: hidden !important }
@keyframes frameboard-step-appear { from { visibility: hidden } to { visibility: visible } }
@keyframes frameboard-step-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes frameboard-step-fly { from { opacity: 0; translate: 0 40px } to { opacity: 1; translate: 0 0 } }
@keyframes frameboard-step-wipe { from { clip-path: inset(0 100% 0 0) } to { clip-path: inset(0 0 0 0) } }
@keyframes frameboard-step-zoom { from { opacity: 0; scale: 0.6 } to { opacity: 1; scale: 1 } }
@media (prefers-reduced-motion: no-preference) {
  [${SHOWN}='enter'] {
    animation-duration: ${STEP_MS}ms;
    animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    animation-fill-mode: both;
    animation-delay: var(${DELAY}, 0ms);
  }
  [${SHOWN}='enter'][${SHOWN}-effect='appear'] { animation-name: frameboard-step-appear; animation-duration: 1ms }
  [${SHOWN}='enter'][${SHOWN}-effect='fade'] { animation-name: frameboard-step-fade }
  [${SHOWN}='enter'][${SHOWN}-effect='fly'] { animation-name: frameboard-step-fly }
  [${SHOWN}='enter'][${SHOWN}-effect='wipe'] { animation-name: frameboard-step-wipe }
  [${SHOWN}='enter'][${SHOWN}-effect='zoom'] { animation-name: frameboard-step-zoom }
}
`

/**
 * An element's inline style, read without `instanceof`, since the element
 * lives in the frame's own window, whose classes are not this one's.
 */
function inlineStyleOf(element: Element): CSSStyleDeclaration | undefined {
  return 'style' in element
    ? (element as Element & ElementCSSInlineStyle).style
    : undefined
}

/** A step number as written, or null for anything but a positive integer. */
function stepNumberOf(element: Element): number | null {
  const value = element.getAttribute(STEP_ATTRIBUTES.step)?.trim() ?? ''
  if (!/^\d+$/.test(value)) return null
  const number = Number(value)
  return number > 0 ? number : null
}

function effectOf(element: Element): StepEffect {
  const value = element.getAttribute(STEP_ATTRIBUTES.effect)
  return STEP_EFFECTS.find((effect) => effect === value) ?? 'appear'
}

function startOf(element: Element): StepStart {
  const value = element.getAttribute(STEP_ATTRIBUTES.start)
  return STEP_STARTS.find((start) => start === value) ?? 'click'
}

function durationOf(effect: StepEffect): number {
  return effect === 'appear' ? 0 : STEP_MS
}

/**
 * A document's steps, one group per press, in number order with gaps closed.
 * Equal numbers share a press, and a step starting with or after the one
 * before it joins that one's press, an after step waiting for it to finish.
 * Ties keep document order, and an element whose number is not a positive
 * integer is no step.
 */
export function readSteps(doc: Document): StepGroup[] {
  const marked = [...doc.querySelectorAll(`[${STEP_ATTRIBUTES.step}]`)]
    .map((element) => ({ element, number: stepNumberOf(element) }))
    .filter(
      (entry): entry is { element: Element; number: number } =>
        entry.number !== null,
    )
    .sort((a, b) => a.number - b.number)
  const groups: StepGroup[] = []
  let number: number | null = null
  for (const entry of marked) {
    const start = startOf(entry.element)
    const effect = effectOf(entry.element)
    const group = groups.at(-1)
    const last = group?.at(-1)
    if (group && last && (entry.number === number || start !== 'click')) {
      const delayMs =
        start === 'after'
          ? last.delayMs + durationOf(last.effect)
          : last.delayMs
      group.push({ element: entry.element, effect, delayMs })
    } else {
      groups.push([{ element: entry.element, effect, delayMs: 0 }])
    }
    number = entry.number
  }
  return groups
}

const MARKED = `[${STEP_ATTRIBUTES.step}]`

function holdsStep(node: Node): boolean {
  return (
    node.nodeType === 1 &&
    ((node as Element).matches(MARKED) ||
      (node as Element).querySelector(MARKED) !== null)
  )
}

/**
 * Whether a batch of mutations can change a document's steps: a step
 * attribute written, or a marked element added or removed. Anything else a
 * slide does to itself, a ticking clock or a style the board injects, leaves
 * the steps as read.
 */
export function touchesSteps(records: readonly MutationRecord[]): boolean {
  return records.some(
    (record) =>
      record.type === 'attributes' ||
      [...record.addedNodes, ...record.removedNodes].some(holdsStep),
  )
}

/**
 * Shows the first `shown` groups and hides the rest. With `entering`, the
 * group at that index plays its entrances, and every other shown group
 * stands as it is, so stepping back hides the last group at once.
 */
export function showSteps(
  doc: Document,
  groups: readonly StepGroup[],
  shown: number,
  entering: number | null = null,
): void {
  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement('style')
    style.id = STYLE_ID
    style.textContent = STEP_STYLE
    doc.head?.append(style)
  }
  for (const [index, group] of groups.entries()) {
    for (const { element, effect, delayMs } of group) {
      const state =
        index >= shown ? 'hidden' : index === entering ? 'enter' : 'shown'
      element.setAttribute(SHOWN, state)
      element.setAttribute(`${SHOWN}-effect`, effect)
      inlineStyleOf(element)?.setProperty(DELAY, `${delayMs}ms`)
    }
  }
}

/** Takes every mark the board wrote out of `doc`, so it shows each step as the file does. */
export function clearSteps(doc: Document): void {
  doc.getElementById(STYLE_ID)?.remove()
  for (const element of doc.querySelectorAll(`[${SHOWN}]`)) {
    element.removeAttribute(SHOWN)
    element.removeAttribute(`${SHOWN}-effect`)
    inlineStyleOf(element)?.removeProperty(DELAY)
  }
}
