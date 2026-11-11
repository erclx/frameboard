import { z } from 'zod'

/**
 * Where a reserved frame will land, and which axes take their size from the
 * content once it does, as `frame add` would place it.
 */
export const claimBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  hugWidth: z.boolean().optional(),
  hugHeight: z.boolean().optional(),
})

export type ClaimBox = z.infer<typeof claimBoxSchema>

/** One session's hold on a frame while its agent rewrites it. */
export const claimSchema = z.looseObject({
  /** The canonical frame ref, `<project>/<page>/<frame>`. */
  frame: z.string(),
  /** The session holding it, the id `inbox` and a note's `to` use. */
  session: z.string(),
  /** The agent's name, such as `claude`, whose first letter the board shows. */
  agent: z.string(),
  /** The listener's tag form, `<agent> · <project folder>`. */
  tag: z.string(),
  /** When the session first claimed it, kept across renewals. */
  claimedAt: z.string(),
  /** When it lapses unless the session claims it again. */
  expiresAt: z.string(),
  /** A reservation's box, held until the frame's file lands in the layout. */
  box: claimBoxSchema.optional(),
  /** The id one `editing --new` call stamps on each frame it reserves, which renew together. */
  set: z.string().optional(),
  /** When the session last claimed a reserved frame plainly, so the latest in a set reads as drawing. */
  drawingAt: z.string().optional(),
})

export type Claim = z.infer<typeof claimSchema>

/**
 * Whether a write naming `ref` reaches the frame a claim holds, being the
 * frame itself, its page, or its project, so a page ref never matches a
 * sibling page whose name only starts the same.
 */
export function claimCovers(ref: string, frame: string): boolean {
  return frame === ref || frame.startsWith(`${ref}/`)
}

/** `.run/claims.json`. */
export const claimsFileSchema = z.looseObject({
  version: z.literal(1),
  claims: z.array(claimSchema),
})

export type ClaimsFile = z.infer<typeof claimsFileSchema>
