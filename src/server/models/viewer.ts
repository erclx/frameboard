import { constants } from 'node:fs'
import { copyFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isCode } from '@/server/board/json-record'
import { ASSETS_FOLDER } from '@/shared/board-files'
import { VIEWER_FILE } from '@/shared/model-viewer'

/**
 * The viewer build a project's copy is taken from. A built run reads the
 * `viewer` folder the build put beside the bundle, and a source run reads the
 * pinned package.
 */
export function shippedViewerPath(moduleUrl: string = import.meta.url): string {
  if (!moduleUrl.endsWith('.ts')) {
    return fileURLToPath(new URL(`./viewer/${VIEWER_FILE}`, moduleUrl))
  }
  const manifest = createRequire(moduleUrl).resolve(
    '@google/model-viewer/package.json',
  )
  return join(dirname(manifest), 'dist', VIEWER_FILE)
}

/**
 * Copies the viewer script into a project's `assets/` unless a file already
 * holds its name, answering whether this call wrote it. A frame loads nothing
 * over the network, so each project carries its own copy.
 */
export async function ensureViewer(
  projectDir: string,
  shipped: string = shippedViewerPath(),
): Promise<boolean> {
  const folder = join(projectDir, ASSETS_FOLDER)
  await mkdir(folder, { recursive: true })
  try {
    await copyFile(shipped, join(folder, VIEWER_FILE), constants.COPYFILE_EXCL)
    return true
  } catch (error) {
    if (isCode(error, 'EEXIST')) return false
    throw error
  }
}
