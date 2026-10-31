import { relative, sep } from 'node:path'

import {
  checkFrameIn,
  type ProjectContext,
  readProjectContext,
} from '@/server/checks/frame'
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
  /**
   * Holds a frame's browser findings beside its static ones, returning the
   * frame's merged list as a partial map. A frame whose static findings have
   * not landed yet, as one the watcher has not batched, is held and sent
   * nothing until they do.
   */
  setRendered: (ref: string, findings: Finding[]) => Record<string, Finding[]>
  /** The browser findings held for each of `refs`, an unchecked one as empty. */
  rendered: (refs: string[]) => Record<string, Finding[]>
  /**
   * Holds the findings an agent's latest write to a frame raised against the
   * bytes it replaced, in place of its previous write's, returning the
   * frame's merged list as `setRendered` does.
   */
  setChanged: (ref: string, findings: Finding[]) => Record<string, Finding[]>
  /** The change findings held for each of `refs`, a frame with none as empty. */
  changed: (refs: string[]) => Record<string, Finding[]>
}

/**
 * The board's check findings, held between batches so a hello needs no
 * check. Each frame's list is its static findings, then those its last agent
 * write raised against the bytes it replaced, then the browser findings the
 * server's warm checker last landed for it. `tokens` is the
 * server's `--tokens` sheet, null for none.
 */
export function createBoardFindings(
  root: string,
  tokens: string | null = null,
): BoardFindings {
  const held = new Map<string, Finding[]>()
  const change = new Map<string, Finding[]>()
  const browser = new Map<string, Finding[]>()
  const merged = (ref: string, own: Finding[]) => [
    ...own,
    ...(change.get(ref) ?? []),
    ...(browser.get(ref) ?? []),
  ]

  return {
    all: () =>
      Object.fromEntries(
        [...held].map(([ref, own]) => [ref, merged(ref, own)]),
      ),
    setRendered: (ref, findings) => {
      browser.set(ref, findings)
      const own = held.get(ref)
      return own ? { [ref]: merged(ref, own) } : {}
    },
    rendered: (refs) =>
      Object.fromEntries(refs.map((ref) => [ref, browser.get(ref) ?? []])),
    setChanged: (ref, findings) => {
      change.set(ref, findings)
      const own = held.get(ref)
      return own ? { [ref]: merged(ref, own) } : {}
    },
    changed: (refs) =>
      Object.fromEntries(refs.map((ref) => [ref, change.get(ref) ?? []])),
    update: (board, paths) => {
      const frames = framesOf(board)
      for (const ref of [...held.keys(), ...change.keys(), ...browser.keys()]) {
        if (!frames.has(ref)) {
          held.delete(ref)
          change.delete(ref)
          browser.delete(ref)
        }
      }
      const refs =
        paths === 'all'
          ? [...frames.keys()]
          : recheckRefs(root, paths, board, tokens)
      const contexts = new Map<string, ProjectContext>()
      const changed: Record<string, Finding[]> = {}
      for (const ref of refs) {
        const frame = frames.get(ref)
        if (!frame) continue
        let context = contexts.get(frame.project)
        if (!context) {
          context = readProjectContext(root, frame.project, tokens)
          contexts.set(frame.project, context)
        }
        const findings = checkOne(root, frame, context)
        if (findings === null) continue
        held.set(ref, findings)
        changed[ref] = merged(ref, findings)
      }
      return changed
    },
  }
}

/**
 * The frames a batch changed the findings of: every frame whose rendered
 * inputs changed, token sheets among them, plus every frame a project's
 * check config reaches, which the reload rule leaves alone since it renders
 * nothing.
 */
export function recheckRefs(
  root: string,
  paths: string[],
  board: ListResult,
  tokens: string | null = null,
): string[] {
  const refs = new Set(reloadRefs(root, paths, board, tokens))
  for (const path of paths) {
    const parts = relative(root, path).split(sep)
    const [first, second] = parts
    if (parts.length !== 2 || second !== PROJECT_FILE) continue
    for (const project of board.projects) {
      if (project.name !== first) continue
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
