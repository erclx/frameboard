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

/**
 * A project's first visible page as white boxes scaled to fit, each capture
 * drawn over its box, so the box stays the placeholder for one not rendered.
 */
export function FrameSkeleton({
  project,
  captures,
  className,
}: FrameSkeletonProps) {
  const frames = cardFrames(project)
  if (frames.length === 0) return null
  const boxes = frames.map((frame) => frame.box)
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
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
        return (
          <g key={ref}>
            <rect
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              // Frames are white pages in either theme, so their boxes are too.
              className="fill-white stroke-black/6"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
            {captures && stamp ? (
              <image
                href={thumbnailUrl(ref, captures.theme, stamp)}
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                preserveAspectRatio="none"
              />
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

function thumbnailUrl(ref: string, theme: Theme, stamp: string): string {
  return `/api/thumbnails/png?${new URLSearchParams({ ref, theme, v: stamp })}`
}
