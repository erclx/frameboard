import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { RUN_FOLDER } from '@/shared/board-files'
import type { Theme } from '@/shared/theme'

import type { RenderFrame } from './render'

const THUMBNAILS_FOLDER = 'thumbnails'

/** A frame as the store renders it, being its ref and its layout size. */
export interface ThumbnailFrame {
  ref: string
  box: { width: number; height: number }
}

export interface ThumbnailStore {
  /**
   * The stamp of each frame whose capture in `theme` is current, queueing a
   * render of every other one not already rendering or failed at its stamp.
   * It never waits on a render, so a home view's request answers at once.
   */
  ask: (
    theme: Theme,
    frames: readonly ThumbnailFrame[],
  ) => Record<string, string>
  /** Drops both themes of each frame, so its next ask renders it afresh. */
  invalidate: (refs: readonly string[]) => void
  /** The stored capture's path when `stamp` is the frame's current one in `theme`, else null. */
  file: (ref: string, theme: Theme, stamp: string) => string | null
  /** Resolves once every render started so far has landed or failed. */
  settled: () => Promise<void>
  /** Removes every stored capture, as a server does at start. */
  empty: () => Promise<void>
}

interface Entry {
  stamp: string
  state: 'rendering' | 'done' | 'failed'
}

/**
 * The home view's frame captures, one per frame and theme under
 * `.run/thumbnails/<project>/<page>/<frame>.<theme>.png`. A stamp names the
 * server run, how often the frame changed, and its size, so a capture of a
 * changed or resized frame, or one a previous server served, is never
 * answered as current. A failed render is remembered against its stamp, so a
 * frame refusing `font-missing`, or a board with no headless shell, costs one
 * render until the frame changes.
 */
export function createThumbnailStore({
  root,
  run,
  render,
  onRendered,
}: {
  root: string
  /** This server run's id, which every stamp carries. */
  run: string
  render: RenderFrame
  /** Called with the stamp of each capture as it lands. */
  onRendered: (theme: Theme, stamps: Record<string, string>) => void
}): ThumbnailStore {
  const folder = join(root, RUN_FOLDER, THUMBNAILS_FOLDER)
  const generations = new Map<string, number>()
  const entries = new Map<string, Entry>()
  const inFlight = new Set<Promise<void>>()
  const pathOf = (ref: string, theme: Theme) =>
    join(folder, `${ref}.${theme}.png`)
  const keyOf = (ref: string, theme: Theme) => `${theme}:${ref}`
  const stampOf = ({ ref, box }: ThumbnailFrame) =>
    `${run}-${generations.get(ref) ?? 0}-${box.width}x${box.height}`

  const start = (frame: ThumbnailFrame, theme: Theme, stamp: string) => {
    const key = keyOf(frame.ref, theme)
    const entry: Entry = { stamp, state: 'rendering' }
    entries.set(key, entry)
    const landing = render(frame, theme)
      .then(async (bytes) => {
        // A frame that changed while rendering has a newer entry, so this capture is dropped.
        if (entries.get(key) !== entry) return
        const path = pathOf(frame.ref, theme)
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, bytes)
        if (entries.get(key) !== entry) return
        entry.state = 'done'
        onRendered(theme, { [frame.ref]: stamp })
      })
      .catch(() => {
        entry.state = 'failed'
      })
      .finally(() => inFlight.delete(landing))
    inFlight.add(landing)
  }

  return {
    ask: (theme, frames) => {
      const stamps: Record<string, string> = {}
      for (const frame of frames) {
        const stamp = stampOf(frame)
        const entry = entries.get(keyOf(frame.ref, theme))
        if (entry?.stamp !== stamp) start(frame, theme, stamp)
        else if (entry.state === 'done') stamps[frame.ref] = stamp
      }
      return stamps
    },
    invalidate: (refs) => {
      for (const ref of refs) {
        generations.set(ref, (generations.get(ref) ?? 0) + 1)
        entries.delete(keyOf(ref, 'light'))
        entries.delete(keyOf(ref, 'dark'))
      }
    },
    file: (ref, theme, stamp) => {
      const entry = entries.get(keyOf(ref, theme))
      return entry?.stamp === stamp && entry.state === 'done'
        ? pathOf(ref, theme)
        : null
    },
    settled: async () => {
      while (inFlight.size > 0) await Promise.all(inFlight)
    },
    empty: () => rm(folder, { recursive: true, force: true }),
  }
}
