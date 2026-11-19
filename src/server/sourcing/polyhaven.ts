import { FrameboardError } from '@/shared/errors'
import {
  type LicenseFile,
  MODEL_SIZES,
  type ModelResult,
  type ModelSize,
} from '@/shared/records/sourcing'
import { version } from '@/shared/version'

import { packGlb } from './pack-glb'
import { download } from './save'

export const POLYHAVEN_API = 'https://api.polyhaven.com/'

/** Named on every listing, which Poly Haven's API terms ask of any surface showing its content. */
export const POLYHAVEN_SOURCE = {
  name: 'Poly Haven',
  url: 'https://polyhaven.com',
} as const

export const CC0_URL = 'https://creativecommons.org/publicdomain/zero/1.0/'

/** The most results one search lists, as many as an image search does. */
export const RESULT_LIMIT = 20

/** The size a saved model takes when `--size` names none, the smallest Poly Haven serves. */
export const DEFAULT_MODEL_SIZE: ModelSize = '1k'

/** Poly Haven's `type` for a model, beside 0 for an HDRI and 1 for a texture. */
const MODEL_TYPE = 2

/** A found model with the fields its license file records, before it is numbered. */
export type PolyHavenModel = Omit<ModelResult, 'number'>

/** A model packed as one GLB, with the glTF address it was packed from. */
export interface PackedModel {
  bytes: Uint8Array
  url: string
}

/**
 * Poly Haven has no search, so this ranks its whole list here: by distinct
 * query words matching the name, tags, or categories, then download count,
 * then id, numbered from 1 and empty when no word matches.
 */
export async function searchModels(
  query: string,
  send: typeof fetch,
): Promise<ModelResult[]> {
  const url = new URL('assets', POLYHAVEN_API)
  url.searchParams.set('t', 'models')
  const body = await request(url, send)
  const words = new Set(wordsOf(query))
  const scored = Object.entries(isRecord(body) ? body : {})
    .map(([id, raw]) => toModel(id, raw))
    .filter((model) => model !== null)
    .map((model) => {
      const own = new Set(
        [model.name, ...model.tags, ...model.categories].flatMap(wordsOf),
      )
      const score = [...words].filter((word) => own.has(word)).length
      return { model, score }
    })
    .filter(({ score }) => score > 0)
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (b.model.downloadCount ?? 0) - (a.model.downloadCount ?? 0) ||
      a.model.id.localeCompare(b.model.id),
  )
  return scored
    .slice(0, RESULT_LIMIT)
    .map(({ model }, index) => ({ number: index + 1, ...model }))
}

/**
 * One model by its Poly Haven id, refusing `result-not-found` for an id
 * Poly Haven does not hold or one naming a texture or an HDRI.
 */
export async function modelById(
  id: string,
  send: typeof fetch,
): Promise<PolyHavenModel> {
  const missing = new FrameboardError(
    'result-not-found',
    `Poly Haven holds no model ${id}.`,
    { id },
  )
  const url = new URL(`info/${encodeURIComponent(id)}`, POLYHAVEN_API)
  const model = toModel(id, await request(url, send, missing))
  if (model === null) throw missing
  return model
}

/**
 * Downloads every file of one model at `size` into memory and packs them as
 * one GLB, so a failed download leaves nothing to write. Refuses `usage` with
 * the sizes offered, and `source-failed` on a failed download or pack.
 */
