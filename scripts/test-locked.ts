// Runs one heavy test command under the machine-wide test lock, so a third
// worktree's Vitest or Playwright run queues rather than starving the first two.
// Usage: bun scripts/test-locked.ts <command> [args...]. Exits with the
// command's code, and releases its slot however the command ends. A command
// still running at the time limit is killed with every process it started, and
// the wrapper exits 124.
//
// FRAMEBOARD_TEST_SLOTS: runs admitted at once across the machine, default 2.
// FRAMEBOARD_TEST_LIMIT: seconds a command may run, default 900, 0 for none,
// and off by default when CI is set, since a CI job carries its own timeout.
import { execFileSync, spawn } from 'node:child_process'
import { constants, homedir } from 'node:os'

import {
  type Holder,
  lockPath,
  release,
  tryAcquireSlot,
} from './lib/machine-lock.ts'

const POLL_MS = 1000
// How long a process has to exit on TERM before it is sent KILL.
const GRACE_MS = 3000
const DEFAULT_SLOTS = 2
const DEFAULT_LIMIT_S = 900
const USAGE = 'Usage: bun scripts/test-locked.ts <command> [args...]'

function usage(message: string): never {
  console.error(`test-locked: ${message}\n${USAGE}`)
  process.exit(2)
}

function readSetting(name: string, fallback: number, min: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value < min) {
    usage(`${name} must be a number of at least ${min}, not '${raw}'`)
  }
  return value
}

const [command, ...args] = process.argv.slice(2)
if (!command) usage('no command given')

const slotsSetting = readSetting('FRAMEBOARD_TEST_SLOTS', DEFAULT_SLOTS, 1)
if (!Number.isInteger(slotsSetting)) {
  usage(`FRAMEBOARD_TEST_SLOTS must be a whole number, not '${slotsSetting}'`)
}
const slots = slotsSetting
const limitMs =
  readSetting(
    'FRAMEBOARD_TEST_LIMIT',
    process.env.CI ? 0 : DEFAULT_LIMIT_S,
    0,
  ) * 1000

const first = lockPath(process.platform, process.env, homedir())
const me: Holder = {
  pid: process.pid,
  cwd: process.cwd(),
  command: [command, ...args].join(' '),
  startedAt: new Date().toISOString(),
}

function say(message: string): void {
  const time = new Date().toTimeString().slice(0, 8)
  console.error(`[test-lock ${time}] ${message}`)
}

function describe(holder: Holder | null): string {
  return holder
    ? `pid ${holder.pid} in ${holder.cwd} running '${holder.command}'`
    : 'a run taking over a stale slot'
}

let waited = false
let attempt = tryAcquireSlot(first, slots, me)
while (!attempt.acquired) {
  if (!waited) {
    const by = attempt.holders.map(describe).join(' and ')
    say(`waiting on ${by}. Lock: ${first}`)
    waited = true
  }
  await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  attempt = tryAcquireSlot(first, slots, me)
}
const slot = attempt.path
if (waited) say(`acquired the test lock at ${slot}`)

// The clock starts here, once the command runs, never while queued.
const child = spawn(command, args, { stdio: 'inherit' })
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => child.kill(signal))
}

let killing = false

child.on('error', (error) => {
  release(slot, process.pid)
  console.error(`test-locked: could not start ${command}: ${error.message}`)
  process.exit(127)
})

child.on('exit', (code, signal) => {
  // At the limit the kill below owns the exit, since the processes the
  // command started can outlive it.
  if (killing) return
  release(slot, process.pid)
  process.exit(code ?? 128 + (signal ? constants.signals[signal] : 0))
})

if (limitMs > 0) {
  // A process whose parent exits is handed to init, where a walk from this
  // wrapper no longer finds it, so every descendant seen while the command
  // runs is remembered with its start time, which tells it from a reused pid.
  const seen = new Map<number, string>()
  const watch = setInterval(() => {
    for (const [pid, started] of descendants()) seen.set(pid, started)
  }, POLL_MS)
  watch.unref()

  setTimeout(() => {
    killing = true
    clearInterval(watch)
    void killRun(seen)
  }, limitMs).unref()
}

async function killRun(seen: Map<number, string>): Promise<void> {
  const table = processes()
  for (const [pid, started] of descendants(table)) seen.set(pid, started)
  // Deepest first, so a parent is not left to restart a child it lost.
  const targets = [...seen.keys()]
    .filter((pid) => table.get(pid)?.started === seen.get(pid))
    .reverse()
  const seconds = limitMs / 1000
  say(
    `killing '${me.command}' after the ${seconds} s limit, with ${targets.length} process${targets.length === 1 ? '' : 'es'}. FRAMEBOARD_TEST_LIMIT sets it`,
  )
  signalAll(targets, 'SIGTERM')
  const deadline = Date.now() + GRACE_MS
  while (Date.now() < deadline && targets.some((pid) => stillRuns(pid, seen))) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  signalAll(
    targets.filter((pid) => stillRuns(pid, seen)),
    'SIGKILL',
  )
  release(slot, process.pid)
  process.exit(124)
}

interface Row {
  ppid: number
  started: string
}

// `ps -eo pid=,ppid=,lstart=` reads alike on macOS and Linux.
function processes(): Map<number, Row> {
  const table = new Map<number, Row>()
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

/** The command and its descendants, parents ahead of their children. */
function descendants(table = processes()): Map<number, string> {
  const children = new Map<number, number[]>()
  for (const [pid, row] of table) {
    children.set(row.ppid, [...(children.get(row.ppid) ?? []), pid])
  }
  // Walked from the command rather than this wrapper, whose own `ps` calls
  // would otherwise count among the targets.
  const found = new Map<number, string>()
  const order = child.pid === undefined ? [] : [child.pid]
  // A for-of over an array visits what the loop appends to it.
  for (const pid of order) {
    const row = table.get(pid)
    if (!row || found.has(pid)) continue
    found.set(pid, row.started)
    order.push(...(children.get(pid) ?? []))
  }
  return found
}

function stillRuns(pid: number, seen: Map<number, string>): boolean {
  return processes().get(pid)?.started === seen.get(pid)
}

function signalAll(pids: number[], signal: NodeJS.Signals): void {
  for (const pid of pids) {
    try {
      process.kill(pid, signal)
    } catch {
      // Gone already.
    }
  }
}
