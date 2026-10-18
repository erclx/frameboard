import type { ReactElement } from 'react'

import { keyLabel } from '@/client/actions/keys'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/client/components/ui/tooltip'

interface ActionTooltipProps {
  label: string
  keys?: readonly string[]
  /** The control the tooltip names, rendered as the tooltip's trigger. */
  children: ReactElement
  side?: 'top' | 'bottom'
}

/** A control's name and its first key, as the toolbar and panel headers show them on hover. */
export function ActionTooltip({
  label,
  keys,
  children,
  side = 'top',
}: ActionTooltipProps) {
  const key = keys?.[0]
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent
        side={side}
        sideOffset={6}
        className="rounded-md px-2 py-[5px] text-[11px]"
      >
        {key ? `${label} ${keyLabel(key)}` : label}
      </TooltipContent>
    </Tooltip>
  )
}
