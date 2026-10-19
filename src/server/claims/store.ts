import { join } from 'node:path'

import { CLAIMS_FILE, RUN_FOLDER } from '@/shared/board-files'
import { FrameboardError } from '@/shared/errors'
import {
  type Claim,
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
      throw new FrameboardError(
        'frame-claimed',
        `${current.tag} is editing ${fields.frame} until ${current.expiresAt}.`,
        {
          frame: current.frame,
          session: current.session,
          tag: current.tag,
          expiresAt: current.expiresAt,
        },
      )
    }
    const held: Claim = {
      ...fields,
      claimedAt: current?.claimedAt ?? now.toISOString(),
      expiresAt: new Date(now.getTime() + CLAIM_TTL_MS).toISOString(),
    }
    return {
      ...file,
      claims: [...live.filter((each) => each !== current), held],
    }
  })
  // The change appends the held claim last.
  return written.claims.at(-1) as Claim
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
