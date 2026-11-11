import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { keyLabel } from '@/client/actions/keys'
import { findAction } from '@/client/actions/registry'
import type { FrameRecord, SectionRecord } from '@/shared/records/list'

import { stepOrder } from '../frame-order'
import { useSelection } from '../selection'
import { boundsOf, type Box } from './box'
import { OUTLINE, place, screen } from './draw'
import type { Corner } from './resize'
import { useDrawnFrames } from './write'

const CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se']

const PARENT_OUTLINE = `${screen(1)} dashed var(--primary)`

const NO_SECTIONS: readonly SectionRecord[] = []

/** Above every frame, whose z-index is its stacking order. */
export const OVERLAY_Z = 1_000_000

export const CHIP =
  'absolute top-full left-1/2 origin-top-left rounded-[4px] bg-primary-fill px-1.5 py-0.5 text-[10px] leading-[14px] whitespace-nowrap text-primary-foreground tabular-nums [transform:scale(calc(1/var(--zoom,1)))_translate(-50%,6px)]'

interface OverlayProps {
  /** The page's shown frames, which the selection is drawn from. */
  frames: readonly FrameRecord[]
  /** The page's sections, bottom first, which order the chip's count as Layers does. */
  sections?: readonly SectionRecord[]
}

/**
 * What the board draws over the frames on the canvas layer: the selection's
 * outline, corner handles, and chip, plus the empty marquee and guide
 * layers a gesture draws into. React draws the selection at rest, and a
 * gesture writes this DOM straight from its handler through `draw.ts`, so a
 * drag renders nothing. Every length that has to keep its screen size
 * divides by `--zoom`, as the frame label does.
 */
export function SelectionOverlay({
  frames,
  sections = NO_SECTIONS,
}: OverlayProps) {
  const selected = useSelection((state) => state.frames)
  const inside = useSelection((state) => Boolean(state.element))
  const chosen = frames.filter((frame) => selected.includes(frame.ref))
  const shown = useDrawnFrames(chosen)
  const bounds = boundsOf(shown.map((frame) => frame.box))
  return (
    <div
      data-overlay
      className="pointer-events-none absolute top-0 left-0"
      style={{ zIndex: OVERLAY_Z }}
    >
      {bounds ? (
        <Selection
          frames={shown}
          bounds={bounds}
          order={stepOrder(frames, sections)}
          inside={inside}
        />
      ) : null}
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

/**
 * The frame selection. With an element selected inside it, the frame keeps a
 * dashed outline alone, as the parent of what is selected, and the element
 * overlay draws the handles and chip.
 */
function Selection({
  frames,
  bounds,
  order,
  inside,
}: {
  frames: readonly FrameRecord[]
  bounds: Box
  /** The frames a step walks, which place one selected frame. */
  order: readonly FrameRecord[]
  inside: boolean
}) {
  const [only] = frames
  const several = frames.length > 1
  return (
    <div
      data-selection
      data-inside={inside || undefined}
      className="absolute"
      style={{
        ...place(bounds),
        ...(inside
          ? { outline: PARENT_OUTLINE, outlineOffset: screen(1) }
          : { outline: OUTLINE }),
      }}
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
      <div data-handles hidden={inside}>
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
      <span
        data-chip
        hidden={inside}
        className={`${CHIP} flex items-center gap-1`}
      >
        {only && !several ? (
          <FrameChip frame={only} order={order} />
        ) : (
          `${frames.length} frames`
        )}
      </span>
      <span data-move-chip hidden className={CHIP} />
    </div>
  )
}

/**
 * One selected frame's name and place in Layers order, with the controls
 * that step to the previous and next frame and zoom to it. The chip takes no
 * pointer, so the gestures click a control through `data-label-control`.
 */
function FrameChip({
  frame,
  order,
}: {
  frame: FrameRecord
  order: readonly FrameRecord[]
}) {
  const at = order.findIndex((candidate) => candidate.ref === frame.ref)
  return (
    <>
      <span className="max-w-60 min-w-0 truncate">{frame.name}</span>{' '}
      {at === -1 ? null : (
        <span>
          · {at + 1} of {order.length}
        </span>
      )}
      <span className="-my-0.5 -mr-1 flex">
        {order.length > 1 ? (
          <>
            <ChipControl action="frame.previous" label="Previous frame">
              <ChevronLeft aria-hidden className="size-3" />
            </ChipControl>
            <ChipControl action="frame.next" label="Next frame">
              <ChevronRight aria-hidden className="size-3" />
            </ChipControl>
          </>
        ) : null}
        <ChipControl action="view.zoomToSelection" label="Zoom to selection">
          <Maximize2 aria-hidden className="size-2.5" />
        </ChipControl>
      </span>
    </>
  )
}

/** A chip button running a registered action, named with that action's key. */
function ChipControl({
  action,
  label,
  children,
}: {
  action: string
  label: string
  children: ReactNode
}) {
  const key = findAction(action)?.keys?.[0]
  return (
    <button
      type="button"
      data-label-control
      aria-label={label}
      aria-keyshortcuts={key ? keyLabel(key) : undefined}
      title={key ? `${label} ${keyLabel(key)}` : label}
      onClick={() => findAction(action)?.run()}
      className="grid size-[18px] place-items-center rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/70"
    >
      {children}
    </button>
  )
}
