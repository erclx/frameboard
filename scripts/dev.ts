// Backs `bun run dev`: starts the board server Vite proxies `/api`, `/frames`,
// and `/frameboard` to, then Vite in front of it, so one command gives a
// healthy board at Vite's address. The board runs from source in this process
// with `src/client` as its client folder, which passes the built-client check
// with no build, so its own port serves a page that does not load and only
// Vite's address is printed. The board port is read from the proxy target in
// `vite.config.ts`, which owns it.
//
// CANON_PREVIEW_ROOT names the checkout whose `basic` board is served, as in
// `preview.ts`. Unset, a temporary copy is served instead of the committed
// fixture, so a hand edit writes no tracked file and a concurrent `test:e2e`
// finds no live server on the fixture. The board runs with the hidden
// `--open-route`, so the printed link hands any local browser a writing tab.
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
