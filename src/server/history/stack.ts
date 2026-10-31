import { existsSync } from 'node:fs'
import { basename, dirname, isAbsolute, relative, sep } from 'node:path'

import { withLocks } from '@/server/board/json-record'
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
    // A record inside a folder an agent removed has no folder to lock in, and
    // its change cannot hold, so the check refuses it unlocked.
    const hashes: Record<string, string> = {}
    const locks = step.changes
      .flatMap(lockPaths)
      .filter((path) => existsSync(dirname(path)))
    try {
      await withLocks(locks, async () => {
        for (const change of step.changes) {
          if (!(await holds(change, was))) {
            throw new FrameboardError(
              'undo-overtaken',
              `An agent changed ${nameOf(change)} after your edit, so that step was dropped.`,
              { change: change.kind },
            )
          }
        }
        const ordered =
          to === 'before' ? [...step.changes].reverse() : step.changes
        for (const change of ordered) {
          const hash = await restore(change, to)
          if (hash !== undefined && 'ref' in change) hashes[change.ref] = hash
        }
      })
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

/** What a refusal names as overtaken, being a frame, a section, a page, or the page order. */
function nameOf(change: Change): string {
  if (change.kind === 'entry') return change.frame
  if (change.kind === 'section') return `section ${change.section}`
  if (change.kind === 'pages') return 'the page order'
  if (change.kind === 'token') return change.name
  const path = change.kind === 'moved' ? change.to : change.path
  return basename(path, FRAME_EXTENSION)
}
