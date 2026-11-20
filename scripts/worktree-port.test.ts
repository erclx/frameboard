import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const script = join(import.meta.dirname, 'worktree-port.sh')

/** The offset the script hashes a worktree's folder name into, 1 to 50. */
function hashedOffset(name: string): number {
  const sum = execFileSync('cksum', { input: name, encoding: 'utf8' })
  return (Number(sum.split(' ')[0]) % 50) + 1
}

/** The first `wt-<n>` folder name that hashes to `offset`. */
function nameHashingTo(offset: number): string {
  for (let n = 0; ; n++) {
    if (hashedOffset(`wt-${n}`) === offset) return `wt-${n}`
  }
}

/**
 * The environment with no `GIT_*` variable, since a git hook running this
 * suite exports `GIT_DIR` and would point every command at the real checkout.
 */
const ENV = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) => !key.startsWith('GIT_') && key !== 'WORKTREE_PORT_OFFSET',
  ),
)

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore', env: ENV })
}

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'worktree-port-'))
  git(root, 'init', '-q', '-b', 'main')
  writeFileSync(join(root, 'readme'), 'x')
  git(root, 'add', 'readme')
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Runs the script from a new linked worktree named `name`. */
function portIn(name: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const tree = join(root, 'trees', name)
  git(root, 'worktree', 'add', '-q', tree)
  const run = spawnSync('bash', [script, ...args], {
    cwd: tree,
    encoding: 'utf8',
    env: { ...ENV, ...env },
  })
  return { status: run.status, port: run.stdout.trim() }
}

describe('a linked worktree hashing onto a blocked port', () => {
  it('steps the offset past one a repo base would put on 4190', () => {
    expect(portIn(nameHashingTo(17), [])).toEqual({ status: 0, port: '18' })
  })

  it('serves the preview base one port past 4190', () => {
    expect(portIn(nameHashingTo(17), ['4173'])).toEqual({
      status: 0,
      port: '4191',
    })
  })

  it('wraps past the top of the band to 1, never to 0', () => {
    expect(portIn(nameHashingTo(50), ['4140'])).toEqual({
      status: 0,
      port: '4141',
    })
  })
})

describe('an offset set by hand', () => {
  it('is returned as given, blocked or not', () => {
    expect(
      portIn(nameHashingTo(3), ['4173'], { WORKTREE_PORT_OFFSET: '17' }),
    ).toEqual({ status: 0, port: '4190' })
  })
})

describe('a linked worktree hashing onto a clear port', () => {
  it('keeps a bare offset the bad port list holds as a port number', () => {
    expect(portIn(nameHashingTo(7), [])).toEqual({ status: 0, port: '7' })
  })

  it('keeps its hashed offset', () => {
    expect(portIn(nameHashingTo(16), ['4173'])).toEqual({
      status: 0,
      port: '4189',
    })
  })
})
