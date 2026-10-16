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

export type BatchListener = (paths: string[]) => void

export interface BoardWatcher {
  /** Calls `listener` with each batch's changed paths, and returns the unsubscribe. */
  onBatch: (listener: BatchListener) => () => void
  close: () => Promise<void>
}

/**
 * Watches the board folder and reports changes in batches, so a burst of
 * writes from one agent turn costs one rescan. Resolves once the initial walk
 * is done, so a write after it is always seen.
 */
export async function watchBoard(root: string): Promise<BoardWatcher> {
  const listeners = new Set<BatchListener>()
  let pending = new Set<string>()
  let trailing: ReturnType<typeof setTimeout> | undefined
  let ceiling: ReturnType<typeof setTimeout> | undefined

  const flush = () => {
    clearTimeout(trailing)
    clearTimeout(ceiling)
    trailing = ceiling = undefined
    const paths = [...pending]
    pending = new Set()
    for (const listener of listeners) listener(paths)
  }

  const watcher = watch(root, {
    ignoreInitial: true,
    ignored: (path) => isIgnored(root, path),
  })
  watcher.on('all', (_event, path) => {
    pending.add(path)
    clearTimeout(trailing)
    trailing = setTimeout(flush, TRAILING_MS)
    ceiling ??= setTimeout(flush, CEILING_MS)
  })
  await new Promise<void>((resolve) => watcher.once('ready', resolve))

  return {
    onBatch: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close: async () => {
      clearTimeout(trailing)
      clearTimeout(ceiling)
      listeners.clear()
      await watcher.close()
    },
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
