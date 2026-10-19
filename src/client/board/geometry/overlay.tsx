import type { FrameRecord } from '@/shared/records/list'

import { useSelection } from '../selection'
import { boundsOf, type Box } from './box'
import { OUTLINE, place, screen, sizeLabel } from './draw'
import type { Corner } from './resize'
import { usePendingFrames } from './write'

const CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se']

/** Above every frame, whose z-index is its stacking order. */
const OVERLAY_Z = 1_000_000

const CHIP =
  'absolute top-full left-1/2 origin-top-left rounded-[4px] bg-primary px-1.5 py-0.5 text-[10px] leading-[14px] whitespace-nowrap text-primary-foreground tabular-nums [transform:scale(calc(1/var(--zoom,1)))_translate(-50%,6px)]'

interface OverlayProps {
  /** The page's shown frames, which the selection is drawn from. */
  frames: readonly FrameRecord[]
}

/**
 * What the board draws over the frames on the canvas layer: the selection's
 * outline, corner handles, and size chip, plus the empty marquee and guide
 * layers a gesture draws into. React draws the selection at rest, and a
 * gesture writes this DOM straight from its handler through `draw.ts`, so a
 * drag renders nothing. Every length that has to keep its screen size
 * divides by `--zoom`, as the frame label does.
 */
export function SelectionOverlay({ frames }: OverlayProps) {
  const selected = useSelection((state) => state.frames)
  const shown = usePendingFrames(
    frames.filter((frame) => selected.includes(frame.ref)),
  )
  const bounds = boundsOf(shown.map((frame) => frame.box))
  return (
    <div
      data-overlay
      className="pointer-events-none absolute top-0 left-0"
      style={{ zIndex: OVERLAY_Z }}
    >
      {bounds ? <Selection frames={shown} bounds={bounds} /> : null}
      <div data-marquee-hits />
      <div
        data-marquee
        hidden
        className="absolute bg-primary/10"
        style={{ border: `${screen(1)} solid var(--primary)` }}
      />
      <div data-guides />
    </div>
  )
}

function Selection({
  frames,
  bounds,
}: {
  frames: readonly FrameRecord[]
  bounds: Box
}) {
  const several = frames.length > 1
  return (
    <div
      data-selection
      className="absolute"
      style={{ ...place(bounds), outline: OUTLINE }}
    >
      {several
        ? frames.map((frame) => (
            <div
              key={frame.ref}
              data-outline={frame.ref}
              className="absolute"
              style={{ ...place(frame.box, bounds), outline: OUTLINE }}
            />
          ))
        : null}
      <div data-handles>
        {CORNERS.map((corner) => (
          <span
            key={corner}
            data-handle={corner}
            className="absolute -translate-1/2 border-primary bg-white"
            style={{
              left: corner.endsWith('w') ? 0 : '100%',
              top: corner.startsWith('n') ? 0 : '100%',
              width: screen(7),
              height: screen(7),
              borderWidth: screen(1.5),
            }}
          />
        ))}
      </div>
      <span data-chip className={CHIP}>
        {several ? `${frames.length} frames` : sizeLabel(bounds)}
      </span>
      <span data-move-chip hidden className={CHIP} />
    </div>
  )
}
