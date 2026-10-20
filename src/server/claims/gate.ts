import { FrameboardError } from '@/shared/errors'

import { readClaims } from './store'

/** Whether a claim on `frame` falls under `ref`, being the frame itself, its page, or its project. */
function covers(ref: string, frame: string): boolean {
  return frame === ref || frame.startsWith(`${ref}/`)
}

/**
 * Refuses `frame-claimed` when another session holds a frame the hand write
 * would change. Each ref is a frame, page, or project ref, and a page or
 * project ref matches every claim under it. The claims are read without the
 * lock, so a claim landing between this read and the write lets that one
 * write through, where the file hash still guards the agent's own write.
 */
export async function refuseClaimed(
  root: string,
  refs: readonly string[],
  now: Date,
): Promise<void> {
  if (refs.length === 0) return
  const claims = await readClaims(root, now)
  const held = claims.find((claim) =>
    refs.some((ref) => covers(ref, claim.frame)),
  )
  if (!held) return
  throw new FrameboardError(
    'frame-claimed',
    `${held.tag} is editing ${held.frame} until ${held.expiresAt}.`,
    {
      frame: held.frame,
      tag: held.tag,
      claimedAt: held.claimedAt,
      expiresAt: held.expiresAt,
    },
  )
}
