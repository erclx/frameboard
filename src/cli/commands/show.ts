import type { Command } from 'commander'

import { findLiveServer } from '@/server/address'
import { resolveFrameRef, resolvePageRef } from '@/server/board/refs'
import { scanBoard } from '@/server/board/scan'
import { LOG_CAP } from '@/server/changes/tracker'
import { boardUrl } from '@/shared/board-urls'
import { FrameboardError } from '@/shared/errors'
import type { ChangeAuthor } from '@/shared/records/changes'

import { postToBoard } from '../board-server'
import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  type ProgramContext,
} from '../program'
import { DEFAULT_AGENT, SESSION_ENV, tagFor } from '../session'

interface ShowOptions extends CommonOptions {
  session?: string
  agent: string
}

export function registerShow(program: Command, context: ProgramContext): void {
  const { io } = context
  const command = addVerb(
    program,
    'show',
    'Point the open board at frames and mark each one for the developer to step through',
    { project: true },
  )
    .argument(
      '<refs...>',
      'frame refs, <page>/<frame> or <project>/<page>/<frame>, paths to .html files, or page refs, <page> or <project>/<page>, standing for every frame on the page',
    )
    .option(
      '--session <id>',
      `the session the marks name, defaulting to ${SESSION_ENV}`,
    )
    .option(
      '--agent <name>',
      'the agent the board names, by its first letter',
      DEFAULT_AGENT,
    )

  act<ShowOptions>(command, context, async (args, options) => {
    const root = await boardOf(options, io)
    const refs = await framesOf(root, args, options, io.cwd)
    if (refs.length > LOG_CAP) {
      throw new FrameboardError(
        'usage',
        `Show at most ${LOG_CAP} frames at once. These refs name ${refs.length}.`,
        { count: refs.length },
      )
    }
    const [first = ''] = refs
    const [project = '', page = ''] = first.split('/')

    // Showing needs a board to point, and starting a server is serve's job alone.
    const live = await findLiveServer(root)
    if (!live) {
      throw new FrameboardError(
        'server-not-running',
        `No frameboard server is running for ${root}. Run frameboard serve first.`,
        { root },
      )
    }
    const { tabs } = (await postToBoard(live, '/api/show', {
      refs,
      author: authorOf(options, io.cwd),
    })) as { tabs: number }

    const what = refs.length === 1 ? first : `${refs.length} frames`
    return {
      data: {
        ref: first,
        refs,
        url: `${live.url}${boardUrl(project, page)}`,
        tabs,
      },
      human:
        tabs > 0
          ? `Showing ${what} on the open board`
          : `No board tab is open to show ${what}. Run frameboard serve to open one.`,
    }
  })
}

/**
 * Each argument's canonical frame refs in the order given, a page standing
 * for its frames in board order, and a frame named twice kept at its first
 * place. An argument naming no frame and no page refuses the whole show
 * with the frame's error, so nothing is posted.
 */
async function framesOf(
  root: string,
  args: string[],
  options: ShowOptions,
  cwd: string,
): Promise<string[]> {
  const scope = { project: options.project, cwd }
  const refs: string[] = []
  for (const arg of args) {
    try {
      const frame = await resolveFrameRef(root, arg, scope)
      refs.push(`${frame.project}/${frame.page}/${frame.name}`)
    } catch (error) {
      if (!(error instanceof FrameboardError)) throw error
      const page = await resolvePageRef(root, arg, scope).catch(() => {
        throw error
      })
      const board = await scanBoard(root, { project: page.project })
      const listed = board.projects
        .find((each) => each.name === page.project)
        ?.pages.find((each) => each.name === page.page)
      refs.push(...(listed?.frames.map((frame) => frame.ref) ?? []))
    }
  }
  return [...new Set(refs)]
}

/** The session the marks name, or null when no session is known. */
function authorOf(options: ShowOptions, cwd: string): ChangeAuthor | null {
  const session = options.session ?? process.env[SESSION_ENV]
  if (!session) return null
  return {
    session,
    agent: options.agent,
    tag: tagFor(options.agent, session, cwd),
  }
}
