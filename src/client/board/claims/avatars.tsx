import { cn } from 'cn'
import { useStore } from 'zustand'

import type { Claim } from '@/shared/records/claims'
import type { Listener } from '@/shared/records/notes'

import { follow, followStore, stopFollow } from '../changes/follow'
import { agentOf, initialOf } from './label'

interface ClaimAvatarsProps {
  listeners: readonly Listener[]
  claims: Readonly<Record<string, Claim>>
}

/**
 * One initial per listening session beside the developer's avatar, solid
 * while the session holds a claim and pale while it only listens. A holder
 * that is not listening is left off, since its frame already shows it. A
 * click follows the session, drawing its initial as the `Following` chip of
 * agents/unseen-many, and a second click stops.
 */
export function ClaimAvatars({ listeners, claims }: ClaimAvatarsProps) {
  const followed = useStore(followStore, (state) => state.session)
  if (listeners.length === 0) return null
  const holding = new Map(
    Object.values(claims).map((claim) => [claim.session, claim.agent]),
  )
  return (
    <span className="ml-1 flex items-center">
      {listeners.map((listener, index) => {
        const editing = holding.has(listener.session)
        const following = followed === listener.session
        const initial = (
          <span
            aria-hidden
            className={cn(
              'grid size-[22px] place-items-center rounded-full text-[9px] font-bold text-card shadow-[0_0_0_2px_var(--sidebar)]',
              editing
                ? 'bg-claim'
                : 'bg-[color-mix(in_srgb,var(--claim)_55%,var(--sidebar))]',
            )}
          >
            {initialOf(holding.get(listener.session) ?? agentOf(listener.tag))}
          </span>
        )
        return (
          <button
            key={listener.session}
            type="button"
            aria-label={`${listener.tag}, ${editing ? 'editing' : 'listening'}`}
            aria-pressed={following}
            title={
              following
                ? `Stop following ${listener.tag}`
                : `Follow ${listener.tag}`
            }
            data-editing={editing || undefined}
            onClick={() =>
              following ? stopFollow() : follow(listener.session)
            }
            className={cn(
              'rounded-full outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring/50',
              following
                ? 'flex items-center gap-1.5 py-0.5 pr-2 pl-0.5 text-[11px] font-semibold text-claim shadow-[0_0_0_1.5px_var(--claim)]'
                : index > 0 && '-ml-1.5',
              following && index > 0 && 'ml-1.5',
            )}
          >
            {initial}
            {following ? 'Following' : null}
          </button>
        )
      })}
    </span>
  )
}
