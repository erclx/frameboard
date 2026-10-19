import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/types'
import { cn } from 'cn'

/** The drop line of `canon/design/layers/edit`, drawn on the edge a drag would land on. */
export function DropLine({ edge }: { edge: Edge | null }) {
  if (edge === null) return null
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute right-1.5 left-5 z-10 h-0.5 rounded-[1px] bg-primary',
        "before:absolute before:-top-[3px] before:-left-[5px] before:size-2 before:rounded-full before:border-2 before:border-primary before:bg-sidebar before:content-['']",
        edge === 'top' ? '-top-px' : '-bottom-px',
      )}
    />
  )
}
