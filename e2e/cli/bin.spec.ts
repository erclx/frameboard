import { type ChildProcess, execFile, spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { expect, test } from '@playwright/test'

const CLI = resolve('dist/cli.js')
const run = promisify(execFile)

interface Envelope {
  ok: boolean
  data: Record<string, unknown>
  error?: { code: string }
}

/** Runs the bundle to completion, resolving its exit code and parsed envelope. */
async function frameboard(
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; envelope: Envelope }> {
  try {
    const { stdout } = await run('node', [CLI, ...args], { cwd })
    return { exitCode: 0, envelope: JSON.parse(stdout) }
  } catch (error) {
    const failed = error as { code: number; stdout: string }
    return { exitCode: failed.code, envelope: JSON.parse(failed.stdout) }
  }
}

/** Starts `serve --json`, resolving its envelope once the one document has printed. */
function startServe(
  cwd: string,
): Promise<{ child: ChildProcess; envelope: Envelope }> {
  const child = spawn(
    'node',
    [CLI, 'serve', '--json', '--no-open', '--port', '0'],
    { cwd },
  )
  return new Promise((done, fail) => {
    let stdout = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
      try {
        done({ child, envelope: JSON.parse(stdout) })
      } catch {
        // The document has not finished printing.
      }
    })
    child.once('exit', (code) => fail(new Error(`serve exited ${code}`)))
  })
}

test.describe('the built CLI', () => {
  let cwd: string
  let server: ChildProcess | undefined

  test.beforeEach(() => {
    cwd = realpathSync(mkdtempSync(join(tmpdir(), 'frameboard-e2e-')))
  })

  test.afterEach(() => {
    server?.kill('SIGTERM')
    server = undefined
    rmSync(cwd, { recursive: true, force: true })
  })

  test('starts a board in an empty folder and reuses its server', async () => {
    const first = await startServe(cwd)
    server = first.child

    expect(first.envelope.data).toMatchObject({
      root: join(cwd, '.frameboard'),
      created: true,
      reused: false,
    })
    expect(existsSync(join(cwd, '.frameboard/untitled/page-1'))).toBe(true)
    expect(existsSync(join(cwd, '.frameboard/.run/address.json'))).toBe(true)

    const second = await frameboard(['serve', '--json', '--no-open'], cwd)

    expect(second.exitCode).toBe(0)
    expect(second.envelope.data).toMatchObject({
      url: first.envelope.data.url,
      reused: true,
    })
  })

  test('lists the board it started', async () => {
    const first = await startServe(cwd)
    server = first.child

    const listed = await frameboard(['list', '--json'], cwd)

    expect(listed.envelope).toMatchObject({
      ok: true,
      data: { projects: [{ name: 'untitled', pages: [{ name: 'page-1' }] }] },
    })
  })

  test('removes its address file on SIGTERM', async () => {
    const first = await startServe(cwd)

    const exited = new Promise((done) => first.child.once('exit', done))
    first.child.kill('SIGTERM')
    await exited

    expect(existsSync(join(cwd, '.frameboard/.run/address.json'))).toBe(false)
  })

  test('starts the board in an empty subfolder of a repository, not at its top', async () => {
    await run('git', ['init', '--quiet'], { cwd })
    const sub = join(cwd, 'empty')
    mkdirSync(sub)

    const first = await startServe(sub)
    server = first.child

    expect(first.envelope.data).toMatchObject({
      root: join(sub, '.frameboard'),
      created: true,
    })
    expect(existsSync(join(cwd, '.frameboard'))).toBe(false)
  })

  test('exits 0 with nothing on stderr when its reader closes the pipe early', async () => {
    const { stdout, stderr } = await run(
      'bash',
      ['-c', `node "${CLI}" docs --json | head -1; echo "\${PIPESTATUS[0]}"`],
      { cwd },
    )

    expect(stdout).toBe('{\n0\n')
    expect(stderr).toBe('')
  })

  test('exits 3 with one envelope where no board exists', async () => {
    const listed = await frameboard(['list', '--json'], cwd)

    expect(listed.exitCode).toBe(3)
    expect(listed.envelope.error?.code).toBe('board-not-found')
  })
})
