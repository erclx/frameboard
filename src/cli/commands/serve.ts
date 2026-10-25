import { statSync } from 'node:fs'
import { resolve } from 'node:path'

import type { Command } from 'commander'

import {
  findLiveServer,
  newAddress,
  removeAddress,
  writeAddress,
} from '@/server/address'
import { startBoard } from '@/server/board/root'
import { openBoard } from '@/server/live/open-board'
import { startServer } from '@/server/start'
import { FrameboardError } from '@/shared/errors'

import { postToBoard } from '../board-server'
import {
  act,
  addVerb,
  type CommonOptions,
  parsePort,
  type ProgramContext,
} from '../program'

const DEFAULT_PORT = 4173
/** How long a fresh server waits for a writing board tab left open by its predecessor to reconnect. */
const RECONNECT_WAIT_MS = 1000

interface ServeOptions extends CommonOptions {
  port: number
  open: boolean
  tokens?: string
}

export function registerServe(
  program: Command,
  context: ProgramContext & { clientDir: string; facesDir: string },
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
    .option(
      '--tokens <path>',
      "a token sheet another tool manages, standing in for the board's tokens.css",
    )

  act<ServeOptions>(command, context, async (_args, options, self) => {
    const tokens =
      options.tokens === undefined ? undefined : resolve(io.cwd, options.tokens)
    if (tokens !== undefined && !isFile(tokens)) {
      throw new FrameboardError(
        'tokens-not-found',
        `No token sheet at ${tokens}.`,
        { tokens },
      )
    }
    const { root, created } = await startBoard({
      root: options.root,
      cwd: io.cwd,
    })

    const live = await findLiveServer(root)
    if (live) {
      // The live server owns the tabs, so it decides whether one needs opening.
      const opened =
        options.open &&
        (
          (await postToBoard(live, '/api/open', {}).catch(() => null)) as {
            opened?: boolean
          } | null
        )?.opened === true
      return {
        data: {
          url: live.url,
          port: live.port,
          pid: live.pid,
          root,
          reused: true,
          // The running server keeps the sheet it started with, so a different
          // --tokens shows here as a mismatch rather than a second server.
          tokens: live.tokens ?? null,
          created,
          opened,
        },
        human: `Frameboard is already serving ${root} on ${live.url}`,
      }
    }

    const server = await startServer({
      clientDir,
      facesDir: context.facesDir,
      root,
      tokens,
      port: options.port,
      strictPort: self.getOptionValueSource('port') !== 'default',
      openUrl: io.openUrl,
    })
    const address = newAddress({
      root,
      host: server.hostname,
      port: server.port,
      tokens,
    })
    await writeAddress(root, address)
    server.authorize(address.token)
    io.signal?.addEventListener(
      'abort',
      () => void removeAddress(root, address.token).finally(server.close),
      { once: true },
    )

    const opened =
      options.open &&
      (await openBoard({
        tabs: server.tabs,
        url: server.boardUrl,
        open: io.openUrl,
        graceMs: RECONNECT_WAIT_MS,
      }))

    return {
      data: {
        url: address.url,
        port: address.port,
        pid: address.pid,
        root,
        reused: false,
        tokens: tokens ?? null,
        created,
        opened,
      },
      human: `Frameboard is serving ${root} on ${address.url}`,
    }
  })
}

/** True for a file, and false for a folder or a path that does not exist. */
function isFile(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isFile() ?? false
}
