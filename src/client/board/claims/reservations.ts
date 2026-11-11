import { toast } from '@/client/components/ui/toast'
import { useLive } from '@/client/live/store'
import { BoardWriteError, writeBoard } from '@/client/live/write'
import type { Claim, ClaimBox } from '@/shared/records/claims'
import type { FrameRecord } from '@/shared/records/list'

import { useMode } from '../mode'

/** A reservation the canvas draws, with where it sits in its set. */
export interface Reserved {
  claim: Claim & { box: ClaimBox }
  /** The frame's name, the ref's last part. */
  name: string
  /** Its place in the set the agent named, from 1. */
  index: number
  /** How many frames the set still holds, landed ones included. */
  count: number
  /** Whether it is the one the agent turned to last. */
  drawing: boolean
}

/**
 * The reservations on a page whose frame is not listed yet, each placed in
 * its set in the order the agent named the frames. The member holding the
 * set's latest `drawingAt` reads as drawing, and every other one queued, so
 * a set reads all queued until the agent turns to its first frame.
 */
export function reservedOn(
  claims: Readonly<Record<string, Claim>>,
  frames: readonly FrameRecord[],
  page: string,
): Reserved[] {
  const listed = new Set(frames.map((frame) => frame.ref))
  const all = Object.values(claims)
  const prefix = `${page}/`
  return all.flatMap((claim): Reserved[] => {
    const { box } = claim
    if (!box || listed.has(claim.frame) || !claim.frame.startsWith(prefix)) {
      return []
    }
    const set = claim.set
    const members =
      set === undefined ? [claim] : all.filter((each) => each.set === set)
    const latest = members.reduce<Claim | undefined>(
      (last, each) =>
        each.drawingAt !== undefined &&
        (last?.drawingAt === undefined || each.drawingAt > last.drawingAt)
          ? each
          : last,
      undefined,
    )
    return [
      {
        claim: { ...claim, box },
        name: claim.frame.slice(prefix.length),
        index: members.indexOf(claim) + 1,
        count: members.length,
        drawing: latest === claim,
      },
    ]
  })
}

/**
 * The reservations the canvas draws as boxes on the page, none in Play, so
 * whatever yields to the boxes reads the same list they draw from.
 */
export function useReservedBoxes(
  page: string,
  frames: readonly FrameRecord[],
): Reserved[] {
  const claims = useLive((state) => state.claims)
  const playing = useMode((state) => state.mode === 'play')
  return playing ? [] : reservedOn(claims, frames, page)
}

/**
 * Drops a reservation by hand, whichever session holds it, raising a toast
 * when the server refuses, as when the agent's file landed first.
 */
export async function releaseReserved(frame: string): Promise<void> {
  try {
    await writeBoard('/api/claims/release', { frame })
  } catch (error) {
    if (!(error instanceof BoardWriteError)) throw error
    toast.add({
      title: 'Reservation not released',
      description: error.message,
      type: 'warning',
    })
  }
}
