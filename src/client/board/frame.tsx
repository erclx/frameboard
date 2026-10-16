import { memo } from 'react'

import { frameUrl } from '@/shared/board-urls'
import type { FrameRecord } from '@/shared/records/list'

interface FrameProps {
  frame: FrameRecord
  /** False for a frame far offscreen, which draws a placeholder rather than a live page. */
  live: boolean
  /** Bumped on each reload message, so a changed file reloads this iframe alone. */
  version: number
}

/**
 * One frame at its box on the canvas layer, with its name above it at a
 * constant screen size. The label is the surface later rows add check
 * findings and claim tags to.
 */
export const Frame = memo(function Frame({ frame, live, version }: FrameProps) {
  const { x, y, width, height } = frame.box
  return (
    <div
      data-frame={frame.ref}
      className="absolute"
      style={{ left: x, top: y, width, height, zIndex: frame.order }}
    >
      <div
        className="absolute bottom-full left-0 origin-bottom-left truncate pb-1 text-label text-muted-foreground [transform:scale(calc(1/var(--zoom,1)))]"
        style={{ maxWidth: `calc(${width}px * var(--zoom, 1))` }}
        title={frame.name}
      >
        {frame.name}
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
