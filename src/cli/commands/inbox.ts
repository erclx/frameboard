import { basename } from 'node:path'

import type { Command } from 'commander'

import { resolveBoard } from '@/server/board/root'
import { queuedFor } from '@/server/notes/store'
import { FrameboardError } from '@/shared/errors'

import { follow } from '../inbox/follow'
import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  type ProgramContext,
} from '../program'
import { SESSION_ENV } from './notes'

interface InboxOptions extends CommonOptions {
  session?: string
  follow?: boolean
}

export function registerInbox(program: Command, context: ProgramContext): void {
  const { io } = context
  const command = addVerb(
    program,
    'inbox',
    "Print the notes the board sent to this session, one line each, opening with 'frameboard note'",
  )
    .option(
      '--session <id>',
      `the session the notes were sent to, defaulting to ${SESSION_ENV}`,
    )
    .option(
      '--follow',
      'keep running and print each note as the board sends it, waiting quietly for a board and a server',
    )

  act<InboxOptions>(command, context, async (_args, options) => {
    const session = options.session ?? process.env[SESSION_ENV]
    if (!session) {
      throw new FrameboardError(
        'session-required',
        `Pass --session <id>, or run inside Claude Code, which sets ${SESSION_ENV}.`,
      )
    }

    if (options.follow) {
      await follow({
        findRoot: () =>
          resolveBoard({ root: options.root, cwd: io.cwd }).catch(() => null),
        session,
        tag: tagFor(session, io.cwd),
        print: (note) =>
          io.stdout(
            options.json ? `${JSON.stringify(note)}\n` : `${note.line}\n`,
          ),
        signal: io.signal ?? new AbortController().signal,
      })
      return { data: { session }, human: `Stopped following ${session}` }
    }

    const queued = await queuedFor(await boardOf(options, io), session)
    return {
      data: { session, notes: queued },
      human:
        queued.length === 0
          ? `No notes queued to ${session}`
          : queued.map((delivery) => delivery.line).join('\n'),
    }
  })
}

/**
 * What the board shows for a listener: the agent and its project folder, as
 * the design labels it. Two listeners sharing one read apart by their ids,
 * which the server decides.
 */
function tagFor(session: string, cwd: string): string {
  const folder = basename(process.env.CLAUDE_PROJECT_DIR || cwd)
  return folder ? `claude · ${folder}` : session.slice(0, 6)
}
