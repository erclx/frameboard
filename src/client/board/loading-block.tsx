import { Skeleton } from '@/client/components/ui/skeleton'
import { cn } from '@/client/lib/cn'
import type { Theme } from '@/shared/theme'

/**
 * The pulsing grey block over a frame still waiting on its page, drawn after
 * the iframe and before any bezel, so the bezel stands over it.
 */
export function LoadingBlock({ theme }: { theme: Theme }) {
  return (
    <Skeleton
      data-loading-block
      // The theme class scopes the fill to a flipped frame's own tokens.
      className={cn(
        theme,
        'pointer-events-none absolute inset-0 rounded-none motion-safe:animate-frame-loading',
      )}
    />
  )
}
