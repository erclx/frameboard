import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

import { checkFrame, readConfig } from '@/server/checks/frame'
import { formatFinding, withoutOff } from '@/server/checks/rule'
import {
  checkTransitionSheet,
  transitionPath,
} from '@/server/checks/transition-file'
import {
  ASSETS_FOLDER,
  BOARD_FILE,
  FRAME_EXTENSION,
} from '@/shared/board-files'
import {
  TRANSITION_FILE_EXTENSION,
  TRANSITIONS_FOLDER,
} from '@/shared/present-transition'
import type { Finding } from '@/shared/records/check'

/**
 * What the write hook prints for one hook payload: a `block` decision whose
 * reason lists the findings, which Claude Code hands the agent beside the
 * tool result, or null to print nothing. It answers a frame and a project's
 * transition file. Any other write, a file outside any board, a file gone
 * since, and a payload that does not read all answer null, so the hook
 * never reports a write as failed.
 *
 * Imports nothing beyond the rules and `src/shared/`, since process start is
 * the hook's whole budget on every agent write.
 */
export function hookReply(stdin: string): string | null {
  try {
    const path = writtenPath(JSON.parse(stdin))
    if (!path) return null
    const checked = frameFindings(path) ?? transitionFindings(path)
    if (!checked || checked.findings.length === 0) return null
    const { findings, subject, noun } = checked
    const count = `${findings.length} finding${findings.length === 1 ? '' : 's'}`
    return JSON.stringify({
      decision: 'block',
      reason: [
        `frameboard check found ${count} in ${subject}. Fix each and write the ${noun} again.`,
        ...findings.map(formatFinding),
      ].join('\n'),
    })
  } catch {
    return null
  }
}

interface Checked {
  findings: Finding[]
  /** What the reply names as checked, and the word it calls it by. */
  subject: string
  noun: string
}

/** The absolute path a payload wrote, null for a payload naming none. */
function writtenPath(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null
  const { tool_input: input, cwd } = payload as {
    tool_input?: { file_path?: unknown }
    cwd?: unknown
  }
  const written = input?.file_path
  if (typeof written !== 'string') return null
  return isAbsolute(written)
    ? written
    : resolve(typeof cwd === 'string' ? cwd : process.cwd(), written)
}

function frameFindings(path: string): Checked | null {
  const target = frameOf(path)
  if (!target) return null
  return {
    findings: checkFrame(target).findings,
    subject: `${target.project}/${target.page}/${target.name}`,
    noun: 'frame',
  }
}

/**
 * The findings of a stylesheet written directly under a project's
 * `assets/transitions/` in a board, null for any other path.
 */
function transitionFindings(path: string): Checked | null {
  if (!path.endsWith(TRANSITION_FILE_EXTENSION)) return null
  const folder = dirname(path)
  const assets = dirname(folder)
  const projectDir = dirname(assets)
  const root = dirname(projectDir)
  const project = basename(projectDir)
  const file = basename(path)
  if (
    basename(folder) !== TRANSITIONS_FOLDER ||
    basename(assets) !== ASSETS_FOLDER ||
    [project, file].some((part) => part.startsWith('.')) ||
    !existsSync(path) ||
    !existsSync(join(root, BOARD_FILE))
  ) {
    return null
  }
  const name = file.slice(0, -TRANSITION_FILE_EXTENSION.length)
  return {
    findings: withoutOff(
      checkTransitionSheet({ project, name }, readFileSync(path, 'utf8')),
      readConfig(root, project).off,
    ),
    subject: transitionPath(project, name),
    noun: 'file',
  }
}

/** The frame at `path`, when it sits in a page of a board. */
function frameOf(path: string) {
  if (!path.endsWith(FRAME_EXTENSION)) return null
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
