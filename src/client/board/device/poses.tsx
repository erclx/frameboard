import { RotateCcw } from 'lucide-react'

import { cn } from '@/client/lib/cn'
import { type Structure, structure } from '@/client/live/structure'
import { type Pose, POSES, type Turn } from '@/shared/frame-device'

import { reportRefusal } from '../left-panel/page-actions'
import { canvasView } from '../view'
import { rotateFrame } from './turn'

/** The screen pixels the bar takes below a device's body, its gap included, which chrome under it stands past. */
export const POSE_BAR_ROOM = 40

/** The bar's place under the body, held at screen size. */
const BAR_PLACE =
  'absolute left-1/2 origin-top-left pt-2.5 [transform:scale(calc(1/var(--zoom,1)))_translateX(-50%)]'
const BAR_GROUP =
  'flex gap-0.5 rounded-[10px] bg-card p-[3px] shadow-[0_0_0_1px_var(--border),0_4px_14px_rgba(0,0,0,.14)]'
const BAR_BUTTON =
  'flex items-center gap-[5px] rounded-[7px] px-[9px] py-1 text-[10.5px] leading-[14px] font-medium whitespace-nowrap text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** The bar's Rotate button, which the Play banner and the present bar draw in their own colors. */
export function RotateLabel() {
  return (
    <>
      <RotateCcw aria-hidden className="size-3" strokeWidth={1.8} />
      Rotate
    </>
  )
}

/**
 * Rotate alone under a selected phone or tablet, as
 * `canon/design/canvas/device-turned` draws it, turning it a quarter at each press.
 */
export function RotateButtons({
  frameRef,
  name,
  turn,
  below,
  off,
  calls = structure,
}: {
  frameRef: string
  name: string
  turn?: Turn
  /** Board units from the frame's bottom to its body's. */
  below: number
  /** Why the frame cannot turn, which turns the button off and names the reason. */
  off?: string
  calls?: Structure
}) {
  return (
    <div className={BAR_PLACE} style={{ top: `calc(100% + ${below}px)` }}>
      <div
        role="group"
        aria-label={`Turn of ${name}`}
        data-turns={frameRef}
        className={BAR_GROUP}
      >
        <RotateButton frameRef={frameRef} turn={turn} off={off} calls={calls} />
      </div>
    </div>
  )
}

function RotateButton({
  frameRef,
  turn,
  off,
  calls,
}: {
  frameRef: string
  turn?: Turn
  off?: string
  calls: Structure
}) {
  return (
    <button
      type="button"
      data-label-control
      aria-disabled={off ? true : undefined}
      title={off}
      onClick={() => {
        if (!off) rotateFrame({ ref: frameRef, turn }, { calls })
      }}
      className={cn(
        BAR_BUTTON,
        off ? 'opacity-60' : 'hover:text-foreground active:bg-muted',
      )}
    >
      <RotateLabel />
    </button>
  )
}

const POSE_LABELS = {
  closed: 'Closed',
  half: 'Half',
  open: 'Open',
} as const satisfies Record<Pose, string>

interface PoseButtonsProps {
  frameRef: string
  name: string
  pose: Pose
  /** Board units from the frame's bottom to its body's. */
  below: number
  /** Why the frame cannot fold, which turns the buttons off and names the reason. */
  off?: string
  /** Rotate after a divider, with the turn it is held at and why it cannot turn, absent where the viewer cannot write. */
  rotate?: { turn?: Turn; off?: string }
  /** The server calls a fold writes through, the board's own when absent. */
  calls?: Structure
}

/**
 * The Closed, Half, and Open buttons under a selected foldable, then a divider
 * and Rotate, as `canon/design/canvas/foldable-buttons` draws them, held at
 * screen size and reached through the hit layer as the label's controls are.
 */
export function PoseButtons({
  frameRef,
  name,
  pose,
  below,
  off,
  rotate,
  calls = structure,
}: PoseButtonsProps) {
  return (
    <div className={BAR_PLACE} style={{ top: `calc(100% + ${below}px)` }}>
      <div
        role="group"
        aria-label={`Pose of ${name}`}
        data-poses={frameRef}
        className={BAR_GROUP}
      >
        {POSES.map((each) => {
          const on = each === pose
          return (
            <button
              key={each}
              type="button"
              data-label-control
              aria-pressed={on}
              aria-disabled={off ? true : undefined}
              title={off}
              onClick={() => {
                if (off || on) return
                calls
                  .setPose([frameRef], each)
                  .then((frames) => {
                    // A press is the developer's move, so the grown box comes into view as a nudge's does.
                    const folded = frames.find(
                      (frame) => frame.ref === frameRef,
                    )
                    if (folded) canvasView.reveal(folded.box, { fit: false })
                  })
                  .catch(reportRefusal('Couldn’t fold the frame'))
              }}
              className={cn(
                BAR_BUTTON,
                on && 'bg-muted font-semibold text-foreground',
                off
                  ? 'opacity-60'
                  : !on && 'hover:text-foreground active:bg-muted',
              )}
            >
              <PoseIcon pose={each} />
              {POSE_LABELS[each]}
            </button>
          )
        })}
        {rotate ? (
          <>
            <span
              aria-hidden
              data-bar-divider
              className="mx-[3px] h-3.5 w-px self-center bg-border"
            />
            <RotateButton
              frameRef={frameRef}
              turn={rotate.turn}
              off={rotate.off}
              calls={calls}
            />
          </>
        ) : null}
      </div>
    </div>
  )
}

/** The cover screen, the inner screen bent at its fold, and the inner screen flat with its crease. */
function PoseIcon({ pose }: { pose: Pose }) {
  if (pose === 'closed') {
    return (
      <svg
        aria-hidden
        width="9"
        height="13"
        viewBox="0 0 9 13"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      >
        <rect x=".65" y=".65" width="7.7" height="11.7" rx="2" />
      </svg>
    )
  }
  return (
    <svg
      aria-hidden
      width="15"
      height="13"
      viewBox="0 0 15 13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    >
      {pose === 'half' ? (
        <path d="M7.5 1.5 2 .8a1.2 1.2 0 0 0-1.35 1.2v9A1.2 1.2 0 0 0 2 12.2l5.5-.7 5.5.7a1.2 1.2 0 0 0 1.35-1.2V2A1.2 1.2 0 0 0 13 .8Zm0 0v10" />
      ) : (
        <>
          <rect x=".65" y=".65" width="13.7" height="11.7" rx="2" />
          <path d="M7.5 1v11" strokeDasharray="1.6 1.6" />
        </>
      )}
    </svg>
  )
}
