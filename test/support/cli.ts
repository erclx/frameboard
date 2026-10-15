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

/** Runs one command line in process, the way the bin does, collecting its output. */
export async function cli(
  argv: string[],
  { cwd, signal }: { cwd: string; signal?: AbortSignal },
): Promise<CliRun> {
  let stdout = ''
  let stderr = ''
  const opened: string[] = []
  const exitCode = await runCli(argv, {
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
    cwd,
    openUrl: (url) => opened.push(url),
    signal,
  })
  return { exitCode, stdout, stderr, json: () => JSON.parse(stdout), opened }
}
