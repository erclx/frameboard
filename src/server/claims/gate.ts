import { FrameboardError } from '@/shared/errors'
import { claimCovers } from '@/shared/records/claims'

import { readClaims } from './store'

/**
 * Refuses `frame-claimed` for a frame another session holds, read without the
 * lock, since the file hash still guards an agent's write that lands between.
 */
export async function refuseClaimed(
  root: string,
  refs: readonly string[],
  now: Date,
): Promise<void> {
  if (refs.length === 0) return
  const claims = await readClaims(root, now)
  const held = claims.find((claim) =>
    refs.some((ref) => claimCovers(ref, claim.frame)),
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
