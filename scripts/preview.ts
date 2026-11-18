// Serves the `basic` board and prints an editing link, since `serve --no-open`
// mints none. Its `--open-route` makes any local browser a writer, safe only on
// a throwaway board, so never point CANON_PREVIEW_ROOT at a real one.
import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'

interface Served {
  url: string
  root: string
  reused: boolean
}

type Document<T> =
  | { ok: true; data: T }
  | { ok: false; error: { message: string } }

interface Opened {
  writeUrl: string
}

const run = promisify(execFile)

const CLI = join(import.meta.dirname, '..', 'dist', 'cli.js')
const BOARD = join(
  process.env.CANON_PREVIEW_ROOT || '.',
  'test',
  'fixtures',
  'boards',
  'basic',
)
const PORT = process.env.PREVIEW_PORT || '4173'

const server = spawn(
  'node',
  [
    CLI,
    'serve',
    '--root',
    BOARD,
    '--no-open',
    '--json',
    '--port',
    PORT,
    '--open-route',
  ],
  { stdio: ['ignore', 'pipe', 'inherit'] },
)
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.kill(signal))
}
const exited = new Promise<number>((done) =>
  server.once('exit', (code, signal) => done(code ?? (signal ? 1 : 0))),
)

try {
  const served = await envelope<Served>(server)
  const { stdout } = await run('node', [
    CLI,
    'open',
    '--root',
    served.root,
    '--no-open',
    '--json',
  ])
  const opened = JSON.parse(stdout).data as Opened
  console.log(`Frameboard is serving ${served.root} on ${served.url}`)
  console.log(`Edit link: ${opened.writeUrl}`)
  console.log(
    `The link works once and lives two minutes. Mint another with: node ${CLI} open --root ${served.root} --no-open`,
  )
  // A reused server kept the flags it started with, so its route may be absent.
  console.log(
    `Edit link (fresh each open): ${served.url}/api/access/open${served.reused ? ' (only on a server preview started)' : ''}`,
  )
  // A reused server belongs to someone else, and its `serve` has already exited.
  process.exit(served.reused ? 0 : await exited)
} catch (error) {
  server.kill('SIGTERM')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}

/** The `data` of the one envelope `serve --json` prints, or its refusal as an error, read once it parses. */
function envelope<T>(child: ChildProcess): Promise<T> {
  return new Promise((done, fail) => {
    let stdout = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
      let document: Document<T>
      try {
        document = JSON.parse(stdout)
      } catch {
        // The document has not finished printing.
        return
      }
      if (document.ok) done(document.data)
      else fail(new Error(document.error.message))
    })
    child.once('exit', (code) =>
      fail(new Error(`serve exited ${code} before it printed an address`)),
    )
  })
}
