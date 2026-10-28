import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { readFrame } from '@/server/board/frames'
import type { RenderFrame } from '@/server/capture/render'
import { type ErrorCode, FrameboardError } from '@/shared/errors'
import type { Theme } from '@/shared/theme'

const STATUS: Partial<Record<ErrorCode, ContentfulStatusCode>> = {
  usage: 400,
  'project-required': 400,
  'project-not-found': 404,
  'page-not-found': 404,
  'frame-not-found': 404,
  'font-missing': 422,
  'capture-too-large': 422,
  'browser-not-found': 503,
}

/** The route's scale when none is asked for, matching Copy as PNG. */
const DEFAULT_SCALE = 2

/**
 * `GET /api/frames/png?ref=<frame-ref>&theme=<light|dark>&scale=<1|2|3>`, a
 * frame rendered at `scale` times its layout size, twice when no scale is
 * given. It takes no token, since the image shows only
 * what the frame route already serves, and a refusal answers the CLI's
 * `{ ok, error }` envelope.
 */
export function pngRoutes(root: string, render: RenderFrame): Hono {
  const app = new Hono()

  app.get('/api/frames/png', async (c) => {
    try {
      const ref = c.req.query('ref') ?? ''
      const theme = c.req.query('theme') ?? ''
      const scale = parseScale(c.req.query('scale'))
      if (ref === '' || !isTheme(theme) || scale === null) {
        throw new FrameboardError(
          'usage',
          'Ask for /api/frames/png?ref=<frame-ref>&theme=<light|dark>&scale=<1|2|3>.',
          { ref, theme, scale: c.req.query('scale') ?? null },
        )
      }
      const frame = await readFrame(root, ref, { cwd: root })
      const bytes = await render(frame, theme, scale)
      return c.body(new Uint8Array(bytes), 200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      })
    } catch (error) {
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
  })

  return app
}

function isTheme(value: string): value is Theme {
  return value === 'light' || value === 'dark'
}

// Exact strings only, so `1.5`, `2x`, and an empty value refuse rather than round.
function parseScale(value: string | undefined): number | null {
  if (value === undefined) return DEFAULT_SCALE
  if (value === '1' || value === '2' || value === '3') return Number(value)
  return null
}
