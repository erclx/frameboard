import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'

/** A process's parent and a start that names it apart from a reused pid. */
export interface ProcessRow {
  ppid: number
  started: string
}

/**
 * Every process by pid, its Linux start counted from boot, since a clock step
 * moves `ps` lstart and the kill would spare a live process as a reused pid.
 */
export function processTable(
  platform: NodeJS.Platform,
): Map<number, ProcessRow> {
  return platform === 'linux' ? fromProc() : fromPs()
}

/** The fields of one `/proc/<pid>/stat` line from the state on, past the command name, which can hold spaces and parentheses. */
export function statFields(line: string): string[] | undefined {
  const close = line.lastIndexOf(')')
  return close === -1 ? undefined : line.slice(close + 2).split(' ')
}

/** One `/proc/<pid>/stat` line. */
export function parseStat(
  line: string,
): { pid: number; ppid: number; started: string } | undefined {
  const fields = statFields(line)
  if (!fields) return undefined
  const pid = Number.parseInt(line, 10)
  // After the name come state, ppid, and on, so starttime, field 22, is 19th.
  const ppid = Number(fields[1])
  const started = fields[19]
  if (!Number.isInteger(pid) || !Number.isInteger(ppid) || !started) {
    return undefined
  }
  return { pid, ppid, started }
}

/** Every `/proc/<pid>/stat` line, none off Linux. */
export function statLines(): string[] {
  let entries: string[]
  try {
    entries = readdirSync('/proc')
  } catch {
    return []
  }
  return entries.flatMap((entry) => {
    if (!/^\d+$/.test(entry)) return []
    try {
      return [readFileSync(`/proc/${entry}/stat`, 'utf8')]
    } catch {
      // Exited between the listing and the read.
      return []
    }
  })
}

function fromProc(): Map<number, ProcessRow> {
  const table = new Map<number, ProcessRow>()
  for (const line of statLines()) {
    const row = parseStat(line)
    if (row) table.set(row.pid, { ppid: row.ppid, started: row.started })
  }
  return table
}

// `ps -eo pid=,ppid=,lstart=` reads alike on macOS and Linux.
function fromPs(): Map<number, ProcessRow> {
  const table = new Map<number, ProcessRow>()
  let out: string
  try {
    out = execFileSync('ps', ['-eo', 'pid=,ppid=,lstart='], {
      encoding: 'utf8',
    })
  } catch {
    return table
  }
  for (const line of out.split('\n')) {
    const [, pid, ppid, started] =
      /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line) ?? []
    if (pid && ppid && started) {
      table.set(Number(pid), { ppid: Number(ppid), started })
    }
  }
  return table
}
