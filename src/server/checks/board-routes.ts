import type { Element } from 'domhandler'

import type { Finding, FindingLocation } from '@/shared/records/check'

import {
  attributeLocation,
  boardPath,
  type FrameSource,
  locate,
  scriptSource,
} from './frame-source'
import { findingFor, type RuleDoc } from './rule'

export const BOARD_ROUTE_RULES: RuleDoc[] = [
  {
    id: 'board-route',
    tier: 'exact',
    severity: 'error',
    description:
      "A frame's scripts and event handlers name no path under /api/, which fails from a frame on its own port, apart from the board's server",
  },
]

const finding = findingFor(BOARD_ROUTE_RULES)

/**
 * A quoted `/api/` path, so prose in a comment does not match, while a path
 * built at runtime passes, since the rule catches mistakes, not deliberate calls.
 */
const BOARD_ROUTE =
  /(['"`])((?:(?:[a-z][a-z0-9+.-]*:)?\/\/[^/'"`\s]*)?\/api\/[^'"`\n]*)\1/gi

/** Code a frame runs, and how a match in it is located. */
interface Code {
  text: string
  /** The file holding `text`. */
  path: string
  /** Where `text` starts in `file`, or null for code located at `at` alone. */
  offset: number | null
  file: string
  at: FindingLocation | null
  via: string
}

/**
 * `board-route`, one finding per string naming a board route in a frame's
 * scripts, inline or local, and in its `on*` event handler attributes.
 */
export function checkBoardRoutes(source: FrameSource): Finding[] {
  return frameCode(source).flatMap((code) =>
    [...code.text.matchAll(BOARD_ROUTE)].map((match) => {
      const start = code.offset === null ? null : code.offset + match.index
      return finding('board-route', {
        frame: source.ref,
        path: boardPath(source.root, code.path),
        message: `${code.via} names ${match[2]}, a route of the board's own server, which fails from a frame on its own port. Mock an app's calls with data kept in the script, or list board-route in the project's checks.off if its frames mean to call /api/.`,
        location:
          start === null
            ? code.at
            : locate(code.file, start, start + match[0].length),
      })
    }),
  )
}

/**
 * Whether a browser runs the script, as it does for no `type`, `module`, or a
 * JavaScript type. A JSON, import map, or template block is data, which the
 * rule's own message names as the way to mock an app's calls.
 */
function runs(element: Element): boolean {
  const type = (element.attribs.type ?? '').trim().toLowerCase()
  return (
    type === '' ||
    type === 'module' ||
    /^(?:application|text)\/(?:x-)?(?:java|ecma)script$/.test(type)
  )
}

function frameCode(source: FrameSource): Code[] {
  const code: Code[] = []
  for (const element of source.elements) {
    if (element.name === 'script' && runs(element)) {
      const script = scriptSource(element, source)
      if (script) {
        const inline = element.attribs.src === undefined
        code.push({
          ...script,
          file: inline ? source.html : script.text,
          at: null,
          via: inline ? 'A <script>' : `The script ${element.attribs.src}`,
        })
      }
    }
    for (const [name, value] of Object.entries(element.attribs)) {
      if (!name.startsWith('on')) continue
      code.push({
        text: value,
        path: source.path,
        offset: null,
        file: source.html,
        at: attributeLocation(element, name),
        via: `The ${name} handler on <${element.name}>`,
      })
    }
  }
  return code
}
