import { existsSync } from 'node:fs'
import { basename, dirname, isAbsolute, relative, sep } from 'node:path'

import { withLocks } from '@/server/board/json-record'
import { keepingTimes } from '@/server/board/projects'
import { FRAME_EXTENSION } from '@/shared/board-files'
import { FrameboardError } from '@/shared/errors'

import {
  type Change,
  holds,
  lockPaths,
  restore,
  type Side,
  StepJournal,
} from './changes'

/** The steps the stacks hold at most, the oldest dropped past it. */
export const HISTORY_CAP = 100

/** One board write as the history holds it. */
export interface Step {
  /** The id the step's journal took, naming its trash folder. */
  id: number
  changes: Change[]
  /** The page ref the board shows with the step undone, and with it done, when the step moves it. */
  page: { before: string | null; after: string | null } | null
  /** The frame refs the step touched, as the board shows them. */
  frames: string[]
  /** The project name, page ref, or frame ref on each side, when the step only renamed it, so the board keeps what it shows. */
  renamed?: { before: string; after: string }
}

/** What an undo or redo answers, so the board can follow what it changed. */
export interface StepAnswer {
  /** The page to show now, or null to stay where the board is. */
  page: string | null
  frames: string[]
  /** Each hand-edited frame's content hash as the step left it, by ref, so the board keeps an element selected. */
  hashes?: Record<string, string>
}

/** Checks the refs a step would write before it is taken, throwing to keep it. */
export type Gate = (refs: string[]) => Promise<void>

const OPEN: Gate = async () => {}

export interface HistoryCounts {
  undo: number
  redo: number
}

/**
 * The developer's undo and redo stacks, in memory, holding the board's own
 * writes and never an agent's. Undo and redo run one at a time, each
 * checking every change of a step under its records' locks before writing
 * any, and refusing with `undo-overtaken` and dropping the step when an
 * agent has since changed one.
 */
export class History {
  #undo: Step[] = []
  #redo: Step[] = []
  #nextId = 1
  #turn: Promise<unknown> = Promise.resolve()

  constructor(
    readonly root: string,
    readonly onChange: (counts: HistoryCounts) => void = () => {},
    /** Told each step once it is written, by a record, an undo, or a redo, with the side it left. */
    readonly onWrite: (step: Step, side: Side) => void = () => {},
  ) {}

