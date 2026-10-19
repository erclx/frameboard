import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { readFrame } from '@/server/board/frames'
import type { RenderFrame, Theme } from '@/server/capture/render'
import { type ErrorCode, FrameboardError } from '@/shared/errors'

const STATUS: Partial<Record<ErrorCode, ContentfulStatusCode>> = {
  usage: 400,
  'project-required': 400,
  'project-not-found': 404,
  'page-not-found': 404,
  'frame-not-found': 404,
  'font-missing': 422,
  'browser-not-found': 503,
}

/**
 * `GET /api/frames/png?ref=<frame-ref>&theme=<light|dark>`, a frame rendered
 * at twice its layout size. It takes no token, since the image shows only
 * what the frame route already serves, and a refusal answers the CLI's
 * `{ ok, error }` envelope.
 */
export function pngRoutes(root: string, render: RenderFrame): Hono {
  const app = new Hono()

  app.get('/api/frames/png', async (c) => {
    try {
      const ref = c.req.query('ref') ?? ''
      const theme = c.req.query('theme') ?? ''
      if (ref === '' || !isTheme(theme)) {
        throw new FrameboardError(
          'usage',
          'Ask for /api/frames/png?ref=<frame-ref>&theme=<light|dark>.',
          { ref, theme },
        )
      }
      const frame = await readFrame(root, ref, { cwd: root })
      const bytes = await render(frame, theme)
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
