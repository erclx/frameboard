import type { ReactNode } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/client/components/ui/tooltip'
import { cn } from '@/client/lib/cn'

interface LabelTipProps {
  /** The label as the caller draws it, keeping its own element and id. */
  children: ReactNode
  /** The label's text, which names the mark as `About <label>`. */
  label: string
  /** The sentence the mark shows, once a standing caption under the control. */
  tip: string
  /** The id the sentence carries, which the control names in `aria-describedby`. */
  tipId: string
  className?: string
}

/**
 * A label whose mark shows its sentence on hover and focus, the sentence also
 * kept in a hidden node under `tipId`, so the control reads it as its
 * description whether the tooltip is open or not.
 */
export function LabelTip({
  children,
  label,
  tip,
  tipId,
  className,
}: LabelTipProps) {
  return (
    <span className={cn('flex min-w-0 items-center gap-1', className)}>
      {children}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={`About ${label}`}
              aria-describedby={tipId}
              // The padding widens the target past the 12px mark it draws.
              className="group/tip -m-1 grid shrink-0 place-items-center rounded-full p-1 outline-none"
            >
              <span
                aria-hidden
                className="grid size-3 place-items-center rounded-full text-[8px] leading-none font-medium text-muted-foreground ring-1 ring-faint group-hover/tip:text-foreground group-hover/tip:ring-muted-foreground group-focus-visible/tip:ring-2 group-focus-visible/tip:ring-ring"
              >
                ?
              </span>
            </button>
          }
        />
        <TooltipContent
          // Below, so the sentence never covers the tab strip or a heading above its label.
          side="bottom"
          sideOffset={6}
          className="max-w-[220px] rounded-md px-2 py-[5px] text-[11px] leading-snug [overflow-wrap:anywhere]"
        >
          {tip}
        </TooltipContent>
      </Tooltip>
      <span id={tipId} className="sr-only">
        {tip}
      </span>
    </span>
  )
}
