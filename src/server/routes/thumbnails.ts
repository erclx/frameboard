import { readFile } from 'node:fs/promises'

import { Hono } from 'hono'

import { scanBoard } from '@/server/board/scan'
import type { ThumbnailStore } from '@/server/capture/thumbnails'
import { cardFrames } from '@/shared/card-frames'
import { FrameboardError } from '@/shared/errors'
import { isTheme, type Theme } from '@/shared/theme'

import { answerRefusal } from './envelope'

/**
 * The thumbnail routes, queueing stale renders so home hears each landing on
 * the socket, and caching a capture for good, since a change takes a new stamp.
 */
export function thumbnailRoutes(root: string, store: ThumbnailStore): Hono {
  const app = new Hono()

  app.get('/api/thumbnails', async (c) => {
    const theme = themeOf(
      c.req.query('theme'),
      'Ask for /api/thumbnails?theme=<light|dark>.',
    )
    const board = await scanBoard(root)
    const frames = board.projects.flatMap((project) =>
      cardFrames(project).map(({ ref, box }) => ({
        ref,
        box: { width: box.width, height: box.height },
      })),
    )
    return c.json({ ok: true, data: { stamps: store.ask(theme, frames) } })
  })

  app.get('/api/thumbnails/png', async (c) => {
    const theme = themeOf(
      c.req.query('theme'),
      'Ask for /api/thumbnails/png?ref=<frame-ref>&theme=<light|dark>&v=<stamp>.',
    )
    const ref = c.req.query('ref') ?? ''
    const stamp = c.req.query('v') ?? ''
    const path = store.file(ref, theme, stamp)
    // A capture removed from disk under a current entry reads as stale, not a fault.
    const bytes = path ? await readFile(path).catch(() => null) : null
    if (!bytes) {
      throw new FrameboardError(
        'frame-not-found',
        `No current thumbnail of ${ref} in ${theme} at v=${stamp}.`,
        { ref, theme, v: stamp },
      )
    }
    return c.body(new Uint8Array(bytes), 200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    })
  })

  app.onError(answerRefusal)

  return app
}

function themeOf(value: string | undefined, usage: string): Theme {
  if (!isTheme(value)) {
    throw new FrameboardError('usage', usage, {
      theme: value ?? '',
    })
  }
  return value
}
