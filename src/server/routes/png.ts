import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { readFrame } from '@/server/board/frames'
import type { RenderFilmstrip } from '@/server/capture/images'
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
  'image-missing': 422,
  'capture-too-large': 422,
  'motion-missing': 422,
  'motion-unbounded': 422,
  'browser-not-found': 503,
}

/** The route's scale when none is asked for, matching Copy as PNG. */
const DEFAULT_SCALE = 2

/**
 * `GET /api/frames/png?ref=<frame-ref>&theme=<light|dark>&scale=<1|2|3>`, a
 * frame rendered at `scale` times its layout size, twice when no scale is
 * given. An added `filmstrip=<n>` of 2 or more renders `n` moments of its
 * timeline in one row instead, refusing a frame with no timeline as
 * `motion-missing` and one that never ends as `motion-unbounded`. An added
 * `device=1` draws a frame holding a device inside its body, and leaves a
 * frame holding none as it is. It takes no token, since the image shows only
 * what the frame route already serves, and a refusal answers the CLI's
 * `{ ok, error }` envelope.
 */
export function pngRoutes(
  root: string,
  render: RenderFrame,
  renderFilmstrip: RenderFilmstrip,
): Hono {
  const app = new Hono()

  app.get('/api/frames/png', async (c) => {
    try {
      const ref = c.req.query('ref') ?? ''
      const theme = c.req.query('theme') ?? ''
      const scale = parseScale(c.req.query('scale'))
      const filmstrip = parseFilmstrip(c.req.query('filmstrip'))
      const device = parseDevice(c.req.query('device'))
      if (
        ref === '' ||
        !isTheme(theme) ||
        scale === null ||
        filmstrip === null ||
        device === null
      ) {
        throw new FrameboardError(
          'usage',
          'Ask for /api/frames/png?ref=<frame-ref>&theme=<light|dark>&scale=<1|2|3>, adding &filmstrip=<n> of 2 or more for a filmstrip or &device=1 for the frame inside its device.',
          {
            ref,
            theme,
            scale: c.req.query('scale') ?? null,
            filmstrip: c.req.query('filmstrip') ?? null,
            device: c.req.query('device') ?? null,
          },
        )
      }
      const { device: held, ...frame } = await readFrame(root, ref, {
        cwd: root,
      })
      const bytes =
        filmstrip === undefined
          ? await render(
              device && held ? { ...frame, device: held } : frame,
              theme,
              scale,
            )
          : await renderFilmstrip(frame, theme, scale, filmstrip)
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

// `1` alone asks for the device, so `true` or an empty value refuses.
function parseDevice(value: string | undefined): boolean | null {
  if (value === undefined) return false
  return value === '1' ? true : null
}

// Whole numbers from 2 alone, so `1`, `2.5`, and an empty value refuse, and
// a count too wide to shoot refuses later as `capture-too-large`.
function parseFilmstrip(value: string | undefined): number | undefined | null {
  if (value === undefined) return undefined
  if (!/^[1-9][0-9]*$/.test(value)) return null
  const count = Number(value)
  return count >= 2 ? count : null
}
