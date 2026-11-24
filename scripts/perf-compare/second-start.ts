import { type ChildProcess, spawn } from 'node:child_process'
import { once } from 'node:events'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

import { readTree, waitForQuiet } from './process-cpu'
import type { StartValues } from './report'

// Five seconds at under 5% of one core, wider than any gap between two checks.
const QUIET = { windowMs: 5000, busyMs: 250 }
const QUIET_LIMIT_MS = 600_000
const ADDRESS_LIMIT_MS = 120_000
const BOARD_LIMIT_MS = 120_000
const STOP_LIMIT_MS = 10_000

export interface SideServer {
  url: string
  start: StartValues
  /** Waits out the work the last write started, so the next start finds none. */
  settle: () => Promise<void>
  stop: () => Promise<void>
}

/**
 * Starts a side's built CLI on a board and follows the start until its checks
 * go quiet, with one board tab's socket open as a person's would be.
 */
export async function startSide(
  sideDir: string,
  root: string,
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
  const quiet = () =>
    waitForQuiet(pid, { ...QUIET, spawnedAt, limitMs: QUIET_LIMIT_MS })
  try {
    const url = await printedUrl(child)
    const addressMs = since()
    const socket = new WebSocket(`${url.replace(/^http/, 'ws')}/api/live`)
    const boardMs = (await boardMessage(socket)) ? since() : null
    const settled = await quiet()
    socket.close()
    return {
      url,
      start: {
        addressMs,
        boardMs,
        quietMs: settled?.atMs ?? null,
        cpuMs: settled?.cpuMs ?? null,
      },
      settle: async () => {
        await quiet()
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
