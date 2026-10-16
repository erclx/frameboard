import { relative, sep } from 'node:path'

import {
  checkFrameIn,
  type ProjectContext,
  readProjectContext,
} from '@/server/checks/frame'
import { TOKEN_FILE } from '@/server/checks/tokens'
import { PROJECT_FILE } from '@/shared/board-files'
import type { Finding } from '@/shared/records/check'
import type { FrameRecord, ListResult } from '@/shared/records/list'

import { reloadRefs } from './watch'

export interface BoardFindings {
  /** Every frame's findings by ref, as a board client's hello receives them. */
  all: () => Record<string, Finding[]>
  /**
   * Rechecks the frames `paths` changed, or every frame for `'all'`, and drops
   * refs `board` no longer holds. Returns each rechecked ref's findings, an
   * empty list clearing a frame, which is the partial map a batch sends.
   */
  update: (
    board: ListResult,
    paths: string[] | 'all',
  ) => Record<string, Finding[]>
}

/** The board's check findings, held between batches so a hello needs no check. */
export function createBoardFindings(root: string): BoardFindings {
  const held = new Map<string, Finding[]>()

  return {
    all: () => Object.fromEntries(held),
    update: (board, paths) => {
      const frames = framesOf(board)
      for (const ref of held.keys()) {
        if (!frames.has(ref)) held.delete(ref)
      }
      const refs =
        paths === 'all' ? [...frames.keys()] : recheckRefs(root, paths, board)
      const contexts = new Map<string, ProjectContext>()
      const changed: Record<string, Finding[]> = {}
      for (const ref of refs) {
        const frame = frames.get(ref)
        if (!frame) continue
        let context = contexts.get(frame.project)
        if (!context) {
          context = readProjectContext(root, frame.project)
          contexts.set(frame.project, context)
        }
        const findings = checkOne(root, frame, context)
        if (findings === null) continue
        held.set(ref, findings)
        changed[ref] = findings
      }
      return changed
    },
  }
}

/**
 * The frames a batch changed the findings of: every frame whose rendered
 * inputs changed, plus every frame a token sheet or a project's check config
 * reaches, which the reload rule leaves alone since neither renders by itself.
 */
export function recheckRefs(
  root: string,
  paths: string[],
  board: ListResult,
): string[] {
  const refs = new Set(reloadRefs(root, paths, board))
  for (const path of paths) {
    const parts = relative(root, path).split(sep)
    const [first, second] = parts
    const everyProject = parts.length === 1 && first === TOKEN_FILE
    const oneProject =
      parts.length === 2 && (second === TOKEN_FILE || second === PROJECT_FILE)
    for (const project of board.projects) {
      if (!everyProject && !(oneProject && project.name === first)) continue
      for (const page of project.pages) {
        for (const frame of page.frames) refs.add(frame.ref)
      }
    }
  }
  return [...refs]
}

function framesOf(board: ListResult): Map<string, FrameRecord> {
  const frames = new Map<string, FrameRecord>()
  for (const project of board.projects) {
    for (const page of project.pages) {
      for (const frame of page.frames) frames.set(frame.ref, frame)
    }
  }
  return frames
}

/** A frame's findings, or null for one removed between the scan and the check. */
function checkOne(
  root: string,
  frame: FrameRecord,
  context: ProjectContext,
): Finding[] | null {
  try {
    return checkFrameIn(
      { root, project: frame.project, page: frame.page, name: frame.name },
      context,
    )
  } catch {
    return null
  }
}
