import {
  closeSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

/** Who holds the lock, written into it so a waiter can name the run. */
export interface Holder {
  pid: number
  cwd: string
  command: string
  startedAt: string
}

export type Attempt =
  | { acquired: true }
  // `holder` is null when the file does not parse or a takeover is under way.
  | { acquired: false; holder: Holder | null }

/** The one lock every frameboard checkout on this machine shares. */
export function lockPath(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  home: string,
): string {
  const cache =
    platform === 'darwin'
      ? join(home, 'Library', 'Caches')
      : env.XDG_CACHE_HOME || join(home, '.cache')
  return join(cache, 'frameboard', 'test.lock')
}

/**
 * Takes the lock at `path` for `me`, or names who holds it. A holder whose
 * process has exited, or a file that does not parse, is taken over.
 */
export function tryAcquire(path: string, me: Holder): Attempt {
  mkdirSync(dirname(path), { recursive: true })
  if (create(path, me)) return { acquired: true }

  const seen = read(path)
  if (seen.holder && alive(seen.holder.pid)) {
    return { acquired: false, holder: seen.holder }
  }
  return takeOver(path, seen.raw, me)
    ? { acquired: true }
    : { acquired: false, holder: null }
}

/** Removes the lock only while its file still names `pid`. */
export function release(path: string, pid: number): void {
  if (read(path).holder?.pid === pid) unlinkSync(path)
}

// Two waiters can see one stale holder together. Unlinking on a second read
// alone lets the slower one delete the faster one's fresh file, so the
// unlink-and-create runs under a guard file only one waiter can make.
function takeOver(path: string, staleRaw: string | null, me: Holder): boolean {
  const guard = `${path}.takeover`
  if (!create(guard, me)) {
    const taker = read(guard).holder
    if (taker && alive(taker.pid)) return false
    // A taker that died mid-takeover strands the guard, which nothing else
    // would ever clear.
    unlinkQuietly(guard)
    if (!create(guard, me)) return false
  }
  try {
    if (read(path).raw !== staleRaw) return create(path, me)
    unlinkQuietly(path)
    return create(path, me)
  } finally {
    unlinkQuietly(guard)
  }
}

// Opening the lock itself with 'wx' leaves it empty until the write lands, and
// a waiter reading it then would take it for unparseable and take it over. The
// holder is written to a private file first and linked into place whole.
function create(path: string, holder: Holder): boolean {
  const draft = `${path}.${holder.pid}.draft`
  const fd = openSync(draft, 'w')
  try {
    writeSync(fd, JSON.stringify(holder))
  } finally {
    closeSync(fd)
  }
  try {
    linkSync(draft, path)
    return true
  } catch (error) {
    if (isCode(error, 'EEXIST')) return false
    throw error
  } finally {
    unlinkQuietly(draft)
  }
}

function read(path: string): { raw: string | null; holder: Holder | null } {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    if (isCode(error, 'ENOENT')) return { raw: null, holder: null }
    throw error
  }
  return { raw, holder: parse(raw) }
}

function parse(raw: string): Holder | null {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return null
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'pid' in value &&
    typeof value.pid === 'number' &&
    'cwd' in value &&
    typeof value.cwd === 'string' &&
    'command' in value &&
    typeof value.command === 'string' &&
    'startedAt' in value &&
    typeof value.startedAt === 'string'
  ) {
    return {
      pid: value.pid,
      cwd: value.cwd,
      command: value.command,
      startedAt: value.startedAt,
    }
  }
  return null
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means a process another user owns holds the pid, which is alive.
    return !isCode(error, 'ESRCH')
  }
}

function unlinkQuietly(path: string): void {
  try {
    unlinkSync(path)
  } catch (error) {
    if (!isCode(error, 'ENOENT')) throw error
  }
}

function isCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}
