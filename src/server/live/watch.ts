import { join, relative, sep } from 'node:path'

import { watch } from 'chokidar'

import { linkedAssets } from '@/server/board/asset-usage'
import {
  ASSETS_FOLDER,
  FRAME_EXTENSION,
  LAYOUT_FILE,
} from '@/server/board/scan'
import { assetKind, isPlaceableKind } from '@/shared/asset-kinds'
import { CLAIMS_FILE, RUN_FOLDER, TOKEN_FILE } from '@/shared/board-files'
import { KIT_ASSETS, PROJECT_KITS } from '@/shared/kits'
import type { FrameRecord, ListResult } from '@/shared/records/list'
import { LICENSE_FILE_SUFFIX } from '@/shared/records/sourcing'

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
 * Watches the board in batches, so one agent turn costs one rescan, resolving
 * once warm, so a later write is always seen.
 */
export async function watchBoard(
  root: string,
  files: readonly string[] = [],
): Promise<BoardWatcher> {
  const listeners = new Set<BatchListener>()
  const batcher = createBatcher((paths) => {
    for (const listener of listeners) {
      // A throw would escape the timer and stop the server.
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
 * The frames a batch changed what they render, a layout or notes file
 * reloading nothing, since moving a frame must not restart it.
 */
export function reloadRefs(
  root: string,
  paths: string[],
  board: ListResult,
  tokens: string | null = null,
): string[] {
  const { refs, everyFrame, media } = reloadCauses(root, paths, tokens)
  const named: string[] = []
  for (const project of board.projects) {
    const changed = media.get(project.name)
    for (const page of project.pages) {
      for (const frame of page.frames) {
        if (
          everyFrame ||
          refs.has(frame.ref) ||
          refs.has(`${page.ref}/*`) ||
          refs.has(`${project.name}/*`) ||
          (changed !== undefined && links(root, frame, changed))
        ) {
          named.push(frame.ref)
        }
      }
    }
  }
  return named
}

/** Whether the frame's file, read as it stands, loads any of the changed asset paths. */
function links(
  root: string,
  frame: FrameRecord,
  changed: ReadonlySet<string>,
): boolean {
  for (const path of linkedAssets(
    root,
    frame.project,
    frame.page,
    frame.name,
  )) {
    if (changed.has(path)) return true
  }
  return false
}

/**
 * The frames `reloadRefs` names through their own file alone, with no token
 * sheet, asset, or other page-folder file in the batch reaching them, in
 * board order. Only these reload into bytes a hash of that one file names.
 */
export function ownReloadRefs(
  root: string,
  paths: string[],
  board: ListResult,
  tokens: string | null = null,
): string[] {
  const { refs, everyFrame, media } = reloadCauses(root, paths, tokens)
  if (everyFrame) return []
  return board.projects.flatMap((project) => {
    if (refs.has(`${project.name}/*`)) return []
    const changed = media.get(project.name)
    return project.pages.flatMap((page) =>
      refs.has(`${page.ref}/*`)
        ? []
        : page.frames
            .filter(
              (frame) =>
                refs.has(frame.ref) &&
                (changed === undefined || !links(root, frame, changed)),
            )
            .map((frame) => frame.ref),
    )
  })
}

/**
 * What a batch's paths reach: frame refs, `<page>/*` and `<project>/*`
 * wildcards, whether a board-wide sheet reaches every frame, and per project
 * the placeable media under `assets/` that reach only the frames loading them.
 */
function reloadCauses(
  root: string,
  paths: string[],
  tokens: string | null,
): { refs: Set<string>; everyFrame: boolean; media: Map<string, Set<string>> } {
  const refs = new Set<string>()
  const media = new Map<string, Set<string>>()
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
      const name = rest.at(-1) ?? ''
      if (name.endsWith(LICENSE_FILE_SUFFIX)) continue
      // A sheet's url() or the kit the frame route imports reaches a frame unlisted in its own loads.
      const inKit = rest[0] === PROJECT_KITS || rest[0] === KIT_ASSETS
      if (inKit || !isPlaceableKind(assetKind(name))) {
        refs.add(`${project}/*`)
        continue
      }
      const changed = media.get(project) ?? new Set<string>()
      changed.add(rest.join('/'))
      media.set(project, changed)
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
  return { refs, everyFrame, media }
}

/** A project or page folder the board's own rename moved from `from` to `path`, at `at` in epoch milliseconds. */
export interface MovedFolder {
  from: string
  path: string
  at: number
}

/**
 * `refs` less frames that only moved with a renamed folder and still match
 * `last`, since a reload would restart them for nothing.
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
 * Hugging frames newly placed, measured without a reload, since placing writes
 * `layout.json` alone, which reloads nothing. `unmeasured` names frames
 * `previous` holds placed that no batch measured, read as unplaced.
 */
export function placedRefs(
  previous: ListResult,
  next: ListResult,
  paths?: readonly string[],
  unmeasured: readonly string[] = [],
): string[] {
  const written = paths && new Set(paths)
  const pending = new Set(unmeasured)
  const before = new Set(
    previous.projects.flatMap((project) =>
      project.pages.flatMap((page) =>
        page.frames
          .filter((frame) => frame.placed && !pending.has(frame.ref))
          .map((frame) => frame.ref),
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

/**
 * Height-hugging frames whose linked widths changed, measured here, since
 * that write reloads nothing.
 */
export function relistedRefs(previous: ListResult, next: ListResult): string[] {
  const before = new Map(
    previous.projects.flatMap((project) =>
      project.pages.flatMap((page) =>
        page.frames.map((frame) => [frame.ref, listed(frame)] as const),
      ),
    ),
  )
  return next.projects.flatMap((project) =>
    project.pages.flatMap((page) =>
      page.frames
        .filter((frame) => {
          const was = before.get(frame.ref)
          return (
            frame.placed &&
            frame.hugHeight &&
            frame.widths.length > 0 &&
            was !== undefined &&
            was !== listed(frame)
          )
        })
        .map((frame) => frame.ref),
    ),
  )
}

function listed(frame: FrameRecord): string {
  return frame.widths.map(({ width }) => width).join(',')
}

/**
 * Frames whose kit changed, reloaded here, since the kit lives in
 * `layout.json`, which reloads nothing, and the frame route imports its sheets.
 */
export function rekittedRefs(previous: ListResult, next: ListResult): string[] {
  const before = new Map(
    previous.projects.flatMap((project) =>
      project.pages.flatMap((page) =>
        page.frames.map((frame) => [frame.ref, frame.kit ?? null] as const),
      ),
    ),
  )
  return next.projects.flatMap((project) =>
    project.pages.flatMap((page) =>
      page.frames
        .filter((frame) => {
          const was = before.get(frame.ref)
          return was !== undefined && was !== (frame.kit ?? null)
        })
        .map((frame) => frame.ref),
    ),
  )
}
