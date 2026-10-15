import { randomBytes } from 'node:crypto'
import { open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'

import type { z } from 'zod'

import { type ErrorCode, FrameboardError } from '@/shared/errors'

export interface RecordSpec<T> {
  schema: z.ZodType<T>
  /** The code a file that does not parse or fails the schema throws. */
  invalidCode: ErrorCode
  /** What a missing file reads as. A spec without one throws on a missing file. */
  empty?: () => T
}

export interface LockOptions {
  /** How long to wait on a live holder before `lock-timeout`. */
  timeoutMs?: number
}

const LOCK_TIMEOUT_MS = 2000
const LOCK_STALE_MS = 10_000
const LOCK_POLL_MS = 25

export const LOCK_SUFFIX = '.lock'
export const TEMP_SUFFIX = '.tmp'

/**
 * Reads and validates one record. The value returned is the parsed JSON itself
 * rather than the schema's output, so key order and unknown keys survive a
 * write back. Every schema here reads through `looseObject` with no defaults,
 * so the two hold the same data.
 */
export async function readRecord<T>(
  path: string,
  spec: RecordSpec<T>,
): Promise<T> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (isCode(error, 'ENOENT') && spec.empty) return spec.empty()
    throw error
  }

  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw invalid(spec, path, `does not parse: ${messageOf(error)}`, error)
  }
  const result = spec.schema.safeParse(raw)
  if (!result.success) {
    throw invalid(spec, path, `fails its schema: ${result.error.message}`)
  }
  return raw as T
}

/** Writes through a temp file and a rename, so a reader never sees half a file. */
export async function writeRecord(
  path: string,
  value: unknown,
  { mode }: { mode?: number } = {},
): Promise<void> {
  const temp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}${TEMP_SUFFIX}`
  try {
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode })
    await rename(temp, path)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

/** Reads, changes, and writes one record under its lock. */
export async function updateRecord<T>(
  path: string,
  spec: RecordSpec<T>,
  change: (current: T) => T,
  options?: LockOptions,
): Promise<T> {
  return withLocks(
    [path],
    async () => {
      const next = change(await readRecord(path, spec))
      await writeRecord(path, next)
      return next
    },
    options,
  )
}

/**
 * Holds the lock beside every record named for the length of `run`. Locks
 * are taken in path order, so two callers locking the same pair never wait
 * on each other.
 */
export async function withLocks<T>(
  paths: string[],
  run: () => Promise<T>,
  options: LockOptions = {},
): Promise<T> {
  const ordered = [...new Set(paths)].sort()
  const held: string[] = []
  try {
    for (const path of ordered) {
      await acquire(
        `${path}${LOCK_SUFFIX}`,
        options.timeoutMs ?? LOCK_TIMEOUT_MS,
      )
      held.push(`${path}${LOCK_SUFFIX}`)
    }
    return await run()
  } finally {
    await Promise.all(held.map((lock) => rm(lock, { force: true })))
  }
}

async function acquire(lock: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const handle = await open(lock, 'wx')
      await handle.writeFile(JSON.stringify({ pid: process.pid }))
      await handle.close()
      return
    } catch (error) {
      if (!isCode(error, 'EEXIST')) throw error
    }

    if (await isStale(lock)) {
      await rm(lock, { force: true })
      continue
    }
    if (Date.now() >= deadline) {
      throw new FrameboardError(
        'lock-timeout',
        `Another writer held ${lock} for more than ${timeoutMs} ms.`,
        { path: lock },
      )
    }
    await sleep(LOCK_POLL_MS)
  }
}

/** A lock whose pid is dead or that is older than 10 s is broken and taken. */
async function isStale(lock: string): Promise<boolean> {
  let text: string
  let modifiedAt: number
  try {
    ;[text, { mtimeMs: modifiedAt }] = await Promise.all([
      readFile(lock, 'utf8'),
      stat(lock),
    ])
  } catch (error) {
    // Gone since the open failed, so the next attempt takes it.
    if (isCode(error, 'ENOENT')) return false
    throw error
  }
  if (Date.now() - modifiedAt > LOCK_STALE_MS) return true
  // An empty lock is one created but not yet written, so it is live until it ages out.
  const pid = Number(/"pid":(\d+)/.exec(text)?.[1])
  return Number.isInteger(pid) && !isAlive(pid)
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means the pid exists under another user.
    return isCode(error, 'EPERM')
  }
}

function invalid(
  spec: RecordSpec<unknown>,
  path: string,
  reason: string,
  cause?: unknown,
): FrameboardError {
  return new FrameboardError(
    spec.invalidCode,
    `${path} ${reason}`,
    { path },
    { cause },
  )
}

export function isCode(error: unknown, code: string): boolean {
  return (
    error instanceof Error && (error as NodeJS.ErrnoException).code === code
  )
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
