import { createHash, randomBytes } from 'node:crypto'
import { link, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { z } from 'zod'

import { ensureRunFolder } from '../address'
import { isCode } from '../board/json-record'

export const KEY_FILE = 'board-key.json'

const keyFileSchema = z.object({
  version: z.literal(1),
  key: z.string().regex(/^[0-9a-f]{64}$/),
})

/**
 * The board's write key, kept in `.run/` at mode 0600 across restarts so a
 * tab's cookie outlives the server that set it. Deleting the file revokes
 * every cookie. A malformed file is replaced rather than failing the start.
 */
export async function loadBoardKey(root: string): Promise<string> {
  const folder = await ensureRunFolder(root)
  const path = join(folder, KEY_FILE)
  const existing = await readKey(path)
  if (existing) return existing

  // Written whole under a private name, then linked into place, so a racing
  // start never reads a half-written file and the first link wins.
  const draft = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  const key = randomBytes(32).toString('hex')
  await writeFile(draft, JSON.stringify({ version: 1, key }), {
    flag: 'wx',
    mode: 0o600,
  })
  try {
    try {
      await link(draft, path)
      return key
    } catch (error) {
      if (!isCode(error, 'EEXIST')) throw error
    }
    const winner = await readKey(path)
    if (winner) return winner
    // The file there does not read, so this start replaces it.
    await rename(draft, path)
    return key
  } finally {
    await rm(draft, { force: true })
  }
}

async function readKey(path: string): Promise<string | null> {
  try {
    const parsed = keyFileSchema.safeParse(
      JSON.parse(await readFile(path, 'utf8')),
    )
    return parsed.success ? parsed.data.key : null
  } catch (error) {
    if (isCode(error, 'ENOENT') || error instanceof SyntaxError) return null
    throw error
  }
}

/** The cookie a board's key rides in, named by its root so two boards on two ports never overwrite each other's. */
export function cookieName(root: string): string {
  return `frameboard-key-${createHash('sha256').update(root).digest('hex').slice(0, 12)}`
}
