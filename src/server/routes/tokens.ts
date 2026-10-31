import { readFileSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'

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
  /** The sheet the edit writes, the project's own when absent. */
  sheet: z.enum(['project', 'board']).default('project'),
  /** That sheet's hash as the tab read it, null when it had none. */
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

/** The sheet an edit writes and the token's declarations under it, which a one-theme edit renders over. */
interface Target {
  path: string
  under: TokenSides
}

/**
 * The Theme tab's token write, behind `requireWriter`. `POST
 * /api/tokens/edit` sets one token the project's sheets list on one theme or
 * both in the sheet `sheet` names. `project`, the default, writes the
 * project's `tokens.css`, creating it when the project has none, and a reset
 * there takes the project's override back to the board's value. `board`
 * writes the board's sheet, which every project without an override follows,
 * for a token that sheet already sets. A `hash` the named sheet no longer
 * has, or a project sheet created since the tab read none, answers 409
 * `stale-tokens` with nothing written, which also lands a retried edit once.
 * A name the sheets do not list, a value that is not one declaration, a
 * reset with no board value, and a sheet that does not parse answer 409
 * `invalid-edit`, as does a board edit that is a reset, names a token the
 * board sheet does not set, or meets a `--tokens` sheet outside the board
 * folder, which belongs to whatever handed it over. A landed edit records
 * one step and answers the token's values after it with the hash written.
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
    if (
      !readTokenTable(root, sheets).tokens.some((row) => row.name === body.name)
    ) {
      throw new FrameboardError(
        'invalid-edit',
        `${project.name}'s token sheets set no ${body.name}.`,
        { name: body.name },
      )
    }

    const target: Target =
      body.sheet === 'board'
        ? boardTarget(root, sheets.board, 'reset' in body)
        : {
            path: join(project.path, TOKEN_FILE),
            under: boardSides(sheets.board, body.name),
          }
    const refuseStale = () => stale(project.name, body.sheet)
    const css = readSheet(target.path, body.hash, refuseStale)
    if (
      body.sheet === 'board' &&
      Object.keys(tokenSides(css, body.name)).length === 0
    ) {
      throw new FrameboardError(
        'invalid-edit',
        `The board token sheet sets no ${body.name}, so it has no board value to change.`,
        { name: body.name },
      )
    }
    const edit: TokenEdit =
      'reset' in body
        ? { name: body.name, reset: true }
        : { name: body.name, side: body.side, value: body.value }
    const written = editTokenCss(css, target.under, edit)
    const outcome = writeTokenSheet(target.path, body.hash, written)
    if (outcome === 'stale') refuseStale()

    const journal = history.journal()
    if (outcome === 'created') await journal.created(target.path)
    else {
      journal.token(
        target.path,
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
      sheet: body.sheet,
      created: outcome === 'created',
    }
    return c.json({ ok: true, data: result })
  })

  app.onError(answerRefusal)

  return app
}

/** The board sheet as an edit target, refusing a reset, a board with no sheet, and a sheet outside the board folder. */
function boardTarget(
  root: string,
  board: string | null,
  reset: boolean,
): Target {
  if (reset) {
    throw new FrameboardError(
      'invalid-edit',
      'A board token has no value under it to reset to.',
    )
  }
  if (!board) {
    throw new FrameboardError('invalid-edit', 'The board has no token sheet.')
  }
  const inside = relative(root, board)
  if (inside.startsWith('..') || isAbsolute(inside)) {
    throw new FrameboardError(
      'invalid-edit',
      `${board} sits outside the board folder, so it belongs to whatever handed it over and stays read-only here.`,
      { path: board },
    )
  }
  return { path: board, under: {} }
}

/** The sheet's text as `hash` names it, empty for a null hash, refusing a sheet that moved since. */
function readSheet(
  path: string,
  hash: string | null,
  refuseStale: () => never,
): string {
  const now = hashOrNull(path)
  if (now !== hash) refuseStale()
  if (now === null) return ''
  const bytes = readFileSync(path)
  const text = bytes.toString('utf8')
  if (!Buffer.from(text, 'utf8').equals(bytes)) {
    throw new FrameboardError(
      'invalid-edit',
      'The token sheet is not UTF-8, so it was left as it is.',
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

function stale(project: string, sheet: 'project' | 'board'): never {
  const owner = sheet === 'board' ? 'The board' : `${project}'s`
  throw new FrameboardError(
    'stale-tokens',
    `${owner} token sheet changed since the Theme tab read it, so nothing was written.`,
    { project, sheet },
  )
}
