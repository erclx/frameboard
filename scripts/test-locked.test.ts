import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  type Holder,
  lockPath,
  release,
  tryAcquire,
} from './lib/machine-lock.ts'

function holder(pid: number, cwd = '/repo/a'): Holder {
  return {
    pid,
    cwd,
    command: 'vitest run',
    startedAt: '2026-10-27T10:00:00.000Z',
  }
}

/** A pid that named a process which has since exited. */
function deadPid(): number {
  const run = spawnSync('true')
  return run.pid
}

let dir: string
let path: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'machine-lock-'))
  path = join(dir, 'frameboard', 'test.lock')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('tryAcquire', () => {
  it('should take a free lock, creating its folder, and write the holder', () => {
    const me = holder(process.pid)

    const result = tryAcquire(path, me)

    expect(result).toEqual({ acquired: true })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(me)
  })

  it('should refuse a lock a live process holds, naming the holder', () => {
    const live = holder(process.pid, '/repo/b')
    tryAcquire(path, live)

    const result = tryAcquire(path, holder(deadPid()))

    expect(result).toEqual({ acquired: false, holder: live })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(live)
  })

  it('should take over a lock whose holder has exited', () => {
    tryAcquire(path, holder(deadPid()))
    const me = holder(process.pid)

    const result = tryAcquire(path, me)

    expect(result).toEqual({ acquired: true })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(me)
  })

  it('should take over a lock file that does not parse', () => {
    tryAcquire(path, holder(process.pid))
    writeFileSync(path, '{"pid":')
    const me = holder(process.pid, '/repo/c')

    const result = tryAcquire(path, me)

    expect(result).toEqual({ acquired: true })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(me)
  })

  it('should leave a stale lock alone while another run is taking it over', () => {
    tryAcquire(path, holder(deadPid()))
    writeFileSync(`${path}.takeover`, JSON.stringify(holder(process.pid)))

    const result = tryAcquire(path, holder(process.pid, '/repo/c'))

    expect(result).toEqual({ acquired: false, holder: null })
  })

  it("should clear a dead taker's guard and take the lock on the next poll", () => {
    const dead = holder(deadPid())
    tryAcquire(path, dead)
    writeFileSync(`${path}.takeover`, JSON.stringify(dead))
    const me = holder(process.pid)

    const first = tryAcquire(path, me)
    const second = tryAcquire(path, me)

    expect(first).toEqual({ acquired: false, holder: null })
    expect(second).toEqual({ acquired: true })
    expect(existsSync(`${path}.takeover`)).toBe(false)
  })
})

describe('release', () => {
  it('should remove a lock this process holds', () => {
    tryAcquire(path, holder(process.pid))

    release(path, process.pid)

    expect(existsSync(path)).toBe(false)
  })

  it("should spare another holder's lock", () => {
    const other = holder(process.pid + 1)
    tryAcquire(path, other)

    release(path, process.pid)

    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(other)
  })

  it('should do nothing when no lock exists', () => {
    expect(() => release(path, process.pid)).not.toThrow()
  })
})

describe('lockPath', () => {
  it('should sit under Library/Caches on macOS', () => {
    expect(lockPath('darwin', {}, '/Users/me')).toBe(
      '/Users/me/Library/Caches/frameboard/test.lock',
    )
  })

  it('should sit under XDG_CACHE_HOME on Linux when it is set', () => {
    expect(lockPath('linux', { XDG_CACHE_HOME: '/xdg' }, '/home/me')).toBe(
      '/xdg/frameboard/test.lock',
    )
  })

  it('should fall back to ~/.cache on Linux', () => {
    expect(lockPath('linux', {}, '/home/me')).toBe(
      '/home/me/.cache/frameboard/test.lock',
    )
  })
})
