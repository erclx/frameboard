import { fileURLToPath } from 'node:url'

import { Command, InvalidArgumentError } from 'commander'

import { startServer } from '@/server/start'
import { version } from '@/shared/version'

// The bundle lands at dist/cli.js, so the built client sits beside it.
const CLIENT_DIR = fileURLToPath(new URL('./client', import.meta.url))

function parsePort(value: string): number {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new InvalidArgumentError('Expected a port between 0 and 65535.')
  }
  return port
}

export function createProgram(): Command {
  const program = new Command('frameboard').version(version)

  program
    .command('serve')
    .description('Serve the board in a local browser')
    .option('-p, --port <port>', 'port to listen on', parsePort, 4173)
    .action(async ({ port }: { port: number }) => {
      await startServer({ clientDir: CLIENT_DIR, port })
      console.log(`Frameboard is serving on http://localhost:${port}`)
    })

  return program
}
