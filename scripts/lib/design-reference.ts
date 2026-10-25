import { format, type FormatConfig } from 'oxfmt'

const BOARD_KIT = '../assets/kit/'
const REFERENCE_KIT = '../kit/'

/** A `frames.json` entry the sync cannot capture, named so the file can be fixed. */
export class MappingError extends Error {}

const REFERENCE = /^[a-z0-9]+(-[a-z0-9]+)*\/[a-z0-9]+(-[a-z0-9]+)*$/
const BOARD_REF = /^[^/\s]+\/[^/\s]+\/[^/\s]+$/

/**
 * Reads `frames.json`, mapping each reference, `<group>/<name>`, to the
 * board frame `<project>/<page>/<frame>` it is captured from. An entry in
 * any other shape throws rather than filing into the wrong folder.
 */
export function parseFrameMap(json: string): Map<string, string> {
  const parsed: unknown = JSON.parse(json)
  const frames =
    typeof parsed === 'object' && parsed !== null && 'frames' in parsed
      ? parsed.frames
      : undefined
  if (typeof frames !== 'object' || frames === null) {
    throw new MappingError('frames.json needs a frames object.')
  }
  const map = new Map<string, string>()
  for (const [reference, ref] of Object.entries(frames)) {
    if (!REFERENCE.test(reference)) {
      throw new MappingError(
        `frames.json entry "${reference}" needs a kebab-case <group>/<name>.`,
      )
    }
    if (typeof ref !== 'string' || !BOARD_REF.test(ref)) {
      throw new MappingError(
        `frames.json entry "${reference}" needs a board frame as <project>/<page>/<frame>.`,
      )
    }
    map.set(reference, ref)
  }
  return map
}

/** The mapped board frames the board does not hold. */
export function missingFrames(
  map: ReadonlyMap<string, string>,
  board: ReadonlySet<string>,
): string[] {
  return [...map.values()].filter((ref) => !board.has(ref))
}

/** A mapped board frame the formatter cannot parse, so the sync lands nothing. */
export class FormatRefused extends Error {}

/**
 * What the folder holds of a board frame: its project kit links moved to the
 * folder's kit, formatted under `options` so a reference diffs line by line
 * while the board file stays as the agent wrote it. The write and `--check`
 * both build through it, so they compare the same bytes.
 */
export async function toReference(
  html: string,
  reference: string,
  options: FormatConfig,
): Promise<string> {
  const result = await format(
    `${reference}.html`,
    html.replaceAll(BOARD_KIT, REFERENCE_KIT),
    options,
  )
  const [error] = result.errors
  if (error) {
    // The message carries a code frame of the whole line, which for a
    // one-line thumbnail is thousands of characters.
    const [reason] = error.message.split('\n')
    throw new FormatRefused(
      `${reference} does not parse as HTML: ${reason}. Fix its board frame and sync again. Nothing written.`,
    )
  }
  return result.code
}

export interface Drift {
  readonly changed: readonly string[]
  /** PNGs whose bytes differ, a warning since a PNG varies with the browser build. */
  readonly pngDiffers: readonly string[]
  readonly missing: readonly string[]
  readonly stray: readonly string[]
}

/** Compares what a sync would write against the files the folder holds, the HTML as the source and a PNG as derived. */
export function classifyDrift(
  expected: ReadonlyMap<string, string | Uint8Array>,
  tracked: ReadonlyMap<string, string | Uint8Array>,
): Drift {
  const changed: string[] = []
  const pngDiffers: string[] = []
  const missing: string[] = []
  for (const [path, data] of expected) {
    const copy = tracked.get(path)
    if (copy === undefined) missing.push(path)
    else if (!Buffer.from(copy).equals(Buffer.from(data))) {
      ;(path.endsWith('.png') ? pngDiffers : changed).push(path)
    }
  }
  const stray = [...tracked.keys()].filter((path) => !expected.has(path))
  return { changed, pngDiffers, missing, stray }
}
