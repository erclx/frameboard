import { z } from 'zod'

export const addressFileSchema = z.looseObject({
  version: z.literal(1),
  url: z.string(),
  host: z.string(),
  port: z.int().min(1).max(65535),
  pid: z.int().min(1),
  token: z.string().regex(/^[0-9a-f]{64}$/),
  root: z.string(),
  startedAt: z.iso.datetime(),
  frameboard: z.string(),
  /** The absolute `--tokens` sheet standing in for the board's, absent when none was given. */
  tokens: z.string().optional(),
})

export type AddressFile = z.infer<typeof addressFileSchema>
