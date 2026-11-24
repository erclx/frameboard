import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { git, gitEnv } from './lib/git.ts'

const SCRIPT = join(import.meta.dirname, 'check-changed.ts')

let home: string
let root: string
let bin: string

/** The project's package scripts, each logging its name and arguments. */
function packageJson(scripts: Record<string, string> = {}): string {
  const names = ['typecheck', 'lint', 'check:format', 'check:shell', 'test:run']
  return JSON.stringify({
    scripts: {
      ...Object.fromEntries(names.map((name) => [name, `../log.sh ${name}`])),
      ...scripts,
    },
  })
}

function write(path: string, text: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

function commit(): void {
  git(root, ['add', '-A'])
  git(root, [
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@t',
    'commit',
    '-qm',
    'change',
  ])
}

function run(...args: string[]) {
  const result = spawnSync('bun', [SCRIPT, ...args], {
    cwd: root,
    encoding: 'utf8',
    // A PATH with no canon on it, so no case runs the machine's own gate.
    env: { ...gitEnv(), PATH: `${bin}:/usr/bin:/bin` },
  })
  return { code: result.status, output: `${result.stdout}${result.stderr}` }
}

/** The package scripts that ran, in order, each with its arguments. */
function ran(): string[] {
  const log = join(home, 'log')
  if (!existsSync(log)) return []
  return readFileSync(log, 'utf8').trim().split('\n')
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'check-changed-'))
  root = join(home, 'project')
  bin = join(home, 'bin')
  mkdirSync(bin)
  mkdirSync(root)
  const bun = execFileSync('which', ['bun'], { encoding: 'utf8' }).trim()
  symlinkSync(bun, join(bin, 'bun'))
  writeFileSync(
    join(home, 'log.sh'),
    `#!/bin/sh\necho "$@" >> '${join(home, 'log')}'\n`,
    { mode: 0o755 },
  )
  git(root, ['init', '-q', '-b', 'main'])
  write('package.json', packageJson())
  write('src/a.ts', 'one')
  write('src/a.test.ts', 'one')
  commit()
  git(root, ['update-ref', 'refs/remotes/origin/main', 'HEAD'])
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('the phases', () => {
  it('should run each check and the tests tied to the change', () => {
    write('src/a.ts', 'two')

    const { code } = run()

    expect(code).toBe(0)
    expect(ran()).toEqual([
      'typecheck',
      'lint',
      'check:format',
      'check:shell',
      'test:run src/a.test.ts',
    ])
  })

  it('should start no test run for a package change', () => {
    write('package.json', `${packageJson()}\n`)

    run()

    expect(ran()).not.toContainEqual(expect.stringContaining('test:run'))
  })

  it('should leave a sweep past the limit to CI', () => {
    for (let n = 0; n <= 40; n++) write(`src/sweep/t${n}.test.ts`, 'x')

    const { code, output } = run()

    expect(code).toBe(0)
    expect(output).toContain('41 test files')
    expect(ran()).not.toContainEqual(expect.stringContaining('test:run'))
  })

  it('should check web/ when a file under it changed', () => {
    write(
      'web/package.json',
      packageJson().replaceAll('../log.sh', '../../log.sh web'),
    )
    write('web/node_modules/.keep', '')
    write('web/src/b.test.ts', 'x')

    run()

    expect(ran()).toContain('web typecheck')
    expect(ran()).toContain('web test:run src/b.test.ts')
  })

  it('should name the install web/ is missing', () => {
    write('web/package.json', packageJson())

    const { code, output } = run()

    expect(code).toBe(1)
    expect(output).toContain('bun install')
  })

  it('should stop at the first failing check and name it', () => {
    write('package.json', packageJson({ lint: 'false' }))

    const { code, output } = run()

    expect(code).toBe(1)
    expect(output).toContain('Lint failed')
    expect(ran()).toEqual(['typecheck'])
  })

  it('should refuse a checkout with no origin/main to measure from', () => {
    git(root, ['update-ref', '-d', 'refs/remotes/origin/main'])

    const { code, output } = run()

    expect(code).toBe(1)
    expect(output).toContain('origin/main')
    expect(ran()).toEqual([])
  })

  it('should refuse an argument it does not know', () => {
    expect(run('--all').code).toBe(2)
  })
})

describe('a tree that already passed', () => {
  it('should skip, across the commit of that tree', () => {
    write('src/a.ts', 'two')
    run()
    const first = ran()
    commit()

    const { code, output } = run()

    expect(code).toBe(0)
    expect(output).toContain('--force')
    expect(ran()).toEqual(first)
  })

  it('should run again once a canon is on PATH after a pass without one', () => {
    run()
    writeFileSync(
      join(bin, 'canon'),
      `#!/bin/sh\necho 'Usage: canon gate run'\necho "canon $*" >> '${join(home, 'log')}'\n`,
      { mode: 0o755 },
    )

    run()

    expect(ran()).toContain('canon gate run --nested')
  })

  it('should run again on a tree that was edited while it ran', () => {
    const edits = packageJson({ lint: 'echo edit >> src/a.ts' })
    write('package.json', edits)
    run()
    write('src/a.ts', 'one')
    const first = ran()

    run()

    expect(ran()).toHaveLength(first.length * 2)
  })

  it('should run again under --force', () => {
    run()
    const first = ran()

    run('--force')

    expect(ran()).toEqual([...first, ...first])
  })

  it('should run again after a later failure on the same tree', () => {
    run()
    writeFileSync(join(home, 'log.sh'), '#!/bin/sh\nexit 1\n')
    run('--force')

    expect(run().code).toBe(1)
  })
})
