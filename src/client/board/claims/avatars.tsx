import { cn } from 'cn'

import type { Claim } from '@/shared/records/claims'
import type { Listener } from '@/shared/records/notes'

import { initialOf } from './label'

interface ClaimAvatarsProps {
  listeners: readonly Listener[]
  claims: Readonly<Record<string, Claim>>
}

/**
 * One initial per listening session beside the developer's avatar, solid
 * while the session holds a claim and pale while it only listens. A holder
 * that is not listening is left off, since its frame already shows it.
 */
export function ClaimAvatars({ listeners, claims }: ClaimAvatarsProps) {
  if (listeners.length === 0) return null
  const holding = new Set(Object.values(claims).map((claim) => claim.session))
  return (
    <span className="ml-1 flex items-center">
      {listeners.map((listener, index) => {
        const editing = holding.has(listener.session)
        return (
          <span
            key={listener.session}
            role="img"
            aria-label={`${listener.tag}, ${editing ? 'editing' : 'listening'}`}
            title={listener.tag}
            data-editing={editing || undefined}
            className={cn(
              'grid size-[22px] place-items-center rounded-full text-[9px] font-bold text-card shadow-[0_0_0_2px_var(--sidebar)]',
              index > 0 && '-ml-1.5',
              editing
                ? 'bg-claim'
                : 'bg-[color-mix(in_srgb,var(--claim)_55%,var(--sidebar))]',
            )}
          >
            {initialOf(listener.tag)}
          </span>
        )
      })}
    </span>
  )
}
