import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { serve, type ServerType } from '@hono/node-server'
import { Hono } from 'hono'
import { afterEach, describe, expect, it } from 'vitest'

import { newAddress, writeAddress } from '@/server/address'
import { checkResultSchema, type Finding } from '@/shared/records/check'

import { cli } from '../../../test/support/cli'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'

// `check` only reads, so the committed fixture serves every test as is.
const ROOT = fileURLToPath(
  new URL('../../../test/fixtures/boards/checks/', import.meta.url),
).replace(/\/$/, '')

const NO_SERVER = { ran: false, reason: 'server-not-running' }

function check(args: string[], cwd = ROOT) {
  return cli(['check', ...args, '--json'], { cwd })
}

describe('check', () => {
  it('returns the result in one envelope and exits 0 on a clean frame', async () => {
    const run = await check(['theme/pass'])

    expect(run.exitCode).toBe(0)
    expect(run.json()).toEqual({
      ok: true,
      data: { checked: 1, findings: [], browser: NO_SERVER },
    })
  })

  it('fails check-findings, exit 8, with the result in the details', async () => {
    const run = await check(['theme/fail'])

    expect(run.exitCode).toBe(8)
    expect(run.json().error?.code).toBe('check-findings')
    expect(checkResultSchema.parse(run.json().error?.details)).toMatchObject({
      checked: 1,
      findings: [{ rule: 'theme', frame: 'rules/theme/fail' }],
    })
  })

  it('takes a project-qualified frame ref', async () => {
    const run = await check(['rules/theme/pass'])

    expect(run.json().data).toEqual({
      checked: 1,
      findings: [],
      browser: NO_SERVER,
    })
  })

  it('takes a path to the frame file against the working folder', async () => {
    const run = await check(['pass.html'], join(ROOT, 'rules/theme'))

    expect(run.json().data).toEqual({
      checked: 1,
      findings: [],
      browser: NO_SERVER,
    })
  })

  it('checks a whole page from a page ref', async () => {
    const run = await check(['network'])

    expect(run.json().error?.details).toMatchObject({
      checked: 2,
      findings: [{ rule: 'network' }],
    })
  })

  it('reads a two-part ref naming no frame as a project and page', async () => {
    const run = await check(['rules/network'])

    expect(run.json().error?.details).toMatchObject({ checked: 2 })
  })

  it('reads a two-part ref as a project and page on a board of several projects', async () => {
    const board: TempBoard = writeBoard({
      'studio/home/hero.html': '<img src="gone.png" alt="">',
      'other/home/hero.html': '<img src="gone.png" alt="">',
    })

    const run = await check(['studio/home'], board.root)
    board.cleanup()

    expect(run.exitCode).toBe(8)
    expect(run.json().error?.details).toMatchObject({
      checked: 1,
      findings: [{ frame: 'studio/home/hero' }],
    })
  })

  it('checks the whole project with no target', async () => {
    const run = await check([])

    expect(run.json().error?.details).toMatchObject({ checked: 30 })
  })

  it('fails frame-not-found, exit 3, on a ref that names nothing', async () => {
    const run = await check(['theme/nowhere'])

    expect(run.exitCode).toBe(3)
    expect(run.json().error?.code).toBe('frame-not-found')
  })

  it('checks the project a bare name holds on a board of several projects', async () => {
    const board: TempBoard = writeBoard({
      'studio/home/hero.html': '<img src="gone.png" alt="">',
      'studio/about/team.html': '<img src="gone.png" alt="">',
      'other/home/hero.html': '<img src="gone.png" alt="">',
    })

    const run = await check(['studio'], board.root)
    board.cleanup()

    expect(run.exitCode).toBe(8)
    expect(run.json().error?.details).toMatchObject({ checked: 2 })
  })

  it('reads a bare name as a page first where a page and a project share it', async () => {
    const board: TempBoard = writeBoard({
      'home/home/hero.html': '<img src="gone.png" alt="">',
      'home/about/team.html': '<img src="gone.png" alt="">',
    })

    const run = await check(['home'], board.root)
    board.cleanup()

    expect(run.json().error?.details).toMatchObject({
      checked: 1,
      findings: [{ frame: 'home/home/hero' }],
    })
  })

  it('keeps project-required on a bare name no project holds', async () => {
    const board: TempBoard = writeBoard({
      'studio/home/hero.html': '<p>Hello</p>',
      'other/home/hero.html': '<p>Hello</p>',
    })

    const run = await check(['nowhere'], board.root)
    board.cleanup()

    expect(run.json().error?.code).toBe('project-required')
  })

  it('prints the findings on stdout and one summary line on stderr without --json', async () => {
    const run = await cli(['check', 'theme/fail'], { cwd: ROOT })

    expect(run.exitCode).toBe(8)
    expect(run.stdout).toContain('rules/theme/fail.html:9:9  theme  ')
    expect(run.stdout).not.toMatch(/^Checked /m)
    expect(run.stderr).not.toContain('rules/theme/fail.html')
    expect(run.stderr.trim().split('\n')).toEqual([
      expect.stringMatching(/^frameboard: Checked 1 frame, \d+ findings?\.$/),
    ])
  })

  it('closes the human output saying the browser rules did not run', async () => {
    const run = await cli(['check', 'theme/pass'], { cwd: ROOT })

    expect(run.stdout).toContain(
      'Browser rules did not run, since no board server is running.',
    )
  })
})

