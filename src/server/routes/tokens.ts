import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Hono } from 'hono'
import { z } from 'zod'

import { resolveProject } from '@/server/board/refs'
import { contentHash } from '@/server/edit/address'
import type { History } from '@/server/history/stack'
import {
  editTokenCss,
  hashOrNull,
  type TokenEdit,
  type TokenSides,
  tokenSides,
  writeTokenSheet,
} from '@/server/look/token-edit'
import { readTokenTable } from '@/server/look/token-table'
import { TOKEN_FILE } from '@/shared/board-files'
import { FrameboardError } from '@/shared/errors'
import type { TokenEditResult } from '@/shared/records/tokens'

import { type Access, requireWriter } from '../access/guard'
import { answerRefusal, parseBody } from './envelope'
import type { FrameLook } from './frames'

const common = {
  project: z.string().min(1).max(256),
  name: z.string().min(1).max(256),
  /** The project sheet's hash as the tab read it, null when it had none. */
  hash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable(),
}

// Bounds the body alone. The writer refuses a value that is not one declaration.
const editSchema = z.union([
  z.object({
    ...common,
    side: z.enum(['light', 'dark', 'both']),
    value: z.string().max(1000),
  }),
  z.object({ ...common, reset: z.literal(true) }),
])

/**
 * The Theme tab's token write, behind `requireWriter`. `POST
 * /api/tokens/edit` sets one token the project's sheets list on one theme or
 * both, or resets a token the project overrides back to the board's value,
 * writing the project's `tokens.css` alone and creating it when the project
 * has none. The board sheet and a `--tokens` sheet are never written. A
 * `hash` the project sheet no longer has, or a sheet created since the tab
 * read none, answers 409 `stale-tokens` with nothing written, which also
 * lands a retried edit once. A name the sheets do not list, a value that is
 * not one declaration, a reset with no board value, and a project sheet that
 * does not parse answer 409 `invalid-edit`. A landed edit records one step
 * and answers the token's values after it with the hash written.
 */
export function tokenRoutes(
  root: string,
  access: Access,
  history: History,
  look: FrameLook,
): Hono {
  const app = new Hono()

  app.post('/api/tokens/edit', requireWriter(access), async (c) => {
    const body = await parseBody(c.req.raw, editSchema)
    const project = await resolveProject(root, body.project)
    const sheets = look.sheets(project.name)
    const path = join(project.path, TOKEN_FILE)
    if (
      !readTokenTable(root, sheets).tokens.some((row) => row.name === body.name)
    ) {
      throw new FrameboardError(
        'invalid-edit',
        `${project.name}'s token sheets set no ${body.name}.`,
        { name: body.name },
      )
    }

    const css = readProjectSheet(path, body.hash, project.name)
    const edit: TokenEdit =
      'reset' in body
        ? { name: body.name, reset: true }
        : { name: body.name, side: body.side, value: body.value }
    const written = editTokenCss(css, boardSides(sheets.board, body.name), edit)
    const outcome = writeTokenSheet(path, body.hash, written)
    if (outcome === 'stale') stale(project.name)

    const journal = history.journal()
    if (outcome === 'created') await journal.created(path)
    else {
      journal.token(
        path,
        body.name,
        tokenSides(css, body.name),
        tokenSides(written, body.name),
      )
    }
    history.record({
      id: journal.id,
      changes: journal.changes,
      page: null,
      frames: [],
    })

    const row = readTokenTable(root, look.sheets(project.name)).tokens.find(
      (token) => token.name === body.name,
    )
    const result: TokenEditResult = {
      project: project.name,
      name: body.name,
      light: row?.light ?? null,
      dark: row?.dark ?? null,
      hash: contentHash(written),
      created: outcome === 'created',
    }
    return c.json({ ok: true, data: result })
  })

  app.onError(answerRefusal)

  return app
}

/** The project sheet's text as `hash` names it, empty for a null hash, refusing a sheet that moved since. */
function readProjectSheet(
  path: string,
  hash: string | null,
  project: string,
): string {
  const now = hashOrNull(path)
  if (now !== hash) stale(project)
  if (now === null) return ''
  const bytes = readFileSync(path)
  const text = bytes.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(bytes)) {
    throw new FrameboardError(
      'invalid-edit',
      'The project token sheet is not UTF-8, so it was left as it is.',
    )
  }
  return text
}

/** The token's declarations in the board sheet, none when it has no sheet or one that does not parse. */
function boardSides(board: string | null, name: string): TokenSides {
  if (!board) return {}
  try {
    return tokenSides(readFileSync(board, 'utf8'), name)
  } catch (error) {
    if (error instanceof FrameboardError) return {}
    throw error
  }
}

function stale(project: string): never {
  throw new FrameboardError(
    'stale-tokens',
    `${project}'s token sheet changed since the Theme tab read it, so nothing was written.`,
    { project },
  )
}