  counts(): HistoryCounts {
    return { undo: this.#undo.length, redo: this.#redo.length }
  }

  /** A journal for one write, to pass into the board verb and then record. */
  journal(): StepJournal {
    return new StepJournal(this.root, this.#nextId++)
  }

  /** Pushes a write's step, clearing redo. A write that changed nothing records nothing. */
  record(step: Step): void {
    if (step.changes.length === 0) return
    this.#undo.push(step)
    if (this.#undo.length > HISTORY_CAP) this.#undo.shift()
    this.#redo = []
    this.onChange(this.counts())
    this.onWrite(step, 'after')
  }

  /**
   * The refs the top undo or redo step would write, without popping it, so a
   * route can refuse a claimed frame before the step is taken. These are the
   * step's frames, and the page or project folder and frame file each move
   * or removal names, since a page or project step names no frames.
   */
  peek(side: 'undo' | 'redo'): string[] {
    const step = (side === 'undo' ? this.#undo : this.#redo).at(-1)
    if (!step) return []
    const paths = step.changes.flatMap((change) => {
      if (change.kind === 'moved') return [change.from, change.to]
      if (change.kind === 'path') return [change.path]
      return []
    })
    const refs = paths.flatMap((path) => {
      const inBoard = relative(this.root, path)
      if (inBoard === '' || inBoard.startsWith('..') || isAbsolute(inBoard)) {
        return []
      }
      const ref = inBoard.split(sep).join('/')
      return [
        ref.endsWith(FRAME_EXTENSION)
          ? ref.slice(0, -FRAME_EXTENSION.length)
          : ref,
      ]
    })
    return [...new Set([...step.frames, ...refs])]
  }

  /**
   * Undoes the top step. `gate` reads what `peek` names of that step in turn,
   * before it is taken, so a refusal it throws leaves the step on its stack
   * and a quick second undo never checks one step and takes another.
   */
  undo(gate: Gate = OPEN): Promise<StepAnswer> {
    return this.#inTurn(() =>
      this.#move(this.#undo, this.#redo, 'before', gate),
    )
  }

  /** Redoes the top step, gated as `undo` is. */
  redo(gate: Gate = OPEN): Promise<StepAnswer> {
    return this.#inTurn(() => this.#move(this.#redo, this.#undo, 'after', gate))
  }

  /** Takes the top step of `from`, writes `to` side of it, and pushes it onto `onto`. */
  async #move(
    from: Step[],
    onto: Step[],
    to: Side,
    gate: Gate,
  ): Promise<StepAnswer> {
    const empty = () =>
      new FrameboardError(
        'nothing-to-undo',
        `There is nothing to ${to === 'before' ? 'undo' : 'redo'}.`,
      )
    if (from.length === 0) throw empty()
    await gate(this.peek(from === this.#undo ? 'undo' : 'redo'))
    const step = from.pop()
    if (!step) throw empty()
    const was: Side = to === 'before' ? 'after' : 'before'
    const standing = step.changes.map((change, index) =>
      standingAt(change, step.changes.slice(index + 1), was),
    )
    // A record inside a folder an agent removed has no folder to lock in, and
    // its change cannot hold, so the check refuses it unlocked. One inside a
    // folder the step moves goes unlocked too, as the move does, since its
    // lock file would move with the folder and outlive the release.
    const hashes: Record<string, string> = {}
    const moves = step.changes.flatMap((change) =>
      change.kind === 'moved' ? [change.from, change.to] : [],
    )
    const locks = standing
      .flatMap(lockPaths)
      .filter((path) => existsSync(dirname(path)))
      .filter((path) => !moves.some((folder) => path.startsWith(folder + sep)))
    // A filing is not an edit to the project, so neither is its undo. Each
    // file's time is kept where it stands now and put back where the step
    // leaves it, which differ for a title that moved its folder.
    const landing = new Map(
      standing.flatMap((change, index) =>
        change.kind === 'project'
          ? [
              [
                change.file,
                standingAt(
                  step.changes[index] ?? change,
                  step.changes.slice(index + 1),
                  to,
                ),
              ] as const,
            ]
          : [],
      ),
    )
    const timed = [...landing.keys()]
    const landed = (file: string) => {
      const change = landing.get(file)
      return change?.kind === 'project' ? change.file : file
    }
    try {
      await keepingTimes(
        timed,
        (keep) =>
          withLocks(locks, async () => {
            for (const change of standing) {
              if (!(await holds(change, was))) {
                throw new FrameboardError(
                  'undo-overtaken',
                  `An agent changed ${nameOf(change)} after your edit, so that step was dropped.`,
                  { change: change.kind },
                )
              }
            }
            for (const file of timed) await keep(file)
            const ordered =
              to === 'before' ? [...step.changes].reverse() : step.changes
            for (const change of ordered) {
              const hash = await restore(change, to)
              if (hash !== undefined && 'ref' in change)
                hashes[change.ref] = hash
            }
          }),
        landed,
      )
    } catch (error) {
      // Only an overtaken step is dropped. One that waited out a lock stays to try again.
      const overtaken =
        error instanceof FrameboardError && error.code === 'undo-overtaken'
      if (!overtaken) from.push(step)
      this.onChange(this.counts())
      throw error
    }
    onto.push(step)
    this.onChange(this.counts())
    this.onWrite(step, to)
    const answer: StepAnswer = {
      page: step.page?.[to] ?? null,
      frames: step.frames,
    }
    return Object.keys(hashes).length > 0 ? { ...answer, hashes } : answer
  }

  #inTurn<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#turn.then(task)
    this.#turn = run.catch(() => {})
    return run
  }
}

/**
 * The change as the board stands at `side`, reading a project file where the
 * moves `later` in its step left it on the after side, since a retitle writes
 * the file under the old folder and then moves the folder. Restoring keeps the
 * recorded path, since the moves are undone first and redone last.
 */
function standingAt(change: Change, later: Change[], side: Side): Change {
  if (side === 'before' || change.kind !== 'project') return change
  let file = change.file
  for (const each of later) {
    if (each.kind !== 'moved') continue
    if (file.startsWith(each.from + sep)) {
      file = each.to + file.slice(each.from.length)
    }
  }
  return file === change.file ? change : { ...change, file }
}

/** What a refusal names as overtaken, being a frame, a section, a page, the slide transition, the page order, or a filed project. */
function nameOf(change: Change): string {
  if (change.kind === 'entry') return change.frame
  if (change.kind === 'section') return `section ${change.section}`
  if (change.kind === 'pages') return 'the page order'
  if (change.kind === 'present') return 'the slide transition'
  if (change.kind === 'project') return basename(dirname(change.file))
  if (change.kind === 'token') return change.name
  const path = change.kind === 'moved' ? change.to : change.path
  return basename(path, FRAME_EXTENSION)
}
