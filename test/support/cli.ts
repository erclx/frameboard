import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { runCli } from '../../src/cli/run'

export interface CliRun {
  exitCode: number
  stdout: string
  stderr: string
  /** stdout read as the one `--json` envelope it should hold. */
  json: () => {
    ok: boolean
    data?: unknown
    error?: { code: string; message: string; details: unknown }
  }
  opened: string[]
}

// A source run serves `dist/client`, which a checkout may not have built, so
// every in-process `serve` gets this stub in its place.
const STUB_CLIENT = mkdtempSync(join(tmpdir(), 'frameboard-stub-client-'))
writeFileSync(join(STUB_CLIENT, 'index.html'), '<title>Frameboard</title>')

/** Runs one command line in process, the way the bin does, collecting its output. */
export async function cli(
  argv: string[],
  {
    cwd,
    signal,
    clientDir = STUB_CLIENT,
  }: { cwd: string; signal?: AbortSignal; clientDir?: string },
): Promise<CliRun> {
  let stdout = ''
  let stderr = ''
  const opened: string[] = []
  const exitCode = await runCli(
    argv,
    {
      stdout: (text) => (stdout += text),
      stderr: (text) => (stderr += text),
      cwd,
      openUrl: (url) => opened.push(url),
      signal,
    },
    { clientDir },
  )
  return { exitCode, stdout, stderr, json: () => JSON.parse(stdout), opened }
}
