import { setTimeout as sleep } from 'node:timers/promises'

import { parseStat, statFields, statLines } from '../lib/process-table'

// The kernel reports CPU time in ticks of 1/100 s on every Linux runner.
const MS_PER_TICK = 10
const POLL_MS = 250

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
  /** Milliseconds since the process was spawned. */
  atMs: number
  cpuMs: number
}

export interface QuietRule {
  windowMs: number
  /** The most CPU time a window may hold and still count as quiet. */
  busyMs: number
}

/** The reading a whole quiet window up to the last one follows, if one does. */
export function quietSince(
  readings: readonly Reading[],
  { windowMs, busyMs }: QuietRule,
): Reading | undefined {
  const last = readings.at(-1)
  if (!last) return undefined
  const start = readings.findLast(({ atMs }) => last.atMs - atMs >= windowMs)
  return start && last.cpuMs - start.cpuMs <= busyMs ? start : undefined
}

/** Reads a process's tree until it goes quiet, undefined when the limit comes first. */
export async function waitForQuiet(
  pid: number,
  {
    spawnedAt,
    limitMs,
    ...rule
  }: QuietRule & {
    /** The `performance.now()` a reading's time counts from. */
    spawnedAt: number
    limitMs: number
  },
): Promise<Reading | undefined> {
  const readings: Reading[] = []
  const deadline = performance.now() + limitMs
  while (performance.now() < deadline) {
    const { cpuMs } = readTree(pid)
    readings.push({ atMs: performance.now() - spawnedAt, cpuMs })
    const quiet = quietSince(readings, rule)
    if (quiet) return quiet
    await sleep(POLL_MS)
  }
  return undefined
}
