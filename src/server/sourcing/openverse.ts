import { FrameboardError } from '@/shared/errors'
import type { ImageResult, LicenseFile } from '@/shared/records/sourcing'
import { version } from '@/shared/version'

export const OPENVERSE_API = 'https://api.openverse.org/v1/images/'

/** Public domain alone, so a saved image owes nobody credit. */
export const DEFAULT_LICENSES = ['cc0', 'pdm'] as const

/** `--credited` adds the licenses that ask only for credit, never a share-alike or non-commercial one. */
export const CREDITED_LICENSES = [...DEFAULT_LICENSES, 'by'] as const

/** The most results an anonymous Openverse search returns in one page. */
export const PAGE_SIZE = 20

export interface SearchOptions {
  credited: boolean
}

/** A found image with the fields its license file records, before it is numbered. */
export type OpenverseImage = Omit<ImageResult, 'number'>

export function licensesFor({ credited }: SearchOptions): string[] {
  return [...(credited ? CREDITED_LICENSES : DEFAULT_LICENSES)]
}

/**
 * One page of Openverse results for the query, numbered from 1 in the order
 * Openverse ranked them, empty when nothing matched. A refusal or a failed
 * request throws `source-failed` with the status in the details.
 */
export async function searchImages(
  query: string,
  options: SearchOptions,
  send: typeof fetch,
): Promise<ImageResult[]> {
  const url = new URL(OPENVERSE_API)
  url.searchParams.set('q', query)
  url.searchParams.set('license', licensesFor(options).join(','))
  url.searchParams.set('page_size', String(PAGE_SIZE))
  const body = await request(url, send)
  const results =
    isRecord(body) && Array.isArray(body.results) ? body.results : []
  return results
    .map(toImage)
    .filter((image) => image !== null)
    .map((image, index) => ({ number: index + 1, ...image }))
}

/**
 * One image by its Openverse id, refusing `result-not-found` for an id
 * Openverse does not hold or one under a license the options do not allow.
 */
export async function imageById(
  id: string,
  options: SearchOptions,
  send: typeof fetch,
): Promise<OpenverseImage> {
  const missing = (reason: string) =>
    new FrameboardError('result-not-found', reason, { id })
  const url = new URL(`${encodeURIComponent(id)}/`, OPENVERSE_API)
  const image = toImage(await request(url, send, missing))
  if (image === null) throw missing(`Openverse holds no image ${id}.`)
  const allowed = licensesFor(options)
  if (!allowed.includes(image.license)) {
    throw new FrameboardError(
      'result-not-found',
      `Openverse image ${id} is under ${image.license}, outside ${allowed.join(', ')}. Pass --credited to allow a license that asks for credit.`,
      { id, license: image.license, licenses: allowed },
    )
  }
  return image
}

/** The license file for an Openverse image, `query` null when it was saved by id. */
export function foundLicense(
  image: OpenverseImage,
  query: string | null,
  savedAt: Date,
): LicenseFile {
  return {
    version: 1,
    origin: 'found',
    source: 'openverse',
    id: image.id,
    query,
    title: image.title,
    creator: image.creator,
    creatorUrl: image.creatorUrl,
    license: image.license,
    licenseVersion: image.licenseVersion,
    licenseUrl: image.licenseUrl,
    attribution: image.attribution,
    landingUrl: image.landingUrl,
    url: image.url,
    savedAt: savedAt.toISOString(),
  }
}

async function request(
  url: URL,
  send: typeof fetch,
  missing?: (reason: string) => FrameboardError,
): Promise<unknown> {
  let response: Response
  try {
    response = await send(url, {
      headers: { 'User-Agent': `frameboard/${version}` },
    })
  } catch (error) {
    throw new FrameboardError(
      'source-failed',
      `Openverse did not answer: ${error instanceof Error ? error.message : String(error)}`,
      { source: 'openverse', status: null },
    )
  }
  if (response.status === 404 && missing) {
    throw missing(`Openverse holds no image at ${url.pathname}.`)
  }
  if (!response.ok) {
    throw new FrameboardError(
      'source-failed',
      `Openverse answered ${response.status}${response.status === 429 ? ', its limit for anonymous requests' : ''}.`,
      { source: 'openverse', status: response.status },
    )
  }
  try {
    return await response.json()
  } catch {
    throw new FrameboardError(
      'source-failed',
      'Openverse answered something other than JSON.',
      { source: 'openverse', status: response.status },
    )
  }
}

/** Openverse's snake_case result as the record's fields, null when it lacks an id, a license, or a URL. */
function toImage(raw: unknown): OpenverseImage | null {
  if (!isRecord(raw)) return null
  const id = text(raw.id)
  const license = text(raw.license)
  const url = text(raw.url)
  if (id === null || license === null || url === null) return null
  return {
    id,
    title: text(raw.title),
    creator: text(raw.creator),
    creatorUrl: text(raw.creator_url),
    license,
    licenseVersion: text(raw.license_version),
    licenseUrl: text(raw.license_url),
    attribution: text(raw.attribution),
    landingUrl: text(raw.foreign_landing_url),
    url,
    thumbnail: text(raw.thumbnail),
    width: integer(raw.width),
    height: integer(raw.height),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}
