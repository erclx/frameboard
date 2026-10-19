import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { z } from 'zod'

import { type ErrorCode, FrameboardError } from '@/shared/errors'

/** The status each refusal of a structure or history write answers with. */
const STATUS: Partial<Record<ErrorCode, ContentfulStatusCode>> = {
  usage: 400,
  'invalid-name': 400,
  'project-required': 400,
  'project-not-found': 404,
  'page-not-found': 404,
  'frame-not-found': 404,
  'name-taken': 409,
  'stale-layout': 409,
  'undo-overtaken': 409,
  'nothing-to-undo': 409,
  'frame-locked': 423,
  'layout-invalid': 422,
  'project-file-invalid': 422,
  'lock-timeout': 503,
}

/**
 * Answers a refusal in the CLI's `{ ok, error }` envelope, for a route
 * module's `onError`. Anything else is a fault and goes on to Hono.
 */
export function answerRefusal(error: Error, c: Context): Response {
  if (!(error instanceof FrameboardError)) throw error
  return c.json(
    {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    },
    STATUS[error.code] ?? 500,
  )
}

/** The request's JSON body as the schema reads it, or `usage` naming what failed. */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    throw new FrameboardError('usage', `The body ${parsed.error.message}`)
  }
  return parsed.data
}
