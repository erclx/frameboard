import { readFileSync } from 'node:fs'

import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'

import { readFrame } from '@/server/board/frames'
import type { RenderFilmstrip } from '@/server/capture/images'
import type { RenderFrame } from '@/server/capture/render'
import { contentHash } from '@/server/edit/address'
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
  'invalid-address': 422,
  'stale-address': 409,
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
 * frame holding none as it is. An added `element=<index>&hash=<hash>`, the
 * address `edit` takes, renders that one element alone on a transparent
 * ground at its own box. It answers 409 `stale-address` when the file's
 * hash is no longer `hash`, and 422 `invalid-address` for an index naming
 * no element or one with no layout box. The three additions exclude each
 * other, and `element` without `hash` is no address, each refusing as
 * `usage`. It takes no token, since the image shows only
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
      const element = parseElement(c.req.query('element'), c.req.query('hash'))
      const forms = [filmstrip !== undefined, device, element !== undefined]
      if (
        ref === '' ||
        !isTheme(theme) ||
        scale === null ||
        filmstrip === null ||
        device === null ||
        element === null ||
        forms.filter(Boolean).length > 1
      ) {
        throw new FrameboardError(
          'usage',
          'Ask for /api/frames/png?ref=<frame-ref>&theme=<light|dark>&scale=<1|2|3>, adding one of &filmstrip=<n> of 2 or more for a filmstrip, &device=1 for the frame inside its device, or &element=<index>&hash=<hash> for one element alone.',
          {
            ref,
            theme,
            scale: c.req.query('scale') ?? null,
            filmstrip: c.req.query('filmstrip') ?? null,
            device: c.req.query('device') ?? null,
            element: c.req.query('element') ?? null,
            hash: c.req.query('hash') ?? null,
          },
        )
      }
      const { device: held, ...frame } = await readFrame(root, ref, {
        cwd: root,
      })
      if (element) assertHash(frame, element.hash)
      const bytes =
        filmstrip !== undefined
          ? await renderFilmstrip(frame, theme, scale, filmstrip)
          : element
            ? await render({ ...frame, element: element.index }, theme, scale)
            : await render(
                device && held ? { ...frame, device: held } : frame,
                theme,
                scale,
              )
      // A file that moved under the render shot whatever now holds the index.
      if (element) assertHash(frame, element.hash)
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

// The pair `edit --index --hash` takes, both or neither, so an index alone
// refuses rather than naming whichever element moved into that place.
function parseElement(
  index: string | undefined,
  hash: string | undefined,
): { index: number; hash: string } | undefined | null {
  if (index === undefined && hash === undefined) return undefined
  if (index === undefined || !hash || !/^(0|[1-9][0-9]*)$/.test(index)) {
    return null
  }
  return { index: Number(index), hash }
}

function assertHash(frame: { ref: string; path: string }, hash: string): void {
  if (contentHash(readFileSync(frame.path)) === hash) return
  throw new FrameboardError(
    'stale-address',
    `${frame.ref} changed since the element was picked, so nothing is exported. Select it again.`,
    { ref: frame.ref },
  )
}

// Whole numbers from 2 alone, so `1`, `2.5`, and an empty value refuse, and
// a count too wide to shoot refuses later as `capture-too-large`.
function parseFilmstrip(value: string | undefined): number | undefined | null {
  if (value === undefined) return undefined
  if (!/^[1-9][0-9]*$/.test(value)) return null
  const count = Number(value)
  return count >= 2 ? count : null
}
