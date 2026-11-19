import { useState } from 'react'

import { cn } from '@/client/lib/cn'
import { thumbnailUrl } from '@/client/live/thumbnail-url'
import { cardFrames } from '@/shared/card-frames'
import type { ProjectRecord } from '@/shared/records/list'
import type { Theme } from '@/shared/theme'

interface FrameSkeletonProps {
  project: ProjectRecord
  /** The thumbnail stamps of the theme shown, absent for a mark drawing boxes alone. */
  captures?: {
    theme: Theme
    stamps: Readonly<Record<string, string>>
  }
  className?: string
}

/** How a capture's image request ended, keyed by its URL so a new stamp waits again. */
type Settled = Readonly<Record<string, 'loaded' | 'failed'>>

/** What a box shows: its capture, the pulse while that loads, or still grey without one. */
type Capture = 'drawn' | 'waiting' | 'none'

const BOX_FILL: Readonly<Record<Capture, string>> = {
  // Frames are white pages in either theme, so a drawn capture's box is too.
  drawn: 'fill-white',
  waiting: 'fill-muted motion-safe:animate-frame-loading',
  none: 'fill-muted',
}

/**
 * A project's first visible page as boxes scaled to fit. With `captures`, a
 * box pulses grey until its capture loads over it, and holds still grey when
 * its frame has none or the request fails. Without, every box is white.
 */
export function FrameSkeleton({
  project,
  captures,
  className,
}: FrameSkeletonProps) {
  const [settled, setSettled] = useState<Settled>({})
  const frames = cardFrames(project)
  if (frames.length === 0) return null
  const boxes = frames.map((frame) => frame.box)
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  const settle = (href: string, outcome: Settled[string]) =>
    setSettled((current) => ({ ...current, [href]: outcome }))
  return (
    <svg
      aria-hidden
      data-skeleton
      viewBox={`${left} ${top} ${right - left} ${bottom - top}`}
      preserveAspectRatio="xMidYMin meet"
      className={className}
    >
      {frames.map(({ ref, box }) => {
        const stamp = captures?.stamps[ref]
        const href =
          captures && stamp
            ? thumbnailUrl(ref, captures.theme, stamp)
            : undefined
        const outcome = href === undefined ? undefined : settled[href]
        const capture: Capture | undefined = !captures
          ? undefined
          : href === undefined || outcome === 'failed'
            ? 'none'
            : outcome === 'loaded'
              ? 'drawn'
              : 'waiting'
        return (
          <g key={ref}>
            <rect
              data-capture={capture}
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              className={cn('stroke-black/6', BOX_FILL[capture ?? 'drawn'])}
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {href !== undefined && outcome !== 'failed' ? (
              <image
                href={href}
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                preserveAspectRatio="none"
                onLoad={() => settle(href, 'loaded')}
                onError={() => settle(href, 'failed')}
              />
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
