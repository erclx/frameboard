import { type ChildProcess, spawn } from 'node:child_process'
import { resolve } from 'node:path'

const CLI = resolve('dist/cli.js')

export interface BoardServer {
  url: string
  /** The `data` of the envelope `serve --json` printed. */
  data: Record<string, unknown>
  stop: () => Promise<void>
}

/**
 * Starts the built CLI's `serve` on its own port over `root`, for a spec that
 * writes files and so must not share the committed fixture the default
 * `webServer` serves. Resolves once the one `--json` envelope has printed.
 */
export function serveBoard(root: string): Promise<BoardServer> {
  const child = spawn('node', [
    CLI,
    'serve',
    '--root',
    root,
    '--port',
    '0',
    '--no-open',
    '--json',
  ])
  return new Promise((done, fail) => {
    let stdout = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
      let envelope: { data: { url: string } & Record<string, unknown> }
      try {
        envelope = JSON.parse(stdout)
      } catch {
        // The document has not finished printing.
        return
      }
      done({
        url: envelope.data.url,
        data: envelope.data,
        stop: () => stop(child),
      })
    })
    child.once('exit', (code) => fail(new Error(`serve exited ${code}`)))
  })
}

function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve()
  const exited = new Promise<void>((done) => child.once('exit', () => done()))
  child.kill('SIGTERM')
  return exited
}
