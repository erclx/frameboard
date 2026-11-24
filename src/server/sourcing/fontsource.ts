import postcss, { type AtRule } from 'postcss'
import { z } from 'zod'

import type { JournalOptions } from '@/server/board/journal'
import { FrameboardError } from '@/shared/errors'
import {
  FONT_LICENSE_TEXT,
  FONT_LICENSES,
  type FontCategory,
  type FontLicense,
} from '@/shared/fonts'
import {
  type FontFace,
  fontFaceSchema,
  type FontLicenseFile,
  type FontResult,
  type SavedFont,
} from '@/shared/records/sourcing'

import { assertFontFree, download, DOWNLOAD_LIMIT, saveFont } from './save'

const FONTSOURCE_API = 'https://api.fontsource.org/v1/fonts'
const PACKAGES = 'https://cdn.jsdelivr.net/npm'
const SAMPLES = 'https://cdn.jsdelivr.net/fontsource/fonts'

export const FONTSOURCE_SOURCE = {
  name: 'Fontsource',
  url: 'https://fontsource.org',
} as const

/** The most results one search lists, as many as a model search does. */
export const FONT_RESULT_LIMIT = 20

/** The weights an install keeps of a static family that has them. */
export const DEFAULT_WEIGHTS = [400, 700]

/** How many files download at once, since a Chinese, Japanese, or Korean family splits into over a hundred. */
const PARALLEL_DOWNLOADS = 8

const LICENSE_URLS: Record<FontLicense, string> = {
  'OFL-1.1': 'https://openfontlicense.org/open-font-license-official-text/',
  'Apache-2.0': 'https://www.apache.org/licenses/LICENSE-2.0',
  'UFL-1.0': 'https://ubuntu.com/legal/font-licence',
}

/** An id as Fontsource spells one, checked since it names a request path and the installed folder. */
const ID = /^[a-z0-9][a-z0-9-]*$/

const listedSchema = z.object({
  id: z.string().regex(ID),
  family: z.string().min(1),
  subsets: z.array(z.string()),
  weights: z.array(z.int()).min(1),
  styles: z.array(z.enum(['normal', 'italic'])).min(1),
  defSubset: z.string(),
  variable: z.boolean(),
  category: z.string(),
  license: z.string(),
})

const familySchema = listedSchema.extend({
  /** The release of the family's package. */
  npmVersion: z.string().regex(/^[\w.-]+$/),
  /** Its files by weight, then style. */
  variants: z.record(z.string(), z.record(z.string(), z.unknown())),
})

/** A family under a license a project installs, as the list names it. */
export type ListedFamily = z.infer<typeof listedSchema> & {
  license: FontLicense
}

/** A family with the release its files come from. */
export type FontFamily = z.infer<typeof familySchema> & { license: FontLicense }

/** A family's files whole in memory, with what its license record states of them. */
export interface FetchedFont {
  faces: FontFace[]
  /** Each file's bytes as served, by name. */
  files: Map<string, Uint8Array>
  licenseText: Uint8Array
  /** The package the files came from, at its release. */
  url: string
}

/** Every family under a license a project installs, from the one request Fontsource lists them in. */
export async function fetchFamilies(
  send: typeof fetch,
): Promise<ListedFamily[]> {
  const body = await readJson(FONTSOURCE_API, send)
  if (!Array.isArray(body)) throw malformed('its list')
  return body.flatMap((raw) => {
    const family = listedSchema.safeParse(raw).data
    return family && isInstallable(family) ? [family] : []
  })
}

/**
 * Ranks families here, since Fontsource has no search: an exact name, then a
 * name the query opens, then one whose words its words open, then the category
 * the query names, each by family name.
 */
export function searchFamilies(
  families: readonly ListedFamily[],
  { query, category }: { query: string | null; category: FontCategory | null },
): { total: number; results: FontResult[] } {
  const asked = query?.trim().toLowerCase() ?? ''
  const ranked = families
    .filter((family) => category === null || family.category === category)
    .flatMap((family) => {
      const rank = rankOf(family, asked)
      return rank === null ? [] : [{ family, rank }]
    })
    .sort(
      (a, b) =>
        a.rank - b.rank || a.family.family.localeCompare(b.family.family),
    )
  return {
    total: ranked.length,
    results: ranked
      .slice(0, FONT_RESULT_LIMIT)
      .map(({ family }, index) => toResult(family, index + 1)),
  }
}

