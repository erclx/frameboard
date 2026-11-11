import { randomUUID } from 'node:crypto'
import { join } from 'node:path'

import { CLAIMS_FILE, RUN_FOLDER } from '@/shared/board-files'
import { FrameboardError } from '@/shared/errors'
import {
  type Claim,
  type ClaimBox,
  type ClaimsFile,
  claimsFileSchema,
} from '@/shared/records/claims'

import { ensureRunFolder } from '../address'
import { readRecord, type RecordSpec, updateRecord } from '../board/json-record'

/** How long a claim holds after its last claim or renewal. */
export const CLAIM_TTL_MS = 5 * 60_000

export const claimsSpec: RecordSpec<ClaimsFile> = {
  schema: claimsFileSchema,
  invalidCode: 'claims-invalid',
  empty: () => ({ version: 1, claims: [] }),
}

/** What a session claims a frame as. */
export interface ClaimFields {
  frame: string
  session: string
  agent: string
  tag: string
}

export function claimsPath(root: string): string {
  return join(root, RUN_FOLDER, CLAIMS_FILE)
}

function claimedError(holder: Claim, frame: string): FrameboardError {
  return new FrameboardError(
    'frame-claimed',
    `${holder.tag} is editing ${frame} until ${holder.expiresAt}.`,
    {
      frame: holder.frame,
      session: holder.session,
      tag: holder.tag,
      expiresAt: holder.expiresAt,
    },
  )
}

function isLive(claim: Claim, now: Date): boolean {
  return Date.parse(claim.expiresAt) > now.getTime()
}

/** The claims still live at `now`, refusing a file that does not parse. */
export async function readClaims(root: string, now: Date): Promise<Claim[]> {
  const file = await readRecord(claimsPath(root), claimsSpec)
  return file.claims.filter((claim) => isLive(claim, now))
}

/**
 * Claims a frame for a session, or renews the session's own claim keeping
 * `claimedAt`. A frame another session holds live refuses `frame-claimed`.
 */
export async function claim(
  root: string,
  fields: ClaimFields,
  now: Date,
): Promise<Claim> {
  await ensureRunFolder(root)
  const written = await updateRecord(claimsPath(root), claimsSpec, (file) => {
    const live = file.claims.filter((each) => isLive(each, now))
    const current = live.find((each) => each.frame === fields.frame)
    if (current && current.session !== fields.session) {
      throw claimedError(current, fields.frame)
    }
    const expiresAt = new Date(now.getTime() + CLAIM_TTL_MS).toISOString()
    const held: Claim = {
      ...fields,
      ...setOf(current),
      claimedAt: current?.claimedAt ?? now.toISOString(),
      expiresAt,
      // A plain claim on a reserved frame is the agent turning to draw it.
      ...(current?.box ? { drawingAt: now.toISOString() } : {}),
    }
    const set = current?.set
    return {
      ...file,
      claims: [
        ...live
          .filter((each) => each !== current)
          .map((each) =>
            set !== undefined &&
            each.set === set &&
            each.session === fields.session
              ? { ...each, expiresAt }
              : each,
          ),
        held,
      ],
    }
  })
  // The change appends the held claim last.
  return written.claims.at(-1) as Claim
}

/** The reservation a renewal carries over from the claim it renews. */
function setOf(
  current: Claim | undefined,
): Pick<Claim, 'box' | 'set' | 'drawingAt'> {
  if (!current) return {}
  const { box, set, drawingAt } = current
  return {
    ...(box ? { box } : {}),
    ...(set === undefined ? {} : { set }),
    ...(drawingAt === undefined ? {} : { drawingAt }),
  }
}

/** One frame a reservation names, with the box it will land in. */
export interface Reservation {
  frame: string
  box: ClaimBox
}

/**
 * Reserves every frame named as one set, each a claim carrying its box and
 * the set's id, in one write. A frame another session holds live refuses
 * `frame-claimed` before any is written, and the session's own claim on a
 * named frame is replaced.
 */
export async function reserve(
  root: string,
  holder: Omit<ClaimFields, 'frame'>,
  reservations: Reservation[],
  now: Date,
): Promise<Claim[]> {
  await ensureRunFolder(root)
  const set = randomUUID()
  const claimedAt = now.toISOString()
  const expiresAt = new Date(now.getTime() + CLAIM_TTL_MS).toISOString()
  const made: Claim[] = reservations.map(({ frame, box }) => ({
    frame,
    ...holder,
    claimedAt,
    expiresAt,
    box,
    set,
  }))
  const names = new Set(made.map((each) => each.frame))
  await updateRecord(claimsPath(root), claimsSpec, (file) => {
    const live = file.claims.filter((each) => isLive(each, now))
    const taken = live.find(
      (each) => names.has(each.frame) && each.session !== holder.session,
    )
    if (taken) throw claimedError(taken, taken.frame)
    return {
      ...file,
      claims: [...live.filter((each) => !names.has(each.frame)), ...made],
    }
  })
  return made
}

/**
 * Drops the live reservation on a frame whoever holds it, refusing a claim
 * with no box so an agent's claim on an existing frame is never broken.
 * Answers the dropped claim, or undefined when the frame holds none.
 */
export async function releaseReservation(
  root: string,
  frame: string,
  now: Date,
): Promise<Claim | undefined> {
  let dropped: Claim | undefined
  await ensureRunFolder(root)
  await updateRecord(claimsPath(root), claimsSpec, (file) => {
    const live = file.claims.filter((each) => isLive(each, now))
    dropped = live.find((each) => each.frame === frame && each.box)
    return { ...file, claims: live.filter((each) => each !== dropped) }
  })
  return dropped
}

/**
 * Drops a session's claim on one frame, or every claim it holds when no
 * frame is named, returning what it dropped.
 */
export async function release(
  root: string,
  session: string,
  frame: string | undefined,
  now: Date,
): Promise<Claim[]> {
  const dropped: Claim[] = []
  await ensureRunFolder(root)
  await updateRecord(claimsPath(root), claimsSpec, (file) => {
    const kept: Claim[] = []
    for (const each of file.claims) {
      if (!isLive(each, now)) continue
      const mine =
        each.session === session &&
        (frame === undefined || each.frame === frame)
      ;(mine ? dropped : kept).push(each)
    }
    return { ...file, claims: kept }
  })
  return dropped
}
