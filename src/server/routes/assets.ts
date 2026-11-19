import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import { framesLinking } from '@/server/board/asset-links'
import type { AssetUsage } from '@/server/board/asset-usage'
import {
  addAssets,
  listAssets,
  removeAsset,
  renameAsset,
  replaceAsset,
} from '@/server/board/assets'
import { listTransitions, ownKeyframes } from '@/server/board/transitions'
import { refuseClaimed } from '@/server/claims/gate'
import type { History } from '@/server/history/stack'
import { FrameboardError } from '@/shared/errors'
import { isValidName } from '@/shared/names'
import {
  type AssetFrames,
  assetRenameSchema,
  type AssetWriteResult,
  type TransitionKeyframesList,
} from '@/shared/records/assets'

import { type Access, requireWriter } from '../access/guard'
import { answerRefusal, parseBody } from './envelope'
import { decodeSegments } from './frames'

/** The most a drop may carry, multipart overhead included. */
export const ASSET_BODY_LIMIT = 64 * 1024 * 1024

export interface AssetsRoutesOptions {
  /** The most a drop may carry, `ASSET_BODY_LIMIT` unless given. */
  limit?: number
  /** Counts the frames linking each file, which the listing carries as `frames` when given. */
  usage?: AssetUsage
}

/**
 * A project's `assets/` routes, the drop held in memory, so the body limit is
 * its only bound. A rename, replace, or delete names its file after
 * `assets/` in the URL, each segment encoded, and records one undo step.
 */
export function assetsRoutes(
  root: string,
  access: Access,
  history: History,
  { limit = ASSET_BODY_LIMIT, usage }: AssetsRoutesOptions = {},
): Hono {
  const app = new Hono()
  const authorized = requireWriter(access)
  const path = '/api/projects/:project/assets'
  const file = `${path}/*`
  const limited = bodyLimit({
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
  })

  /** The project folder and the file's path under `assets/`, refusing a missing project or a path segment that leaves the folder. */
  const target = (url: string, project: string) => {
    const projectDir = projectFolder(root, project)
    if (projectDir === null) {
      throw new FrameboardError(
        'project-not-found',
        `No project named ${project} in this board.`,
      )
    }
    const prefix = `/api/projects/${encodeURIComponent(project)}/assets/`
    const raw = new URL(url).pathname
    const segments = raw.startsWith(prefix)
      ? decodeSegments(raw.slice(prefix.length).split('/'))
      : null
    if (segments === null || segments.length === 0) {
      throw new FrameboardError(
        'asset-not-found',
        "Name a file in the project's assets folder.",
      )
    }
    return { projectDir, asset: segments.join('/') }
  }

  /** Runs one write with a fresh journal and records it as a step that moves no page. */
  const recorded = async (
    write: (
      journal: ReturnType<History['journal']>,
    ) => Promise<AssetWriteResult>,
  ): Promise<AssetWriteResult> => {
    const journal = history.journal()
    const result = await write(journal)
    history.record({
      id: journal.id,
      changes: journal.changes,
      page: null,
      frames: result.frames,
    })
    return result
  }

  app.get(path, async (c) => {
    const projectDir = projectFolder(root, c.req.param('project'))
    if (projectDir === null)
      return c.json(notFound(c.req.param('project')), 404)
    const [files, counts] = await Promise.all([
      listAssets(projectDir),
      usage?.counts(c.req.param('project')),
    ])
    return c.json({
      ok: true,
      data: {
        files: counts
          ? files.map((file) => ({
              ...file,
              frames: counts.get(file.path) ?? 0,
            }))
          : files,
      },
    })
  })

  // Answers what the reader kept, renamed, never a file's own bytes.
  app.get('/api/projects/:project/transitions', async (c) => {
    const project = c.req.param('project')
    const projectDir = projectFolder(root, project)
    if (projectDir === null) return c.json(notFound(project), 404)
    const data: TransitionKeyframesList = {
      transitions: (await listTransitions(projectDir)).map((transition) => ({
        name: transition.name,
        css: ownKeyframes(project, transition),
      })),
    }
    return c.json({ ok: true, data })
  })

  app.post(path, authorized, limited, async (c) => {
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
  })

  app.get(file, async (c) => {
    const project = c.req.param('project')
    const { asset } = target(c.req.url, project)
    const linking = await framesLinking(root, project, asset)
    const data: AssetFrames = {
      path: asset,
      frames: linking.map(({ page, name }) => `${project}/${page}/${name}`),
    }
    return c.json({ ok: true, data })
  })

  app.delete(file, authorized, async (c) => {
    const { projectDir, asset } = target(c.req.url, c.req.param('project'))
    const data = await recorded((journal) =>
      removeAsset(projectDir, asset, { journal }),
    )
    return c.json({ ok: true, data })
  })

  app.patch(file, authorized, async (c) => {
    const project = c.req.param('project')
    const { asset } = target(c.req.url, project)
    const { name } = await parseBody(c.req.raw, assetRenameSchema)
    const data = await recorded((journal) =>
      renameAsset(root, project, asset, name, {
        journal,
        gate: (refs) => refuseHeld(root, asset, refs),
      }),
    )
    return c.json({ ok: true, data })
  })

  app.put(file, authorized, limited, async (c) => {
    const { projectDir, asset } = target(c.req.url, c.req.param('project'))
    const form = await c.req
      .parseBody()
      .catch(() => ({}) as Record<string, unknown>)
    const sent = form.file
    if (!(sent instanceof File)) {
      throw new FrameboardError(
        'usage',
        'Send multipart/form-data with one file in the "file" field.',
      )
    }
    const upload = {
      name: sent.name,
      bytes: new Uint8Array(await sent.arrayBuffer()),
    }
    const data = await recorded((journal) =>
      replaceAsset(projectDir, asset, upload, { journal }),
    )
    return c.json({ ok: true, data })
  })

  app.onError(answerRefusal)

  return app
}

/** Refuses `asset-held` naming the session, when another session holds a frame the rename would rewrite. */
async function refuseHeld(
  root: string,
  asset: string,
  refs: string[],
): Promise<void> {
  try {
    await refuseClaimed(root, refs, new Date())
  } catch (error) {
    if (!(error instanceof FrameboardError) || error.code !== 'frame-claimed') {
      throw error
    }
    const { tag, frame } = error.details
    throw new FrameboardError(
      'asset-held',
      `${String(tag)} is editing ${String(frame)}, which links assets/${asset}, so it was not renamed. Try again once it finishes.`,
      error.details,
    )
  }
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
