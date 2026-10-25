import type { Command } from 'commander'

import { findLiveServer } from '@/server/address'
import { FrameboardError } from '@/shared/errors'

import { postToBoard } from '../board-server'
import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  type ProgramContext,
} from '../program'

interface OpenOptions extends CommonOptions {
  open: boolean
}

export function registerOpen(program: Command, context: ProgramContext): void {
  const { io } = context
  const command = addVerb(
    program,
    'open',
    'Open a board tab that can edit, through a single-use link to the running server',
  ).option('--no-open', 'leave the browser alone and print the link')

  act<OpenOptions>(command, context, async (_args, options) => {
    const root = await boardOf(options, io)
    // Minting needs the address file's bearer, so a board with no server mints nothing.
    const live = await findLiveServer(root)
    if (!live) {
      throw new FrameboardError(
        'server-not-running',
        `No frameboard server is running for ${root}. Run frameboard serve first.`,
        { root },
      )
    }
    const { url: writeUrl, expiresAt } = (await postToBoard(
      live,
      '/api/access/ticket',
      {},
    )) as { url: string; expiresAt: string }

    if (options.open) io.openUrl(writeUrl)

    return {
      data: { url: live.url, writeUrl, expiresAt, opened: options.open },
      human: options.open
        ? `Opened a board tab that can edit ${live.url}`
        : `Open ${writeUrl} before ${expiresAt} to edit the board. The link works once.`,
    }
  })
}