describe('check with a board server running', () => {
  const CLEAN = '<style>body { font-family: Geist }</style><p>Hello</p>'
  let board: TempBoard
  let server: ServerType
  let asked: unknown[]

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
    board.cleanup()
  })

  /** A server for the board answering `/api/checks` with `answer`. */
  async function serveStub(answer: {
    findings: Finding[]
    browser: { ran: boolean; reason?: string }
  }) {
    board = writeBoard({
      'site/home/hero.html': CLEAN,
      'site/home/about.html': CLEAN,
    })
    asked = []
    const app = new Hono()
    app.get('/api/health', (c) => c.json({ root: board.root }))
    app.post('/api/checks', async (c) => {
      asked.push(await c.req.json())
      return c.json({ ok: true, data: answer })
    })
    const port = await new Promise<number>((resolve) => {
      server = serve(
        { fetch: app.fetch, hostname: '127.0.0.1', port: 0 },
        (info: AddressInfo) => resolve(info.port),
      )
    })
    await writeAddress(
      board.root,
      newAddress({ root: board.root, host: '127.0.0.1', port }),
    )
  }

  function finding(rule: string, severity: Finding['severity']): Finding {
    return {
      rule,
      severity,
      frame: 'site/home/hero',
      path: 'site/home/hero.html',
      message: `site/home/hero breaks ${rule}.`,
      location: null,
    }
  }

  it('posts the refs it checked and appends the server findings', async () => {
    await serveStub({
      findings: [finding('clipped', 'error')],
      browser: { ran: true },
    })

    const run = await check(['home'], board.root)

    expect(asked).toEqual([{ refs: ['site/home/about', 'site/home/hero'] }])
    expect(run.exitCode).toBe(8)
    expect(run.json().error?.details).toEqual({
      checked: 2,
      findings: [finding('clipped', 'error')],
      browser: { ran: true },
    })
  })

  it('exits 0 on warnings alone', async () => {
    await serveStub({
      findings: [finding('viewport', 'warning')],
      browser: { ran: true },
    })

    const run = await check(['home/hero'], board.root)

    expect(run.exitCode).toBe(0)
    expect(run.json().data).toMatchObject({
      findings: [{ rule: 'viewport', severity: 'warning' }],
    })
  })

  it('keeps the static result when the server has no browser', async () => {
    await serveStub({
      findings: [],
      browser: { ran: false, reason: 'browser-not-found' },
    })

    const run = await cli(['check', 'home/hero'], { cwd: board.root })

    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain(
      "could not launch Playwright's headless shell. Install it with npx playwright-core@",
    )
  })
})
