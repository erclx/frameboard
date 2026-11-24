// Usage: bun scripts/check-changed.ts [--force], the gate a push runs. It
// checks the whole tree but runs only the tests tied to the change, since CI
// runs the full suites. A tree that already passed is skipped without --force.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { tiedTests } from './lib/changed-tests.ts'
import { clearPass, gateKey, hasPassed, recordPass } from './lib/gate-stamp.ts'
import { git, gitEnv } from './lib/git.ts'

const USAGE = 'Usage: bun scripts/check-changed.ts [--force]'
const TRUNK = 'origin/main'
// Past this a change is a sweep, and its run is the suite CI runs anyway.
const MAX_TEST_FILES = 40

interface Check {
  readonly title: string
  readonly cwd: string
  readonly command: string
  readonly args: readonly string[]
}

function fail(message: string, code = 1): never {
  console.error(`✗ ${message}`)
  process.exit(code)
}

function skip(message: string): void {
  console.log(`- ${message}`)
}

function lines(output: string): string[] {
  return output.split('\0').filter((line) => line !== '')
}

function mergeBase(root: string): string {
  try {
    return git(root, ['merge-base', 'HEAD', TRUNK]).trim()
  } catch {
    return fail(
      `No merge base with ${TRUNK}, so nothing says what changed. Run 'git fetch origin main'`,
    )
  }
}

/** Every path that differs from `base`, deleted and untracked ones included. */
function changedSince(root: string, base: string): string[] {
  const untracked = ['ls-files', '-z', '--others', '--exclude-standard']
  return [
    ...lines(git(root, ['diff', '--name-only', '-z', '--no-renames', base])),
    ...lines(git(root, untracked)),
  ]
}

function presentFiles(root: string): string[] {
  const listed = git(root, [
    'ls-files',
    '-z',
    '--cached',
    '--others',
    '--exclude-standard',
  ])
  return lines(listed).filter((path) => existsSync(join(root, path)))
}

function script(
  cwd: string,
  title: string,
  name: string,
  args: string[] = [],
): Check {
  return { title, cwd, command: 'bun', args: ['run', name, ...args] }
}

function testChecks(cwd: string, title: string, tests: string[]): Check[] {
  if (tests.length === 0) {
    skip(`${title}: no test is tied to the change`)
    return []
  }
  if (tests.length > MAX_TEST_FILES) {
    skip(
      `${title}: ${tests.length} test files are tied to the change, past the ${MAX_TEST_FILES} run here, so CI runs them`,
    )
    return []
  }
  return [script(cwd, title, 'test:run', tests)]
}

function webChecks(root: string, changed: string[], files: string[]): Check[] {
  const inWeb = (paths: string[]) =>
    paths
      .filter((path) => path.startsWith('web/'))
      .map((path) => path.slice('web/'.length))
  const webChanged = inWeb(changed)
  if (webChanged.length === 0) return []
  const web = join(root, 'web')
  if (!existsSync(join(web, 'node_modules'))) {
    fail("web/ changed and its packages are missing. Run 'bun install' in web/")
  }
  return [
    script(web, 'Web typecheck', 'typecheck'),
    script(web, 'Web lint', 'lint'),
    script(web, 'Web format check', 'check:format'),
    ...testChecks(web, 'Web tests', tiedTests(webChanged, inWeb(files))),
  ]
}

/** The canon a pass was checked by, as one word in the key. */
function canonVersion(): string {
  const { stdout } = spawnSync('canon', ['--version'], { encoding: 'utf8' })
  return stdout?.trim() || 'none'
}

/** `canon gate`, where the binary has the verb, since CI never runs it. */
function canonChecks(root: string): Check[] {
  const help = spawnSync('canon', ['gate', 'run', '--help'], {
    encoding: 'utf8',
  })
  // An older canon answers an unknown verb with its root help and exits zero.
  if (!help.stdout?.startsWith('Usage: canon gate run')) {
    skip('Canon checks: no canon with a gate verb on PATH. Run canon upgrade')
    return []
  }
  const args = ['gate', 'run', '--nested']
  return [{ title: 'Canon checks', cwd: root, command: 'canon', args }]
}

function seconds(since: number): string {
  return `${((Date.now() - since) / 1000).toFixed(1)} s`
}

function runCheck(check: Check): void {
  console.log(`\n${check.title}`)
  const started = Date.now()
  const { status } = spawnSync(check.command, check.args, {
    cwd: check.cwd,
    stdio: 'inherit',
    env: gitEnv(),
  })
  if (status !== 0) fail(`${check.title} failed after ${seconds(started)}`)
  console.log(`✓ ${check.title} passed in ${seconds(started)}`)
}

const args = process.argv.slice(2)
if (args.some((arg) => arg !== '--force')) fail(USAGE, 2)

const root = process.cwd()
const started = Date.now()
const base = mergeBase(root)
const key = gateKey(root, base, canonVersion())
if (!args.includes('--force') && hasPassed(root, key)) {
  skip('This tree already passed the gate. --force runs it again')
  process.exit(0)
}
clearPass(root)

const changed = changedSince(root, base)
const files = presentFiles(root)
const inRoot = (path: string) => !path.startsWith('web/')
const tests = tiedTests(changed.filter(inRoot), files.filter(inRoot))

const checks = [
  script(root, 'Typecheck', 'typecheck'),
  script(root, 'Lint', 'lint'),
  script(root, 'Format check', 'check:format'),
  script(root, 'Shell', 'check:shell'),
  ...webChecks(root, changed, files),
  ...canonChecks(root),
  ...testChecks(root, 'Tests', tests),
]
for (const check of checks) runCheck(check)

// An edit made while the gate ran was checked in part, so no pass is kept.
if (gateKey(root, base, canonVersion()) === key) recordPass(root, key)
console.log(`\n✓ Gate passed in ${seconds(started)}`)
