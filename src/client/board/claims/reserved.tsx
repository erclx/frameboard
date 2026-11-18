import type { FrameRecord } from '@/shared/records/list'

import { initialOf } from './label'
import { useReservedBoxes } from './reservations'

/**
 * Each reserved, unwritten frame as a hatched box where its file will land,
 * none in Play, which shows the frames as they ship.
 */
export function ReservedBoxes({
  page,
  frames,
}: {
  page: string
  frames: readonly FrameRecord[]
}) {
  return useReservedBoxes(page, frames).map(
    ({ claim, name, index, count, drawing }) => {
      const state = drawing ? 'drawing' : 'queued'
      const tag = `${initialOf(claim.tag)}${claim.tag.slice(1)}`
      return (
        <div
          key={claim.frame}
          data-reserved={claim.frame}
          data-drawing={drawing || undefined}
          role="img"
          aria-label={`${name}, reserved by ${tag}, ${index} of ${count}, ${state}`}
          className="pointer-events-none absolute rounded-[2px] bg-[repeating-linear-gradient(135deg,color-mix(in_srgb,var(--claim)_10%,transparent)_0_6px,transparent_6px_12px)]"
          style={{
            left: claim.box.x,
            top: claim.box.y,
            width: claim.box.width,
            height: claim.box.height,
          }}
        >
          <div
            aria-hidden
            className="absolute bottom-full left-0 flex origin-bottom-left items-center gap-1.5 pb-1 text-label font-normal whitespace-nowrap text-claim [transform:scale(calc(1/var(--zoom,1)))]"
          >
            <span>{name}</span>
            <span className="grid size-4 shrink-0 place-items-center rounded-full bg-claim text-[9px] font-bold text-card">
              {initialOf(claim.agent)}
            </span>
            <span data-reserved-place>
              {index} of {count}
            </span>
          </div>
          <svg
            aria-hidden
            className="absolute inset-0 size-full overflow-visible"
          >
            <rect
              width="100%"
              height="100%"
              fill="none"
              className="stroke-claim [stroke-width:calc(1.5px/var(--zoom,1))] [stroke-dasharray:calc(4.5px/var(--zoom,1))_calc(3px/var(--zoom,1))]"
            />
          </svg>
          <div
            aria-hidden
            data-reserved-state
            className="absolute inset-0 grid place-items-center text-label text-claim [transform-origin:center] [&>span]:[transform:scale(calc(1/var(--zoom,1)))]"
          >
            <span>{state}…</span>
          </div>
        </div>
      )
    },
  )
}
