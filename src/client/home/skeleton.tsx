import type { ProjectRecord } from '@/shared/records/list'

interface FrameSkeletonProps {
  project: ProjectRecord
  className?: string
}

/**
 * The frames of the page a project opens on, drawn as white boxes at their
 * layout boxes and scaled as a group to fit, centered across and held to the
 * top, as `canon/design/home/grid` and `canon/design/home/list` draw a card's
 * well and a row's mark. A project with no visible frame draws nothing,
 * leaving the empty well.
 */
export function FrameSkeleton({ project, className }: FrameSkeletonProps) {
  const frames = (project.pages[0]?.frames ?? []).filter(
    (frame) => !frame.hidden,
  )
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
      {frames.map(({ ref, box }) => (
        <rect
          key={ref}
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          // Frames are white pages in either theme, so their boxes are too.
          className="fill-white stroke-black/6"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}
