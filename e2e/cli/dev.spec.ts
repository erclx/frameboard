import { type ChildProcess, spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'

const FIXTURE = fileURLToPath(
  new URL('../../test/fixtures/boards/basic', import.meta.url),
)
const SCRIPT = fileURLToPath(new URL('../../scripts/dev.ts', import.meta.url))

interface Dev {
  child: ChildProcess
  output: () => string
  errors: () => string
  /** Resolves with the output once `text` has printed. */
  printed: (text: string) => Promise<string>
  exited: Promise<number | null>
}

interface Health {
  root: string
}

test.describe('bun run dev', () => {
  let checkout: string
  let board: string
  let offset: number
  let devs: Dev[]
  let blockers: Server[]

  test.beforeEach(() => {
    checkout = realpathSync(mkdtempSync(join(tmpdir(), 'frameboard-spec-dev-')))
    board = join(checkout, 'test', 'fixtures', 'boards', 'basic')
    cpSync(FIXTURE, board, {
      recursive: true,
      filter: (source) => !source.endsWith('.run'),
    })
    // Above the worktree band of 1 to 50, so no checkout's own dev is in the way.
    offset = 51 + test.info().parallelIndex
    devs = []
    blockers = []
  })

  test.afterEach(async () => {
    for (const { child, exited } of devs) {
      child.kill('SIGTERM')
      await exited
    }
    for (const blocker of blockers) {
      await new Promise((done) => blocker.close(done))
    }
    rmSync(checkout, { recursive: true, force: true })
  })

  const viteUrl = () => `http://localhost:${5173 + offset}`

  function startDev(previewRoot: string | null = checkout): Dev {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      WORKTREE_PORT_OFFSET: String(offset),
    }
    delete env.CANON_PREVIEW_ROOT
    if (previewRoot) env.CANON_PREVIEW_ROOT = previewRoot
    const child = spawn('bun', [SCRIPT], { env })
    let stdout = ''
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    const waiting: (() => void)[] = []
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
      waiting.forEach((check) => check())
    })
    const dev: Dev = {
      child,
      output: () => stdout,
      errors: () => stderr,
      printed: (text) =>
        new Promise((done) => {
          const check = () => stdout.includes(text) && done(stdout)
          waiting.push(check)
          check()
        }),
      exited: new Promise((done) => child.once('exit', done)),
    }
    devs.push(dev)
    return dev
  }

  async function health(): Promise<Health> {
    const response = await fetch(`${viteUrl()}/api/health`)
    expect(response.status).toBe(200)
    return (await response.json()) as Health
  }

  test('proxies a healthy board through Vite with no build', async () => {
    const dev = startDev()

    await dev.printed('Edit link:')

    expect(await health()).toMatchObject({ root: board })
  })

  test("redeems the edit link on Vite's origin", async () => {
    const dev = startDev()
    const output = await dev.printed('Edit link:')
    const link = output.match(/^Edit link: (\S+)$/m)?.[1] as string

    const open = await fetch(link, { redirect: 'manual' })
    const ticket = open.headers.get('location') as string
    const redeem = await fetch(new URL(ticket, viteUrl()), {
      redirect: 'manual',
    })

    expect(link.startsWith(viteUrl())).toBe(true)
    expect(ticket).toMatch(/^\/api\/access\/redeem\?ticket=/)
    expect(redeem.headers.get('location')).toBe('/')
    expect(redeem.headers.get('set-cookie')).toContain('Path=/api')
  })

  test('serves a temporary copy rather than the committed fixture when no root is given', async () => {
    const dev = startDev(null)

    await dev.printed('Edit link:')

    const { root } = await health()
    expect(root.startsWith(join(tmpdir(), 'frameboard-dev-'))).toBe(true)
    expect(root.endsWith(join('test', 'fixtures', 'boards', 'basic'))).toBe(
      true,
    )
  })

  test('removes the temporary copy on SIGTERM', async () => {
    const dev = startDev(null)
    await dev.printed('Edit link:')
    const { root } = await health()

    dev.child.kill('SIGTERM')

    expect(await dev.exited).toBe(0)
    expect(existsSync(root)).toBe(false)
  })

  test('clears the address record on SIGTERM', async () => {
    const dev = startDev()
    await dev.printed('Edit link:')

    dev.child.kill('SIGTERM')

    expect(await dev.exited).toBe(0)
    expect(existsSync(join(board, '.run', 'address.json'))).toBe(false)
  })

  test('exits non-zero without starting Vite when the board port is taken', async () => {
    const blocker = createServer()
    blockers.push(blocker)
    await new Promise<void>((done) =>
      blocker.listen(6173 + offset, '127.0.0.1', done),
    )
    const dev = startDev()

    expect(await dev.exited).not.toBe(0)
    expect(dev.output()).not.toContain('Edit link:')
    await expect(fetch(viteUrl())).rejects.toThrow()
  })
})
