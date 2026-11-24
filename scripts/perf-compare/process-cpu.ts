import { setTimeout as sleep } from 'node:timers/promises'

import { parseStat, statFields, statLines } from '../lib/process-table'

// The kernel reports CPU time in ticks of 1/100 s on every Linux runner.
const MS_PER_TICK = 10
const POLL_MS = 100

export interface ProcessTree {
  pids: number[]
  /** CPU time of the tree, the children it has reaped included. */
  cpuMs: number
}

/** A process and everything below it, from `/proc/<pid>/stat` lines. */
export function treeOf(pid: number, lines: readonly string[]): ProcessTree {
  const rows = lines.flatMap((line) => {
    const row = parseStat(line)
    // Fields 14 to 17 are the user and system ticks of its own and its reaped.
    const ticks = statFields(line)?.slice(11, 15).map(Number) ?? []
    return row ? [{ ...row, ticks: ticks.reduce((sum, n) => sum + n, 0) }] : []
  })
  const pids: number[] = []
  let cpuMs = 0
  let level = rows.filter((row) => row.pid === pid)
  while (level.length > 0) {
    pids.push(...level.map((row) => row.pid))
    cpuMs += level.reduce((sum, row) => sum + row.ticks * MS_PER_TICK, 0)
    const parents = new Set(level.map((row) => row.pid))
    level = rows.filter((row) => parents.has(row.ppid))
  }
  return { pids, cpuMs }
}

export function readTree(pid: number): ProcessTree {
  return treeOf(pid, statLines())
}

export interface Reading {
  /** Milliseconds since the first reading. */
  atMs: number
  cpuMs: number
}

export interface QuietRule {
  windowMs: number
  /** The most CPU time a window may hold and still count as quiet. */
  busyMs: number
  /** The share of one core past which a step between two readings is work. */
  busyShare: number
}

/**
 * When a whole quiet window up to the last reading began, past any work it
 * still holds, with the CPU time through it. Undefined with no such window.
 */
export function settledFrom(
  readings: readonly Reading[],
  { windowMs, busyMs, busyShare }: QuietRule,
): Reading | undefined {
  const last = readings.at(-1)
  if (!last) return undefined
  const from = readings.findLastIndex(
    ({ atMs }) => last.atMs - atMs >= windowMs,
  )
  const start = readings[from]
  if (!start || last.cpuMs - start.cpuMs > busyMs) return undefined
  const busy = readings.slice(from + 1).findLast((reading, index) => {
    const before = readings[from + index] ?? start
    const elapsed = reading.atMs - before.atMs
    return reading.cpuMs - before.cpuMs > busyShare * elapsed
  })
  return { atMs: (busy ?? start).atMs, cpuMs: last.cpuMs }
}

/** When the process went quiet or the limit came, and the CPU time of everything read. */
export interface Settled extends Reading {
  quiet: boolean
}

/** Reads a process's tree until it goes quiet or the limit comes, throwing once it exits. */
export async function waitForQuiet(
  pid: number,
  { limitMs, ...rule }: QuietRule & { limitMs: number },
): Promise<Settled> {
  const readings: Reading[] = []
  const startedAt = performance.now()
  for (;;) {
    const { pids, cpuMs } = readTree(pid)
    if (pids.length === 0) throw new Error(`process ${pid} exited`)
    const reading = { atMs: performance.now() - startedAt, cpuMs }
    readings.push(reading)
    const settled = settledFrom(readings, rule)
    if (settled) return { ...settled, quiet: true }
    if (reading.atMs >= limitMs) return { ...reading, quiet: false }
    await sleep(POLL_MS)
  }
}
