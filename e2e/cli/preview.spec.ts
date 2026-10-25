import { type ChildProcess, spawn } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

const FIXTURE = fileURLToPath(
  new URL('../../test/fixtures/boards/basic', import.meta.url),
)
const SCRIPT = fileURLToPath(
  new URL('../../scripts/preview.ts', import.meta.url),
)

interface Preview {
  child: ChildProcess
  output: () => string
  /** Resolves with the output once `text` has printed. */
  printed: (text: string) => Promise<string>
  exited: Promise<number | null>
}

test.describe('bun run preview', () => {
  let checkout: string
  let board: string
  let previews: Preview[]

  test.beforeEach(() => {
    checkout = realpathSync(mkdtempSync(join(tmpdir(), 'frameboard-preview-')))
    board = join(checkout, 'test', 'fixtures', 'boards', 'basic')
    cpSync(FIXTURE, board, {
      recursive: true,
      filter: (source) => !source.endsWith('.run'),
    })
    previews = []
  })

  test.afterEach(async () => {
    for (const { child, exited } of previews) {
      child.kill('SIGTERM')
      await exited
    }
    rmSync(checkout, { recursive: true, force: true })
  })

  function startPreview(): Preview {
    const child = spawn('bun', [SCRIPT], {
      env: { ...process.env, CANON_PREVIEW_ROOT: checkout, PREVIEW_PORT: '0' },
    })
    let stdout = ''
    const waiting: (() => void)[] = []
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
      waiting.forEach((check) => check())
    })
    const preview: Preview = {
      child,
      output: () => stdout,
      printed: (text) =>
        new Promise((done) => {
          const check = () => stdout.includes(text) && done(stdout)
          waiting.push(check)
          check()
        }),
      exited: new Promise((done) => child.once('exit', done)),
    }
    previews.push(preview)
    return preview
  }

  function editLink(output: string): string {
    const link = output.match(/^Edit link: (\S+)$/m)?.[1]
    expect(link).toBeDefined()
    return link as string
  }

  async function redeem(
    link: string,
  ): Promise<{ location: string | null; cookie: string | null }> {
    const response = await fetch(link, { redirect: 'manual' })
    return {
      location: response.headers.get('location'),
      cookie: response.headers.get('set-cookie'),
    }
  }

  const record = () =>
    JSON.parse(readFileSync(join(board, '.run', 'address.json'), 'utf8'))

  test('prints an edit link that redeems once', async () => {
    const preview = startPreview()

    const link = editLink(await preview.printed('Mint another with'))

    expect(await redeem(link)).toMatchObject({
      location: '/',
      cookie: expect.stringContaining('HttpOnly'),
    })
    expect(await redeem(link)).toMatchObject({
      location: '/?link=expired',
      cookie: null,
    })
  })

  test('prints the address the server really bound, over a stale record', async () => {
    mkdirSync(join(board, '.run'), { recursive: true })
    writeFileSync(
      join(board, '.run', 'address.json'),
      JSON.stringify({
        version: 1,
        url: 'http://127.0.0.1:1',
        host: '127.0.0.1',
        port: 1,
        pid: 999999,
        token: 'a'.repeat(64),
        root: board,
        startedAt: new Date().toISOString(),
        frameboard: '0.0.0',
      }),
    )
    const preview = startPreview()

    const output = await preview.printed('Mint another with')

    const { pid, url } = record()
    expect(pid).not.toBe(999999)
    expect(() => process.kill(pid, 0)).not.toThrow()
    expect(output).toContain(`on ${url}\n`)
    expect(editLink(output).startsWith(url)).toBe(true)
  })

  test('stops its server and clears the record on SIGTERM', async () => {
    const preview = startPreview()
    await preview.printed('Mint another with')
    const { pid } = record()

    preview.child.kill('SIGTERM')

    expect(await preview.exited).toBe(0)
    expect(() => process.kill(pid, 0)).toThrow()
    expect(existsSync(join(board, '.run', 'address.json'))).toBe(false)
  })

  test('prints a link over a server already live and exits 0', async () => {
    const first = startPreview()
    await first.printed('Mint another with')
    const second = startPreview()

    const output = await second.printed('Mint another with')

    expect(await second.exited).toBe(0)
    expect(editLink(output).startsWith(record().url)).toBe(true)
    expect(() => process.kill(record().pid, 0)).not.toThrow()
  })
})
