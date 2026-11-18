import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'

import { readFrame } from '@/server/board/frames'
import type { RenderFrame } from '@/server/capture/render'
import {
  type ClipboardFile,
  type ClipboardFiles,
  clipboardUnsupported,
} from '@/server/clipboard/files'
import { type ErrorCode, FrameboardError } from '@/shared/errors'

import { type Access, requireWriter } from '../access/guard'
import { parseBody } from './envelope'

const STATUS: Partial<Record<ErrorCode, ContentfulStatusCode>> = {
  usage: 400,
  'project-required': 400,
  'project-not-found': 404,
  'page-not-found': 404,
  'frame-not-found': 404,
  'font-missing': 422,
  'image-missing': 422,
  'capture-too-large': 422,
  'clipboard-unsupported': 501,
  'browser-not-found': 503,
}

/** The scale every copied frame renders at, matching Copy as PNG. */
const COPY_SCALE = 2

const CopyBody = z.object({
  refs: z.array(z.string().min(1)).min(1),
  theme: z.enum(['light', 'dark']),
  themes: z.record(z.string(), z.enum(['light', 'dark'])).optional(),
})

/**
 * `POST /api/frames/clipboard`, putting 2x renders on the OS clipboard behind
 * `requireWriter`, since it replaces whatever the developer held.
 */
export function clipboardRoutes(
  root: string,
  access: Access,
  render: RenderFrame,
  clipboard: ClipboardFiles | null,
): Hono {
  const app = new Hono()
  app.onError((error, c) => {
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
  })
  app.use('/api/frames/clipboard', requireWriter(access))

  app.post('/api/frames/clipboard', async (c) => {
    const { refs, theme, themes } = await parseBody(c.req.raw, CopyBody)
    if (clipboard === null) throw clipboardUnsupported()
    const files: ClipboardFile[] = []
    // One at a time, so a large selection never opens a page per frame at once.
    for (const ref of refs) {
      const frame = await readFrame(root, ref, { cwd: root })
      files.push({
        name: frame.name,
        bytes: await render(frame, themes?.[ref] ?? theme, COPY_SCALE),
      })
    }
    await clipboard.write(files)
    return c.json({
      ok: true,
      data: { copied: files.length, backend: clipboard.backend },
    })
  })

  return app
}
