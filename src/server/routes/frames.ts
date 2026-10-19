import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, join, sep } from 'node:path'

import { Hono } from 'hono'

import { ASSETS_FOLDER, LAYOUT_FILE } from '@/server/board/scan'
import type { TokenSheetPaths } from '@/server/checks/tokens'
import { contentHash } from '@/server/edit/address'
import { frameHead, injectHead } from '@/server/look/inject'
import { FRAME_EXTENSION, TOKEN_FILE } from '@/shared/board-files'
import { FACES, faceSheetUrl } from '@/shared/faces'

const NOTES_FILE = 'notes.json'

/** Where the look route serves the board's token sheet, whichever file stands in for it. */
export const BOARD_SHEET_URL = '/frameboard/tokens.css'

/** How a served frame gets its look from outside itself. */
export interface FrameLook {
  /** A project's token sheets, read per request so a sheet made later is imported. */
  sheets: (project: string) => TokenSheetPaths
}

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
 * from the board, so a frame's relative links resolve with no rewriting, and
 * `/frames/<project>/tokens.css`, so a project sheet's relative links resolve
 * the same way. It is a handler of its own rather than static serving over
 * the root, since it reads the developer's files and has to refuse
 * everything else: board records, dot-named paths, and any path whose
 * realpath leaves its project. Every refusal answers 404, so nothing tells a
 * caller what exists.
 *
 * A frame served from a page gets the faces and the token sheets spliced
 * first into its `head`, in the response alone, and every other file is
 * served byte for byte.
 */
export function frameRoutes(root: string, look: FrameLook): Hono {
  const app = new Hono()

  app.get('/frames/*', async (c) => {
    // The URL parser has already resolved `..` and `%2e%2e` segments.
    const raw = new URL(c.req.url).pathname.slice('/frames/'.length)
    const parts = decodeSegments(raw.split('/'))
    const file = parts && (await resolveFile(root, parts))
    if (!file) return c.notFound()

    const [project = '', page = ''] = parts
    const bytes = new Uint8Array(await readFile(file))
    const isFrame =
      page !== ASSETS_FOLDER &&
      parts.length === 3 &&
      extname(file).toLowerCase() === FRAME_EXTENSION
    const body = isFrame
      ? injectHead(
          bytes,
          frameHead(
            sheetUrls(project, look.sheets(project)),
            contentHash(bytes),
          ),
        )
      : bytes

    return c.body(body, 200, {
      'Content-Type':
        CONTENT_TYPES[extname(file).toLowerCase()] ??
        'application/octet-stream',
      'Cache-Control': 'no-store',
    })
  })

  return app
}

/** The sheets a frame imports, being every face, then the board's tokens, then the project's. */
function sheetUrls(project: string, sheets: TokenSheetPaths): string[] {
  return [
    ...FACES.map(faceSheetUrl),
    ...(sheets.board ? [BOARD_SHEET_URL] : []),
    ...(sheets.project
      ? [`/frames/${encodeURIComponent(project)}/${TOKEN_FILE}`]
      : []),
  ]
}

export function decodeSegments(segments: string[]): string[] | null {
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
  if (!project || !page) return null
  const projectSheet = rest.length === 0 && page === TOKEN_FILE
  if (rest.length === 0 && !projectSheet) return null
  const inPage = page !== ASSETS_FOLDER && !projectSheet
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
