import { randomBytes } from 'node:crypto'
import {
  link,
  mkdir,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { join, sep } from 'node:path'

import {
  assetKind,
  extensionOf,
  isAcceptedUpload,
  isPlaceableKind,
  type PlaceableKind,
} from '@/shared/asset-kinds'
import { ASSETS_FOLDER } from '@/shared/board-files'
import { NAME_MAX_LENGTH, nextFreeName } from '@/shared/names'
import type { AssetAddResult, AssetFile } from '@/shared/records/assets'
import { LICENSE_FILE_SUFFIX } from '@/shared/records/sourcing'

import { isCode, LOCK_SUFFIX, TEMP_SUFFIX } from './json-record'

/** One dropped file, by the name it came with. */
export interface AssetUpload {
  name: string
  bytes: Uint8Array
}

/**
 * Every file under a project's `assets/` by relative path, skipping dot-named
 * paths, lock and temp files, `*.license.json` files, and any file whose real
 * path leaves the folder. The Assets tab and the usage counts both read it.
 * A folder that does not exist lists as empty.
 */
export async function listAssets(projectDir: string): Promise<AssetFile[]> {
  const folder = join(projectDir, ASSETS_FOLDER)
  let real: string
  try {
    real = await realpath(folder)
  } catch (error) {
    if (isCode(error, 'ENOENT') || isCode(error, 'ENOTDIR')) return []
    throw error
  }
  const files: AssetFile[] = []
  await walk(folder, '', real, files)
  return files.sort((a, b) => byPath(a.path, b.path))
}

/** Case-insensitive, so `Inter.woff2` sorts among the h and j files, with the exact path breaking a tie. */
function byPath(a: string, b: string): number {
  const folded = a.toLowerCase().localeCompare(b.toLowerCase())
  return folded !== 0 ? folded : a < b ? -1 : a > b ? 1 : 0
}

async function walk(
  folder: string,
  prefix: string,
  real: string,
  into: AssetFile[],
): Promise<void> {
  const entries = await readdir(folder, { withFileTypes: true })
  for (const entry of entries) {
    const name = entry.name
    if (name.startsWith('.') || isScratch(name)) continue
    const path = join(folder, name)
    if (entry.isDirectory()) {
      await walk(path, `${prefix}${name}/`, real, into)
      continue
    }
    // An image's license file shows on the image's own tile, never as a tile of its own.
    if (name.endsWith(LICENSE_FILE_SUFFIX)) continue
    // A symlink counts only when it resolves to a file inside the folder.
    let target: string
    let size: number
    try {
      target = await realpath(path)
      const info = await stat(target)
      if (!info.isFile()) continue
      size = info.size
    } catch {
      continue
    }
    if (!target.startsWith(real + sep)) continue
    into.push({ path: `${prefix}${name}`, kind: assetKind(name), size })
  }
}

export type ResolvedAsset =
  | { readonly ok: true; readonly kind: PlaceableKind }
  | {
      readonly ok: false
      readonly code: 'asset-missing' | 'asset-not-placeable'
      readonly message: string
    }

/**
 * A placeable asset's kind, confined as `listAssets` is, so a path leaving the
 * folder reads `asset-missing` and an unshowable file `asset-not-placeable`.
 */
export async function resolveAsset(
  projectDir: string,
  path: string,
): Promise<ResolvedAsset> {
  const missing = {
    ok: false,
    code: 'asset-missing',
    message: `assets/${path} is not a file in the project's assets folder`,
  } as const
  const segments = path.split('/')
  if (
    segments.some(
      (segment) =>
        segment === '' || segment.startsWith('.') || isScratch(segment),
    )
  ) {
    return missing
  }
  const folder = join(projectDir, ASSETS_FOLDER)
  try {
    const real = await realpath(folder)
    const target = await realpath(join(folder, ...segments))
    if (!target.startsWith(real + sep) || !(await stat(target)).isFile()) {
      return missing
    }
  } catch (error) {
    if (isCode(error, 'ENOENT') || isCode(error, 'ENOTDIR')) return missing
    throw error
  }
  const kind = assetKind(path)
  if (!isPlaceableKind(kind)) {
    return {
      ok: false,
      code: 'asset-not-placeable',
      message: `assets/${path} is not an image, GIF, SVG, video, or audio, so a frame cannot show it`,
    }
  }
  return { ok: true, kind }
}

function isScratch(name: string): boolean {
  return name.endsWith(LOCK_SUFFIX) || name.endsWith(TEMP_SUFFIX)
}

/**
 * Writes each upload under the first free name, hard-linking a temp file so a
 * name an agent took in between is never overwritten.
 */
export async function addAssets(
  projectDir: string,
  uploads: AssetUpload[],
): Promise<AssetAddResult> {
  const folder = join(projectDir, ASSETS_FOLDER)
  const result: AssetAddResult = { added: [], refused: [] }
  for (const upload of uploads) {
    if (!isAcceptedUpload(upload.name)) {
      result.refused.push({
        name: upload.name,
        code: 'asset-type-refused',
        message: `${upload.name} is not an image, GIF, SVG, video, audio, font, stylesheet, or script.`,
      })
      continue
    }
    await mkdir(folder, { recursive: true })
    const path = await writeFree(folder, upload)
    result.added.push({ name: upload.name, path })
  }
  return result
}

async function writeFree(
  folder: string,
  { name, bytes }: AssetUpload,
): Promise<string> {
  const { stem, extension } = splitName(name)
  const temp = join(folder, `${randomBytes(6).toString('hex')}${TEMP_SUFFIX}`)
  await writeFile(temp, bytes, { flag: 'wx' })
  try {
    const raced = new Set<string>()
    for (;;) {
      const taken = await takenStems(folder, extension)
      const free = `${nextFreeName(stem, [...taken, ...raced])}.${extension}`
      try {
        await link(temp, join(folder, free))
        return free
      } catch (error) {
        if (!isCode(error, 'EEXIST')) throw error
        raced.add(free.slice(0, -(extension.length + 1)))
      }
    }
  } finally {
    await rm(temp, { force: true })
  }
}

/** The stems of the top-level entries that already end in `.<extension>`, in any case. */
async function takenStems(
  folder: string,
  extension: string,
): Promise<string[]> {
  const suffix = `.${extension}`
  const names = await readdir(folder)
  return names
    .filter((name) => name.toLowerCase().endsWith(suffix))
    .map((name) => name.slice(0, -suffix.length))
}

/**
 * The board's name rule for a dropped name, an emptied stem becoming `file`
 * and the whole name kept within the cap.
 */
export function splitName(name: string): { stem: string; extension: string } {
  const extension = extensionOf(name)
  const base = extension === '' ? name : name.slice(0, -(extension.length + 1))
  const stem = base
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[._-]+/, '')
    .slice(0, NAME_MAX_LENGTH - extension.length - 1 - 4)
  return { stem: stem === '' ? 'file' : stem, extension }
}