/** A family's place in a search, lowest first, null when the query misses it. */
function rankOf(
  { family, category }: ListedFamily,
  asked: string,
): number | null {
  const name = family.toLowerCase()
  if (asked === '' || name === asked) return 0
  if (name.startsWith(asked)) return 1
  const words = name.split(/\s+/)
  const opens = (word: string) => words.some((each) => each.startsWith(word))
  if (asked.split(/\s+/).every(opens)) return 2
  return category === asked ? 3 : null
}

function toResult(family: ListedFamily, number: number): FontResult {
  const weight = family.weights.includes(400) ? 400 : family.weights[0]
  const style = family.styles.includes('normal') ? 'normal' : 'italic'
  return {
    number,
    id: family.id,
    family: family.family,
    category: family.category,
    license: family.license,
    variable: family.variable,
    weights: family.weights,
    styles: family.styles,
    subsets: family.subsets,
    landingUrl: landingUrl(family.id),
    sample: `${SAMPLES}/${family.id}@latest/${family.defSubset}-${weight}-${style}.woff2`,
  }
}

/**
 * One family by its Fontsource id, refusing `result-not-found` for an id
 * Fontsource does not hold and `license-refused` for one under a license a
 * project may not install.
 */
export async function familyById(
  id: string,
  send: typeof fetch,
): Promise<FontFamily> {
  const missing = new FrameboardError(
    'result-not-found',
    `Fontsource holds no family ${id}.`,
    { id },
  )
  if (!ID.test(id)) throw missing
  let body: unknown
  try {
    body = await readJson(`${FONTSOURCE_API}/${id}`, send)
  } catch (error) {
    if (error instanceof FrameboardError && error.details.status === 404) {
      throw missing
    }
    throw error
  }
  const family = familySchema.safeParse(body).data
  if (family?.id !== id) throw malformed(`its record of ${id}`)
  if (!isInstallable(family)) {
    throw new FrameboardError(
      'license-refused',
      `${family.family} is under ${family.license}, and a project installs a font under ${FONT_LICENSES.join(', ')} alone.`,
      { id, license: family.license, licenses: [...FONT_LICENSES] },
    )
  }
  return family
}

/**
 * Downloads a family whole into memory, so one failed file leaves nothing to
 * write: every subset of a variable family, or of a static one at the
 * `weights` asked for, `DEFAULT_WEIGHTS` when none are.
 */
export async function fetchFont(
  family: FontFamily,
  weights: readonly number[] | undefined,
  send: typeof fetch,
): Promise<FetchedFont> {
  const scope = family.variable ? '@fontsource-variable' : '@fontsource'
  const url = `${PACKAGES}/${scope}/${family.id}@${family.npmVersion}/`
  const names = sheetNames(family, weights)
  const [licenseText, ...sheets] = await Promise.all([
    fetchFrom(`${url}LICENSE`, send),
    ...names.map((name) => fetchFrom(`${url}${name}`, send)),
  ])
  if (!licenseText?.byteLength) throw malformed(`the license of ${family.id}`)
  const faces = sheets.flatMap((sheet) => {
    const found = facesOf(new TextDecoder().decode(sheet))
    if (found === null) throw malformed(`a sheet of ${family.id}`)
    return found
  })
  return {
    faces,
    files: await downloadAll(
      new Set(faces.map((face) => face.file)),
      `${url}files/`,
      send,
    ),
    licenseText,
    url,
  }
}

/** The family an install asks for, `query` null when no search found it. */
export interface FontInstall {
  id: string
  query: string | null
  weights?: readonly number[]
  savedAt: Date
}

/**
 * Finds one family by id and installs it whole, refusing as `familyById`,
 * `fetchFont`, and `saveFont` do, a family the project holds ahead of any
 * download.
 */
export async function installFont(
  project: { name: string; path: string },
  { id, query, weights, savedAt }: FontInstall,
  send: typeof fetch,
  options: JournalOptions = {},
): Promise<SavedFont> {
  const family = await familyById(id, send)
  await assertFontFree(project, family.id)
  const font = await fetchFont(family, weights, send)
  return saveFont(
    project,
    font,
    fontLicense(family, query, font, savedAt),
    options,
  )
}

