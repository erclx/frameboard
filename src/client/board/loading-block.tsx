import { Skeleton } from '@/client/components/ui/skeleton'
import { cn } from '@/client/lib/cn'
import type { Theme } from '@/shared/theme'

/**
 * The pulsing grey block over a frame still waiting on its page, drawn after
 * the iframe and before any bezel, so the bezel stands over it.
 */
export function LoadingBlock({
  theme,
  corners,
}: {
  theme: Theme
  /** A device screen's `border-radius`, so the block stays inside the bezel. */
  corners?: string
}) {
  return (
    <Skeleton
      data-loading-block
      // The theme class scopes the fill to a flipped frame's own tokens.
      className={cn(
        theme,
        'pointer-events-none absolute inset-0 motion-safe:animate-frame-loading',
        corners === undefined && 'rounded-none',
      )}
      style={corners === undefined ? undefined : { borderRadius: corners }}
    />
  )
}
