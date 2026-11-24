import { FrameboardError } from '@/shared/errors'
import type { Finding } from '@/shared/records/check'
import type { FrameRecord, ListResult } from '@/shared/records/list'

/**
 * Runs every browser rule on one frame, as `checkRendered` does on the warm
 * browser, answering null for a reading the frame's file has since moved past.
 */
export type CheckFrame = (frame: FrameRecord) => Promise<Finding[] | null>

/**
 * Runs `check` at the own box and each linked width, leaving out a linked
 * finding the own box already reported, since it is no fault of that width.
 */
export async function acrossWidths(
  frame: Pick<FrameRecord, 'box' | 'widths'>,
  check: (box: { width: number; height: number }) => Promise<Finding[] | null>,
): Promise<Finding[] | null> {
  const own = await check({ width: frame.box.width, height: frame.box.height })
  if (own === null) return null
  const seen = new Set(own.map(sameness))
  const findings = [...own]
  for (const { width, height } of frame.widths) {
    const linked = await check({ width, height })
    if (linked === null) return null
    for (const finding of linked) {
      if (!seen.has(sameness(finding))) findings.push({ ...finding, width })
    }
  }
  return findings
}

function sameness(finding: Finding): string {
  return JSON.stringify([finding.rule, finding.message, finding.location])
}

export interface RenderedFindings {
  /** Marks `refs` as already read at the box and file time `board` gives, queueing none. */
  prime: (board: ListResult, refs: readonly string[]) => void
  /**
   * Queues `refs` and every frame whose box or file time moved, catching a
   * resize no write announces.
   */
  queue: (board: ListResult, refs: string[]) => void
  /** Moves whichever of `refs` are queued ahead of the rest, in queue order. */
  front: (refs: readonly string[]) => void
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
 * The warm checker, on its own queue so a PNG never waits, dropping a result
 * a requeue made stale, so no finding outlives its file.
 */
export function createRenderedFindings({
  check,
  onResult,
}: {
  check: CheckFrame
  /** `ran` is false for the empty list a failed recheck lands. */
  onResult: (ref: string, findings: Finding[], ran: boolean) => void
}): RenderedFindings {
  // What each frame rendered from when last queued, being its box and file time.
  const seen = new Map<string, string>()
  let known = new Map<string, FrameRecord>()
  let pending = new Map<string, FrameRecord>()
  const generation = new Map<string, number>()
  let running: string | null = null
  let failure: 'browser-not-found' | null = null
  // The frames no browser launched for, which the next launch checks.
  const missed = new Set<string>()
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
        failure = null
        missed.delete(ref)
        // A stale reading lands nothing, and the write's batch queues the frame again.
        if (findings && current()) onResult(ref, findings, true)
        for (const other of missed) {
          const record = known.get(other)
          if (record && !pending.has(other)) enqueue(other, record)
        }
        missed.clear()
      })
      .catch((error: unknown) => {
        if (
          error instanceof FrameboardError &&
          error.code === 'browser-not-found'
        ) {
          failure = 'browser-not-found'
          missed.add(ref)
          return
        }
        // Clears the older file's findings, and the next write requeues it.
        if (current()) onResult(ref, [], false)
      })
      .finally(() => {
        running = null
        notify()
        pump()
      })
  }

  return {
    prime: (board, refs) => {
      const frames = framesOf(board)
      for (const ref of refs) {
        const frame = frames.get(ref)
        if (frame) seen.set(ref, drawnFrom(frame))
      }
    },
    queue: (board, refs) => {
      if (closed) return
      const frames = framesOf(board)
      for (const ref of [...seen.keys(), ...pending.keys()]) {
        if (frames.has(ref)) continue
        seen.delete(ref)
        pending.delete(ref)
        generation.delete(ref)
      }
      known = frames
      const due = new Set(refs)
      for (const [ref, frame] of frames) {
        const from = drawnFrom(frame)
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
    front: (refs) => {
      const named = new Set(refs)
      const queued = [...pending]
      pending = new Map([
        ...queued.filter(([ref]) => named.has(ref)),
        ...queued.filter(([ref]) => !named.has(ref)),
      ])
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

/** What a frame renders from, being its boxes and file time. */
function drawnFrom(frame: FrameRecord): string {
  const views = [frame.box, ...frame.widths]
    .map(({ width, height }) => `${width}x${height}`)
    .join(',')
  return `${views}@${frame.modifiedAt}`
}

function framesOf(board: ListResult): Map<string, FrameRecord> {
  return new Map(
    board.projects
      .flatMap((project) => project.pages)
      .flatMap((page) => page.frames)
      .map((frame) => [frame.ref, frame]),
  )
}
