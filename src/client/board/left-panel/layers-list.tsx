import { cn } from 'cn'
import { Square } from 'lucide-react'

import type { FrameRecord } from '@/shared/records/list'

import { PanelSection } from './section'

interface LayersListProps {
  frames: readonly FrameRecord[]
}

/**
 * The page's frames in stacking order, read-only and flat, with a hidden
 * frame dimmed. Nesting, reorder, hide, and lock belong to the layers tree
 * built on top of it.
 */
export function LayersList({ frames }: LayersListProps) {
  return (
    <section aria-labelledby="layers-heading" className="flex min-h-0 flex-col">
      <PanelSection id="layers-heading" title="Layers" />
      {frames.length === 0 ? (
        <p className="px-3.5 py-1 text-faint">No frames on this page</p>
      ) : (
        <ul className="flex min-h-0 flex-col overflow-y-auto pb-1">
          {frames.map((frame) => (
            <li
              key={frame.ref}
              aria-label={frame.hidden ? `${frame.name}, hidden` : frame.name}
              className={cn(
                'mx-1.5 flex h-[26px] items-center gap-1.5 rounded-md pr-2 pl-2 text-foreground',
                frame.hidden && 'text-faint',
              )}
            >
              <span aria-hidden className="w-2.5 shrink-0" />
              <Square
                aria-hidden
                className={cn(
                  'size-[13px] shrink-0',
                  frame.hidden ? 'text-faint' : 'text-muted-foreground',
                )}
              />
              <span className="min-w-0 flex-1 truncate" title={frame.name}>
                {frame.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
