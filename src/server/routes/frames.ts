import { type BigIntStats, createReadStream } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, join, sep } from 'node:path'
import { Readable } from 'node:stream'

import { Hono } from 'hono'

import { ASSETS_FOLDER, LAYOUT_FILE } from '@/server/board/scan'
import type { TokenSheetPaths } from '@/server/checks/tokens'
import { contentHash } from '@/server/edit/address'
import { frameHead, injectHead } from '@/server/look/inject'
import { FRAME_EXTENSION, TOKEN_FILE } from '@/shared/board-files'
import { FACES, faceSheetUrl } from '@/shared/faces'
import { AT_QUERY } from '@/shared/theme'

const NOTES_FILE = 'notes.json'

/** Where the look route serves the board's token sheet, whichever file stands in for it. */
export const BOARD_SHEET_URL = '/frameboard/tokens.css'

/**
 * The source a frame held under a content hash before an agent's write
 * replaced it, or null where the server holds none.
 */
export type FrameVersion = (ref: string, hash: string) => string | null

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
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
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
 * first into its `head`, in the response alone, and is never cached. Every
 * other file is served byte for byte under a validator the browser checks on
 * each use, so an edit shows on the next load and an unchanged file answers
 * 304 with no body. A frame path carrying `?at=<hash>` serves the
 * version `version` holds under that hash in its place, with the same head,
 * and any other path carrying it answers 404. `base` prefixes the sheet URLs
 * the head imports, for a listener serving these routes under a path of its
 * own, since the head names them from the server's root.
 */
export function frameRoutes(
  root: string,
  look: FrameLook,
  version?: FrameVersion,
  base = '',
): Hono {
  const app = new Hono()

  app.get('/frames/*', async (c) => {
    // The URL parser has already resolved `..` and `%2e%2e` segments.
    const raw = new URL(c.req.url).pathname.slice('/frames/'.length)
    const parts = decodeSegments(raw.split('/'))
    const file = parts && (await resolveFile(root, parts))
    if (!file) return c.notFound()

    const [project = '', page = '', name = ''] = parts
    const isFrame =
      page !== ASSETS_FOLDER &&
      parts.length === 3 &&
      extname(file).toLowerCase() === FRAME_EXTENSION
    const contentType =
      CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream'
    const at = c.req.query(AT_QUERY)

    const rangeHeader = c.req.header('Range')
    if (!isFrame && at === undefined && rangeHeader !== undefined) {
      const { size } = await stat(file)
      const range = parseRange(rangeHeader, size)
      if (range === 'unsatisfiable') {
        return c.body(null, 416, {
          'Content-Range': `bytes */${size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
        })
      }
      if (range) {
        const headers = {
          'Content-Type': contentType,
          'Content-Length': String(range.end - range.start + 1),
          'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
        }
        // Hono answers HEAD by dropping the GET body unread, which would
        // leave an opened read stream holding its file handle.
        if (c.req.method === 'HEAD') return c.body(null, 206, headers)
        // Node types its web stream apart from the global one Hono takes,
        // though at runtime they are the same class.
        const stream = Readable.toWeb(
          createReadStream(file, range),
        ) as ReadableStream
        return c.body(stream, 206, headers)
      }
    }

    if (!isFrame && at === undefined) {
      // A validator with no lifetime, never `max-age`, since an asset edit
      // reloads every frame in the project and the reload has to see it.
      const tag = weakTag(await stat(file, { bigint: true }))
      const revalidate = { ETag: tag, 'Cache-Control': 'no-cache' }
      if (matchesTag(c.req.header('If-None-Match'), tag)) {
        return c.body(null, 304, revalidate)
      }
      const headers = {
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        ...revalidate,
      }
      // Hono drops a HEAD body unread, so reading a video for it is waste.
      if (c.req.method === 'HEAD') return c.body(null, 200, headers)
      return c.body(new Uint8Array(await readFile(file)), 200, headers)
    }

    let bytes: Uint8Array<ArrayBuffer>
    if (at === undefined) {
      bytes = new Uint8Array(await readFile(file))
    } else {
      const ref = `${project}/${page}/${name.slice(0, -FRAME_EXTENSION.length)}`
      const held = isFrame ? (version?.(ref, at) ?? null) : null
      if (held === null) return c.notFound()
      bytes = new TextEncoder().encode(held)
    }
    const body = injectHead(
      bytes,
      frameHead(
        sheetUrls(project, look.sheets(project)).map((url) => `${base}${url}`),
        contentHash(bytes),
      ),
    )

    return c.body(body, 200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    })
  })

  return app
}

/**
 * A weak validator from a file's size and nanosecond mtime, so a check costs
 * one stat rather than a read of every byte. A same-size rewrite inside one
 * timestamp tick keeps its tag, which a coarse mount makes likelier.
 */
function weakTag({ size, mtimeNs }: BigIntStats): string {
  return `W/"${size.toString(16)}-${mtimeNs.toString(16)}"`
}

/** Whether an `If-None-Match` header names `tag`, compared weakly per RFC 9110. */
function matchesTag(header: string | undefined, tag: string): boolean {
  if (header === undefined) return false
  if (header.trim() === '*') return true
  const opaque = tag.replace(/^W\//, '')
  return header
    .split(',')
    .some((listed) => listed.trim().replace(/^W\//, '') === opaque)
}

interface ByteRange {
  start: number
  end: number
}

/**
 * The inclusive bytes a single `bytes=` range names within `size`,
 * `'unsatisfiable'` for a valid range that names none of them, or null for a
 * header to ignore, which RFC 9110 allows for any range a server does not
 * support, a multi-range among them.
 */
function parseRange(
  header: string,
  size: number,
): ByteRange | 'unsatisfiable' | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, first = '', last = ''] = match
  if (first === '') {
    if (last === '') return null
    const suffix = Number(last)
    if (suffix === 0) return 'unsatisfiable'
    // RFC 9110 counts a suffix on an empty file satisfiable, and a 206 cannot
    // name zero bytes, so the empty file is served whole.
    if (size === 0) return null
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(first)
  const end = last === '' ? size - 1 : Number(last)
  if (last !== '' && end < start) return null
  if (start >= size) return 'unsatisfiable'
  return { start, end: Math.min(end, size - 1) }
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
