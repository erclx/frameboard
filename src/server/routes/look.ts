import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, join, sep } from 'node:path'

import { Hono } from 'hono'

import { boardSheetPath, tokenSheetPaths } from '@/server/checks/tokens'
import { FACES_URL } from '@/shared/faces'
import { version } from '@/shared/version'

import {
  BOARD_SHEET_URL,
  decodeSegments,
  type FrameLook,
  frameRoutes,
  type FrameVersion,
} from './frames'

/** The answer for faces under the running release, whose bytes a release fixes. */
const IMMUTABLE = 'public, max-age=31536000, immutable'

/** A release segment as `faceSheetUrl` writes one, such as `v0.29.0`. */
const RELEASE_SEGMENT = /^v\d+\.\d+\.\d+/

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
 * server recorded in the address file on each request. `version` serves the
 * frame versions an agent write replaced, absent where nothing holds them.
 */
export function servedFrames(
  root: string,
  {
    facesDir,
    tokens,
    version,
  }: { facesDir: string; tokens?: string | null; version?: FrameVersion },
): ServedFrames {
  const look: FrameLook = {
    sheets: (project) => tokenSheetPaths(root, project, tokens),
  }
  const routes = new Hono()
  routes.route(
    '/',
    lookRoutes({ facesDir, boardSheet: () => boardSheetPath(root, tokens) }),
  )
  routes.route('/', frameRoutes(root, look, version))
  return { look, routes }
}

/**
 * Serves what every frame imports from outside the board: the faces under
 * `/frameboard/faces/*` and the board sheet at `/frameboard/tokens.css`.
 * The board sheet is never cached, so a changed sheet reaches a frame on its
 * reload. The faces under the running release's segment, as
 * `/frameboard/faces/v0.29.0/geist/index.css`, are cached for good, since
 * only a release changes them, and any other release segment answers 404 so
 * a stale URL never caches today's bytes. The bare faces path stays
 * uncached for anything naming it. A dot-named or escaping path answers 404,
 * as the frame route does.
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
    const segments = raw.split('/')
    const release = RELEASE_SEGMENT.test(segments[0] ?? '')
    if (release && segments[0] !== `v${version}`) return c.notFound()
    const file = await resolveFace(
      facesDir,
      release ? segments.slice(1) : segments,
    )
    const type = file && CONTENT_TYPES[extname(file)]
    const bytes = type ? await readOrNull(file) : null
    if (!type || !bytes) return c.notFound()
    return c.body(bytes, 200, {
      'Content-Type': type,
      'Cache-Control': release ? IMMUTABLE : 'no-store',
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
