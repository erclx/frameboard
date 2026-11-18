import { type KeyboardEvent, useRef, useState } from 'react'

import { cn } from '@/client/lib/cn'

import { prefersReducedMotion } from '../present/travel'
import { EffectTile, type TilePicture } from './effect-tile'

export interface TileOption {
  value: string
  label: string
  /** The accessible name, where the label alone would not say it. */
  name?: string
  picture: TilePicture
}

interface EffectTilesProps {
  /** The id of the visible caption naming the group. */
  labelledBy: string
  describedBy?: string
  options: readonly TileOption[]
  /** The value held, or null where nothing is picked, such as several differing. */
  current: string | null
  columns: 4 | 5
  disabled: boolean
  onPick: (value: string) => void
  /** Plays a tile's motion on the slide or the element, on hover or focus. */
  onPreview?: (value: string) => void
  onPreviewEnd?: () => void
}

/** The radio group's arrow keys, each moving one tile along and picking it. */
const ARROW_STEPS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
}

/**
 * A grid of tiles picked like a radio group, each playing its own motion on
 * hover or focus while `onPreview` plays it on the slide or the element.
 * Arrows move the pick, and Escape puts back the value held when focus came
 * in. Past two rows the grid scrolls inside its own height.
 */
export function EffectTiles({
  labelledBy,
  describedBy,
  options,
  current,
  columns,
  disabled,
  onPick,
  onPreview,
  onPreviewEnd,
}: EffectTilesProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const entered = useRef<string | null>(null)
  const [playing, setPlaying] = useState<{ value: string; play: number }>({
    value: '',
    play: 0,
  })

  const start = (value: string) => {
    if (disabled || playing.value === value) return
    if (!prefersReducedMotion()) {
      setPlaying((held) => ({ value, play: held.play + 1 }))
    }
    onPreview?.(value)
  }
  const end = () => {
    setPlaying((held) => ({ ...held, value: '' }))
    onPreviewEnd?.()
  }
  const pick = (value: string) => {
    if (value !== current) onPick(value)
  }

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.key === 'Escape') {
      end()
      const held = entered.current
      if (held === null || held === current) return
      event.stopPropagation()
      onPick(held)
      buttons.current[options.findIndex(({ value }) => value === held)]?.focus()
      return
    }
    const by = ARROW_STEPS[event.key]
    if (by === undefined) return
    event.preventDefault()
    const next = (index + by + options.length) % options.length
    const target = options[next]
    if (!target) return
    buttons.current[next]?.focus()
    pick(target.value)
  }

  // The checked tile takes the tab stop, or the first where none is.
  const focusable = Math.max(
    0,
    options.findIndex(({ value }) => value === current),
  )

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onFocus={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          entered.current = current
        }
      }}
      className={cn(
        'grid max-h-[118px] gap-1.5 overflow-y-auto p-0.5',
        columns === 4 ? 'grid-cols-4' : 'grid-cols-5',
      )}
    >
      {options.map((option, index) => {
        const checked = option.value === current
        const play = playing.value === option.value
        return (
          <button
            key={option.value}
            ref={(button) => {
              buttons.current[index] = button
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.name}
            title={option.name}
            tabIndex={index === focusable ? 0 : -1}
            disabled={disabled}
            data-tile={option.value}
            onClick={() => pick(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            onPointerEnter={() => start(option.value)}
            onPointerLeave={end}
            onFocus={() => start(option.value)}
            onBlur={end}
            className={cn(
              'group min-w-0 rounded-[7px] px-1 pt-[5px] pb-1 text-center text-caption text-muted-foreground outline-none hover:bg-input hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40',
              checked &&
                'font-semibold text-foreground shadow-[0_0_0_1.5px_var(--primary)]',
            )}
          >
            <EffectTile
              key={play ? playing.play : 'rest'}
              picture={option.picture}
              playing={play}
              onPlayed={() =>
                setPlaying((held) =>
                  held.value === option.value ? { ...held, value: '' } : held,
                )
              }
            />
            <span className="mt-1 block truncate">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
