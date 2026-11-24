import type { Dirent } from 'node:fs'
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import { z } from 'zod'

import { ensureRunFolder } from '@/server/address'
import type { MeasuredSize } from '@/server/board/frames'
import {
  LOCK_SUFFIX,
  TEMP_SUFFIX,
  writeRecord,
} from '@/server/board/json-record'
import { boardPath } from '@/server/checks/frame-source'
import { boardSheetPath } from '@/server/checks/tokens'
import { contentHash } from '@/server/edit/address'
import { NOTES_FILE } from '@/server/notes/store'
import {
  ASSETS_FOLDER,
  FRAME_EXTENSION,
  LAYOUT_FILE,
  PROJECT_FILE,
  RUN_FOLDER,
  TOKEN_FILE,
} from '@/shared/board-files'
import { findingSchema } from '@/shared/records/check'
import type { FrameRecord } from '@/shared/records/list'
import { version as ownVersion } from '@/shared/version'

const STORE_FILE = 'checks.json'
/** How long a landed result waits, so a sweep of the board saves in few writes. */
const SAVE_MS = 2000

const keptSchema = z.object({
  key: z.string(),
  findings: z.array(findingSchema),
})

const storeSchema = z.looseObject({
  version: z.literal(1),
  frames: z.record(
    z.string(),
    z.object({
      checks: keptSchema.optional(),
      rendered: keptSchema.optional(),
      measured: z.string().optional(),
    }),
  ),
})

/** Findings under the key of what they were read from. */
export type Kept = z.infer<typeof keptSchema>

/** One frame's results, `measured` the key its stored size was measured under. */
export type RememberedFrame = z.infer<typeof storeSchema>['frames'][string]

/** The keys a frame's results are kept under, each moving with what that result depends on. */
export interface FrameKeys {
  checks: string
  rendered: string
  /** The key of a measure that stores `size`, or of the size the frame holds. */
  measured: (size?: MeasuredSize) => string
}

export interface KeyMaker {
  /**
   * The keys of what `frame` is now, null once its file is gone. Read before
   * the check whose result is kept, since an input written mid-check then
   * leaves an older key, which costs a recheck and never hides one.
   */
  of: (frame: FrameRecord) => Promise<FrameKeys | null>
  /** Forgets what a batch's paths may have moved. */
  drop: (paths: readonly string[]) => void
}

/**
 * Keys frames by the bytes of their file, project file, and token sheets, and
 * the path, size, and time of every other file in their page folder and their
 * project's `assets/`, beside the Frameboard version, which pins the rules,
 * the browser, and the faces.
 */
export function createFrameKeys(
  root: string,
  {
    tokens = null,
    version = ownVersion,
  }: { tokens?: string | null; version?: string } = {},
): KeyMaker {
  let boardSheet: Promise<string | null> | undefined
  const projects = new Map<string, Promise<string>>()
  const pages = new Map<string, Promise<PageFiles>>()

  const readBoardSheet = async () => {
    const path = boardSheetPath(root, tokens)
    return path && `${boardPath(root, path)}\n${await fileHash(path)}`
  }
  const readProject = async (dir: string) =>
    contentHash(
      JSON.stringify(
        await Promise.all([
          fileHash(join(dir, PROJECT_FILE)),
          fileHash(join(dir, TOKEN_FILE)),
          filesUnder(join(dir, ASSETS_FOLDER)),
        ]),
      ),
    )

  return {
    of: async (frame) => {
      let source: string
      try {
        source = await readFile(frame.path, 'utf8')
      } catch {
        return null
      }
      const { project, page } = frame
      const [sheet, inProject, inPage] = await Promise.all([
        (boardSheet ??= readBoardSheet()),
        memo(projects, project, () => readProject(join(root, project))),
        memo(pages, `${project}/${page}`, () =>
          readPage(join(root, project, page)),
        ),
      ])
      const checks = contentHash(
        JSON.stringify([
          version,
          contentHash(source),
          frame.kit ?? null,
          sheet,
          inProject,
          inPage.beside,
          // A neighbor reaches only a frame that embeds it.
          /<(?:iframe|object|embed)\b/i.test(source) ? inPage.frames : null,
        ]),
      )
      const drawn = [frame.device ?? null, frame.turn ?? null]
      return {
        checks,
        rendered: contentHash(
          JSON.stringify([
            checks,
            frame.box.width,
            frame.box.height,
            frame.widths.map(({ width, height }) => [width, height]),
            drawn,
            frame.scroll,
            frame.hugHeight,
          ]),
        ),
        measured: (size = {}) =>
          contentHash(
            JSON.stringify([
              checks,
              (frame.hugWidth ? size.width : undefined) ?? frame.box.width,
              (frame.hugHeight ? size.height : undefined) ?? frame.box.height,
              frame.widths.map(({ width, height }) => [
                width,
                (frame.hugHeight
                  ? size.widths?.find((each) => each.width === width)?.height
                  : undefined) ?? height,
              ]),
              drawn,
              frame.hugWidth,
              frame.hugHeight,
            ]),
          ),
      }
    },
    drop: (paths) => {
      for (const path of paths) {
        const [project, page] = relative(root, path).split(sep)
        if (path === tokens || project === TOKEN_FILE) boardSheet = undefined
        if (!project) continue
        projects.delete(project)
        pages.delete(`${project}/${page}`)
      }
    },
  }
}

