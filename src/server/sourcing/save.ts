import { randomBytes } from 'node:crypto'
import { rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { addAssets } from '@/server/board/assets'
import { TEMP_SUFFIX } from '@/server/board/json-record'
import { assetKind } from '@/shared/asset-kinds'
import { ASSETS_FOLDER } from '@/shared/board-files'
import { FrameboardError } from '@/shared/errors'
import { folderName, isValidName, NAME_PATTERN } from '@/shared/names'
import {
  LICENSE_FILE_SUFFIX,
  type LicenseFile,
  type SavedImage,
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
  const failed = (message: string, status: number | null) =>
    new FrameboardError('source-failed', message, { url, status })
  let response: Response
  try {
    response = await send(url, {
      headers: { 'User-Agent': `frameboard/${version}` },
    })
  } catch (error) {
    throw failed(
      `The image did not download: ${error instanceof Error ? error.message : String(error)}`,
      null,
    )
  }
  if (!response.ok) {
    throw failed(`The image host answered ${response.status}.`, response.status)
  }
  const extension = imageExtension(response.headers.get('content-type'), url)
  if (extension === null) {
    throw failed('The download is not an image a frame shows.', response.status)
  }
  let bytes: Uint8Array
  try {
    bytes = await readCapped(response, limit)
  } catch (error) {
    if (error instanceof FrameboardError) throw error
    throw failed(
      `The image stopped downloading: ${error instanceof Error ? error.message : String(error)}`,
      response.status,
    )
  }
  return { bytes, extension }
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
    `The image is past ${limit / 1024 / 1024} MiB.`,
    { limit },
  )
}

/**
 * The stem a saved file takes: `--name` when given, else the query or prompt
 * as a lowercase dashed name, else `image`. Refuses `invalid-name` for a
 * `--name` breaking the board name rule.
 */
export function savedStem(name: string | undefined, text: string): string {
  if (name === undefined) return folderName(text) || 'image'
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
export async function saveImage(
  project: { name: string; path: string },
  stem: string,
  image: ImageBytes,
  license: LicenseFile,
): Promise<SavedImage> {
  const { added, refused } = await addAssets(project.path, [
    { name: `${stem}.${image.extension}`, bytes: image.bytes },
  ])
  const landed = added[0]
  if (landed === undefined) {
    throw new FrameboardError(
      'asset-type-refused',
      refused[0]?.message ?? 'The image was refused.',
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
