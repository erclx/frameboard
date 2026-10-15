import { fileURLToPath } from 'node:url'

import { Command, InvalidArgumentError } from 'commander'

import { startServer } from '@/server/start'
import { version } from '@/shared/version'

// The bundle lands at dist/cli.js, so the built client sits beside it.
const CLIENT_DIR = fileURLToPath(new URL('./client', import.meta.url))

export function parsePort(value: string): number {
  // Number() reads '' as 0 and accepts '1e3' or '0x10', so require plain digits.
  const port = /^\d+$/.test(value) ? Number(value) : Number.NaN
  if (!(port >= 0 && port <= 65535)) {
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
      const server = await startServer({
        clientDir: CLIENT_DIR,
        root: process.cwd(),
        port,
      })
      console.log(
        `Frameboard is serving on http://${server.hostname}:${server.port}`,
      )
    })

  return program
}
