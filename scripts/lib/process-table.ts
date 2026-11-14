import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'

/** A process's parent and a start that names it apart from a reused pid. */
export interface ProcessRow {
  ppid: number
  started: string
}

/**
 * Every process on the machine, by pid. Empty when the table cannot be read.
 *
 * On Linux the start is the kernel's count of clock ticks since boot, which a
 * wall clock step never moves. `ps` derives `lstart` from the boot time, which
 * it computes from the wall clock, so a step makes one live process read two
 * starts and the kill spares it as a reused pid.
 */
export function processTable(
  platform: NodeJS.Platform,
): Map<number, ProcessRow> {
  return platform === 'linux' ? fromProc() : fromPs()
}

/** One `/proc/<pid>/stat` line, read past the command name, which can hold spaces and parentheses. */
export function parseStat(
  line: string,
): { pid: number; ppid: number; started: string } | undefined {
  const close = line.lastIndexOf(')')
  if (close === -1) return undefined
  const pid = Number.parseInt(line, 10)
  // After the name come state, ppid, and on, so starttime, field 22, is 19th.
  const fields = line.slice(close + 2).split(' ')
  const ppid = Number(fields[1])
  const started = fields[19]
  if (!Number.isInteger(pid) || !Number.isInteger(ppid) || !started) {
    return undefined
  }
  return { pid, ppid, started }
}

function fromProc(): Map<number, ProcessRow> {
  const table = new Map<number, ProcessRow>()
  let entries: string[]
  try {
    entries = readdirSync('/proc')
  } catch {
    return table
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue
    let line: string
    try {
      line = readFileSync(`/proc/${entry}/stat`, 'utf8')
    } catch {
      // Exited between the listing and the read.
      continue
    }
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
