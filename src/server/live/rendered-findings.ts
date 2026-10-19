import { FrameboardError } from '@/shared/errors'
import type { Finding } from '@/shared/records/check'
import type { FrameRecord, ListResult } from '@/shared/records/list'

/** Runs every browser rule on one frame, as `checkRendered` does on the warm browser. */
export type CheckFrame = (frame: FrameRecord) => Promise<Finding[]>

export interface RenderedFindings {
  /**
   * Queues `refs` for a browser recheck, along with every frame whose box
   * changed since it was last queued, which covers a new frame and a resize
   * no file write announces. The first call queues every frame.
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
 * file. `onResult` receives each landed frame's browser findings.
 */
export function createRenderedFindings({
  check,
  onResult,
}: {
  check: CheckFrame
  onResult: (ref: string, findings: Finding[]) => void
}): RenderedFindings {
  const boxes = new Map<string, string>()
  const pending = new Map<string, FrameRecord>()
  const generation = new Map<string, number>()
  let running: string | null = null
  let failure: 'browser-not-found' | null = null
  let closed = false
  let waiters: Waiter[] = []

  const busy = (refs: string[]) =>
    refs.some((ref) => ref === running || pending.has(ref))

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
    check(frame)
      .then((findings) => {
        failure = null
        if (!closed && generation.get(ref) === asked) onResult(ref, findings)
      })
      .catch((error: unknown) => {
        // A frame removed or failing to load mid-check lands nothing, and the
        // next write to it queues it again.
        if (
          error instanceof FrameboardError &&
          error.code === 'browser-not-found'
        ) {
          failure = 'browser-not-found'
        }
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
      for (const ref of [...boxes.keys(), ...pending.keys()]) {
        if (frames.has(ref)) continue
        boxes.delete(ref)
        pending.delete(ref)
        generation.delete(ref)
      }
      const due = new Set(refs)
      for (const [ref, frame] of frames) {
        const box = `${frame.box.width}x${frame.box.height}`
        if (boxes.get(ref) !== box) due.add(ref)
        boxes.set(ref, box)
      }
      for (const ref of due) {
        const frame = frames.get(ref)
        if (!frame) continue
        generation.set(ref, (generation.get(ref) ?? 0) + 1)
        pending.set(ref, frame)
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