/** The package sheets declaring the faces an install keeps, refusing `usage` for a weight the family lacks. */
function sheetNames(
  family: FontFamily,
  asked: readonly number[] | undefined,
): string[] {
  const styles = (['normal', 'italic'] as const).filter((style) =>
    family.styles.includes(style),
  )
  if (family.variable) {
    if (asked !== undefined) {
      throw new FrameboardError(
        'usage',
        `${family.family} is variable, so an install keeps every weight from ${Math.min(...family.weights)} to ${Math.max(...family.weights)}. Leave the weights out.`,
        { id: family.id, weights: family.weights },
      )
    }
    return styles.map((style) =>
      style === 'italic' ? 'wght-italic.css' : 'index.css',
    )
  }
  const lacking = asked?.filter((weight) => !family.weights.includes(weight))
  if (lacking !== undefined && lacking.length > 0) {
    throw new FrameboardError(
      'usage',
      `${family.family} has the weights ${family.weights.join(', ')}, not ${lacking.join(', ')}.`,
      { id: family.id, weights: family.weights },
    )
  }
  const usual = DEFAULT_WEIGHTS.filter((each) => family.weights.includes(each))
  const kept = asked
    ? new Set(asked)
    : usual.length > 0
      ? usual
      : family.weights
  return [...kept].flatMap((weight) =>
    styles
      .filter((style) => family.variants[weight]?.[style] !== undefined)
      .map((style) => `${weight}${style === 'italic' ? '-italic' : ''}.css`),
  )
}

/** A package sheet's faces, or null for one holding none or a face that does not read whole. */
function facesOf(css: string): FontFace[] | null {
  const rules: AtRule[] = []
  try {
    postcss.parse(css).walkAtRules('font-face', (rule) => {
      rules.push(rule)
    })
  } catch {
    return null
  }
  const faces = rules.flatMap((rule) => faceOf(rule) ?? [])
  return faces.length > 0 && faces.length === rules.length ? faces : null
}

function faceOf(rule: AtRule): FontFace | undefined {
  const declared = new Map<string, string>()
  rule.walkDecls((decl) => {
    declared.set(decl.prop, decl.value)
  })
  const [min, max = min] = (declared.get('font-weight') ?? '')
    .split(/\s+/)
    .map(Number)
  const source = declared.get('src') ?? ''
  return fontFaceSchema.safeParse({
    file: /url\(\.\/files\/([^)]+\.woff2)\)/.exec(source)?.[1],
    style: declared.get('font-style'),
    weights: { min, max },
    unicodeRange: declared.get('unicode-range') ?? null,
  }).data
}

/** Every named file's bytes, a few at a time, refusing once together they pass one download's limit. */
async function downloadAll(
  names: ReadonlySet<string>,
  base: string,
  send: typeof fetch,
): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>()
  const queue = [...names]
  let room = DOWNLOAD_LIMIT
  const work = async () => {
    for (let name = queue.shift(); name; name = queue.shift()) {
      const bytes = await fetchFrom(`${base}${name}`, send, room)
      room -= bytes.byteLength
      files.set(name, bytes)
    }
  }
  try {
    await Promise.all(Array.from({ length: PARALLEL_DOWNLOADS }, work))
  } finally {
    // Stops the other workers once one has failed.
    queue.length = 0
  }
  return files
}

/** The license record of a fetched family, `query` null when it was saved by id. */
function fontLicense(
  family: FontFamily,
  query: string | null,
  font: Pick<FetchedFont, 'faces' | 'url'>,
  savedAt: Date,
): FontLicenseFile {
  return {
    version: 1,
    origin: 'found',
    source: 'fontsource',
    id: family.id,
    query,
    family: family.family,
    category: family.category,
    license: family.license,
    licenseUrl: LICENSE_URLS[family.license],
    licenseFile: FONT_LICENSE_TEXT,
    landingUrl: landingUrl(family.id),
    url: font.url,
    variable: family.variable,
    faces: font.faces,
    savedAt: savedAt.toISOString(),
  }
}

function landingUrl(id: string): string {
  return `${FONTSOURCE_SOURCE.url}/fonts/${id}`
}

function isInstallable<T extends { license: string }>(
  family: T,
): family is T & { license: FontLicense } {
  return FONT_LICENSES.some((license) => license === family.license)
}

async function readJson(url: string, send: typeof fetch): Promise<unknown> {
  const bytes = await fetchFrom(url, send)
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw malformed(url)
  }
}

/** One file whole, its refusal naming the source, which `download` cannot. */
async function fetchFrom(
  url: string,
  send: typeof fetch,
  limit?: number,
): Promise<Uint8Array> {
  try {
    return (await download(url, send, limit)).bytes
  } catch (error) {
    if (!(error instanceof FrameboardError)) throw error
    throw new FrameboardError(
      error.code,
      `${FONTSOURCE_SOURCE.name} failed: ${error.message}`,
      { ...error.details, source: 'fontsource' },
    )
  }
}

function malformed(what: string): FrameboardError {
  return new FrameboardError(
    'source-failed',
    `Fontsource answered ${what} in a form that does not read.`,
    { source: 'fontsource', status: null },
  )
}
