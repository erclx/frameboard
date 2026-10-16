import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, join, sep } from 'node:path'

import { Hono } from 'hono'

import { ASSETS_FOLDER, LAYOUT_FILE } from '@/server/board/scan'

const NOTES_FILE = 'notes.json'

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
}

/**
 * Serves `/frames/<project>/<page>/<file>` and `/frames/<project>/assets/<path>`
 * from the board, so a frame's relative links resolve with no rewriting. It is
 * a handler of its own rather than static serving over the root, since it
 * reads the developer's files and has to refuse everything else: board
 * records, dot-named paths, and any path whose realpath leaves its project.
 * Every refusal answers 404, so nothing tells a caller what exists.
 */
export function frameRoutes(root: string): Hono {
  const app = new Hono()

  app.get('/frames/*', async (c) => {
    // The URL parser has already resolved `..` and `%2e%2e` segments.
    const raw = new URL(c.req.url).pathname.slice('/frames/'.length)
    const parts = decodeSegments(raw.split('/'))
    const file = parts && (await resolveFile(root, parts))
    if (!file) return c.notFound()

    return c.body(new Uint8Array(await readFile(file)), 200, {
      'Content-Type':
        CONTENT_TYPES[extname(file).toLowerCase()] ??
        'application/octet-stream',
      'Cache-Control': 'no-store',
    })
  })

  return app
}

function decodeSegments(segments: string[]): string[] | null {
  const decoded: string[] = []
  for (const segment of segments) {
    let name: string
    try {
      name = decodeURIComponent(segment)
    } catch {
      return null
    }
    if (name === '' || name.startsWith('.') || /[/\\\0]/.test(name)) {
      return null
    }
    decoded.push(name)
  }
  return decoded
}

/** The realpath of the file a request names, or null when it is refused or missing. */
async function resolveFile(
  root: string,
  [project, page, ...rest]: string[],
): Promise<string | null> {
  if (!project || !page || rest.length === 0) return null
  const inPage = page !== ASSETS_FOLDER
  if (inPage && (rest.length > 1 || isRecord(rest[0] ?? ''))) return null

  try {
    const projectDir = await realpath(join(root, project))
    if (!projectDir.startsWith(root + sep)) return null
    const file = await realpath(join(projectDir, page, ...rest))
    if (!file.startsWith(projectDir + sep)) return null
    return (await stat(file)).isFile() ? file : null
  } catch {
    return null
  }
}

function isRecord(name: string): boolean {
  return name === LAYOUT_FILE || name === NOTES_FILE
}
