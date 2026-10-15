import { spawn } from 'node:child_process'

import { runCli } from './run'

// Aborting lets a running serve remove its address file before the process ends.
const controller = new AbortController()
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => controller.abort())
}

process.exitCode = await runCli(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  cwd: process.cwd(),
  openUrl,
  signal: controller.signal,
})

function openUrl(url: string): void {
  const [command, ...args] =
    process.platform === 'darwin'
      ? ['open', url]
      : process.platform === 'win32'
        ? ['cmd', '/c', 'start', '""', url]
        : ['xdg-open', url]
  // A machine with no opener still serves, so a failed open is not an error.
  spawn(command, args, { detached: true, stdio: 'ignore' })
    .on('error', () => {})
    .unref()
}
