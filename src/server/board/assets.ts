import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
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
  isForeignModel,
  isPlaceableKind,
  type PlaceableKind,
} from '@/shared/asset-kinds'
import { ASSETS_FOLDER } from '@/shared/board-files'
import { FrameboardError } from '@/shared/errors'
import { PROJECT_KITS } from '@/shared/kits'
import { NAME_MAX_LENGTH, nextFreeName } from '@/shared/names'
import type {
  AssetAddResult,
  AssetFile,
  AssetWriteResult,
} from '@/shared/records/assets'
import { LICENSE_FILE_SUFFIX } from '@/shared/records/sourcing'

import type { JournalOptions } from './journal'
import { isCode, LOCK_SUFFIX, TEMP_SUFFIX } from './json-record'

/** One dropped file, by the name it came with. */
export interface AssetUpload {
  name: string
  bytes: Uint8Array
}

/**
 * Every file under a project's `assets/` by relative path, skipping dot-named
 * paths, lock, temp, and license files, and any file whose real path leaves
 * the folder. A folder that does not exist lists as empty.
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
  if ((await confinedAsset(projectDir, path)) === null) {
    return {
      ok: false,
      code: 'asset-missing',
      message: `assets/${path} is not a file in the project's assets folder`,
    }
  }
  const kind = assetKind(path)
  if (!isPlaceableKind(kind)) {
    return {
      ok: false,
      code: 'asset-not-placeable',
      message: `assets/${path} is not an image, GIF, SVG, video, audio, or 3D model, so a frame cannot show it`,
    }
  }
  return { ok: true, kind }
}

/**
 * The absolute path of a file under the project's `assets/`, or null for a
 * path naming a dot, lock, or temp segment, or whose real path leaves the
 * folder or is not a file.
 */
async function confinedAsset(
  projectDir: string,
  path: string,
): Promise<string | null> {
  const segments = path.split('/')
  if (
    segments.some(
      (segment) =>
        segment === '' || segment.startsWith('.') || isScratch(segment),
    )
  ) {
    return null
  }
  const folder = join(projectDir, ASSETS_FOLDER)
  const file = join(folder, ...segments)
  try {
    const real = await realpath(folder)
    const target = await realpath(file)
    if (!target.startsWith(real + sep) || !(await stat(target)).isFile()) {
      return null
    }
  } catch (error) {
    if (isCode(error, 'ENOENT') || isCode(error, 'ENOTDIR')) return null
    throw error
  }
  return file
}

/**
 * A file a hand write may change, refusing `asset-not-found` for one
 * `confinedAsset` refuses, a license file, or a kit's file, which the Theme
 * tab owns.
 */
async function writableAsset(
  projectDir: string,
  path: string,
): Promise<string> {
  const file =
    path.split('/')[0] === PROJECT_KITS || path.endsWith(LICENSE_FILE_SUFFIX)
      ? null
      : await confinedAsset(projectDir, path)
  if (file === null) {
    throw new FrameboardError(
      'asset-not-found',
      `assets/${path} is not a file in the project's assets folder.`,
      { path },
    )
  }
  return file
}

/** The license file beside an asset, when it has one. */
function licenseOf(file: string): string | null {
  const license = `${file}${LICENSE_FILE_SUFFIX}`
  return existsSync(license) ? license : null
}

/**
 * Deletes an asset and its license file, each taken out through the journal
 * where one is given, so an undo brings both back.
 */
export async function removeAsset(
  projectDir: string,
  path: string,
  { journal }: JournalOptions = {},
): Promise<AssetWriteResult> {
  const file = await writableAsset(projectDir, path)
  for (const each of [file, licenseOf(file)]) {
    if (each === null) continue
    if (journal) await journal.removed(each)
    else await rm(each)
  }
  return { path, frames: [] }
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
    const refusal = uploadRefusal(upload)
    if (refusal !== null) {
      result.refused.push({
        name: upload.name,
        code: 'asset-type-refused',
        message: refusal,
      })
      continue
    }
    await mkdir(folder, { recursive: true })
    const path = await writeFree(folder, upload)
    result.added.push({ name: upload.name, path })
  }
  return result
}

/** Why a drop refuses a file, or null for one it keeps. */
function uploadRefusal({ name, bytes }: AssetUpload): string | null {
  if (isForeignModel(name)) {
    return `${name} is a 3D model a frame cannot show. Open it in Blender, export it through File, Export, glTF 2.0 as a glTF Binary (.glb), and drop that file.`
  }
  if (!isAcceptedUpload(name)) {
    return `${name} is not an image, GIF, SVG, video, audio, 3D model, font, stylesheet, or script.`
  }
  return extensionOf(name) === 'gltf' ? gltfRefusal(name, bytes) : null
}

/**
 * Why a `.gltf` cannot land alone, or null for one carrying its buffers and
 * images inside itself. A drop keeps one file per name, so a `.bin` or a
 * texture the model loads beside it would be left behind.
 */
function gltfRefusal(name: string, bytes: Uint8Array): string | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return `${name} is not a glTF file a model reads. Export it again as a glTF Binary (.glb).`
  }
  const beside = [
    ...linkedUris(parsed, 'buffers'),
    ...linkedUris(parsed, 'images'),
  ]
  const [first] = beside
  return first === undefined
    ? null
    : `${name} loads ${first} from beside it, which a drop cannot keep with it. Export it as one glTF Binary (.glb) instead.`
}

/** The `uri` of each entry under `key` that names a file rather than carrying its bytes. */
function linkedUris(gltf: unknown, key: 'buffers' | 'images'): string[] {
  if (typeof gltf !== 'object' || gltf === null) return []
  const entries: unknown = (gltf as Record<string, unknown>)[key]
  if (!Array.isArray(entries)) return []
  return entries.flatMap((entry: unknown) => {
    const uri =
      typeof entry === 'object' && entry !== null
        ? (entry as Record<string, unknown>).uri
        : undefined
    return typeof uri === 'string' && !uri.startsWith('data:') ? [uri] : []
  })
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
