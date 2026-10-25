import type { KeyboardEvent, PointerEvent } from 'react'

import type { Hsv } from './space'

interface SaturationAreaProps {
  hsv: Hsv
  onChange: (hsv: Hsv) => void
}

const KEYS: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, 1],
  ArrowDown: [0, -1],
}

/**
 * The picker's square, saturation left to right and value bottom to top
 * at the current hue. A press or a drag places the thumb, and the arrow
 * keys move it by 1 percent, or 10 with Shift.
 */
export function SaturationArea({ hsv, onChange }: SaturationAreaProps) {
  const place = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    onChange({
      h: hsv.h,
      s: unit((event.clientX - box.left) / box.width),
      v: unit(1 - (event.clientY - box.top) / box.height),
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const move = KEYS[event.key]
    if (!move) return
    event.preventDefault()
    const amount = event.shiftKey ? 0.1 : 0.01
    onChange({
      h: hsv.h,
      s: unit(hsv.s + move[0] * amount),
      v: unit(hsv.v + move[1] * amount),
    })
  }

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Saturation and brightness"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(hsv.s * 100)}
      aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
      className="relative h-[150px] touch-none rounded-[7px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      style={{
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))`,
      }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        event.currentTarget.focus()
        place(event)
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          place(event)
        }
      }}
      onKeyDown={onKeyDown}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute size-3 -translate-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.4)]"
        style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
      />
    </div>
  )
}

function unit(value: number): number {
  return Math.min(1, Math.max(0, value))
}
