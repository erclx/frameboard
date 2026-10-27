import { join, relative, sep } from 'node:path'

import { watch } from 'chokidar'

import {
  ASSETS_FOLDER,
  FRAME_EXTENSION,
  LAYOUT_FILE,
} from '@/server/board/scan'
import { CLAIMS_FILE, RUN_FOLDER, TOKEN_FILE } from '@/shared/board-files'
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
 * warm, so a write after it is always seen. Each of `files` outside the
 * board, such as a `--tokens` sheet, is watched too and lands in the same
 * batches.
 */
export async function watchBoard(
  root: string,
  files: readonly string[] = [],
): Promise<BoardWatcher> {
  const listeners = new Set<BatchListener>()
  const batcher = createBatcher((paths) => {
    for (const listener of listeners) {
      // A listener that throws would escape the timer as an uncaught
      // exception, stopping the server and every listener after it.
      try {
        listener(paths)
      } catch (error) {
        console.error('frameboard: a board watch listener failed', error)
      }
    }
  })

  const runFolder = join(root, RUN_FOLDER)
  const outside = files.filter((file) => relative(root, file).startsWith('..'))
  const watchers = [
    watch(root, {
      ignoreInitial: true,
      ignored: (path) => isIgnored(root, path),
    }),
    ...(outside.length > 0
      ? [watch([...outside], { ignoreInitial: true })]
      : []),
  ]
  let warm = false
  await Promise.all(
    watchers.map((watcher) => {
      watcher.on('all', (_event, path) => {
        // `.run/` itself is watched only to reach its claims file.
        if (warm && path !== runFolder) batcher.add(path)
      })
      return new Promise<void>((resolve) => watcher.once('ready', resolve))
    }),
  )
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
      await Promise.all(watchers.map((watcher) => watcher.close()))
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

/**
 * Skips any dot-named segment, and the lock and temp files writers leave
 * behind. `.run/` is skipped but for its claims file, so a claim reaches the
 * board while the address, the key, and captures stay out.
 */
function isIgnored(root: string, path: string): boolean {
  const inside = relative(root, path)
  if (inside === '' || inside === RUN_FOLDER) return false
  if (inside === join(RUN_FOLDER, CLAIMS_FILE)) return false
  const parts = inside.split(sep)
  const name = parts.at(-1) ?? ''
  return (
    parts.some((part) => part.startsWith('.')) ||
    name.endsWith('.lock') ||
    name.endsWith('.tmp')
  )
}

/**
 * The frames a batch changed what they render: a frame's own file, or a temp
 * file it is saved through, reloads that frame, any other file in a page folder reloads the page's frames since
 * any of them may link it, and an asset or the project's token sheet reloads
 * the whole project. The board's token sheet, or the `tokens` sheet standing
 * in for it, reloads every frame. A layout or notes file reloads nothing,
 * since moving a frame must not restart it.
 * Only frames in `board` are named, in board order.
 */
export function reloadRefs(
  root: string,
  paths: string[],
  board: ListResult,
  tokens: string | null = null,
): string[] {
  const refs = new Set<string>()
  let everyFrame = false
  for (const path of paths) {
    const [project, folder, ...rest] = relative(root, path).split(sep)
    if (path === tokens || (project === TOKEN_FILE && !folder && !tokens)) {
      everyFrame = true
      continue
    }
    if (project && folder === TOKEN_FILE && rest.length === 0) {
      refs.add(`${project}/*`)
      continue
    }
    if (!project || !folder || rest.length === 0) continue
    if (folder === ASSETS_FOLDER) {
      refs.add(`${project}/*`)
    } else if (rest.length === 1) {
      const name = rest[0] ?? ''
      if (name === LAYOUT_FILE || name === NOTES_FILE) continue
      const frame = frameNameOf(name)
      refs.add(
        frame === null
          ? `${project}/${folder}/*`
          : `${project}/${folder}/${frame}`,
      )
    }
  }

  const named: string[] = []
  for (const project of board.projects) {
    for (const page of project.pages) {
      for (const frame of page.frames) {
        if (
          everyFrame ||
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

/** A project or page folder the board's own rename moved from `from` to `path`, at `at` in epoch milliseconds. */
export interface MovedFolder {
  from: string
  path: string
  at: number
}

/**
 * `refs` less each frame that only moved with a folder the board renamed,
 * being one under a moved folder whose file carries the stamp `last`, the
 * board sent before the move, showed at its old path. It renders what the
 * tab already shows, so a reload would restart it for nothing, while a file
 * written before or after the move that `last` never showed still reloads.
 */
export function unmovedRefs(
  refs: string[],
  board: ListResult,
  moved: readonly MovedFolder[],
  last: ListResult | null,
): string[] {
  if (moved.length === 0 || !last) return refs
  const shown = new Map(
    last.projects.flatMap((project) =>
      project.pages.flatMap((page) =>
        page.frames.map((frame) => [frame.path, frame.modifiedAt] as const),
      ),
    ),
  )
  const onlyMoved = new Set<string>()
  for (const project of board.projects) {
    for (const page of project.pages) {
      for (const frame of page.frames) {
        const folder = moved.find(({ path }) =>
          frame.path.startsWith(`${path}${sep}`),
        )
        const before =
          folder && `${folder.from}${frame.path.slice(folder.path.length)}`
        if (before && shown.get(before) === frame.modifiedAt) {
          onlyMoved.add(frame.ref)
        }
      }
    }
  }
  return refs.filter((ref) => !onlyMoved.has(ref))
}

/**
 * The frame a page-folder file belongs to: `hero.html` itself, or a temp file
 * an editor or atomic writer saves it through, such as `hero.html.swap`.
 */
function frameNameOf(name: string): string | null {
  if (name.endsWith(FRAME_EXTENSION)) {
    return name.slice(0, -FRAME_EXTENSION.length)
  }
  const temp = name.lastIndexOf(`${FRAME_EXTENSION}.`)
  return temp > 0 ? name.slice(0, temp) : null
}

/**
 * The hugging frames `next` holds placed that `previous` held unplaced or
 * not at all, on a page whose `layout.json` is among `paths`, as one an
 * agent wrote and then placed. Placing writes `layout.json` alone, which
 * reloads nothing, so these are measured without a reload. A frame that only
 * moved was placed in both, and one a folder rename carried has a new ref
 * but a batch naming the folder alone, so both are left out. Given no
 * `paths`, as for two scans of one batch, every page is read.
 */
export function placedRefs(
  previous: ListResult,
  next: ListResult,
  paths?: readonly string[],
): string[] {
  const written = paths && new Set(paths)
  const before = new Set(
    previous.projects.flatMap((project) =>
      project.pages.flatMap((page) =>
        page.frames.filter((frame) => frame.placed).map((frame) => frame.ref),
      ),
    ),
  )
  return next.projects.flatMap((project) =>
    project.pages
      .filter((page) => !written || written.has(join(page.path, LAYOUT_FILE)))
      .flatMap((page) =>
        page.frames
          .filter(
            (frame) =>
              frame.placed &&
              (frame.hugWidth || frame.hugHeight) &&
              !before.has(frame.ref),
          )
          .map((frame) => frame.ref),
      ),
  )
}
