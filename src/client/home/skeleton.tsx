import type { ProjectRecord } from '@/shared/records/list'

/**
 * The least board area the drawing spans, so one desktop frame takes about a
 * third of a card's well rather than filling it, as the references draw a
 * page's frames small at the top left.
 */
const MIN_EXTENT = { width: 4320, height: 1890 }

interface FrameSkeletonProps {
  project: ProjectRecord
  /** Fills the box with the frames, as the list row's mark does, rather than holding the card's least extent. */
  fill?: boolean
  className?: string
}

/**
 * The frames of the page a project opens on, drawn as white boxes at their
 * layout boxes and scaled to fit, as `canon/design/home/grid` and
 * `canon/design/home/list` draw a card's well and a row's mark. A project
 * with no visible frame draws nothing, leaving the empty well.
 */
export function FrameSkeleton({
  project,
  fill = false,
  className,
}: FrameSkeletonProps) {
  const frames = (project.pages[0]?.frames ?? []).filter(
    (frame) => !frame.hidden,
  )
  if (frames.length === 0) return null
  const boxes = frames.map((frame) => frame.box)
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  const least = fill ? { width: 0, height: 0 } : MIN_EXTENT
  return (
    <svg
      aria-hidden
      data-skeleton
      viewBox={`${left} ${top} ${Math.max(right - left, least.width)} ${Math.max(bottom - top, least.height)}`}
      preserveAspectRatio="xMinYMin meet"
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