export async function fetchModel(
  id: string,
  size: ModelSize,
  send: typeof fetch,
): Promise<PackedModel> {
  const url = new URL(`files/${encodeURIComponent(id)}`, POLYHAVEN_API)
  const body = await request(url, send)
  const gltf = isRecord(body) && isRecord(body.gltf) ? body.gltf : {}
  // Each size holds its glTF one level down, as gltf['1k'].gltf.
  const entryAt = (each: ModelSize) => {
    const sized = gltf[each]
    return isRecord(sized) && isRecord(sized.gltf) ? sized.gltf : null
  }
  const sizes = MODEL_SIZES.filter((each) => entryAt(each) !== null)
  const entry = entryAt(size)
  // A model with no glTF at any size is Poly Haven's gap, not a flag to change.
  if (sizes.length === 0) {
    throw new FrameboardError(
      'source-failed',
      `Poly Haven serves ${id} as no glTF, so it cannot be saved as a GLB.`,
      { source: 'polyhaven', id, status: null },
    )
  }
  if (entry === null) {
    throw new FrameboardError(
      'usage',
      `Poly Haven serves ${id} at ${sizes.join(', ')}, not ${size}.`,
      { id, size, sizes },
    )
  }
  const gltfUrl = text(entry.url)
  if (gltfUrl === null) throw malformed(id)
  const includes = Object.entries(isRecord(entry.include) ? entry.include : {})
  const [main, ...files] = await Promise.all([
    download(gltfUrl, send),
    ...includes.map(([, file]) => {
      const fileUrl = isRecord(file) ? text(file.url) : null
      if (fileUrl === null) throw malformed(id)
      return download(fileUrl, send)
    }),
  ])
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(main?.bytes))
  } catch {
    throw malformed(id)
  }
  if (!isRecord(json)) throw malformed(id)
  const byUri = new Map(
    includes.map(([uri], index) => [
      uri,
      files[index]?.bytes ?? new Uint8Array(),
    ]),
  )
  return { bytes: packGlb(json, byUri), url: gltfUrl }
}

/** The license file for a Poly Haven model, `query` null when it was saved by id. */
export function polyhavenLicense(
  model: PolyHavenModel,
  query: string | null,
  packed: { url: string; size: ModelSize },
  savedAt: Date,
): LicenseFile {
  return {
    version: 1,
    origin: 'found',
    source: 'polyhaven',
    id: model.id,
    query,
    title: model.name,
    authors: model.authors,
    license: 'cc0',
    licenseUrl: CC0_URL,
    landingUrl: model.landingUrl,
    url: packed.url,
    size: packed.size,
    savedAt: savedAt.toISOString(),
  }
}

async function request(
  url: URL,
  send: typeof fetch,
  missing?: FrameboardError,
): Promise<unknown> {
  let response: Response
  try {
    response = await send(url, {
      headers: { 'User-Agent': `frameboard/${version}` },
    })
  } catch (error) {
    throw new FrameboardError(
      'source-failed',
      `Poly Haven did not answer: ${error instanceof Error ? error.message : String(error)}`,
      { source: 'polyhaven', status: null },
    )
  }
  if (response.status === 404 && missing) throw missing
  if (!response.ok) {
    throw new FrameboardError(
      'source-failed',
      `Poly Haven answered ${response.status}.`,
      { source: 'polyhaven', status: response.status },
    )
  }
  try {
    return await response.json()
  } catch {
    throw new FrameboardError(
      'source-failed',
      'Poly Haven answered something other than JSON.',
      { source: 'polyhaven', status: response.status },
    )
  }
}

/** Poly Haven's snake_case asset as the record's fields, null for anything but a model with a name. */
function toModel(id: string, raw: unknown): PolyHavenModel | null {
  if (!isRecord(raw) || raw.type !== MODEL_TYPE) return null
  const name = text(raw.name)
  if (name === null) return null
  const largest = Array.isArray(raw.max_resolution)
    ? Math.max(
        0,
        ...raw.max_resolution.filter((each) => typeof each === 'number'),
      )
    : 0
  const dimensions = Array.isArray(raw.dimensions)
    ? raw.dimensions.filter((each) => typeof each === 'number')
    : []
  return {
    id,
    name,
    authors: isRecord(raw.authors) ? Object.keys(raw.authors) : [],
    categories: texts(raw.categories),
    tags: texts(raw.tags),
    license: 'cc0',
    landingUrl: `${POLYHAVEN_SOURCE.url}/a/${encodeURIComponent(id)}`,
    thumbnail: text(raw.thumbnail_url),
    polycount: integer(raw.polycount),
    dimensionsMm:
      dimensions.length === 3
        ? [dimensions[0] ?? 0, dimensions[1] ?? 0, dimensions[2] ?? 0]
        : null,
    sizes: MODEL_SIZES.filter(
      (each) => Number.parseInt(each) * 1024 <= largest,
    ),
    downloadCount: integer(raw.download_count),
  }
}

function malformed(id: string): FrameboardError {
  return new FrameboardError(
    'source-failed',
    `Poly Haven's file list for ${id} names no glTF to download.`,
    { source: 'polyhaven', status: null },
  )
}

function wordsOf(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function texts(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((each): each is string => typeof each === 'string')
    : []
}

function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}
