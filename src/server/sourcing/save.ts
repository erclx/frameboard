import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rename, rm, rmdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { addAssets } from '@/server/board/assets'
import type { JournalOptions } from '@/server/board/journal'
import { isCode, TEMP_SUFFIX } from '@/server/board/json-record'
import { matchName } from '@/server/board/refs'
import { FONT_RECORD, fontFolders, fontsDir } from '@/server/fonts/installed'
import { assetKind } from '@/shared/asset-kinds'
import { ASSETS_FOLDER } from '@/shared/board-files'
import { FrameboardError } from '@/shared/errors'
import { FONT_LICENSE_TEXT, FONTS_FOLDER } from '@/shared/fonts'
import { folderName, isValidName, NAME_PATTERN } from '@/shared/names'
import {
  type FontLicenseFile,
  LICENSE_FILE_SUFFIX,
  type LicenseFile,
  type SavedFont,
  type SavedImage,
  type SavedModel,
} from '@/shared/records/sourcing'
import { version } from '@/shared/version'

/** The most bytes one download takes, so a runaway response never fills memory. */
export const DOWNLOAD_LIMIT = 64 * 1024 * 1024

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
}

/** Image bytes with the extension their type names. */
export interface ImageBytes {
  bytes: Uint8Array
  extension: string
}

/**
 * The extension an image's media type names, else the one its URL ends in,
 * null when neither names an image a frame shows.
 */
export function imageExtension(
  mediaType: string | null,
  url: string | null,
): string | null {
  const type = mediaType?.split(';')[0]?.trim().toLowerCase() ?? ''
  const fromType = IMAGE_TYPES[type]
  if (fromType !== undefined) return fromType
  if (url === null) return null
  const name = new URL(url).pathname.split('/').at(-1) ?? ''
  const kind = assetKind(name)
  return kind === 'image' || kind === 'gif' || kind === 'svg'
    ? name.slice(name.lastIndexOf('.') + 1).toLowerCase()
    : null
}

/**
 * Downloads a whole image into memory before anything is written, so a
 * download failing partway leaves no file. Refuses `source-failed` on a
 * failed request, a body past `limit`, or a file that is no image.
 */
export async function downloadImage(
  url: string,
  send: typeof fetch,
  limit = DOWNLOAD_LIMIT,
): Promise<ImageBytes> {
  const { bytes, mediaType, status } = await download(url, send, limit)
  const extension = imageExtension(mediaType, url)
  if (extension === null) {
    throw new FrameboardError(
      'source-failed',
      'The download is not an image a frame shows.',
      { url, status },
    )
  }
  return { bytes, extension }
}

/** A whole response body held in memory, with the media type the host named. */
export interface Downloaded {
  bytes: Uint8Array
  mediaType: string | null
  status: number
}

/**
 * Downloads one file whole into memory, carrying the Frameboard user agent.
 * Refuses `source-failed` on a failed request or a body past `limit`, with
 * the URL and the status in the details.
 */
export async function download(
  url: string,
  send: typeof fetch,
  limit = DOWNLOAD_LIMIT,
): Promise<Downloaded> {
  const failed = (message: string, status: number | null) =>
    new FrameboardError('source-failed', message, { url, status })
  let response: Response
  try {
    response = await send(url, {
      headers: { 'User-Agent': `frameboard/${version}` },
    })
  } catch (error) {
    throw failed(
      `${url} did not download: ${error instanceof Error ? error.message : String(error)}`,
      null,
    )
  }
  if (!response.ok) {
    throw failed(
      `The host of ${url} answered ${response.status}.`,
      response.status,
    )
  }
  try {
    return {
      bytes: await readCapped(response, limit),
      mediaType: response.headers.get('content-type'),
      status: response.status,
    }
  } catch (error) {
    if (error instanceof FrameboardError) throw error
    throw failed(
      `${url} stopped downloading: ${error instanceof Error ? error.message : String(error)}`,
      response.status,
    )
  }
}

