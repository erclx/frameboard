// Backs `bun run dev`, the board server behind Vite's proxy, printing Vite's
// address alone. Serves a temporary board copy unless CANON_PREVIEW_ROOT names
// one, and `--open-route` and `--edit-button` each let any local program write.
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createServer } from 'vite'

import { runCli } from '../src/cli/run'

interface Served {
  url: string
  root: string
  reused: boolean
}

type Document<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string } }

const CHECKOUT = join(import.meta.dirname, '..')
const FIXTURE = join('test', 'fixtures', 'boards', 'basic')

const vite = await createServer({
  configFile: join(CHECKOUT, 'vite.config.ts'),
})
const proxy = vite.config.server.proxy?.['/api']
const target = typeof proxy === 'string' ? proxy : proxy?.target
if (typeof target !== 'string') {
  console.error('vite.config.ts proxies /api to no board origin')
  process.exit(1)
}
const port = new URL(target).port

const copy = process.env.CANON_PREVIEW_ROOT
  ? undefined
  : mkdtempSync(join(tmpdir(), 'frameboard-dev-'))
const board = join(copy ?? process.env.CANON_PREVIEW_ROOT ?? '.', FIXTURE)
if (copy) {
  cpSync(join(CHECKOUT, FIXTURE), board, {
    recursive: true,
    filter: (source) => !source.endsWith('.run'),
  })
  // Synchronous, since `exit` runs no further turn of the loop.
  process.once('exit', () => rmSync(copy, { recursive: true, force: true }))
}

// Vite's own SIGTERM listener exits as soon as Vite closes, before the board
// has removed its address file, so this process takes the signal over.
process.removeAllListeners('SIGTERM')
// Aborting lets the board remove its address file before the process ends.
const controller = new AbortController()
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void vite.close().finally(() => controller.abort())
  })
}

let stdout = ''
const code = await runCli(
  [
    'serve',
    '--root',
    board,
    '--no-open',
    '--json',
    '--port',
    port,
    '--open-route',
    '--edit-button',
  ],
  {
    stdout: (text) => {
      stdout += text
    },
    stderr: (text) => process.stderr.write(text),
    cwd: process.cwd(),
    openUrl: () => {},
    signal: controller.signal,
  },
  { clientDir: join(CHECKOUT, 'src', 'client') },
)
const served = JSON.parse(stdout) as Document<Served>
if (!served.ok) {
  console.error(served.error.message)
  await vite.close()
  process.exit(code)
}
// A server another command started keeps its own port and flags, so Vite would
// proxy to nothing or to a board with no open route.
if (served.data.reused) {
  console.error(
    `Frameboard is already serving ${served.data.root} on ${served.data.url}. Stop it before bun run dev.`,
  )
  await vite.close()
  process.exit(1)
}

await vite.listen()
console.log(`Frameboard is serving ${served.data.root} behind Vite`)
vite.printUrls()
const [local] = vite.resolvedUrls?.local ?? []
if (local) console.log(`Edit link: ${new URL('/api/access/open', local)}`)
