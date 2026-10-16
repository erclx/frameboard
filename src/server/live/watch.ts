import { relative, sep } from 'node:path'

import { watch } from 'chokidar'

import {
  ASSETS_FOLDER,
  FRAME_EXTENSION,
  LAYOUT_FILE,
} from '@/server/board/scan'
import type { ListResult } from '@/shared/records/list'

const NOTES_FILE = 'notes.json'
/** A batch closes this long after its last event. */
const TRAILING_MS = 50
/** A batch closes this long after its first event, however busy the folder stays. */
const CEILING_MS = 250
/**
 * How long a new watch runs before it counts events. On macOS, `fs.watch`
 * drops writes in its first few tens of milliseconds and reports changes made
 * just before it began, so the watch resolves only once both have passed.
 */
const WARM_UP_MS = 100

export type BatchListener = (paths: string[]) => void

export interface BoardWatcher {
  /** Calls `listener` with each batch's changed paths, and returns the unsubscribe. */
  onBatch: (listener: BatchListener) => () => void
  close: () => Promise<void>
}

/**
 * Watches the board folder and reports changes in batches, so a burst of
 * writes from one agent turn costs one rescan. Resolves once the watch is
 * warm, so a write after it is always seen.
 */
export async function watchBoard(root: string): Promise<BoardWatcher> {
  const listeners = new Set<BatchListener>()
  const batcher = createBatcher((paths) => {
    for (const listener of listeners) listener(paths)
  })

  const watcher = watch(root, {
    ignoreInitial: true,
    ignored: (path) => isIgnored(root, path),
  })
  let warm = false
  watcher.on('all', (_event, path) => {
    if (warm) batcher.add(path)
  })
  await new Promise<void>((resolve) => watcher.once('ready', resolve))
  await new Promise((resolve) => setTimeout(resolve, WARM_UP_MS))
  warm = true

  return {
    onBatch: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close: async () => {
      batcher.cancel()
      listeners.clear()
      await watcher.close()
    },
  }
}

export interface Batcher {
  add: (path: string) => void
  cancel: () => void
}

/**
 * Gathers paths into batches, each closing 50 ms after its last path or 250
 * ms after its first, whichever comes sooner, so a busy folder still flushes.
 */
export function createBatcher(flush: (paths: string[]) => void): Batcher {
  let pending = new Set<string>()
  let trailing: ReturnType<typeof setTimeout> | undefined
  let ceiling: ReturnType<typeof setTimeout> | undefined

  const cancel = () => {
    clearTimeout(trailing)
    clearTimeout(ceiling)
    trailing = ceiling = undefined
  }
  const close = () => {
    cancel()
    const paths = [...pending]
    pending = new Set()
    flush(paths)
  }

  return {
    add: (path) => {
      pending.add(path)
      clearTimeout(trailing)
      trailing = setTimeout(close, TRAILING_MS)
      ceiling ??= setTimeout(close, CEILING_MS)
    },
    cancel,
  }
}

/** Skips `.run/`, any dot-named segment, and the lock and temp files writers leave behind. */
function isIgnored(root: string, path: string): boolean {
  const inside = relative(root, path)
  if (inside === '') return false
  const parts = inside.split(sep)
  const name = parts.at(-1) ?? ''
  return (
    parts.some((part) => part.startsWith('.')) ||
    name.endsWith('.lock') ||
    name.endsWith('.tmp')
  )
}

/**
 * The frames a batch changed what they render: a frame's own file reloads
 * that frame, any other file in a page folder reloads the page's frames since
 * any of them may link it, and an asset reloads the whole project. A layout or
 * notes file reloads nothing, since moving a frame must not restart it.
 * Only frames in `board` are named, in board order.
 */
export function reloadRefs(
  root: string,
  paths: string[],
  board: ListResult,
): string[] {
  const refs = new Set<string>()
  for (const path of paths) {
    const [project, folder, ...rest] = relative(root, path).split(sep)
    if (!project || !folder || rest.length === 0) continue
    if (folder === ASSETS_FOLDER) {
      refs.add(`${project}/*`)
    } else if (rest.length === 1) {
      const name = rest[0] ?? ''
      if (name === LAYOUT_FILE || name === NOTES_FILE) continue
      refs.add(
        name.endsWith(FRAME_EXTENSION)
          ? `${project}/${folder}/${name.slice(0, -FRAME_EXTENSION.length)}`
          : `${project}/${folder}/*`,
      )
    }
  }

  const named: string[] = []
  for (const project of board.projects) {
    for (const page of project.pages) {
      for (const frame of page.frames) {
        if (
          refs.has(frame.ref) ||
          refs.has(`${page.ref}/*`) ||
          refs.has(`${project.name}/*`)
        ) {
          named.push(frame.ref)
        }
      }
    }
  }
  return named
}
