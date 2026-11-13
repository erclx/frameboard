import { z } from 'zod'

/**
 * What `preview` returns on a start: the link a phone on the same network
 * opens, landing on one frame, which serves that frame's whole project read
 * only. The link ends when another start replaces it, when `preview --stop`
 * runs, when the board card showing it closes, or when the board stops.
 */
export const previewStartSchema = z.object({
  url: z.string(),
  /** This machine's address on the local network, which the link names. */
  address: z.string(),
  /** The port the listener bound on every interface, the one asked for unless it was taken. */
  port: z.int(),
  /** The secret in the link's path, new on every start. */
  token: z.string(),
  project: z.string(),
  /** The frame the link lands on, `<project>/<page>/<frame>`. */
  ref: z.string(),
})

export type PreviewStart = z.infer<typeof previewStartSchema>

/** What `preview --stop` returns: whether a link was running to end. */
export const previewStopSchema = z.object({ stopped: z.boolean() })

export type PreviewStop = z.infer<typeof previewStopSchema>
