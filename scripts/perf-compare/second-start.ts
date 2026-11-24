import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import { readTree, waitForQuiet } from './process-cpu'
import type { StartValues } from './report'

// Five seconds at under 5% of one core, wider than any gap between two checks,
// and timed past any step at 30%, three times one 10 ms tick a poll.
const QUIET = { windowMs: 5000, busyMs: 250, busyShare: 0.3 }
const SETTLE_LIMIT_MS = 120_000
const ADDRESS_LIMIT_MS = 120_000
const BOARD_LIMIT_MS = 120_000
const STOP_LIMIT_MS = 10_000

export interface SideServer {
  url: string
  start: StartValues
  /** Waits out the work the last write started, so nothing it left loads the other side. */
  settle: () => Promise<void>
  stop: () => Promise<void>
}

/**
 * Starts a side's built CLI on a board and follows the start until its checks
 * go quiet or the limit comes, with one board tab's socket open as a person's
 * would be.
 */
export async function startSide(
  sideDir: string,
  root: string,
  limitMs: number,
): Promise<SideServer> {
  const spawnedAt = performance.now()
  const since = () => performance.now() - spawnedAt
  const child = spawn(
    'node',
    [
      join(sideDir, 'dist/cli.js'),
      'serve',
      '--root',
      root,
      '--port',
      '0',
      '--no-open',
      '--json',
    ],
    { cwd: sideDir, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const { pid } = child
  if (pid === undefined) throw new Error(`no server started in ${sideDir}`)
  const stop = () => stopTree(child, pid)
  const quiet = (within: number) =>
    waitForQuiet(pid, { ...QUIET, limitMs: within })
  const connect = async () => {
    const url = await printedUrl(child)
    const addressMs = since()
    const socket = new WebSocket(`${url.replace(/^http/, 'ws')}/api/live`)
    const boardMs = (await boardMessage(socket)) ? since() : null
    return { url, addressMs, boardMs, socket }
  }
  try {
    const [{ url, addressMs, boardMs, socket }, settled] = await Promise.all([
      connect(),
      quiet(limitMs),
    ])
    socket.close()
    return {
      url,
      start: {
        addressMs,
        boardMs,
        // No start is over before its tab has the board.
        quietMs: settled.quiet
          ? Math.max(settled.atMs, boardMs ?? addressMs)
          : null,
        cpuMs: settled.cpuMs,
      },
      settle: async () => {
        await quiet(SETTLE_LIMIT_MS)
      },
      stop,
    }
  } catch (error) {
    await stop()
    throw error
  }
}

/** The address in the JSON document `serve --json` prints. */
async function printedUrl(child: ChildProcess): Promise<string> {
  let stdout = ''
  let stderr = ''
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`serve printed no address\n${stderr}`)),
      ADDRESS_LIMIT_MS,
    )
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
      const url = urlIn(stdout)
      if (url === undefined) return
      clearTimeout(timer)
      resolve(url)
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`serve exited ${code}\n${stderr}`))
    })
  })
}

function urlIn(text: string): string | undefined {
  try {
    const { data } = JSON.parse(text) as { data?: { url?: string } }
    return data?.url
  } catch {
    // The document has not finished printing.
    return undefined
  }
}

/** Whether the socket is sent a board in time, false on a socket that fails. */
async function boardMessage(socket: WebSocket): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), BOARD_LIMIT_MS)
    const settle = (heard: boolean) => {
      clearTimeout(timer)
      resolve(heard)
    }
    socket.addEventListener('open', () =>
      socket.send(
        JSON.stringify({ type: 'hello', role: 'board', tab: 'perf-compare' }),
      ),
    )
    socket.addEventListener('message', ({ data }) => {
      if (String(data).startsWith('{"type":"board"')) settle(true)
    })
    socket.addEventListener('error', () => settle(false))
    socket.addEventListener('close', () => settle(false))
  })
}

/** Stops a server and whatever outlives it, so nothing loads the next side. */
async function stopTree(child: ChildProcess, pid: number): Promise<void> {
  const { pids } = readTree(pid)
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit')
    child.kill('SIGTERM')
    await Promise.race([
      exited,
      sleep(STOP_LIMIT_MS, undefined, { ref: false }),
    ])
  }
  for (const each of pids) {
    try {
      process.kill(each, 'SIGKILL')
    } catch {
      // Already gone.
    }
  }
}
