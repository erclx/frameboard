import { setImmediate } from 'node:timers/promises'

/** Frames per slice, about 25 ms of a static check. */
const SLICE_SIZE = 8

export interface StartChecks {
  /** Checks `refs` slice by slice, resolving once none is left or the server closes. */
  run: (refs: readonly string[]) => Promise<void>
  /** Leaves out frames a write had checked in the meantime. */
  drop: (refs: readonly string[]) => void
  /** Moves whichever of `refs` still wait ahead of the rest. */
  front: (refs: readonly string[]) => void
  /** Resolves once none of `refs` waits for its check or is in one. */
  settle: (refs: readonly string[]) => Promise<void>
  /** Starts no further slice and settles every wait. */
  close: () => void
}

/**
 * The start's static check, in slices with the event loop free between them,
 * so a hello, a batch, or a route never waits on the whole board.
 */
export function createStartChecks({
  check,
  inTurn = (task) => task(),
  pause = () => setImmediate(),
  size = SLICE_SIZE,
}: {
  check: (refs: string[]) => Promise<void>
  /** Runs each slice, taken once its turn comes, so no slice repeats what ran ahead of it. */
  inTurn?: (task: () => Promise<void>) => Promise<void>
  /** What runs ahead of each slice, an event loop turn unless a test stands in. */
  pause?: () => Promise<void>
  size?: number
}): StartChecks {
  let waiting: string[] = []
  let checking: string[] = []
  let closed = false
  let waiters: { refs: readonly string[]; resolve: () => void }[] = []

  const notify = () => {
    const left = new Set([...waiting, ...checking])
    const still = waiters.filter(
      ({ refs }) => !closed && refs.some((ref) => left.has(ref)),
    )
    const done = waiters.filter((waiter) => !still.includes(waiter))
    waiters = still
    for (const { resolve } of done) resolve()
  }

  return {
    run: async (refs) => {
      if (closed) return
      waiting.push(...refs)
      while (waiting.length > 0) {
        // A slice that fails leaves its frames to the batch that names them.
        await pause()
        await inTurn(async () => {
          checking = waiting.splice(0, size)
          if (checking.length > 0) await check(checking)
        }).catch(() => {})
        checking = []
        notify()
      }
    },
    drop: (refs) => {
      const dropped = new Set(refs)
      waiting = waiting.filter((ref) => !dropped.has(ref))
      notify()
    },
    front: (refs) => {
      const named = new Set(refs)
      waiting = [
        ...waiting.filter((ref) => named.has(ref)),
        ...waiting.filter((ref) => !named.has(ref)),
      ]
    },
    settle: (refs) =>
      new Promise((resolve) => {
        waiters.push({ refs, resolve })
        notify()
      }),
    close: () => {
      closed = true
      waiting = []
      notify()
    },
  }
}
