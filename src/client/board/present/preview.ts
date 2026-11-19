import type { StepEffect } from '@/shared/present-transition'

import { subscribe } from '../bridge/channel'
import { liveIframe } from '../frame-dom'
import type { ElementKey } from '../selection'
import { EASING, layerStyle } from './keyframes'
import { prefersReducedMotion, type Travel } from './travel'

let ending: (() => void) | null = null

/**
 * Starts one preview, ending the one playing first, so hovering across tiles
 * fast runs a single preview and leaves its target where it started. Under
 * reduced motion nothing starts.
 */
export function playPreview(start: () => () => void): void {
  stopPreview()
  if (prefersReducedMotion()) return
  ending = start()
}

/** Ends the preview playing, restoring its target, and does nothing when none is. */
export function stopPreview(): void {
  const end = ending
  ending = null
  end?.()
}

/**
 * Cuts a slide or push arrival at its own box, so a canvas frame never slides
 * over its neighbors. Same curve and length as the travel, so the two cancel.
 */
const CLIP_KEYFRAMES_ID = 'fb-preview-clip'
const CLIP_KEYFRAMES = `@keyframes ${CLIP_KEYFRAMES_ID} {
  from { clip-path: inset(var(--clip-top) var(--clip-right) var(--clip-bottom) var(--clip-left)) }
  to { clip-path: inset(0) }
}`

function holdClipKeyframes(): void {
  if (document.getElementById(CLIP_KEYFRAMES_ID)) return
  const style = document.createElement('style')
  style.id = CLIP_KEYFRAMES_ID
  style.textContent = CLIP_KEYFRAMES
  document.head.append(style)
}

/** How far a percentage offset reaches past an edge, as an inset, or none when it points the other way. */
function insetOf(offset: string, side: 1 | -1): string {
  const share = Number.parseFloat(offset) * side
  return share > 0 ? `${share}%` : '0%'
}

const WRITTEN = [
  'animation',
  '--from-x',
  '--from-y',
  '--to-x',
  '--to-y',
  '--clip-top',
  '--clip-right',
  '--clip-bottom',
  '--clip-left',
] as const

/**
 * Plays `travel`'s arrival on a frame in Edit and takes back every property
 * it wrote. The returned call ends it early. The file is never written.
 */
export function previewTransition(
  target: HTMLElement,
  travel: Travel,
  project: string,
): () => void {
  const { name, ms } = travel.transition
  if (name === 'none' || ms <= 0) return () => {}
  const style = layerStyle('enter', travel, project) as Record<string, string>
  const props: Record<string, string> = Object.fromEntries(
    Object.entries(style).filter(([property]) => property !== 'animation'),
  )
  let animation = style.animation ?? ''
  if (travel.transition.direction) {
    holdClipKeyframes()
    const x = props['--from-x'] ?? '0%'
    const y = props['--from-y'] ?? '0%'
    props['--clip-top'] = insetOf(y, -1)
    props['--clip-right'] = insetOf(x, 1)
    props['--clip-bottom'] = insetOf(y, 1)
    props['--clip-left'] = insetOf(x, -1)
    animation += `, ${CLIP_KEYFRAMES_ID} ${ms}ms ${EASING} both`
  }
  const kept = WRITTEN.map((property) => ({
    property,
    value: target.style.getPropertyValue(property),
  }))
  for (const [property, value] of Object.entries(props)) {
    target.style.setProperty(property, value)
  }
  target.style.setProperty('animation', animation)
  let done = false
  const end = () => {
    if (done) return
    done = true
    clearTimeout(timer)
    for (const { property, value } of kept) {
      if (value) target.style.setProperty(property, value)
      else target.style.removeProperty(property)
    }
  }
  const timer = setTimeout(end, ms)
  return end
}

/**
 * Plays `effect` once on the selected element in its frame's live page, one
 * preview at a time, the frame ending it on its own and the board closing it
 * to end it early. Nothing plays while the page does not show the element.
 */
export function previewStepOn(element: ElementKey, effect: StepEffect): void {
  playPreview(() => {
    const iframe = liveIframe(element.frame)
    if (!iframe) return () => {}
    return subscribe(
      iframe,
      'step-preview',
      { index: element.index, effect },
      () => {},
    ).close
  })
}
