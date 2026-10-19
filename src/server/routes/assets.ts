import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import { addAssets, listAssets } from '@/server/board/assets'
import { isValidName } from '@/shared/names'

import { type Access, requireWriter } from '../access/guard'

/** The most a drop may carry, multipart overhead included. */
export const ASSET_BODY_LIMIT = 64 * 1024 * 1024

/**
 * A project's `assets/` folder over the board's JSON envelope: the listing the
 * Assets tab draws, and the drop that writes into it. The drop needs a writer
 * and is held in memory, so the body limit is its only bound.
 */
export function assetsRoutes(
  root: string,
  access: Access,
  limit = ASSET_BODY_LIMIT,
): Hono {
  const app = new Hono()
  const authorized = requireWriter(access)
  const path = '/api/projects/:project/assets'

  app.get(path, async (c) => {
    const projectDir = projectFolder(root, c.req.param('project'))
    if (projectDir === null)
      return c.json(notFound(c.req.param('project')), 404)
    return c.json({ ok: true, data: { files: await listAssets(projectDir) } })
  })

  app.post(
    path,
    authorized,
    bodyLimit({
      maxSize: limit,
      onError: (c) =>
        c.json(
          {
            ok: false,
            error: {
              code: 'asset-too-large',
              message: `A drop may carry ${limit / 1024 / 1024} MiB at most. Nothing was written.`,
            },
          },
          413,
        ),
    }),
    async (c) => {
      const projectDir = projectFolder(root, c.req.param('project'))
      if (projectDir === null)
        return c.json(notFound(c.req.param('project')), 404)
      const form = await c.req
        .parseBody({ all: true })
        .catch(() => ({}) as Record<string, unknown>)
      const sent = [form.files].flat().filter((v) => v instanceof File)
      if (sent.length === 0) {
        return c.json(
          {
            ok: false,
            error: {
              code: 'usage',
              message:
                'Send multipart/form-data with files in the "files" field.',
            },
          },
          400,
        )
      }
      const uploads = await Promise.all(
        sent.map(async (file) => ({
          name: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
        })),
      )
      return c.json({ ok: true, data: await addAssets(projectDir, uploads) })
    },
  )

  return app
}

function projectFolder(root: string, project: string): string | null {
  const folder = join(root, project)
  return isValidName(project) && existsSync(folder) ? folder : null
}

function notFound(project: string) {
  return {
    ok: false,
    error: {
      code: 'project-not-found',
      message: `No project named ${project} in this board.`,
    },
  } as const
}
