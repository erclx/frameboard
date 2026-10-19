import type { Command } from 'commander'

import { resolveFrameRef } from '@/server/board/refs'
import { claim, readClaims, release } from '@/server/claims/store'
import type { Claim } from '@/shared/records/claims'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  type ProgramContext,
} from '../program'
import { DEFAULT_AGENT, SESSION_ENV, sessionOf, tagFor } from '../session'

interface EditingOptions extends CommonOptions {
  release?: boolean
  session?: string
  agent: string
}

export function registerEditing(
  program: Command,
  context: ProgramContext,
): void {
  const { io } = context
  const command = addVerb(
    program,
    'editing',
    'Claim a frame before rewriting it, so the board shows it and another session is told it is taken. Bare, list the live claims',
    { project: true },
  )
    .argument('[frame-ref]', 'the frame to claim, or to release')
    .option(
      '--release',
      "drop this session's claim on the frame, or every claim it holds",
    )
    .option(
      '--session <id>',
      `the session holding the claim, defaulting to ${SESSION_ENV}`,
    )
    .option(
      '--agent <name>',
      'the agent the board names, by its first letter',
      DEFAULT_AGENT,
    )

  act<EditingOptions>(command, context, async ([ref], options) => {
    const root = await boardOf(options, io)
    const now = new Date()

    if (options.release) {
      const session = sessionOf(options.session)
      const frame = ref
        ? await canonicalRef(root, ref, options, io.cwd)
        : undefined
      const released = await release(root, session, frame, now)
      return {
        data: { released },
        human:
          released.length === 0
            ? `${session} held no claim to release`
            : `Released ${released.map((each) => each.frame).join(', ')}`,
      }
    }

    if (ref) {
      const session = sessionOf(options.session)
      const frame = await canonicalRef(root, ref, options, io.cwd)
      const held = await claim(
        root,
        {
          frame,
          session,
          agent: options.agent,
          tag: tagFor(options.agent, session, io.cwd),
        },
        now,
      )
      return {
        data: { claim: held },
        human: `Editing ${frame} until ${held.expiresAt}. Claim it again within five minutes to keep it.`,
      }
    }

    const claims = await readClaims(root, now)
    return { data: { claims }, human: describe(claims, now) }
  })
}

/** `<project>/<page>/<frame>`, the one form a claim names a frame by. */
async function canonicalRef(
  root: string,
  ref: string,
  options: EditingOptions,
  cwd: string,
): Promise<string> {
  const frame = await resolveFrameRef(root, ref, {
    project: options.project,
    cwd,
  })
  return `${frame.project}/${frame.page}/${frame.name}`
}

function describe(claims: Claim[], now: Date): string {
  if (claims.length === 0) return 'No frame is claimed'
  return claims
    .map((each) => {
      const seconds = Math.round(
        (now.getTime() - Date.parse(each.claimedAt)) / 1000,
      )
      return `${each.frame}  ${each.tag}  editing ${seconds}s  ${each.session}`
    })
    .join('\n')
}
