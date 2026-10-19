import { basename } from 'node:path'

import { FrameboardError } from '@/shared/errors'

/** The variable Claude Code sets to the session a command runs in. */
export const SESSION_ENV = 'CLAUDE_CODE_SESSION_ID'

/** The agent a verb names when `--agent` is absent. */
export const DEFAULT_AGENT = 'claude'

/** The session a verb acts for: its `--session` flag, else `SESSION_ENV`. */
export function sessionOf(flag: string | undefined): string {
  const session = flag ?? process.env[SESSION_ENV]
  if (!session) {
    throw new FrameboardError(
      'session-required',
      `Pass --session <id>, or run inside Claude Code, which sets ${SESSION_ENV}.`,
    )
  }
  return session
}

/**
 * What the board shows for a session: the agent and its project folder, as
 * the design labels it. Two listeners sharing one read apart by their ids,
 * which the server decides.
 */
export function tagFor(agent: string, session: string, cwd: string): string {
  const folder = basename(process.env.CLAUDE_PROJECT_DIR || cwd)
  return folder ? `${agent} · ${folder}` : session.slice(0, 6)
}
