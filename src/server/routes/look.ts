import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Hono } from 'hono'

import { boardSheetPath, tokenSheetPaths } from '@/server/checks/tokens'
import { BRIDGE_URL } from '@/server/look/inject'
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
  '.js': 'text/javascript; charset=utf-8',
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
  /** The look routes alone, which the board's own pages read faces from. */
  lookRoutes: Hono
  /** The look routes and the frame routes, in the order a server mounts them. */
  routes: Hono
}

/**
 * The look and frame routes, so the board server and the capture host serve a
 * frame the same way.
 */
export function servedFrames(
  root: string,
  {
    facesDir,
    tokens,
    version,
    base,
  }: {
    facesDir: string
    tokens?: string | null
    version?: FrameVersion
    base?: string
  },
): ServedFrames {
  const look: FrameLook = {
    sheets: (project) => tokenSheetPaths(root, project, tokens),
  }
  const looks = lookRoutes({
    facesDir,
    boardSheet: () => boardSheetPath(root, tokens),
  })
  const routes = new Hono()
  routes.route('/', looks)
  routes.route('/', frameRoutes(root, look, version, base))
  return { look, lookRoutes: looks, routes }
}

/**
 * Serves the faces and board sheet, the sheet never cached and faces cached
 * for good under the release's segment, another release answering 404 so a
 * stale URL never caches today's bytes.
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

  app.get(BRIDGE_URL, async (c) => {
    const script = await bridgeScript()
    if (script === null) return c.notFound()
    return c.body(script, 200, {
      'Content-Type': CONTENT_TYPES['.js'] ?? '',
      'Cache-Control': fromSource ? 'no-store' : IMMUTABLE,
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

/** Whether this module runs from source, where no bundle sits beside it. */
const fromSource = import.meta.url.endsWith('.ts')

let bridge: Promise<string | null> | undefined

/**
 * The frame bridge's script, read once from beside the bundle, or built from
 * source on a source run, so a dev server or a test serves the code as it
 * stands. A missing bundle answers null, and a failed build is tried again.
 */
function bridgeScript(): Promise<string | null> {
  bridge ??= fromSource
    ? buildBridge().catch((error: unknown) => {
        bridge = undefined
        throw error
      })
    : readFile(
        fileURLToPath(new URL('./frame-bridge.js', import.meta.url)),
        'utf8',
      ).catch(() => null)
  return bridge
}

/** Bundles the bridge the way `rolldown.config.ts` does, in memory. */
async function buildBridge(): Promise<string> {
  const { build } = await import('rolldown')
  const src = fileURLToPath(new URL('../..', import.meta.url))
  const { output } = await build({
    input: join(src, 'frame-bridge', 'main.ts'),
    platform: 'browser',
    resolve: { alias: { '@': src } },
    write: false,
    output: { format: 'iife' },
  })
  return output[0].code
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
