import { FrameboardError } from '@/shared/errors'
import type { Claim } from '@/shared/records/claims'

import { claimsPath, readClaims } from './store'

/** setTimeout's longest delay, past which it fires at once. */
const MAX_DELAY_MS = 2 ** 31 - 1

export interface ClaimsPush {
  /** The claims file, which a watch batch names when a claim changes. */
  path: string
  /** The live claims, a file that does not parse reading as none. */
  read: () => Promise<Claim[]>
  /** Rereads and broadcasts the claims, and arms the timer for the soonest expiry. */
  push: () => Promise<void>
  close: () => void
}

/**
 * Sends the live claims to the board on every change, and again as the
 * soonest one lapses, since an expiry writes nothing the watch could see.
 */
export function createClaimsPush(
  root: string,
  {
    broadcast,
    inTurn,
    now = () => new Date(),
  }: {
    broadcast: (claims: Claim[]) => void
    /** Runs a read in turn with the server's scans. */
    inTurn: <T>(task: () => Promise<T>) => Promise<T>
    now?: () => Date
  },
): ClaimsPush {
  let timer: ReturnType<typeof setTimeout> | undefined
  let closed = false

  const read = async () => {
    try {
      return await readClaims(root, now())
    } catch (error) {
      // The board renders with no claims, and `editing` reports the file.
      if (error instanceof FrameboardError) return []
      throw error
    }
  }

  const push = () =>
    inTurn(async () => {
      const claims = await read()
      if (closed) return
      broadcast(claims)
      clearTimeout(timer)
      timer = undefined
      const soonest = Math.min(
        ...claims.map((claim) => Date.parse(claim.expiresAt)),
      )
      if (Number.isFinite(soonest)) {
        const delay = Math.max(0, soonest - now().getTime())
        timer = setTimeout(() => void push(), Math.min(delay, MAX_DELAY_MS))
      }
    })

  return {
    path: claimsPath(root),
    read,
    push,
    close: () => {
      closed = true
      clearTimeout(timer)
    },
  }
}
