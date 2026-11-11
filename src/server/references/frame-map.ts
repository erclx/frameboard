import { FrameboardError } from '@/shared/errors'

const SEGMENT = '[a-z0-9]+(-[a-z0-9]+)*'
// A group, an optional section, and a name, so a reference sits at most one folder deeper than its group.
const REFERENCE = new RegExp(`^${SEGMENT}(/${SEGMENT}){1,2}$`)
const BOARD_REF = /^[^/\s]+\/[^/\s]+\/[^/\s]+$/

/**
 * Reads `frames.json`, mapping each reference, `<group>/<name>` or
 * `<group>/<section>/<name>`, to the board frame `<project>/<page>/<frame>`
 * it is captured from. An entry in any other shape refuses rather than filing
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
        `frames.json entry "${reference}" needs a board frame as <project>/<page>/<frame>.`,
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

/** The mapped board frames the board does not hold. */
export function missingFrames(
  map: ReadonlyMap<string, string>,
  board: ReadonlySet<string>,
): string[] {
  return [...map.values()].filter((ref) => !board.has(ref))
}
