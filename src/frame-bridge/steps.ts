import { elementAt } from '@/shared/frame-bridge/elements'
import { VIEWER_TAG } from '@/shared/model-viewer'
import {
  groupSteps,
  type PressStep,
  stepAttributes,
  stepOf,
} from '@/shared/present-steps'
import {
  STEP_ATTRIBUTES,
  STEP_KEYFRAMES,
  STEP_MS,
  type StepEffect,
} from '@/shared/present-transition'
import { LOOK_MARKER } from '@/shared/theme'

import type { Handlers } from './handler'

/** The elements one press reveals together. */
export type StepGroup = PressStep<Element>[]

/** Frameboard's own marks in a presented document, so nothing it writes lands on a key the file uses. */
const SHOWN = 'data-frameboard-step'
const DELAY = '--frameboard-step-delay'
const DURATION = '--frameboard-step-duration'
const STYLE_ID = 'frameboard-present-steps'

/**
 * The style hiding a step not yet revealed and playing each effect as one
 * is, keeping its room, for `ms` where a step marks no length. Under reduced
 * motion every step appears unmoved.
 */
// canon-allow-embedded: interpolates the step attribute, length, and delay names, and is injected into the presented document as text
const stepStyle = (ms: number) => `
[${SHOWN}='hidden'] { visibility: hidden !important }
${STEP_KEYFRAMES}
@media (prefers-reduced-motion: no-preference) {
  [${SHOWN}='enter'] {
    animation-duration: var(${DURATION}, ${ms}ms);
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

/** An element's inline style, undefined for one in a namespace with none. */
function inlineStyleOf(element: Element): CSSStyleDeclaration | undefined {
  return element instanceof HTMLElement || element instanceof SVGElement
    ? element.style
    : undefined
}

/** A document's steps, one group per press, as `groupSteps` orders and times them. */
export function readSteps(doc: Document): StepGroup[] {
  return groupSteps(
    [...doc.querySelectorAll(MARKED)].flatMap((element) => {
      const step = stepOf(
        element.localName,
        stepAttributes((name) => element.getAttribute(name)),
      )
      return step ? [{ of: element, step }] : []
    }),
  )
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
 * Whether mutations can change the steps, being a step attribute or a marked
 * element, so a ticking clock or an injected style leaves them as read.
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
  holdStepStyle(doc)
  for (const [index, group] of groups.entries()) {
    for (const { of: element, step, waitMs } of group) {
      const state =
        index >= shown ? 'hidden' : index === entering ? 'enter' : 'shown'
      element.setAttribute(SHOWN, state)
      element.setAttribute(`${SHOWN}-effect`, step.effect)
      const style = inlineStyleOf(element)
      style?.setProperty(DELAY, `${waitMs}ms`)
      style?.setProperty(DURATION, `${step.durationMs}ms`)
    }
  }
}

/** Marked as injected and appended last, so an element index and the rendered hash read past it. */
function holdStepStyle(doc: Document, ms = STEP_MS): void {
  const held = doc.getElementById(STYLE_ID)
  const style = held ?? doc.createElement('style')
  const css = stepStyle(ms)
  if (style.textContent !== css) style.textContent = css
  if (held) return
  style.id = STYLE_ID
  style.setAttribute(LOOK_MARKER, '')
  doc.head?.append(style)
}

/** Appear's own entrance runs 1 ms and would show nothing, so its preview blinks the element. */
const APPEAR_PREVIEW_MS = STEP_MS / 2

/**
 * Plays `effect` once for `ms` on an element in Edit and takes its marks back
 * off, its length in the injected style alone so no empty `style` is left.
 * The returned call ends it.
 */
export function previewStep(
  element: Element,
  effect: StepEffect,
  ms = STEP_MS,
): () => void {
  const doc = element.ownerDocument
  holdStepStyle(doc, ms)
  const appear = effect === 'appear'
  element.setAttribute(SHOWN, appear ? 'hidden' : 'enter')
  element.setAttribute(`${SHOWN}-effect`, effect)
  let done = false
  const end = () => {
    if (done) return
    done = true
    clearTimeout(timer)
    element.removeAttribute(SHOWN)
    element.removeAttribute(`${SHOWN}-effect`)
    if (!doc.querySelector(`[${SHOWN}]`)) doc.getElementById(STYLE_ID)?.remove()
  }
  const timer = setTimeout(end, appear ? APPEAR_PREVIEW_MS : ms)
  return end
}

/** Takes every mark a walk wrote out of `doc`, so it shows each step as the file does. */
export function clearSteps(doc: Document): void {
  doc.getElementById(STYLE_ID)?.remove()
  for (const element of doc.querySelectorAll(`[${SHOWN}]`)) {
    element.removeAttribute(SHOWN)
    element.removeAttribute(`${SHOWN}-effect`)
    inlineStyleOf(element)?.removeProperty(DELAY)
    inlineStyleOf(element)?.removeProperty(DURATION)
  }
}

/** The step attributes an agent's write can change, which read the steps again. */
const STEP_KEYS = Object.values(STEP_ATTRIBUTES)

/** A video or a viewer whose clip a step starts, its members absent on a viewer no script drew yet. */
interface Clip extends Element {
  play?: () => unknown
  pause?: () => void
  paused?: boolean
  currentTime?: number
  /** Whether a viewer drew its model, which a video never states. */
  loaded?: boolean
}

/** Pauses a clip, and puts it back to its start when asked. */
function restClip(clip: Clip, rewind: boolean): void {
  // Before its script runs a viewer holds neither, and a time set then would shadow the viewer's own.
  if (typeof clip.pause !== 'function') return
  clip.pause()
  if (rewind) clip.currentTime = 0
}

function playClip(clip: Clip): void {
  // A play the page refuses leaves the step standing as it appears.
  void Promise.resolve(clip.play?.()).catch(() => undefined)
}

function prefersReducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * What a walk owes a playing step's clip: rest while it is hidden or its
 * delay runs, a start once its model loads, rest throughout under reduced
 * motion, or nothing more.
 */
type ClipState = 'hidden' | 'waiting' | 'loading' | 'still' | 'out'

const RESTING: readonly (ClipState | undefined)[] = [
  'hidden',
  'waiting',
  'still',
]

/** The clips of one walk's playing steps. */
interface WalkClips {
  show: (
    groups: readonly StepGroup[],
    shown: number,
    entering: number | null,
  ) => void
  close: () => void
}

/**
 * Starts each playing step's clip as its entrance does where the walk `plays`,
 * once per entrance, and rests one that starts while hidden, as an `autoplay`
 * does. A step standing as shown starts nothing by itself.
 */
function walkClips(doc: Document, plays: boolean): WalkClips {
  const states = new Map<Clip, ClipState>()
  const timers = new Map<Clip, ReturnType<typeof setTimeout>>()

  const stopWaiting = (clip: Clip) => {
    clearTimeout(timers.get(clip))
    timers.delete(clip)
  }
  const put = (clip: Clip, state: ClipState) => {
    stopWaiting(clip)
    states.set(clip, state)
  }
  const start = (clip: Clip) => {
    const unloaded = clip.localName === VIEWER_TAG && clip.loaded !== true
    put(clip, unloaded ? 'loading' : 'out')
    if (!unloaded) playClip(clip)
  }
  const hide = (clip: Clip) => {
    const ran = states.get(clip) === 'out' || clip.paused === false
    put(clip, 'hidden')
    restClip(clip, ran)
  }
  const enter = (clip: Clip, waitMs: number) => {
    const held = states.get(clip)
    // A reread keeps a step entering, and never restarts what its press started.
    if (held !== undefined && held !== 'hidden') return
    if (!plays) put(clip, 'out')
    else if (waitMs === 0 || prefersReducedMotion()) start(clip)
    else {
      put(clip, 'waiting')
      timers.set(
        clip,
        setTimeout(() => start(clip), waitMs),
      )
    }
  }
  const stand = (clip: Clip) => {
    const held = states.get(clip)
    // A press past a step still waiting shows it at once, and its clip with it.
    if (held === 'waiting') start(clip)
    else if (held !== 'loading') put(clip, 'out')
  }
  const still = (clip: Clip) => {
    put(clip, 'still')
    if (clip.paused === false) restClip(clip, true)
  }

  const started = ({ target }: Event) => {
    const clip = target as Clip
    if (RESTING.includes(states.get(clip))) restClip(clip, true)
  }
  const loaded = ({ target }: Event) => {
    const clip = target as Clip
    if (states.get(clip) === 'loading') start(clip)
  }
  // Captured, since neither event bubbles out of the clip it fires on.
  doc.addEventListener('play', started, true)
  doc.addEventListener('load', loaded, true)

  return {
    show: (groups, shown, entering) => {
      const held = new Set<Clip>()
      const reduced = prefersReducedMotion()
      for (const [index, group] of groups.entries()) {
        for (const { of: clip, step, waitMs } of group) {
          if (!step.plays) continue
          held.add(clip)
          if (index >= shown) hide(clip)
          else if (reduced && clip.localName === VIEWER_TAG) still(clip)
          else if (index === entering) enter(clip, waitMs)
          else stand(clip)
        }
      }
      for (const clip of [...states.keys()]) {
        if (held.has(clip)) continue
        stopWaiting(clip)
        states.delete(clip)
      }
    },
    close: () => {
      for (const clip of [...timers.keys()]) stopWaiting(clip)
      doc.removeEventListener('play', started, true)
      doc.removeEventListener('load', loaded, true)
    },
  }
}

/** A walk the board holds open, by its request id: the step it shows and the groups last read. */
interface Walk {
  shown: number
  entering: number | null
  groups: StepGroup[]
  clips: WalkClips
}

const walks = new Map<string, Walk>()

function showWalk({ groups, shown, entering, clips }: Walk): void {
  showSteps(document, groups, shown, entering)
  clips.show(groups, shown, entering)
}

/**
 * A presented page's steps, walked here so the board never reads its
 * document. A reread on an agent's write shows the step the walk holds at
 * once, since new groups would otherwise show unhidden until the board's word.
 */
export const stepHandlers: Handlers = {
  steps: ({ shown, plays }, { id, push, onClose }) => {
    const walk: Walk = {
      shown,
      entering: null,
      groups: readSteps(document),
      clips: walkClips(document, plays === true),
    }
    showWalk(walk)
    walks.set(id, walk)
    const observer = new MutationObserver((records) => {
      if (!touchesSteps(records)) return
      walk.groups = readSteps(document)
      showWalk(walk)
      push(walk.groups.length)
    })
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributeFilter: STEP_KEYS,
    })
    onClose(() => {
      observer.disconnect()
      walk.clips.close()
      walks.delete(id)
    })
    return walk.groups.length
  },
  'steps-show': ({ steps, shown, entering }) => {
    const walk = walks.get(steps)
    if (!walk) return false
    walk.shown = shown
    walk.entering = entering
    showWalk(walk)
    return true
  },
  'step-preview': ({ index, effect, ms }, { onClose }) => {
    const target = elementAt(document, index)
    if (!target) return false
    onClose(previewStep(target, effect, ms))
    return true
  },
}
