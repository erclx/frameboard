import { randomBytes } from 'node:crypto'
import { mkdir, realpath, stat, writeFile } from 'node:fs/promises'
import { join, sep } from 'node:path'

import { FrameboardError } from '@/shared/errors'

import { isCode } from '../board/json-record'

/** A page's folder of note images, dot-named so the board never reads it as content. */
export const NOTES_FOLDER = '.notes'

/** A stored image as a note records it, relative to its page. */
const STORED = /^\.notes\/[0-9a-f]{12}\.(png|jpg|gif|webp)$/

export const IMAGE_CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}

/**
 * The extension an image's bytes declare, or null for anything but PNG,
 * JPEG, GIF, and WebP. SVG is left out on purpose, since it can carry script
 * and the thumbnails render in the board's own page.
 */
export function imageExtension(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, to))
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (ascii(0, 4) === 'GIF8') return 'gif'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp'
  return null
}

/**
 * Saves each image to `<page>/.notes/` under a fresh random name and answers
 * the page-relative paths in order. Every image is checked before any is
 * written, so a refusal leaves the folder as it was.
 */
export async function saveImages(
  pageDir: string,
  images: Uint8Array[],
): Promise<string[]> {
  const typed = images.map((bytes, index) => {
    const extension = imageExtension(bytes)
    if (extension === null) {
      throw new FrameboardError(
        'image-type-refused',
        'A note takes PNG, JPEG, GIF, or WebP images. Nothing was saved.',
        { index },
      )
    }
    return { bytes, extension }
  })
  const folder = join(pageDir, NOTES_FOLDER)
  await mkdir(folder, { recursive: true })
  return Promise.all(
    typed.map(async ({ bytes, extension }) => {
      const name = `${randomBytes(6).toString('hex')}.${extension}`
      await writeFile(join(folder, name), bytes, { flag: 'wx' })
      return `${NOTES_FOLDER}/${name}`
    }),
  )
}

/**
 * The absolute path of a stored image in a page, or null when the path is
 * not one `saveImages` writes, the file is gone, or its real path leaves the
 * page's `.notes/`.
 */
export async function storedImage(
  pageDir: string,
  stored: string,
): Promise<string | null> {
  if (!STORED.test(stored)) return null
  try {
    const folder = await realpath(join(pageDir, NOTES_FOLDER))
    const file = await realpath(join(pageDir, stored))
    if (!file.startsWith(folder + sep)) return null
    return (await stat(file)).isFile() ? file : null
  } catch (error) {
    if (isCode(error, 'ENOENT') || isCode(error, 'ENOTDIR')) return null
    throw error
  }
}

/** Refuses a note naming an image its page does not hold, before anything is written. */
export async function assertStored(
  pageDir: string,
  images: string[],
): Promise<void> {
  const found = await Promise.all(
    images.map((image) => storedImage(pageDir, image)),
  )
  const missing = images.filter((_, index) => found[index] === null)
  if (missing.length > 0) {
    throw new FrameboardError(
      'usage',
      `The note names images its page does not hold: ${missing.join(', ')}. Upload each one first.`,
      { missing },
    )
  }
}
