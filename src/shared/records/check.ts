import { z } from 'zod/mini'

// Written in zod/mini, since the write hook imports this record and its
// budget is process start, which zod classic alone would double.

/** Where in the frame's own bytes a finding sits, absent for one read from a path. */
export const findingLocationSchema = z.object({
  line: z.int().check(z.minimum(1)),
  column: z.int().check(z.minimum(1)),
  startOffset: z.int().check(z.minimum(0)),
  endOffset: z.int().check(z.minimum(0)),
})

export type FindingLocation = z.infer<typeof findingLocationSchema>

/**
 * One rule a frame or folder breaks. Browser rules a later row adds append
 * rule ids and never reshape a field.
 */
export const findingSchema = z.object({
  rule: z.string(),
  severity: z.enum(['error', 'warning']),
  /** The frame ref, null for a finding on a folder. */
  frame: z.nullable(z.string()),
  /** Board-relative, with forward slashes. */
  path: z.string(),
  message: z.string(),
  location: z.nullable(findingLocationSchema),
})

export type Finding = z.infer<typeof findingSchema>

/**
 * Whether the browser rules ran, so a reader can tell no browser findings
 * from none looked for. `reason` names why they did not.
 */
export const browserRunSchema = z.object({
  ran: z.boolean(),
  reason: z.optional(z.enum(['server-not-running', 'browser-not-found'])),
})

export type BrowserRun = z.infer<typeof browserRunSchema>

/** What `check` returns: how many frames it read and every finding among them. */
export const checkResultSchema = z.object({
  checked: z.int().check(z.minimum(0)),
  findings: z.array(findingSchema),
  browser: z.optional(browserRunSchema),
})

export type CheckResult = z.infer<typeof checkResultSchema>
