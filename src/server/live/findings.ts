import { relative, sep } from 'node:path'

import {
  checkFrameIn,
  type ProjectContext,
  readConfig,
  readProjectContext,
} from '@/server/checks/frame'
import { withoutOff } from '@/server/checks/rule'
import { PROJECT_FILE } from '@/shared/board-files'
import type { Finding } from '@/shared/records/check'
import type { FrameRecord, ListResult } from '@/shared/records/list'

import type { Kept, RememberedFrame } from './remembered'
import { reloadRefs } from './watch'

/** Findings, under the key of what they were read from once one is known. */
type Held = Omit<Kept, 'key'> & Partial<Pick<Kept, 'key'>>

export interface BoardFindings {
  /**
   * Holds what a previous server left for the frames `board` still holds, as
   * though checked here, so nothing is sent and nothing rechecked.
   */
  prime: (
    board: ListResult,
    stored: Readonly<
      Record<string, Pick<RememberedFrame, 'checks' | 'rendered'>>
    >,
  ) => void
  /** The results held under a key, which the next start can prime. */
  kept: () => Record<string, Pick<RememberedFrame, 'checks' | 'rendered'>>
  /** Every frame's findings by ref, as a board client's hello receives them. */
  all: () => Record<string, Finding[]>
  /**
   * Rechecks `refs` and drops those `board` no longer holds. Returns each rechecked ref's findings, an
   * empty list clearing a frame, which is the partial map a batch sends.
   * `keys` names what each was read from, and a result with none is not kept.
   */
  update: (
    board: ListResult,
    refs: readonly string[],
    keys?: ReadonlyMap<string, string>,
  ) => Record<string, Finding[]>
  /**
   * Holds a frame's browser findings beside its static ones, sending nothing
   * until the static ones land, and kept as `update` keeps one.
   */
  setRendered: (
    ref: string,
    findings: Finding[],
    key?: string,
  ) => Record<string, Finding[]>
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
 * The board's findings, held between batches so a hello needs no check, and
 * filtered by `checks.off` at read, so a rule turned back on returns its
 * findings with no write to the frame.
 */
export function createBoardFindings(
  root: string,
  tokens: string | null = null,
): BoardFindings {
  const held = new Map<string, Held>()
  const change = new Map<string, Finding[]>()
  const browser = new Map<string, Held>()
  /** Each project's `checks.off` as its last recheck read it. */
  const off = new Map<string, readonly string[] | undefined>()
  const on = (ref: string, list: Finding[] | undefined) =>
    withoutOff(list ?? [], off.get(projectOf(ref)))
  const merged = (ref: string, own: Held) => [
    ...own.findings,
    ...on(ref, change.get(ref)),
    ...on(ref, browser.get(ref)?.findings),
  ]

  return {
    prime: (board, stored) => {
      for (const project of board.projects) {
        // A project with nothing to recheck never reads its config in `update`.
        off.set(project.name, readConfig(root, project.name).off)
      }
      for (const ref of framesOf(board).keys()) {
        const { checks, rendered } = stored[ref] ?? {}
        if (checks) held.set(ref, checks)
        if (rendered) browser.set(ref, rendered)
      }
    },
    kept: () => {
      const frames: ReturnType<BoardFindings['kept']> = {}
      for (const [ref, { key, findings }] of held) {
        if (key !== undefined) frames[ref] = { checks: { key, findings } }
      }
      for (const [ref, { key, findings }] of browser) {
        if (key === undefined) continue
        frames[ref] = { ...frames[ref], rendered: { key, findings } }
      }
      return frames
    },
    all: () =>
      Object.fromEntries(
        [...held].map(([ref, own]) => [ref, merged(ref, own)]),
      ),
    setRendered: (ref, findings, key) => {
      browser.set(ref, { findings, key })
      const own = held.get(ref)
      return own ? { [ref]: merged(ref, own) } : {}
    },
    rendered: (refs) =>
      Object.fromEntries(
        refs.map((ref) => [ref, on(ref, browser.get(ref)?.findings)]),
      ),
    setChanged: (ref, findings) => {
      change.set(ref, findings)
      const own = held.get(ref)
      return own ? { [ref]: merged(ref, own) } : {}
    },
    changed: (refs) =>
      Object.fromEntries(refs.map((ref) => [ref, on(ref, change.get(ref))])),
    update: (board, refs, keys) => {
      const frames = framesOf(board)
      for (const ref of [...held.keys(), ...change.keys(), ...browser.keys()]) {
        if (!frames.has(ref)) {
          held.delete(ref)
          change.delete(ref)
          browser.delete(ref)
        }
      }
      const contexts = new Map<string, ProjectContext>()
      const changed: Record<string, Finding[]> = {}
      for (const ref of refs) {
        const frame = frames.get(ref)
        if (!frame) continue
        let context = contexts.get(frame.project)
        if (!context) {
          context = readProjectContext(root, frame.project, tokens)
          contexts.set(frame.project, context)
          off.set(frame.project, context.config.off)
        }
        const findings = checkOne(root, frame, context)
        if (findings === null) continue
        const own = { findings, key: keys?.get(ref) }
        held.set(ref, own)
        changed[ref] = merged(ref, own)
      }
      return changed
    },
  }
}

/**
 * The frames a batch changed the findings of, adding those a check config
 * reaches, which the reload rule leaves alone since it renders nothing.
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

/** The project a frame ref `<project>/<page>/<frame>` sits in. */
function projectOf(ref: string): string {
  return ref.slice(0, ref.indexOf('/'))
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
