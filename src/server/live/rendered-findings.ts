import { FrameboardError } from '@/shared/errors'
import type { Finding } from '@/shared/records/check'
import type { FrameRecord, ListResult } from '@/shared/records/list'

/** Runs every browser rule on one frame, as `checkRendered` does on the warm browser. */
export type CheckFrame = (frame: FrameRecord) => Promise<Finding[]>

export interface RenderedFindings {
  /**
   * Queues `refs` for a browser recheck, along with every frame whose box or
   * file time changed since it was last queued, which covers a new frame, a
   * resize no file write announces, and a write the watcher has not batched
   * yet. The first call queues every frame.
   */
  queue: (board: ListResult, refs: string[]) => void
  /** Resolves once no recheck of any of `refs` is queued or running. */
  settle: (refs: string[]) => Promise<void>
  /** `browser-not-found` while the last recheck could not launch a browser. */
  unavailable: () => 'browser-not-found' | null
  /** Drops every queued recheck and lands no result after it. */
  close: () => void
}

interface Waiter {
  refs: string[]
  resolve: () => void
}

/**
 * The server's warm checker. Rechecks run one at a time on their own queue,
 * so a PNG never waits behind them, and a ref queued again before its result
 * lands drops that result, so the board never shows findings from an older
 * file. `onResult` receives each landed frame's browser findings, an empty
 * list for a frame whose recheck failed, so no finding outlives its file.
 * The first recheck to run after a browser could not launch queues every
 * frame again, since the ones checked meanwhile landed nothing.
 */
export function createRenderedFindings({
  check,
  onResult,
}: {
  check: CheckFrame
  onResult: (ref: string, findings: Finding[]) => void
}): RenderedFindings {
  // What each frame rendered from when last queued, being its box and file time.
  const seen = new Map<string, string>()
  let known = new Map<string, FrameRecord>()
  const pending = new Map<string, FrameRecord>()
  const generation = new Map<string, number>()
  let running: string | null = null
  let failure: 'browser-not-found' | null = null
  let closed = false
  let waiters: Waiter[] = []

  const busy = (refs: string[]) =>
    refs.some((ref) => ref === running || pending.has(ref))

  const enqueue = (ref: string, frame: FrameRecord) => {
    generation.set(ref, (generation.get(ref) ?? 0) + 1)
    pending.set(ref, frame)
  }

  const notify = () => {
    const still: Waiter[] = []
    for (const waiter of waiters) {
      if (!closed && busy(waiter.refs)) still.push(waiter)
      else waiter.resolve()
    }
    waiters = still
  }

  const pump = () => {
    if (running !== null || closed) return
    const next = pending.entries().next()
    if (next.done) return
    const [ref, frame] = next.value
    pending.delete(ref)
    running = ref
    const asked = generation.get(ref)
    const current = () => !closed && generation.get(ref) === asked
    check(frame)
      .then((findings) => {
        const recovered = failure !== null
        failure = null
        if (current()) onResult(ref, findings)
        if (!recovered) return
        for (const [other, record] of known) {
          if (other !== ref && !pending.has(other)) enqueue(other, record)
        }
      })
      .catch((error: unknown) => {
        if (
          error instanceof FrameboardError &&
          error.code === 'browser-not-found'
        ) {
          failure = 'browser-not-found'
          return
        }
        // A frame removed or failing to load mid-check clears what the older
        // file held, and the next write to it queues it again.
        if (current()) onResult(ref, [])
      })
      .finally(() => {
        running = null
        notify()
        pump()
      })
  }

  return {
    queue: (board, refs) => {
      if (closed) return
      const frames = new Map<string, FrameRecord>()
      for (const project of board.projects) {
        for (const page of project.pages) {
          for (const frame of page.frames) frames.set(frame.ref, frame)
        }
      }
      for (const ref of [...seen.keys(), ...pending.keys()]) {
        if (frames.has(ref)) continue
        seen.delete(ref)
        pending.delete(ref)
        generation.delete(ref)
      }
      known = frames
      const due = new Set(refs)
      for (const [ref, frame] of frames) {
        const from = `${frame.box.width}x${frame.box.height}@${frame.modifiedAt}`
        if (seen.get(ref) !== from) due.add(ref)
        seen.set(ref, from)
      }
      for (const ref of due) {
        const frame = frames.get(ref)
        if (frame) enqueue(ref, frame)
      }
      notify()
      pump()
    },
    settle: (refs) =>
      new Promise((resolve) => {
        waiters.push({ refs, resolve })
        notify()
      }),
    unavailable: () => failure,
    close: () => {
      closed = true
      pending.clear()
      notify()
    },
  }
}
