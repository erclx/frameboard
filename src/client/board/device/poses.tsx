import { cn } from '@/client/lib/cn'
import { type Structure, structure } from '@/client/live/structure'
import { type Pose, POSES } from '@/shared/frame-device'

import { reportRefusal } from '../left-panel/page-actions'
import { canvasView } from '../view'

/** The screen pixels the bar takes below a foldable's body, its gap included, which chrome under it stands past. */
export const POSE_BAR_ROOM = 40

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
  /** The server calls a fold writes through, the board's own when absent. */
  calls?: Structure
}

/**
 * The Closed, Half, and Open buttons under a selected foldable, as
 * `canon/design/canvas/foldable-buttons` draws them, held at screen size and
 * reached through the hit layer as the label's controls are.
 */
export function PoseButtons({
  frameRef,
  name,
  pose,
  below,
  off,
  calls = structure,
}: PoseButtonsProps) {
  return (
    <div
      className="absolute left-1/2 origin-top-left pt-2.5 [transform:scale(calc(1/var(--zoom,1)))_translateX(-50%)]"
      style={{ top: `calc(100% + ${below}px)` }}
    >
      <div
        role="group"
        aria-label={`Pose of ${name}`}
        data-poses={frameRef}
        className="flex gap-0.5 rounded-[10px] bg-card p-[3px] shadow-[0_0_0_1px_var(--border),0_4px_14px_rgba(0,0,0,.14)]"
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
                'flex items-center gap-[5px] rounded-[7px] px-[9px] py-1 text-[10.5px] leading-[14px] font-medium whitespace-nowrap text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
