import type { CSSProperties, ReactNode } from 'react'

import type { Direction } from '@/shared/present-transition'

import type { Travel } from './travel'

/** Which side of a transition a layer draws: the slide arriving or the one it replaces. */
export type LayerRole = 'enter' | 'leave'

const REVERSED: Record<Direction, Direction> = {
  left: 'right',
  right: 'left',
  up: 'down',
  down: 'up',
}

/**
 * Where an arriving slide starts and a leaving one ends, as a share of the
 * window. A slide moving left arrives from the right edge and leaves past
 * the left one.
 */
const OFFSETS: Record<Direction, { x: string; y: string }> = {
  left: { x: '100%', y: '0%' },
  right: { x: '-100%', y: '0%' },
  up: { x: '0%', y: '100%' },
  down: { x: '0%', y: '-100%' },
}

/**
 * The keyframes of every named transition, one pair per name. A directed
 * one reads its offsets from `--from-x`, `--from-y`, `--to-x`, and `--to-y`
 * on the layer, so one pair serves all four directions.
 */
const KEYFRAMES = `
@keyframes fb-present-fade-enter { from { opacity: 0 } to { opacity: 1 } }
@keyframes fb-present-fade-leave { from { opacity: 1 } to { opacity: 0 } }
@keyframes fb-present-dissolve-enter {
  from { opacity: 0; filter: blur(12px) } to { opacity: 1; filter: blur(0) }
}
@keyframes fb-present-dissolve-leave {
  from { opacity: 1; filter: blur(0) } to { opacity: 0; filter: blur(12px) }
}
@keyframes fb-present-slide-enter {
  from { translate: var(--from-x) var(--from-y) } to { translate: 0 0 }
}
@keyframes fb-present-slide-leave { from { opacity: 1 } to { opacity: 1 } }
@keyframes fb-present-push-enter {
  from { translate: var(--from-x) var(--from-y) } to { translate: 0 0 }
}
@keyframes fb-present-push-leave {
  from { translate: 0 0 } to { translate: var(--to-x) var(--to-y) }
}
@keyframes fb-present-zoom-enter {
  from { opacity: 0; scale: 0.6 } to { opacity: 1; scale: 1 }
}
@keyframes fb-present-zoom-leave {
  from { opacity: 1; scale: 1 } to { opacity: 0; scale: 1.15 }
}
@keyframes fb-present-flip-enter {
  0%, 50% { rotate: y -90deg; opacity: 0 }
  50.01% { opacity: 1 }
  100% { rotate: y 0deg; opacity: 1 }
}
@keyframes fb-present-flip-leave {
  0% { rotate: y 0deg; opacity: 1 }
  49.99% { opacity: 1 }
  50%, 100% { rotate: y 90deg; opacity: 0 }
}
`

/** The keyframes every layer plays, mounted once inside the overlay. */
export function TransitionKeyframes() {
  return <style>{KEYFRAMES}</style>
}

function layerStyle(role: LayerRole, { transition, back }: Travel) {
  const { name, ms } = transition
  const direction =
    transition.direction && back
      ? REVERSED[transition.direction]
      : transition.direction
  const from = direction ? OFFSETS[direction] : { x: '0%', y: '0%' }
  return {
    '--from-x': from.x,
    '--from-y': from.y,
    '--to-x': from.x.startsWith('-') ? from.x.slice(1) : `-${from.x}`,
    '--to-y': from.y.startsWith('-') ? from.y.slice(1) : `-${from.y}`,
    animation: `${animationName(name, role)} ${ms}ms cubic-bezier(0.4, 0, 0.2, 1) both`,
  } as CSSProperties
}

function animationName(name: string, role: LayerRole): string {
  return `fb-present-${name}-${role}`
}

/**
 * One slide filling the overlay, playing its side of the step's transition.
 * A leaving layer stacks under the arriving one wherever it sits among its
 * siblings and takes no pointer, so a press during a transition lands on
 * the slide arriving.
 */
export function TransitionLayer({
  role,
  travel,
  children,
}: {
  role: LayerRole
  travel: Travel
  children: ReactNode
}) {
  const playing = travel.transition.name !== 'none'
  return (
    <div
      data-present-layer={role}
      data-transition={playing ? travel.transition.name : undefined}
      inert={role === 'leave' || undefined}
      className="absolute inset-0 overflow-hidden data-[present-layer=leave]:pointer-events-none data-[present-layer=leave]:-z-10"
      style={playing ? layerStyle(role, travel) : undefined}
    >
      {children}
    </div>
  )
}
