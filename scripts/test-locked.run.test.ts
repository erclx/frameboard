import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { lockPath, release, slotPath, tryAcquire } from './lib/machine-lock.ts'

const WRAPPER = join(import.meta.dirname, 'test-locked.ts')
// Resolved once, so a case can hand the wrapper a PATH that finds nothing.
const BUN = execFileSync('which', ['bun'], { encoding: 'utf8' }).trim()

interface Run {
  code: number | null
  stderr: string
}

let home: string
let lock: string

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'test-locked-run-'))
  // HOME and XDG_CACHE_HOME both move, so the lock sits in `home` on macOS
  // and Linux alike and never queues behind the machine's real runs.
  lock = lockPath(process.platform, { XDG_CACHE_HOME: home }, home)
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

function wrap(settings: Record<string, string>, command: string[]): Run {
  const run = spawnSync(BUN, [WRAPPER, ...command], {
    encoding: 'utf8',
    env: wrapperEnv(settings),
  })
  return { code: run.status, stderr: run.stderr }
}

function wrapAsync(
  settings: Record<string, string>,
  command: string[],
): Promise<Run> {
  const child = spawn(BUN, [WRAPPER, ...command], {
    env: wrapperEnv(settings),
  })
  let stderr = ''
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString()
  })
  return new Promise((resolve) => {
    child.on('exit', (code) => resolve({ code, stderr }))
  })
}

function wrapperEnv(settings: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    HOME: home,
    XDG_CACHE_HOME: home,
    FRAMEBOARD_TEST_SLOTS: '',
    FRAMEBOARD_TEST_LIMIT: '',
    ...settings,
  }
}

/** A sleep no other process on the machine runs, so a search finds only it. */
function marker(): string {
  return `${40000 + Math.floor(Math.random() * 9999)}.${process.pid}`
}

function running(pattern: string): boolean {
  return spawnSync('pgrep', ['-f', pattern]).status === 0
}

// Each case waits out a limit plus up to the wrapper's 3 s grace before KILL.
describe('the time limit', { timeout: 20_000 }, () => {
  it('should kill a command past the limit, free its slot, report, and exit 124', () => {
    const stub = marker()

    const run = wrap({ FRAMEBOARD_TEST_LIMIT: '2' }, [
      'bash',
      '-c',
      `sleep ${stub} & wait`,
    ])

    expect(run.code).toBe(124)
    expect(run.stderr).toContain('after the 2 s limit')
    expect(existsSync(lock)).toBe(false)
    expect(running(`sleep ${stub}`)).toBe(false)
  })

  it('should KILL a command that ignores TERM', () => {
    const stub = marker()

    const run = wrap({ FRAMEBOARD_TEST_LIMIT: '1' }, [
      'bash',
      '-c',
      `trap '' TERM; sleep ${stub} & wait`,
    ])

    expect(run.code).toBe(124)
    expect(running(`sleep ${stub}`)).toBe(false)
  })

  it('should kill a process whose parent exited before the limit', () => {
    const orphan = marker()

    // The intermediate lives 6 s, so a poll a few seconds late still sees it.
    const run = wrap({ FRAMEBOARD_TEST_LIMIT: '8' }, [
      'bash',
      '-c',
      `(sleep ${orphan} & sleep 6) & exec sleep ${marker()}`,
    ])

    expect(run.code).toBe(124)
    expect(running(`sleep ${orphan}`)).toBe(false)
  })

  it('should kill the command itself when ps cannot run', () => {
    const stub = marker()

    const run = wrap({ FRAMEBOARD_TEST_LIMIT: '1', PATH: home }, [
      '/bin/sleep',
      stub,
    ])

    expect(run.code).toBe(124)
    expect(running(`sleep ${stub}`)).toBe(false)
  })

  it("should exit with the command's own code when a limit of 0 turns it off", () => {
    const run = wrap({ FRAMEBOARD_TEST_LIMIT: '0' }, [
      'bash',
      '-c',
      'sleep 1.5; exit 3',
    ])

    expect(run.code).toBe(3)
    expect(run.stderr).toBe('')
  })

  it('should start the clock when the command starts, not while queued', async () => {
    const other = {
      pid: process.pid,
      cwd: '/repo/other',
      command: 'vitest run',
      startedAt: '2026-11-14T10:00:00.000Z',
    }
    tryAcquire(lock, other)
    // Counting the 4 s queue trips the 3 s limit, and the 0.5 s command
    // leaves room for a stall when the clock starts where it should.
    setTimeout(() => release(lock, process.pid), 4000)

    const run = await wrapAsync(
      { FRAMEBOARD_TEST_SLOTS: '1', FRAMEBOARD_TEST_LIMIT: '3' },
      ['bash', '-c', 'sleep 0.5; exit 3'],
    )

    expect(run.stderr).toContain('waiting on pid')
    expect(run.code).toBe(3)
  })
})

describe('settings', () => {
  it('should run in slot two while slot one is held', () => {
    tryAcquire(lock, {
      pid: process.pid,
      cwd: '/repo/other',
      command: 'vitest run',
      startedAt: '2026-11-14T10:00:00.000Z',
    })

    const run = wrap({}, ['bash', '-c', `test -f '${slotPath(lock, 2)}'`])

    expect(run.code).toBe(0)
    expect(existsSync(slotPath(lock, 2))).toBe(false)
  })

  it.each([
    ['FRAMEBOARD_TEST_LIMIT', '-1'],
    ['FRAMEBOARD_TEST_LIMIT', 'soon'],
    ['FRAMEBOARD_TEST_SLOTS', '0'],
    ['FRAMEBOARD_TEST_SLOTS', '1.5'],
    ['FRAMEBOARD_TEST_SLOTS', 'two'],
  ])('should exit 2 before touching a lock when %s is %s', (name, value) => {
    const run = wrap({ [name]: value }, ['true'])

    expect(run.code).toBe(2)
    expect(run.stderr).toContain(name)
    expect(existsSync(join(lock, '..'))).toBe(false)
  })
})
