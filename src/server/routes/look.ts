import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, join, sep } from 'node:path'

import { Hono } from 'hono'

import { boardSheetPath, tokenSheetPaths } from '@/server/checks/tokens'
import { FACES_URL } from '@/shared/faces'

import {
  BOARD_SHEET_URL,
  decodeSegments,
  type FrameLook,
  frameRoutes,
} from './frames'

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
}

export interface LookOptions {
  /** The folder the faces were copied into at build, one folder per face. */
  facesDir: string
  /** The board's token sheet, read per request since it can appear after start. */
  boardSheet: () => string | null
}

export interface ServedFrames {
  /** A project's token sheets, as the frame route imports them. */
  look: FrameLook
  /** The look routes and the frame routes, in the order a server mounts them. */
  routes: Hono
}

/**
 * The look routes and the frame routes over `root`, so the board server and
 * the capture host serve a frame the same way. `tokens` is a known
 * `--tokens` sheet, null for none, or absent to read the one a running
 * server recorded in the address file on each request.
 */
export function servedFrames(
  root: string,
  { facesDir, tokens }: { facesDir: string; tokens?: string | null },
): ServedFrames {
  const look: FrameLook = {
    sheets: (project) => tokenSheetPaths(root, project, tokens),
  }
  const routes = new Hono()
  routes.route(
    '/',
    lookRoutes({ facesDir, boardSheet: () => boardSheetPath(root, tokens) }),
  )
  routes.route('/', frameRoutes(root, look))
  return { look, routes }
}

/**
 * Serves what every frame imports from outside the board: the faces under
 * `/frameboard/faces/*` and the board sheet at `/frameboard/tokens.css`.
 * Neither is cached, so a changed sheet reaches a frame on its reload. A
 * dot-named or escaping path answers 404, as the frame route does.
 */
export function lookRoutes({ facesDir, boardSheet }: LookOptions): Hono {
  const app = new Hono()

  app.get(BOARD_SHEET_URL, async (c) => {
    const sheet = boardSheet()
    const bytes = sheet ? await readOrNull(sheet) : null
    if (!bytes) return c.notFound()
    return c.body(bytes, 200, {
      'Content-Type': CONTENT_TYPES['.css'] ?? '',
      'Cache-Control': 'no-store',
    })
  })

  app.get(`${FACES_URL}/*`, async (c) => {
    const raw = new URL(c.req.url).pathname.slice(FACES_URL.length + 1)
    const file = await resolveFace(facesDir, raw.split('/'))
    const type = file && CONTENT_TYPES[extname(file)]
    const bytes = type ? await readOrNull(file) : null
    if (!type || !bytes) return c.notFound()
    return c.body(bytes, 200, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
    })
  })

  return app
}

/** The realpath of a file inside the faces folder, or null for any other path. */
async function resolveFace(
  facesDir: string,
  segments: string[],
): Promise<string | null> {
  const names = decodeSegments(segments)
  if (!names) return null
  try {
    const dir = await realpath(facesDir)
    const file = await realpath(join(dir, ...names))
    if (!file.startsWith(dir + sep)) return null
    return (await stat(file)).isFile() ? file : null
  } catch {
    return null
  }
}

async function readOrNull(
  path: string,
): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    return new Uint8Array(await readFile(path))
  } catch {
    return null
  }
}
