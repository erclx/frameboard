import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { RUN_FOLDER } from '@/shared/board-files'

const TRASH_FOLDER = 'trash'

/**
 * Where the `index`th path a step takes out waits. The trash sits in `.run/`
 * inside the board root, so taking a path out is a rename on one volume, and
 * the watcher and scanner already skip the dot folder.
 */
export function trashSlot(root: string, step: number, index: number): string {
  return join(root, RUN_FOLDER, TRASH_FOLDER, String(step), String(index))
}

export async function takeOut(path: string, slot: string): Promise<void> {
  await mkdir(dirname(slot), { recursive: true })
  await rename(path, slot)
}

/** Emptied when the server starts and stops, since the history it serves lives in memory. */
export async function emptyTrash(root: string): Promise<void> {
  await rm(join(root, RUN_FOLDER, TRASH_FOLDER), {
    recursive: true,
    force: true,
  })
}
