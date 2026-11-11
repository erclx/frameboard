import { FrameboardError } from '@/shared/errors'

const SEGMENT = '[a-z0-9]+(-[a-z0-9]+)*'
// A group, an optional section, and a name, so a reference sits at most one folder deeper than its group.
const REFERENCE = new RegExp(`^${SEGMENT}(/${SEGMENT}){1,2}$`)
// A board frame, and after `@` one width it shows at, its own or a linked one.
const BOARD_REF = /^[^/\s]+\/[^/\s]+\/[^/\s@]+(@[1-9]\d*)?$/

/**
 * Reads `frames.json`, mapping each reference, `<group>/<name>` or
 * `<group>/<section>/<name>`, to the board frame `<project>/<page>/<frame>`
 * it is captured from, or `<project>/<page>/<frame>@<width>` to capture it at
 * one of its widths. An entry in any other shape refuses rather than filing
 * into the wrong folder.
 */
export function parseFrameMap(json: string): Map<string, string> {
  const parsed = parseJson(json)
  const frames =
    typeof parsed === 'object' && parsed !== null && 'frames' in parsed
      ? parsed.frames
      : undefined
  if (typeof frames !== 'object' || frames === null || Array.isArray(frames)) {
    throw new FrameboardError(
      'frame-map-invalid',
      'frames.json needs a frames object.',
    )
  }
  // A sync prunes what it would not write, so an empty map would remove every reference.
  if (Object.keys(frames).length === 0) {
    throw new FrameboardError(
      'frame-map-invalid',
      'frames.json maps no frames, so a sync would remove every reference.',
    )
  }
  const map = new Map<string, string>()
  for (const [reference, ref] of Object.entries(frames)) {
    if (!REFERENCE.test(reference)) {
      throw new FrameboardError(
        'frame-map-invalid',
        `frames.json entry "${reference}" needs a kebab-case <group>/<name> or <group>/<section>/<name>.`,
        { reference },
      )
    }
    if (typeof ref !== 'string' || !BOARD_REF.test(ref)) {
      throw new FrameboardError(
        'frame-map-invalid',
        `frames.json entry "${reference}" needs a board frame as <project>/<page>/<frame> or <project>/<page>/<frame>@<width>.`,
        { reference },
      )
    }
    map.set(reference, ref)
  }
  return map
}

function parseJson(json: string): unknown {
  try {
    return JSON.parse(json)
  } catch (error) {
    throw new FrameboardError(
      'frame-map-invalid',
      'frames.json does not parse as JSON.',
      {},
      { cause: error },
    )
  }
}

/** A mapped value as the board frame it names and the width it asks for, if any. */
export function mappedTarget(value: string): { ref: string; width?: number } {
  const at = value.lastIndexOf('@')
  if (at === -1) return { ref: value }
  return { ref: value.slice(0, at), width: Number(value.slice(at + 1)) }
}

/** Every value a map may name for one frame: its ref, and its ref at each width it shows at. */
export function frameTargets(frame: {
  ref: string
  box: { width: number }
  widths: readonly { width: number }[]
}): string[] {
  return [
    frame.ref,
    ...[frame.box, ...frame.widths].map(({ width }) => `${frame.ref}@${width}`),
  ]
}

/**
 * The mapped values the board does not hold, being a frame it lacks or a
 * width the frame does not show at, read against `frameTargets`.
 */
export function missingFrames(
  map: ReadonlyMap<string, string>,
  board: ReadonlySet<string>,
): string[] {
  return [...map.values()].filter((ref) => !board.has(ref))
}
