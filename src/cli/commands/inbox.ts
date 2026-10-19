import type { Command } from 'commander'

import { resolveBoard } from '@/server/board/root'
import { queuedFor } from '@/server/notes/store'

import { follow } from '../inbox/follow'
import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  type ProgramContext,
} from '../program'
import { DEFAULT_AGENT, SESSION_ENV, sessionOf, tagFor } from '../session'

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
    const session = sessionOf(options.session)

    if (options.follow) {
      await follow({
        findRoot: () =>
          resolveBoard({ root: options.root, cwd: io.cwd }).catch(() => null),
        session,
        tag: tagFor(DEFAULT_AGENT, session, io.cwd),
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