export interface RememberedStore {
  /**
   * What the last server saved, any unreadable shape reading as empty, since
   * another build may have written it and a start never refuses over it.
   */
  load: () => Promise<Record<string, RememberedFrame>>
  /** Saves what is held a while from now, one write for every result landing until then. */
  saveSoon: () => void
  /** Saves at once what still waits, writing nothing when nothing does. */
  close: () => Promise<void>
}

export function rememberedPath(root: string): string {
  return join(root, RUN_FOLDER, STORE_FILE)
}

/** `.run/checks.json`, a cache written whole from what `held` answers. */
export function createRememberedStore(
  root: string,
  held: () => Record<string, RememberedFrame>,
): RememberedStore {
  let timer: ReturnType<typeof setTimeout> | undefined
  let saving: Promise<void> = Promise.resolve()

  const save = () => {
    clearTimeout(timer)
    timer = undefined
    saving = saving
      .then(async () => {
        await ensureRunFolder(root)
        await writeRecord(rememberedPath(root), { version: 1, frames: held() })
      })
      // A save that fails costs the next start its checks, never this one its findings.
      .catch(() => {})
  }

  return {
    load: async () => {
      try {
        const text = await readFile(rememberedPath(root), 'utf8')
        return storeSchema.parse(JSON.parse(text)).frames
      } catch {
        return {}
      }
    },
    saveSoon: () => {
      timer ??= setTimeout(save, SAVE_MS)
    },
    close: () => {
      if (timer !== undefined) save()
      return saving
    },
  }
}

function memo<T>(
  held: Map<string, Promise<T>>,
  name: string,
  read: () => Promise<T>,
): Promise<T> {
  const before = held.get(name)
  if (before) return before
  const reading = read()
  held.set(name, reading)
  return reading
}

async function fileHash(path: string): Promise<string | null> {
  try {
    return contentHash(await readFile(path))
  } catch {
    return null
  }
}

interface PageFiles {
  /** Every file but the page's frames and records, by path, size, and time. */
  beside: string[]
  /** The frame files by name. */
  frames: string[]
}

async function readPage(dir: string): Promise<PageFiles> {
  const entries = await entriesOf(dir)
  const isFrame = ({ name }: Dirent) => name.endsWith(FRAME_EXTENSION)
  const beside = entries.filter(
    (entry) =>
      !isFrame(entry) &&
      // An atomic write's `hero.html.swap` is its frame, as the watcher reads it.
      !entry.name.includes(`${FRAME_EXTENSION}.`) &&
      entry.name !== LAYOUT_FILE &&
      entry.name !== NOTES_FILE,
  )
  return {
    beside: await describeAll(dir, beside),
    frames: entries.filter(isFrame).map(({ name }) => name),
  }
}

/** Every file under `dir` as its path, size, and time, in path order. */
async function filesUnder(dir: string): Promise<string[]> {
  return describeAll(dir, await entriesOf(dir))
}

async function describeAll(
  dir: string,
  entries: readonly Dirent[],
): Promise<string[]> {
  const lines = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return filesUnder(path)
      try {
        const { size, mtimeMs } = await stat(path)
        // A link adds where it points and is never walked, so a loop of links ends.
        const target = entry.isSymbolicLink() ? await realpath(path) : ''
        return [[path, size, mtimeMs, target].join('\n')]
      } catch {
        return [path]
      }
    }),
  )
  return lines.flat()
}

/** A folder's entries by name, without what the watcher ignores, none for a missing one. */
async function entriesOf(dir: string): Promise<Dirent[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter(
        ({ name }) =>
          !name.startsWith('.') &&
          !name.endsWith(LOCK_SUFFIX) &&
          !name.endsWith(TEMP_SUFFIX),
      )
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  } catch {
    return []
  }
}
