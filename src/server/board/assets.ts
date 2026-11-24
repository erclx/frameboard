import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import {
  link,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, join, sep } from 'node:path'

import { type FrameTarget, readFrame } from '@/server/checks/frame-source'
import { holdsRecord } from '@/server/fonts/installed'
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
import { FONTS_FOLDER } from '@/shared/fonts'
import { PROJECT_KITS } from '@/shared/kits'
import {
  isValidName,
  NAME_MAX_LENGTH,
  namesCollide,
  nextFreeName,
} from '@/shared/names'
import type {
  AssetAddResult,
  AssetFile,
  AssetWriteResult,
} from '@/shared/records/assets'
import { LICENSE_FILE_SUFFIX } from '@/shared/records/sourcing'

import { framesLinking, rewriteAssetLinks } from './asset-links'
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
 * `confinedAsset` refuses, a license file, a kit's file, or an installed
 * font's, whose record and license hold only while it stands as served.
 */
async function writableAsset(
  projectDir: string,
  path: string,
): Promise<string> {
  const file =
    path.split('/')[0] === PROJECT_KITS ||
    path.endsWith(LICENSE_FILE_SUFFIX) ||
    isInstalledFontFile(projectDir, path)
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

function isInstalledFontFile(projectDir: string, path: string): boolean {
  const [folder, id, ...rest] = path.split('/')
  return (
    folder === FONTS_FOLDER &&
    id !== undefined &&
    rest.length > 0 &&
    holdsRecord(projectDir, id)
  )
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
 * Writes an upload's bytes under an asset's path and takes its license out, since it named the old bytes.
 * Refuses `asset-type-refused` for an upload a drop refuses or of another kind, which frames would change under.
 */
export async function replaceAsset(
  projectDir: string,
  path: string,
  upload: AssetUpload,
  { journal }: JournalOptions = {},
): Promise<AssetWriteResult> {
  const file = await writableAsset(projectDir, path)
  const refusal =
    uploadRefusal(upload) ??
    (assetKind(upload.name) === assetKind(path)
      ? null
      : `${upload.name} is not the same kind of file as ${path}, so it cannot replace it.`)
  if (refusal !== null) {
    throw new FrameboardError('asset-type-refused', refusal, { path })
  }
  const temp = join(
    dirname(file),
    `${randomBytes(6).toString('hex')}${TEMP_SUFFIX}`,
  )
  await writeFile(temp, upload.bytes, { flag: 'wx' })
  try {
    const license = licenseOf(file)
    if (journal) {
      await journal.replaced(file, temp)
      if (license !== null) await journal.removed(license)
    } else {
      await rename(temp, file)
      if (license !== null) await rm(license)
    }
  } finally {
    await rm(temp, { force: true })
  }
  return { path, frames: [] }
}

/** Checks the frames a rename would rewrite, by ref, throwing to refuse it. */
export type RenameGate = (refs: string[]) => Promise<void>

export interface RenameOptions extends JournalOptions {
  gate?: RenameGate
}

/**
 * Renames an asset and its license and repoints every linking frame, writing nothing until the gate passes,
 * and puts written frames back when a later write fails, so no project is left half renamed.
 * Refuses `invalid-name` off the name rule or for a new extension, and `name-taken` for a name held in any case.
 */
export async function renameAsset(
  root: string,
  project: string,
  path: string,
  name: string,
  { journal, gate = async () => {} }: RenameOptions = {},
): Promise<AssetWriteResult> {
  const projectDir = join(root, project)
  const file = await writableAsset(projectDir, path)
  const folder = dirname(file)
  const from = basename(file)
  const renamed = [...path.split('/').slice(0, -1), name].join('/')
  if (name === from) return { path, frames: [] }
  if (
    !isValidName(name) ||
    isScratch(name) ||
    name.endsWith(LICENSE_FILE_SUFFIX) ||
    extensionOf(name) !== extensionOf(from)
  ) {
    throw new FrameboardError(
      'invalid-name',
      `${name} is not a name ${from} can take. Use letters, digits, dots, dashes, and underscores, keep the .${extensionOf(from)} ending, and stay within ${NAME_MAX_LENGTH} characters.`,
      { path, name },
    )
  }
  const taken = (await readdir(folder)).find(
    (entry) =>
      entry !== from &&
      entry !== `${from}${LICENSE_FILE_SUFFIX}` &&
      (namesCollide(entry, name) ||
        namesCollide(entry, `${name}${LICENSE_FILE_SUFFIX}`)),
  )
  if (taken !== undefined) {
    throw new FrameboardError(
      'name-taken',
      `assets/${[...path.split('/').slice(0, -1), taken].join('/')} already exists. Pick another name.`,
      { path, name },
    )
  }

  const frames = await framesLinking(root, project, path)
  const ref = ({ page, name: frame }: FrameTarget) =>
    `${project}/${page}/${frame}`
  await gate(frames.map(ref))

  const target = join(folder, name)
  const rewrites = frames.flatMap((frame) => {
    const source = readFrame(frame)
    if (!Buffer.from(source.html, 'utf8').equals(readFileSync(source.path))) {
      throw new FrameboardError(
        'invalid-utf8',
        `${ref(frame)} is not UTF-8, so the rename cannot point its links at ${name}. Nothing was renamed.`,
        { frame: ref(frame) },
      )
    }
    const after = rewriteAssetLinks(source, file, target)
    return after === null
      ? []
      : [{ path: source.path, ref: ref(frame), before: source.html, after }]
  })
  const written: typeof rewrites = []
  const license = licenseOf(file)
  try {
    for (const rewrite of rewrites) {
      await writeFrameWhole(rewrite.path, rewrite.before, rewrite.after)
      written.push(rewrite)
    }
    if (journal) {
      for (const each of written) {
        journal.rewritten(each.path, each.ref, each.before, each.after)
      }
      await journal.moved(file, target)
      if (license !== null) {
        await journal.moved(license, `${target}${LICENSE_FILE_SUFFIX}`)
      }
    } else {
      await rename(file, target)
      if (license !== null) {
        await rename(license, `${target}${LICENSE_FILE_SUFFIX}`)
      }
    }
  } catch (error) {
    for (const each of written.toReversed()) {
      await writeFrameWhole(each.path, each.after, each.before).catch(() => {})
    }
    throw error
  }
  return { path: renamed, frames: written.map((each) => each.ref) }
}

/**
 * Writes a frame file whole through a temp file, refusing with
 * `stale-address` when the file no longer holds `before`, so an agent's
 * write that landed since is never overwritten.
 */
async function writeFrameWhole(
  path: string,
  before: string,
  after: string,
): Promise<void> {
  const temp = join(
    dirname(path),
    `.${basename(path)}.${randomBytes(6).toString('hex')}${TEMP_SUFFIX}`,
  )
  await writeFile(temp, after)
  try {
    if ((await readFile(path, 'utf8')) !== before) {
      throw new FrameboardError(
        'stale-address',
        `An agent changed ${basename(path)} while the rename read it, so nothing was renamed. Try again.`,
        { path },
      )
    }
    await rename(temp, path)
  } finally {
    await rm(temp, { force: true })
  }
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
