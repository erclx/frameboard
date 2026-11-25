import { ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { keyLabel } from '@/client/actions/keys'
import { findAction } from '@/client/actions/registry'
import { bezelBox } from '@/shared/frame-device'
import type { FrameRecord } from '@/shared/records/list'

import { POSE_BAR_ROOM } from '../device/poses'
import { showsDeviceBar } from '../device/turn'
import { stepOrder } from '../frame-order'
import { useSelection } from '../selection'
import { useStripRoom } from '../speaker-notes/room'
import { boundsOf, type Box } from './box'
import { OUTLINE, place, screen } from './draw'
import type { Corner } from './resize'
import { useDrawnFrames } from './write'

const CORNERS: readonly Corner[] = ['nw', 'ne', 'sw', 'se']

const PARENT_OUTLINE = `${screen(1)} dashed var(--primary)`

/** Set apart from the frames, so the line never reads as a frame's edge across an unselected one between. */
const GROUP_OUTLINE = `${screen(1)} dashed color-mix(in srgb, var(--primary) 65%, transparent)`

/** Above every frame, whose z-index is its stacking order. */
export const OVERLAY_Z = 1_000_000

export const CHIP =
  'absolute top-full left-1/2 origin-top-left rounded-[4px] bg-primary-fill px-1.5 py-0.5 text-[10px] leading-[14px] whitespace-nowrap text-primary-foreground tabular-nums [transform:scale(calc(1/var(--zoom,1)))_translate(-50%,6px)]'

interface OverlayProps {
  /** The page's frames, hidden ones too, since one can hold a counted row together. */
  frames: readonly FrameRecord[]
}

/**
 * The selection overlay, drawn by React at rest and written by a gesture
 * through `draw.ts`, so a drag renders nothing.
 */
export function SelectionOverlay({ frames }: OverlayProps) {
  const selected = useSelection((state) => state.frames)
  const inside = useSelection((state) => Boolean(state.element))
  const chosen = frames.filter(
    (frame) => !frame.hidden && selected.includes(frame.ref),
  )
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
          order={stepOrder(frames)}
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
 * The frame selection. A frame holding a selected element keeps a dashed
 * outline alone, the element overlay drawing its handles and chip, and
 * several frames keep solid outlines inside a dashed group line.
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
  // The chips stand past any device body drawn below the selection's box.
  const below = Math.max(
    0,
    ...frames.map(({ box, device, turn }) => {
      const body = bezelBox(box, device, turn)
      return body.y + body.height - (bounds.y + bounds.height)
    }),
  )
  // A shown speaker notes strip sits between the frame and its chips, at screen size.
  const strip = useStripRoom(only && !several ? only.ref : null)
  // A device's bar sits under its body, ahead of the strip, at screen size too.
  const poses =
    only && !several && showsDeviceBar(only.device) ? POSE_BAR_ROOM : 0
  const chipAt =
    below || strip || poses
      ? {
          top: `calc(100% + ${below}px + ${poses + strip}px / var(--zoom, 1))`,
        }
      : undefined
  return (
    <div
      data-selection
      data-inside={inside || undefined}
      className="absolute"
      style={{
        ...place(bounds),
        ...(inside
          ? { outline: PARENT_OUTLINE, outlineOffset: screen(1) }
          : several
            ? { outline: GROUP_OUTLINE, outlineOffset: screen(6) }
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
        style={chipAt}
      >
        {only && !several ? (
          <FrameChip frame={only} order={order} />
        ) : (
          `${frames.length} frames`
        )}
      </span>
      <span data-move-chip hidden className={CHIP} style={chipAt} />
    </div>
  )
}

/**
 * One selected frame's name and place in canvas order, with the controls
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
