import { TriangleAlert } from 'lucide-react'
import { memo } from 'react'

import { frameUrl } from '@/shared/board-urls'
import type { Finding } from '@/shared/records/check'
import type { FrameRecord } from '@/shared/records/list'

interface FrameProps {
  frame: FrameRecord
  /** False for a frame far offscreen, which draws a placeholder rather than a live page. */
  live: boolean
  /** Bumped on each reload message, so a changed file reloads this iframe alone. */
  version: number
  /** The frame's check findings, marked on its label when there are any. */
  findings?: readonly Finding[]
}

/**
 * One frame at its box on the canvas layer, with its name above it at a
 * constant screen size. The label is the surface later rows add check
 * findings and claim tags to.
 */
export const Frame = memo(function Frame({
  frame,
  live,
  version,
  findings,
}: FrameProps) {
  const { x, y, width, height } = frame.box
  return (
    <div
      data-frame={frame.ref}
      className="absolute"
      style={{ left: x, top: y, width, height, zIndex: frame.order }}
    >
      <div
        className="absolute bottom-full left-0 flex origin-bottom-left items-center gap-1.5 pb-1 text-label text-muted-foreground [transform:scale(calc(1/var(--zoom,1)))]"
        style={{ maxWidth: `calc(${width}px * var(--zoom, 1))` }}
        title={frame.name}
      >
        <span className="truncate">{frame.name}</span>
        {findings && findings.length > 0 ? (
          <FindingsMark findings={findings} />
        ) : null}
      </div>
      {live ? (
        <iframe
          title={frame.name}
          src={`${frameUrl(frame.ref)}?v=${version}`}
          className="block size-full border-0 bg-[color:Canvas]"
        />
      ) : (
        <div
          data-placeholder
          className="size-full border border-border bg-card"
        />
      )}
    </div>
  )
})

interface FindingsMarkProps {
  findings: readonly Finding[]
}

/**
 * The count of a frame's check findings beside its name. It never shrinks,
 * so a narrow frame truncates the name and keeps the count. The hue sits on
 * the icon alone, since the note color is too light for text on the light
 * canvas, and the count reads in the text color.
 */
function FindingsMark({ findings }: FindingsMarkProps) {
  const count = findings.length
  return (
    <span
      role="img"
      aria-label={`${count} check finding${count === 1 ? '' : 's'}`}
      title={findings.map((finding) => finding.message).join('\n')}
      className="flex shrink-0 items-center gap-0.5 text-foreground"
    >
      <TriangleAlert aria-hidden className="size-3 text-note" />
      {count}
    </span>
  )
}