/** Reads the body chunk by chunk and stops once it passes `limit`, whatever length the host declared. */
async function readCapped(
  response: Response,
  limit: number,
): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') ?? Number.NaN)
  if (declared > limit) throw tooLarge(limit)
  const chunks: Uint8Array[] = []
  let total = 0
  const reader = response.body?.getReader()
  for (let chunk = await reader?.read(); chunk && !chunk.done;) {
    total += chunk.value.byteLength
    if (total > limit) {
      await reader?.cancel()
      throw tooLarge(limit)
    }
    chunks.push(chunk.value)
    chunk = await reader?.read()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function tooLarge(limit: number): FrameboardError {
  return new FrameboardError(
    'source-failed',
    `The download is past ${limit / 1024 / 1024} MiB.`,
    { limit },
  )
}

/**
 * The stem a saved file takes: `--name` when given, else the query or prompt
 * as a lowercase dashed name, else `fallback`. Refuses `invalid-name` for
 * a `--name` breaking the board name rule.
 */
export function savedStem(
  name: string | undefined,
  text: string,
  fallback = 'image',
): string {
  if (name === undefined) return folderName(text) || fallback
  if (!isValidName(name)) {
    throw new FrameboardError(
      'invalid-name',
      `--name ${name} breaks the board's name rule, ${NAME_PATTERN.source}.`,
      { name },
    )
  }
  return name
}

/**
 * Writes the image into the project's `assets/` under the first free name
 * from the stem, then its license file as `<landed name>.license.json`. A
 * license file that fails to land takes the image back out.
 */
export function saveImage(
  project: { name: string; path: string },
  stem: string,
  image: ImageBytes,
  license: LicenseFile,
): Promise<SavedImage> {
  return saveWithLicense(
    project,
    `${stem}.${image.extension}`,
    image.bytes,
    license,
  )
}

/**
 * Writes a packed model into the project's `assets/` as `<stem>.glb`, or the
 * first free name from it, with its license file beside it as `saveImage`
 * writes an image's.
 */
export function saveModel(
  project: { name: string; path: string },
  stem: string,
  glb: Uint8Array,
  license: LicenseFile,
): Promise<SavedModel> {
  return saveWithLicense(project, `${stem}.glb`, glb, license)
}

/**
 * Writes a family's files as served, its license text, and its record into
 * `assets/fonts/<id>/`, in one rename so a project holds all of it or none.
 * Refuses `name-taken` for a folder already there, whatever holds it.
 */
export async function saveFont(
  project: { name: string; path: string },
  font: { files: ReadonlyMap<string, Uint8Array>; licenseText: Uint8Array },
  license: FontLicenseFile,
  { journal }: JournalOptions = {},
): Promise<SavedFont> {
  const { id } = license
  await assertFontFree(project, id)
  const fonts = fontsDir(project.path)
  const fresh = !existsSync(fonts)
  await mkdir(fonts, { recursive: true })
  const staging = join(
    fonts,
    `.${randomBytes(6).toString('hex')}${TEMP_SUFFIX}`,
  )
  const target = join(fonts, id)
  try {
    await mkdir(staging)
    await Promise.all(
      [
        ...font.files,
        [FONT_LICENSE_TEXT, font.licenseText] as const,
        [FONT_RECORD, `${JSON.stringify(license, null, 2)}\n`] as const,
      ].map(([name, contents]) => writeFile(join(staging, name), contents)),
    )
    await rename(staging, target)
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    if (fresh) await rmdir(fonts).catch(() => {})
    if (isCode(error, 'ENOTEMPTY') || isCode(error, 'EEXIST')) {
      throw fontTaken(project.name, id)
    }
    throw error
  }
  await journal?.created(target)
  const path = `${FONTS_FOLDER}/${id}`
  return {
    version: 1,
    project: project.name,
    path,
    licensePath: `${path}/${FONT_RECORD}`,
    license,
  }
}

/** Refuses `name-taken` for a font folder the project already holds, in any case, whatever filled it. */
export async function assertFontFree(
  project: { name: string; path: string },
  id: string,
): Promise<void> {
  const held = matchName(await fontFolders(project.path), id)
  if (held !== undefined) throw fontTaken(project.name, held)
}

function fontTaken(project: string, id: string): FrameboardError {
  return new FrameboardError(
    'name-taken',
    `${project} already holds assets/${FONTS_FOLDER}/${id}/, so nothing was installed. Take it out with \`frameboard font remove ${id} --project ${project}\` to install it again.`,
    { project, id },
  )
}

async function saveWithLicense(
  project: { name: string; path: string },
  name: string,
  bytes: Uint8Array,
  license: LicenseFile,
): Promise<SavedImage> {
  const { added, refused } = await addAssets(project.path, [{ name, bytes }])
  const landed = added[0]
  if (landed === undefined) {
    throw new FrameboardError(
      'asset-type-refused',
      refused[0]?.message ?? `${name} was refused.`,
    )
  }
  const folder = join(project.path, ASSETS_FOLDER)
  const licensePath = `${landed.path}${LICENSE_FILE_SUFFIX}`
  const temp = join(folder, `${randomBytes(6).toString('hex')}${TEMP_SUFFIX}`)
  try {
    await writeFile(temp, `${JSON.stringify(license, null, 2)}\n`, {
      flag: 'wx',
    })
    await rename(temp, join(folder, licensePath))
  } catch (error) {
    await Promise.all([
      rm(temp, { force: true }),
      rm(join(folder, landed.path), { force: true }),
    ])
    throw error
  }
  return {
    version: 1,
    project: project.name,
    path: landed.path,
    licensePath,
    license,
  }
}
