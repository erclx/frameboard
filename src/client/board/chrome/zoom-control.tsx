import { cn } from 'cn'
import { ChevronDown } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { useActions } from '@/client/actions/registry'
import {
  DropdownMenu,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'

import { canvasView } from '../view'
import { ActionMenuItem, ChromeMenuContent } from './menu'

const STEPS = [
  { id: 'view.zoomIn', label: 'Zoom in' },
  { id: 'view.zoomOut', label: 'Zoom out' },
  { id: 'view.zoomToFit', label: 'Zoom to fit' },
] as const

const LEVELS = [
  { id: 'view.zoom50', label: '50%' },
  { id: 'view.zoom100', label: '100%' },
  { id: 'view.zoom200', label: '200%' },
] as const

const IDS = [...STEPS, ...LEVELS].map((entry) => entry.id)

interface ZoomControlProps {
  /** Which edge of the trigger the menu lines up with. */
  align?: 'start' | 'end'
  className?: string
}

/**
 * The zoom level with its chevron, opening the zoom menu. The level is
 * written straight into its text node from the view controller, so a pinch
 * updates it with no React render.
 */
export function ZoomControl({ align = 'end', className }: ZoomControlProps) {
  const level = useRef<HTMLSpanElement>(null)
  const actions = useActions(IDS)

  useEffect(() => {
    const write = () => {
      if (level.current) level.current.textContent = percent(canvasView.zoom())
    }
    write()
    return canvasView.onZoom(write)
  }, [])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Zoom"
        className={cn(
          'flex h-6 items-center gap-1 rounded-md px-1 text-muted-foreground tabular-nums outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:text-foreground',
          className,
        )}
      >
        <span ref={level} data-zoom-level />
        <ChevronDown aria-hidden className="size-2.5" />
      </DropdownMenuTrigger>
      <ChromeMenuContent align={align} sideOffset={8} className="w-48">
        {STEPS.map((step, index) => (
          <ActionMenuItem
            key={step.id}
            action={actions[index]}
            label={step.label}
          />
        ))}
        <DropdownMenuSeparator />
        {LEVELS.map((entry, index) => (
          <ActionMenuItem
            key={entry.id}
            action={actions[STEPS.length + index]}
            label={entry.label}
          >
            {entry.label}
          </ActionMenuItem>
        ))}
      </ChromeMenuContent>
    </DropdownMenu>
  )
}

function percent(scale: number): string {
  return `${Math.round(scale * 100)}%`
}
