import { execFile } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import { expect, test } from '@playwright/test'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../test/support/fixture-board'

const CLI = resolve('dist/cli.js')
const STUB = pathToFileURL(resolve('e2e/support/fontsource-stub.mjs')).href
const FRAME = 'studio/home/hero'
const run = promisify(execFile)

interface Envelope {
  ok: boolean
  data?: Record<string, unknown>
  error?: { code: string }
}

test.describe('font', () => {
  let board: FixtureBoard
  let out: string

  test.beforeEach(() => {
    board = copyFixtureBoard('capture')
    out = mkdtempSync(join(tmpdir(), 'frameboard-font-'))
    writeFileSync(
      join(board.root, `${FRAME}.html`),
      '<!doctype html>\n<html lang="en"><head><title>Title</title></head><body style="font-family: \'Stub Display\', serif"><h1>An installed title</h1></body></html>\n',
    )
  })

  test.afterEach(() => {
    board.cleanup()
    rmSync(out, { recursive: true, force: true })
  })

  async function frameboard(...args: string[]): Promise<Envelope> {
    const argv = [CLI, ...args, '--root', board.root, '--json']
    const env = { ...process.env, NODE_OPTIONS: `--import ${STUB}` }
    try {
      return JSON.parse((await run('node', argv, { env })).stdout)
    } catch (error) {
      return JSON.parse((error as { stdout: string }).stdout)
    }
  }

  function capture() {
    return frameboard('capture', FRAME, '--out', out, '--theme', 'light')
  }

  test('installs a font a frame then draws in, and takes it out again', async () => {
    const before = await capture()
    const installed = await frameboard('font', 'find', 'stub', '--save', '1')
    const during = await capture()
    const removed = await frameboard('font', 'remove', 'stub-display')
    const after = await capture()

    expect(before.error?.code).toBe('font-missing')
    expect(installed.data).toMatchObject({ path: 'fonts/stub-display' })
    expect(during.ok).toBe(true)
    expect(existsSync(join(out, `${FRAME}.light.png`))).toBe(true)
    expect(removed.data).toMatchObject({ frames: [FRAME] })
    expect(after.error?.code).toBe('font-missing')
    expect(
      readFileSync(join(board.root, `${FRAME}.html`), 'utf8'),
    ).not.toContain('font-face')
  })
})
