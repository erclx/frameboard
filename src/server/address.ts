import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { type AddressFile, addressFileSchema } from '@/shared/records/address'
import { version } from '@/shared/version'

import { isAlive, isCode, readRecord, writeRecord } from './board/json-record'

/** Generated files beside the board, ignored by git through their own `.gitignore`. */
export const RUN_FOLDER = '.run'
export const ADDRESS_FILE = 'address.json'

/** How long a live server has to answer the health check. */
const HEALTH_TIMEOUT_MS = 500

export function addressPath(root: string): string {
  return join(root, RUN_FOLDER, ADDRESS_FILE)
}

/** The address record for a server just bound, with a fresh token. */
export function newAddress({
  root,
  host,
  port,
  pid = process.pid,
  now = new Date(),
}: {
  root: string
  host: string
  port: number
  pid?: number
  now?: Date
}): AddressFile {
  return {
    version: 1,
    url: `http://${host}:${port}`,
    host,
    port,
    pid,
    token: randomBytes(32).toString('hex'),
    root,
    startedAt: now.toISOString(),
    frameboard: version,
  }
}

/** Makes `.run/` with the `.gitignore` that keeps everything in it out of git, returning its path. */
export async function ensureRunFolder(root: string): Promise<string> {
  const folder = join(root, RUN_FOLDER)
  await mkdir(folder, { recursive: true })
  await writeFile(join(folder, '.gitignore'), '*\n')
  return folder
}

/** Writes the address file mode 0600, since it holds the token. */
export async function writeAddress(
  root: string,
  address: AddressFile,
): Promise<void> {
  await ensureRunFolder(root)
  await writeRecord(addressPath(root), address, { mode: 0o600 })
}

/** The address file, or null when it is missing or does not read. */
export async function readAddress(root: string): Promise<AddressFile | null> {
  try {
    return await readRecord(addressPath(root), {
      schema: addressFileSchema,
      invalidCode: 'internal',
    })
  } catch {
    return null
  }
}

/** Removes the address file only while it still holds `token`, so a newer server's survives. */
export async function removeAddress(
  root: string,
  token: string,
): Promise<void> {
  try {
    const text = await readFile(addressPath(root), 'utf8')
    if ((JSON.parse(text) as { token?: unknown }).token !== token) return
    await rm(addressPath(root), { force: true })
  } catch (error) {
    if (isCode(error, 'ENOENT') || error instanceof SyntaxError) return
    throw error
  }
}

/**
 * The server recorded for this board when it is live: its pid answers and its
 * health check answers within 500 ms with the same root. Anything else is
 * stale, and a new `serve` replaces it.
 */
export async function findLiveServer(
  root: string,
): Promise<AddressFile | null> {
  const address = await readAddress(root)
  if (!address || !isAlive(address.pid)) return null
  try {
    const response = await fetch(`${address.url}/api/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    })
    const health = (await response.json()) as { root?: unknown }
    return response.ok && health.root === root ? address : null
  } catch {
    return null
  }
}
