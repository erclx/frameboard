import { z } from 'zod'

/** What `references sync` returns, each path relative to the folder and sorted. */
export const referencesSyncSchema = z.object({
  folder: z.string(),
  written: z.array(z.string()),
  removed: z.array(z.string()),
})

export type ReferencesSync = z.infer<typeof referencesSyncSchema>

/**
 * What `references sync --check` returns, and the details of its
 * `references-stale`, each path relative to the folder and sorted. `pngDiffers`
 * warns and never fails, since a PNG varies with the browser build.
 */
export const referencesCheckSchema = z.object({
  folder: z.string(),
  changed: z.array(z.string()),
  missing: z.array(z.string()),
  stray: z.array(z.string()),
  pngDiffers: z.array(z.string()),
})

export type ReferencesCheck = z.infer<typeof referencesCheckSchema>
