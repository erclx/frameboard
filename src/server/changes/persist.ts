import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { z } from 'zod'

import { RUN_FOLDER } from '@/shared/board-files'
import type { FrameChange } from '@/shared/records/changes'

import { ensureRunFolder } from '../address'
import { writeRecord } from '../board/json-record'

const LOG_FILE = 'log.json'
const VERSIONS_FOLDER = 'versions'
const VERSION_EXTENSION = '.html'
const HASH = /^[0-9a-f]{64}$/

const changeSchema = z.looseObject({
  id: z.string(),
  frame: z.string(),
  at: z.string(),
  hash: z.string(),
  author: z
    .looseObject({ session: z.string(), agent: z.string(), tag: z.string() })
    .nullable(),
  elements: z.array(z.number()),
  removed: z.number(),
  whole: z.boolean(),
  created: z.boolean(),
  before: z.string().optional(),
})

const logSchema = z.looseObject({
  version: z.literal(1),
  changes: z.array(changeSchema),
})

export interface SavedChanges {
  /** The logged changes, oldest first. */
  changes: FrameChange[]
  /** The sources the changes name as `before`, by content hash. */
  versions: Map<string, string>
}

/** `.run/changes/`, which holds the change log across a restart. */
export function changesFolder(root: string): string {
  return join(root, RUN_FOLDER, 'changes')
}

/**
 * The log a previous server saved, its newest `cap` changes kept. A missing
 * file, a parse failure, or a shape this build does not know reads as an
 * empty log, since a newer or older build may have written it and a start
 * never refuses over it. A version file that is gone leaves its change in
 * the log with nothing to compare against.
 */
export async function loadChanges(
  root: string,
  cap: number,
): Promise<SavedChanges> {
  const folder = changesFolder(root)
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(join(folder, LOG_FILE), 'utf8'))
  } catch {
    return { changes: [], versions: new Map() }
  }
  const parsed = logSchema.safeParse(raw)
  if (!parsed.success) return { changes: [], versions: new Map() }
  const changes = (parsed.data.changes as FrameChange[]).slice(-cap)

  const versions = new Map<string, string>()
  await Promise.all(
    [...beforeHashes(changes)].map(async (hash) => {
      try {
        versions.set(hash, await readFile(versionPath(folder, hash), 'utf8'))
      } catch {
        // A version removed by hand leaves its change with no compare.
      }
    }),
  )
  return { changes, versions }
}

/**
 * Writes the log whole and each version it names once, by content hash, and
 * removes every version file no change names any longer.
 */
export async function saveChanges(
  root: string,
  changes: readonly FrameChange[],
  versions: ReadonlyMap<string, string>,
): Promise<void> {
  await ensureRunFolder(root)
  const folder = changesFolder(root)
  const versionsFolder = join(folder, VERSIONS_FOLDER)
  await mkdir(versionsFolder, { recursive: true })

  const named = beforeHashes(changes)
  const present = new Set(
    (await readdir(versionsFolder))
      .filter((name) => name.endsWith(VERSION_EXTENSION))
      .map((name) => name.slice(0, -VERSION_EXTENSION.length)),
  )
  await Promise.all(
    [...named]
      .filter((hash) => !present.has(hash))
      .flatMap((hash) => {
        const source = versions.get(hash)
        return source === undefined
          ? []
          : [writeFile(versionPath(folder, hash), source)]
      }),
  )
  await writeRecord(join(folder, LOG_FILE), { version: 1, changes })
  await Promise.all(
    [...present]
      .filter((hash) => !named.has(hash))
      .map((hash) => rm(versionPath(folder, hash), { force: true })),
  )
}

function beforeHashes(changes: readonly FrameChange[]): Set<string> {
  return new Set(
    changes.flatMap((change) =>
      change.before && HASH.test(change.before) ? [change.before] : [],
    ),
  )
}

function versionPath(folder: string, hash: string): string {
  return join(folder, VERSIONS_FOLDER, `${hash}${VERSION_EXTENSION}`)
}
