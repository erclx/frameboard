import { useEffect, useState } from 'react'

import type { Claim } from '@/shared/records/claims'

import { elapsed, initialOf } from './label'

/**
 * The claim on a frame's label: the agent's initial, its tag with the agent
 * capitalized, and how long it has held the frame, ticking each second. It
 * never shrinks, so a narrow frame truncates the name and keeps the tag.
 */
export function ClaimTag({ claim }: { claim: Claim }) {
  const now = useNow()
  const tag = `${initialOf(claim.tag)}${claim.tag.slice(1)}`
  return (
    <span
      data-claim-tag
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--claim)_18%,transparent)] py-0.5 pr-2 pl-[3px] font-medium text-claim motion-safe:animate-claim-tag"
    >
      <span
        aria-hidden
        className="grid size-4 place-items-center rounded-full bg-claim text-[9px] font-bold text-card"
      >
        {initialOf(claim.agent)}
      </span>
      {tag}
      <span className="font-normal text-muted-foreground">
        editing · {elapsed(claim.claimedAt, now)}
      </span>
    </span>
  )
}

/** The current time, moving each second while the caller is mounted. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}
