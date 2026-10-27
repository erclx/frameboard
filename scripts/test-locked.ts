// Runs one heavy test command under the machine-wide test lock, so a second
// worktree's Vitest or Playwright run queues rather than starving the first.
// Usage: bun scripts/test-locked.ts <command> [args...]. Exits with the
// command's code, and releases the lock however the command ends.
import { spawn } from 'node:child_process'
import { constants, homedir } from 'node:os'

import {
  type Holder,
  lockPath,
  release,
  tryAcquire,
} from './lib/machine-lock.ts'

const POLL_MS = 1000

const [command, ...args] = process.argv.slice(2)
if (!command) {
  console.error('Usage: bun scripts/test-locked.ts <command> [args...]')
  process.exit(2)
}

const path = lockPath(process.platform, process.env, homedir())
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

let waited = false
let attempt = tryAcquire(path, me)
while (!attempt.acquired) {
  if (!waited) {
    const by = attempt.holder
      ? `pid ${attempt.holder.pid} in ${attempt.holder.cwd} running '${attempt.holder.command}'`
      : 'a run taking over a stale lock'
    say(`waiting on ${by}. Lock: ${path}`)
    waited = true
  }
  await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  attempt = tryAcquire(path, me)
}
if (waited) say('acquired the test lock')

const child = spawn(command, args, { stdio: 'inherit' })
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => child.kill(signal))
}

child.on('error', (error) => {
  release(path, process.pid)
  console.error(`test-locked: could not start ${command}: ${error.message}`)
  process.exit(127)
})

child.on('exit', (code, signal) => {
  release(path, process.pid)
  process.exit(code ?? 128 + (signal ? constants.signals[signal] : 0))
})
