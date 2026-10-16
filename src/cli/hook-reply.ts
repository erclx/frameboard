import { existsSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

import { checkFrame } from '@/server/checks/frame'
import { formatFinding } from '@/server/checks/rule'
import {
  ASSETS_FOLDER,
  BOARD_FILE,
  FRAME_EXTENSION,
} from '@/shared/board-files'

/**
 * What the write hook prints for one hook payload: a `block` decision whose
 * reason lists the findings, which Claude Code hands the agent beside the
 * tool result, or null to print nothing. A write that is not a frame, a frame
 * outside any board, a file gone since, and a payload that does not read all
 * answer null, so the hook never reports a write as failed.
 *
 * Imports nothing beyond the rules and `src/shared/`, since process start is
 * the hook's whole budget on every agent write.
 */
export function hookReply(stdin: string): string | null {
  try {
    const target = frameOf(JSON.parse(stdin))
    if (!target) return null
    const { findings } = checkFrame(target)
    if (findings.length === 0) return null
    const ref = `${target.project}/${target.page}/${target.name}`
    const count = `${findings.length} finding${findings.length === 1 ? '' : 's'}`
    return JSON.stringify({
      decision: 'block',
      reason: [
        `frameboard check found ${count} in ${ref}. Fix each and write the frame again.`,
        ...findings.map(formatFinding),
      ].join('\n'),
    })
  } catch {
    return null
  }
}

/** The frame a payload wrote, when it sits in a page of a board. */
function frameOf(payload: unknown) {
  if (typeof payload !== 'object' || payload === null) return null
  const { tool_input: input, cwd } = payload as {
    tool_input?: { file_path?: unknown }
    cwd?: unknown
  }
  const written = input?.file_path
  if (typeof written !== 'string' || !written.endsWith(FRAME_EXTENSION)) {
    return null
  }
  const path = isAbsolute(written)
    ? written
    : resolve(typeof cwd === 'string' ? cwd : process.cwd(), written)
  const pageDir = dirname(path)
  const projectDir = dirname(pageDir)
  const root = dirname(projectDir)
  const page = basename(pageDir)
  const project = basename(projectDir)
  const name = basename(path).slice(0, -FRAME_EXTENSION.length)
  if (
    [project, page, name].some((part) => part.startsWith('.')) ||
    page === ASSETS_FOLDER ||
    !existsSync(path) ||
    !existsSync(join(root, BOARD_FILE))
  ) {
    return null
  }
  return { root, project, page, name }
}
