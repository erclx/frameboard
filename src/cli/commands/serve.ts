import type { Command } from 'commander'

import {
  findLiveServer,
  newAddress,
  removeAddress,
  writeAddress,
} from '@/server/address'
import { startBoard } from '@/server/board/root'
import { startServer } from '@/server/start'

import {
  act,
  addVerb,
  type CommonOptions,
  parsePort,
  type ProgramContext,
} from '../program'

const DEFAULT_PORT = 4173
/** How long a fresh server waits for a board tab left open by its predecessor to reconnect. */
const RECONNECT_WAIT_MS = 1000

interface ServeOptions extends CommonOptions {
  port: number
  open: boolean
}

export function registerServe(
  program: Command,
  context: ProgramContext & { clientDir: string },
): void {
  const { io, clientDir } = context
  const command = addVerb(
    program,
    'serve',
    'Serve the board in a local browser',
  )
    .option(
      '-p, --port <port>',
      'port to listen on, falling back to a free one when the default is taken',
      parsePort,
      DEFAULT_PORT,
    )
    .option('--no-open', 'leave the browser alone')

  act<ServeOptions>(command, context, async (_args, options, self) => {
    const { root, created } = await startBoard({
      root: options.root,
      cwd: io.cwd,
    })

    const live = await findLiveServer(root)
    if (live) {
      return {
        data: {
          url: live.url,
          port: live.port,
          pid: live.pid,
          root,
          reused: true,
          created,
          opened: false,
        },
        human: `Frameboard is already serving ${root} on ${live.url}`,
      }
    }

    const server = await startServer({
      clientDir,
      root,
      port: options.port,
      strictPort: self.getOptionValueSource('port') !== 'default',
    })
    const address = newAddress({
      root,
      host: server.hostname,
      port: server.port,
    })
    await writeAddress(root, address)
    io.signal?.addEventListener(
      'abort',
      () => void removeAddress(root, address.token).finally(server.close),
      { once: true },
    )

    let opened = false
    if (options.open && !(await server.tabs.waitForOne(RECONNECT_WAIT_MS))) {
      io.openUrl(address.url)
      opened = true
    }

    return {
      data: {
        url: address.url,
        port: address.port,
        pid: address.pid,
        root,
        reused: false,
        created,
        opened,
      },
      human: `Frameboard is serving ${root} on ${address.url}`,
    }
  })
}
