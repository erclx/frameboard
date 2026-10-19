import { z } from 'zod'

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
})

export type Claim = z.infer<typeof claimSchema>

/** `.run/claims.json`. */
export const claimsFileSchema = z.looseObject({
  version: z.literal(1),
  claims: z.array(claimSchema),
})

export type ClaimsFile = z.infer<typeof claimsFileSchema>
