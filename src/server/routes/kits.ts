import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, join, sep } from 'node:path'

import { Hono } from 'hono'
import { z } from 'zod'

import { contentHash } from '@/server/edit/address'
import type { History } from '@/server/history/stack'
import { installKit, takeOutLook } from '@/server/kits/install'
import {
  findKit,
  listKits,
  readKitFile,
  shippedKitsDir,
} from '@/server/kits/list'
import { saveKit } from '@/server/kits/save'
import { frameHead, injectHead, THEME_SCRIPT } from '@/server/look/inject'
import { FRAME_EXTENSION, TOKEN_FILE } from '@/shared/board-files'
import { FACES, faceSheetUrl } from '@/shared/faces'
import { KIT_PAGE, KIT_SHEET, KITS_URL } from '@/shared/kits'

import { type Access, requireWriter } from '../access/guard'
import { answerRefusal, parseBody } from './envelope'
import { decodeSegments } from './frames'

const name = z.string().min(1).max(256)

/**
 * The policy a kit's sample frame is served under for a preview card. A
 * saved kit's samples come from a project an agent drew, and the card runs
 * them on the board's origin as soon as New project opens, so the policy
 * lets the injected theme script alone run, by its hash, and blocks every
 * script and inline handler the sample carries. A sandbox would block the
 * theme script too, and draw every preview in light.
 */
const PREVIEW_POLICY = `script-src 'sha256-${createHash('sha256').update(THEME_SCRIPT).digest('base64')}'`

const installSchema = z.object({
  project: name,
  kit: name,
  /** Installs over a look already there, which an undo brings back. */
  replace: z.boolean().default(false),
})

const saveSchema = z.object({ project: name, name })

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

export interface KitRouteOptions {
  /** The `--tokens` sheet the server was given, which no install goes under. */
  tokens: string | null
  /** The folder the shipped kits are read from, the package's own when absent. */
  shipped?: string
}

/**
 * The kit routes. `GET /api/kits` answers every kit the board can install.
 * `POST /api/kits/install` installs one into a project and
 * `POST /api/kits/save` saves a project's look as a kit, each behind
 * `requireWriter`, recording one undo step, and answering the record the
 * `kit` verb prints. `GET /frameboard/kits/<name>/<path>` serves a kit's files read
 * only, a sample frame with the faces and the kit's own sheets spliced into
 * its head, so a preview card renders the kit before any project holds it.
 */
export function kitRoutes(
  root: string,
  access: Access,
  history: History,
  { tokens, shipped = shippedKitsDir() }: KitRouteOptions,
): Hono {
  const app = new Hono()

  /** Runs one write with a fresh journal and records it as a step that moves no page. */
  const recorded = async <T>(
    write: (journal: ReturnType<History['journal']>) => Promise<T>,
  ): Promise<T> => {
    const journal = history.journal()
    const result = await write(journal)
    history.record({
      id: journal.id,
      changes: journal.changes,
      page: null,
      frames: [],
    })
    return result
  }

  app.get('/api/kits', async (c) =>
    c.json({ ok: true, data: await listKits(root, shipped) }),
  )

  app.post('/api/kits/install', requireWriter(access), async (c) => {
    const body = await parseBody(c.req.raw, installSchema)
    const kit = findKit(root, body.kit, shipped)
    if (body.replace) {
      await readKitFile(kit)
      await recorded((journal) => takeOutLook(root, body.project, { journal }))
    }
    const installed = await recorded((journal) =>
      installKit(root, body.project, kit, {
        tokens,
        journal,
        replace: body.replace,
      }),
    )
    return c.json({ ok: true, data: installed })
  })

  app.post('/api/kits/save', requireWriter(access), async (c) => {
    const body = await parseBody(c.req.raw, saveSchema)
    const saved = await recorded((journal) =>
      saveKit(root, body.project, body.name, { tokens, journal }),
    )
    return c.json({ ok: true, data: saved })
  })

  app.get(`${KITS_URL}/*`, async (c) => {
    const raw = new URL(c.req.url).pathname.slice(KITS_URL.length + 1)
    const parts = decodeSegments(raw.split('/'))
    const [kitName, ...rest] = parts ?? []
    if (!kitName || rest.length === 0) return c.notFound()
    let kitPath: string
    try {
      kitPath = findKit(root, kitName, shipped).path
    } catch {
      return c.notFound()
    }
    const file = await resolveInside(kitPath, rest)
    const type = file && CONTENT_TYPES[extname(file).toLowerCase()]
    if (!file || !type) return c.notFound()

    const bytes = new Uint8Array(await readFile(file))
    const isSample =
      rest.length === 2 &&
      rest[0] === KIT_PAGE &&
      extname(file).toLowerCase() === FRAME_EXTENSION
    const body = isSample
      ? injectHead(
          bytes,
          frameHead(
            [
              ...FACES.map(faceSheetUrl),
              `${KITS_URL}/${encodeURIComponent(kitName)}/${TOKEN_FILE}`,
              `${KITS_URL}/${encodeURIComponent(kitName)}/${KIT_SHEET}`,
            ],
            contentHash(bytes),
          ),
        )
      : bytes
    return c.body(body, 200, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      ...(isSample ? { 'Content-Security-Policy': PREVIEW_POLICY } : {}),
    })
  })

  app.onError(answerRefusal)

  return app
}

/** The realpath of a file inside the kit folder, or null for a missing file or one that leaves it. */
async function resolveInside(
  kitPath: string,
  segments: string[],
): Promise<string | null> {
  try {
    const dir = await realpath(kitPath)
    const file = await realpath(join(dir, ...segments))
    if (!file.startsWith(dir + sep)) return null
    return (await stat(file)).isFile() ? file : null
  } catch {
    return null
  }
}
