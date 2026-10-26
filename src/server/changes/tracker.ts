import { readFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import { FRAME_EXTENSION } from '@/shared/board-files'
import type { FrameChange } from '@/shared/records/changes'
import type { Claim } from '@/shared/records/claims'
import type { ListResult } from '@/shared/records/list'

import { listFrames } from '../board/scan'
import { contentHash } from '../edit/address'
import type { Step } from '../history/stack'
import { changedElements } from './diff'

/** The changes the log keeps, the oldest dropped past it. */
export const LOG_CAP = 200
/**
 * How many batches a frame that left the board stays matchable by its hash,
 * so a rename whose removal and arrival land in neighboring batches reads as
 * a move rather than a new frame.
 */
const DEPARTED_BATCHES = 4

export interface ChangeTracker {
  /** Holds every frame's source as the start scan found it. */
  prime: (board: ListResult) => Promise<void>
  /**
   * Rereads the frames a board write left, so its batch reads as nothing
   * new, and withdraws a held change the write's batch reached it with first.
   */
  own: (step: Step) => Promise<void>
  /** The changes one watch batch carried, held until `settle`. */
  update: (
    board: ListResult,
    paths: string[],
    claims: Claim[],
  ) => Promise<FrameChange[]>
  /** Logs the held changes `own` has not withdrawn since, and answers them. */
  settle: (changes: readonly FrameChange[]) => FrameChange[]
  /** The recent settled changes, oldest first. */
  log: () => FrameChange[]
  /**
   * The source a frame held under `hash` before an agent's write replaced
   * it, kept while a logged change names it as `before`, else null.
   */
  version: (ref: string, hash: string) => string | null
}

interface Held {
  source: string
  hash: string
}

/**
 * Tells an agent's frame writes from the board's own. It holds each frame's
 * source by ref, so a batch whose file matches what it holds is a write the
 * history already told it of, or no write at all, and one that differs is an
 * agent's, diffed against the source it held. Every caller runs in the
 * server's scan turn, since `own` and a batch reading one frame would race.
 */
export function createChangeTracker(
  root: string,
  {
    now = () => new Date(),
    logCap = LOG_CAP,
  }: { now?: () => Date; logCap?: number } = {},
): ChangeTracker {
  const held = new Map<string, Held>()
  /** Hashes of frames that left the board, with the batch they left in. */
  const departed = new Map<string, number>()
  const changes: FrameChange[] = []
  /** Changes a batch found that `own` may still withdraw, by id. */
  const pending = new Map<string, FrameChange>()
  /** The sources agent writes replaced, by `versionKey`, in memory alone. */
  const versions = new Map<string, string>()
  let batches = 0
  let nextId = 1

  const read = async (path: string): Promise<Held | null> => {
    try {
      const source = await readFile(path, 'utf8')
      return { source, hash: contentHash(source) }
    } catch {
      // A frame removed since the batch named it has nothing to hold.
      return null
    }
  }

  const hold = async (ref: string, path: string) => {
    const file = await read(path)
    if (file) held.set(ref, file)
    else held.delete(ref)
  }

  return {
    prime: async (board) => {
      await Promise.all(framesOf(board).map(({ ref, path }) => hold(ref, path)))
    },

    own: async (step) => {
      const refs = new Set(step.frames)
      const pages = [step.page?.before, step.page?.after].filter(
        (page): page is string => typeof page === 'string',
      )
      for (const page of new Set(pages)) {
        let names: string[]
        try {
          names = await listFrames(join(root, ...page.split('/')))
        } catch {
          // The page this step left has no folder.
          continue
        }
        for (const name of names) refs.add(`${page}/${name}`)
      }
      await Promise.all(
        [...refs].map((ref) =>
          hold(ref, join(root, ...ref.split('/')) + FRAME_EXTENSION),
        ),
      )
      // A write slower than the batch window reached `update` first. Only a
      // step that wrote the frame's file claims it, since one that moved the
      // frame or named its page leaves the agent's bytes in place.
      const written = writtenPaths(step)
      for (const [id, change] of pending) {
        const file = join(root, ...change.frame.split('/')) + FRAME_EXTENSION
        if (
          written.some(
            (path) => file === path || file.startsWith(path + sep),
          ) &&
          held.get(change.frame)?.hash === change.hash
        ) {
          pending.delete(id)
        }
      }
    },

    update: async (board, paths, claims) => {
      batches += 1
      const frames = framesOf(board)
      const present = new Set(frames.map(({ ref }) => ref))
      for (const [ref, file] of held) {
        if (present.has(ref)) continue
        held.delete(ref)
        departed.set(file.hash, batches)
      }
      for (const [hash, batch] of departed) {
        if (batches - batch > DEPARTED_BATCHES) departed.delete(hash)
      }

      const named = framesNamed(root, paths)
      const candidates = frames.filter(
        ({ ref }) => named.has(ref) || !held.has(ref),
      )
      const at = now().toISOString()
      const found: FrameChange[] = []
      for (const { ref, path } of candidates) {
        const file = await read(path)
        if (!file) continue
        const before = held.get(ref)
        held.set(ref, file)
        if (before?.hash === file.hash) continue
        if (!before && departed.has(file.hash)) {
          departed.delete(file.hash)
          continue
        }
        const diff = changedElements(before?.source ?? '', file.source)
        const claim = claims.find((entry) => entry.frame === ref)
        if (before) versions.set(versionKey(ref, before.hash), before.source)
        found.push({
          id: `c${nextId++}`,
          frame: ref,
          at,
          hash: file.hash,
          author: claim
            ? { session: claim.session, agent: claim.agent, tag: claim.tag }
            : null,
          elements: diff.elements,
          removed: diff.removed,
          whole: !before || diff.whole,
          created: !before,
          ...(before ? { before: before.hash } : {}),
        })
      }
      for (const change of found) pending.set(change.id, change)
      return found
    },

    settle: (held) => {
      const kept = held.filter((change) => pending.delete(change.id))
      changes.push(...kept)
      if (changes.length > logCap) changes.splice(0, changes.length - logCap)
      // A version leaves with the last change naming it, so the cap bounds memory.
      const named = new Set(
        [...changes, ...pending.values()].flatMap((change) =>
          change.before ? [versionKey(change.frame, change.before)] : [],
        ),
      )
      for (const key of versions.keys()) {
        if (!named.has(key)) versions.delete(key)
      }
      return kept
    },

    log: () => [...changes],

    version: (ref, hash) => versions.get(versionKey(ref, hash)) ?? null,
  }
}

function versionKey(ref: string, hash: string): string {
  return `${ref}\n${hash}`
}

/** The files and folders a step wrote, being every rewrite, creation, removal, and move. */
function writtenPaths(step: Step): string[] {
  return step.changes.flatMap((change) => {
    if (
      change.kind === 'element' ||
      change.kind === 'inserted' ||
      change.kind === 'relocated' ||
      change.kind === 'path'
    )
      return [change.path]
    if (change.kind === 'moved') return [change.from, change.to]
    return []
  })
}

function framesOf(board: ListResult): { ref: string; path: string }[] {
  return board.projects.flatMap((project) =>
    project.pages.flatMap((page) =>
      page.frames.map((frame) => ({ ref: frame.ref, path: frame.path })),
    ),
  )
}

/**
 * The frame refs whose own file a batch names, or a temp file it is saved
 * through such as `hero.html.swap`. An asset or a token sheet names none,
 * since a frame it reloads is not one an agent wrote.
 */
function framesNamed(root: string, paths: string[]): Set<string> {
  const refs = new Set<string>()
  for (const path of paths) {
    const parts = relative(root, path).split(sep)
    const [project, page, file] = parts
    if (parts.length !== 3 || !project || !page || !file) continue
    const end = file.indexOf(FRAME_EXTENSION)
    if (end <= 0) continue
    const rest = file.slice(end + FRAME_EXTENSION.length)
    if (rest !== '' && !rest.startsWith('.')) continue
    refs.add(`${project}/${page}/${file.slice(0, end)}`)
  }
  return refs
}
