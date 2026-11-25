import type { BigIntStats } from 'node:fs'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'

/** Each project folder's identity by name, null for one that could not be told. */
export type Folders = ReadonlyMap<string, string | null>

export interface FolderRename {
  before: string
  after: string
}

/**
 * What a rename keeps and no other folder shares. A freed inode goes to the
 * next folder made, so without a birth time a folder has none.
 */
export function identityOf({
  dev,
  ino,
  birthtimeNs,
}: Pick<BigIntStats, 'dev' | 'ino' | 'birthtimeNs'>): string | null {
  return birthtimeNs === 0n ? null : `${dev}:${ino}:${birthtimeNs}`
}

export async function readFolders(
  root: string,
  names: readonly string[],
): Promise<Folders> {
  return new Map(
    await Promise.all(
      names.map(async (name) => {
        try {
          const stats = await stat(join(root, name), { bigint: true })
          return [name, identityOf(stats)] as const
        } catch {
          // Moved since the scan that named it, so the next scan finds it.
          return [name, null] as const
        }
      }),
    ),
  )
}

/** `found`, where a folder that could not be told keeps what `held` knew of its name. */
export function keepFolders(held: Folders, found: Folders): Folders {
  return new Map(
    [...found].map(([name, id]) => [name, id ?? held.get(name) ?? null]),
  )
}

export function renameFolder(
  folders: Folders,
  before: string,
  after: string,
): Folders {
  return new Map(
    [...folders].map(([name, id]) => [name === before ? after : name, id]),
  )
}

/**
 * The folders `found` holds under another name than `held` does, ordered so
 * each target is free by its turn. One whose target never frees, as in a
 * swap, is left out.
 */
export function folderRenames(held: Folders, found: Folders): FolderRename[] {
  const named = new Map([...held].map(([name, id]) => [id, name]))
  let waiting = [...found].flatMap(([after, id]) => {
    const before = id === null ? undefined : named.get(id)
    return before === undefined || found.get(before) === id
      ? []
      : [{ before, after }]
  })
  const taken = new Set(held.keys())
  const renames: FolderRename[] = []
  for (;;) {
    const next = waiting.find(({ after }) => !taken.has(after))
    if (!next) return renames
    taken.delete(next.before)
    taken.add(next.after)
    renames.push(next)
    waiting = waiting.filter((rename) => rename !== next)
  }
}
