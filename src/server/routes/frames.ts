import { type BigIntStats, createReadStream } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'
import { Readable } from 'node:stream'

import { Hono } from 'hono'

import { ASSETS_FOLDER, LAYOUT_FILE } from '@/server/board/scan'
import {
  frameKit,
  kitSheetFiles,
  type TokenSheetPaths,
} from '@/server/checks/tokens'
import { contentHash } from '@/server/edit/address'
import { fontSheet, holdsFonts, projectFonts } from '@/server/fonts/installed'
import { BRIDGE_URL, frameHead, injectHead } from '@/server/look/inject'
import { FRAME_EXTENSION, TOKEN_FILE } from '@/shared/board-files'
import { FACES, faceSheetUrl } from '@/shared/faces'
import { FONT_SHEET } from '@/shared/fonts'
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
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
}

/**
 * Serves the board's frames so relative links resolve unrewritten, its own
 * handler since it must refuse records, dot-named, and escaping paths, all as
 * 404 so nothing tells a caller what exists.
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
    if (parts?.length === 2 && parts[1] === FONT_SHEET) {
      const dir = await resolveProjectDir(root, parts[0])
      const fonts = dir === null ? [] : await projectFonts(dir)
      if (fonts.length === 0) return c.notFound()
      return c.body(fontSheet(fonts), 200, {
        'Content-Type': CONTENT_TYPES['.css'] ?? '',
        'Cache-Control': 'no-store',
      })
    }
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
        // An unread stream would hold its file handle when Hono drops the body.
        if (c.req.method === 'HEAD') return c.body(null, 206, headers)
        // Node types its web stream apart from Hono's, though they are one class.
        const stream = Readable.toWeb(
          createReadStream(file, range),
        ) as ReadableStream
        return c.body(stream, 206, headers)
      }
    }

    if (!isFrame && at === undefined) {
      // Never `max-age`, since an asset edit's reload has to see it.
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
    // Read per request, so a kit set or added since reaches the next load.
    const kit = isFrame
      ? frameKit({
          root,
          project,
          page,
          name: name.slice(0, -FRAME_EXTENSION.length),
        })
      : null
    const body = injectHead(
      bytes,
      frameHead(
        sheetUrls(
          project,
          await holdsFonts(join(root, project)),
          look.sheets(project),
          kitSheetFiles(root, project, kit),
        ).map((url) => `${base}${url}`),
        contentHash(bytes),
        `${base}${BRIDGE_URL}`,
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
 * The bytes a single range names, null for a header to ignore, which RFC 9110
 * allows for an unsupported range such as a multi-range.
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
    // Served whole, since a 206 cannot name zero bytes.
    if (size === 0) return null
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(first)
  const end = last === '' ? size - 1 : Number(last)
  if (last !== '' && end < start) return null
  if (start >= size) return 'unsatisfiable'
  return { start, end: Math.min(end, size - 1) }
}

/**
 * The sheets a frame imports, being every face, the project's installed fonts,
 * the board's tokens, the project's, then its kit sheets, which read the tokens
 * and still lose to the frame's own. `kitFiles` come as `kitSheetFiles` answers.
 */
function sheetUrls(
  project: string,
  fonts: boolean,
  sheets: TokenSheetPaths,
  kitFiles: string[],
): string[] {
  const folder = `/frames/${encodeURIComponent(project)}`
  return [
    ...FACES.map(faceSheetUrl),
    ...(fonts ? [`${folder}/${FONT_SHEET}`] : []),
    ...(sheets.board ? [BOARD_SHEET_URL] : []),
    ...(sheets.project ? [`${folder}/${TOKEN_FILE}`] : []),
    ...kitFiles.map(
      (file) =>
        `${folder}/${file.split('/').map(encodeURIComponent).join('/')}`,
    ),
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

/** The realpath of a project folder, or null for one missing or leaving the board. */
async function resolveProjectDir(
  root: string,
  project = '',
): Promise<string | null> {
  try {
    const dir = await realpath(join(root, project))
    return dir.startsWith(root + sep) ? dir : null
  } catch {
    return null
  }
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
    const projectDir = await resolveProjectDir(root, project)
    if (projectDir === null) return null
    const file = await realpath(join(projectDir, page, ...rest))
    if (!file.startsWith(projectDir + sep)) return null
    if (!servableInProject(relative(projectDir, file).split(sep))) return null
    return (await stat(file)).isFile() ? file : null
  } catch {
    return null
  }
}

/**
 * Whether the route may serve a file, read off its real path, so a symlink to
 * a record or a dot-named path is refused.
 */
function servableInProject(segments: string[]): boolean {
  if (segments.some((segment) => segment.startsWith('.'))) return false
  const [first = '', name = ''] = segments
  if (segments.length === 1) return first === TOKEN_FILE
  return first === ASSETS_FOLDER || !isRecord(name)
}

function isRecord(name: string): boolean {
  return name === LAYOUT_FILE || name === NOTES_FILE
}
