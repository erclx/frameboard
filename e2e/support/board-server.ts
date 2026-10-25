import { type ChildProcess, spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const CLI = resolve('dist/cli.js')

export interface BoardServer {
  url: string
  /** The `data` of the envelope `serve --json` printed. */
  data: Record<string, unknown>
  /** A fresh redeem URL, standing in for the one `serve` opens since `--no-open` skips it. */
  ticketUrl: () => Promise<string>
  stop: () => Promise<void>
}

/**
 * Starts the built CLI's `serve` on its own port over `root`, for a spec that
 * writes files and so must not share the committed fixture the default
 * `webServer` serves. Resolves once the one `--json` envelope has printed.
 * `flags` adds to `serve`'s own, such as `--tokens <path>`.
 */
export function serveBoard(
  root: string,
  flags: readonly string[] = [],
): Promise<BoardServer> {
  const child = spawn('node', [
    CLI,
    'serve',
    '--root',
    root,
    '--port',
    '0',
    '--no-open',
    '--json',
    ...flags,
  ])
  return new Promise((done, fail) => {
    let stdout = ''
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
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
        ticketUrl: () => ticketUrl(root, envelope.data.url),
        stop: () => stop(child),
      })
    })
    child.once('exit', (code) =>
      fail(new Error(`serve exited ${code}\n${stderr}`.trimEnd())),
    )
  })
}

/** Asks the running server for a redeem URL with the address file's token, the way a script would. */
async function ticketUrl(root: string, url: string): Promise<string> {
  const { token } = JSON.parse(
    await readFile(join(root, '.run', 'address.json'), 'utf8'),
  )
  const response = await fetch(`${url}/api/access/ticket`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
  return (await response.json()).data.url
}

function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve()
  const exited = new Promise<void>((done) => child.once('exit', () => done()))
  child.kill('SIGTERM')
  return exited
}
