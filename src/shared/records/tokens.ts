import { z } from 'zod'

/** The Theme tab's groups, drawn in this order. */
export const TOKEN_GROUPS = ['color', 'radius', 'font', 'other'] as const

export const tokenRowSchema = z.object({
  /** The custom property, with its leading `--`. */
  name: z.string(),
  group: z.enum(TOKEN_GROUPS),
  /** The value in light, null when the sheets set none for it. */
  light: z.string().nullable(),
  /** The value in dark, null when the sheets set none for it. */
  dark: z.string().nullable(),
  /** The sheet the winning value comes from, as `sheets` names it. */
  sheet: z.string(),
})

export type TokenRow = z.infer<typeof tokenRowSchema>

export const tokenSheetSchema = z.object({
  /** Board-relative, or absolute for a `--tokens` sheet outside the board. */
  path: z.string(),
  kind: z.enum(['board', 'project']),
  /** Why the sheet did not parse, null when it did. */
  error: z.string().nullable(),
})

/** A project's token sheets in cascade order, and one row per custom property they set. */
export const tokenTableSchema = z.object({
  sheets: z.array(tokenSheetSchema),
  tokens: z.array(tokenRowSchema),
})

export type TokenTable = z.infer<typeof tokenTableSchema>
