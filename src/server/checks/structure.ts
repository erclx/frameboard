import type { Element } from 'domhandler'

import { isReservedPageName, isValidName } from '@/shared/names'
import type { Finding, FindingLocation } from '@/shared/records/check'

import {
  boardPath,
  type FrameSource,
  type FrameTarget,
  locate,
  startTagLocation,
} from './frame-source'
import { finding, type RuleDoc } from './rule'

export const STRUCTURE_RULES: RuleDoc[] = [
  {
    id: 'naming',
    tier: 'exact',
    description:
      'A page or frame name uses letters, digits, dots, dashes, and underscores, opening with a letter or digit, at most 64 characters',
  },
  {
    id: 'dot-folder',
    tier: 'exact',
    description:
      'No folder in a project opens with a dot, since the board never shows it',
  },
  {
    id: 'head-body',
    tier: 'exact',
    description: 'A frame stating <head> states <body> too',
  },
  {
    id: 'table-tbody',
    tier: 'exact',
    description:
      'A table holding rows states its <tbody>, since the browser adds one the file does not hold',
  },
  {
    id: 'malformed-tag',
    tier: 'exact',
    description:
      'A tag or attribute the HTML tokenizer cannot read as written, such as a quote ending an attribute early, which the browser recovers from silently',
  },
  {
    id: 'nesting',
    tier: 'exact',
    description:
      'The browser rebuilds the tree the file writes, adding an element it never opens, closing one it never closed, or moving one out of a table',
  },
]

/**
 * Elements a parser may imply with no start tag in a valid file. A `tbody`
 * is `table-tbody`'s to report.
 */
const IMPLIED = new Set(['html', 'head', 'body', 'tbody', 'colgroup'])

/** HTML elements whose end tag a valid file may leave out, void ones included. */
const OPTIONAL_END = new Set([
  'html',
  'head',
  'body',
  'li',
  'dt',
  'dd',
  'p',
  'rt',
  'rp',
  'optgroup',
  'option',
  'colgroup',
  'caption',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'td',
  'th',
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
  'param',
  'keygen',
])

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml'

/** What `malformed-tag` tells the agent for each tokenizer code it reports. */
const MALFORMED: Record<string, string> = {
  'missing-whitespace-between-attributes':
    "An attribute value ends early, so the browser reads the rest as stray attributes. Use single quotes inside a double-quoted value, such as font-family:Geist,'DejaVu Sans'.",
  'unexpected-character-in-attribute-name':
    'An attribute name holds a quote, <, or =, most often the rest of a value a quote inside it ended early. Use single quotes inside a double-quoted value.',
  'unexpected-equals-sign-before-attribute-name':
    'An = stands where an attribute name should, so the browser reads it as the name. Remove it or name the attribute.',
  'duplicate-attribute':
    'This tag states one attribute twice, and the browser drops the second. Keep one.',
  'eof-in-tag':
    'The file ends inside a tag, so the browser drops the tag. Close it.',
  'unexpected-character-in-unquoted-attribute-value':
    'An unquoted attribute value holds a quote, <, =, or backtick. Quote the value.',
}

/** `naming`, read from the frame's path alone. */
export function checkNaming(target: FrameTarget, path: string): Finding[] {
  const ref = `${target.project}/${target.page}/${target.name}`
  const findings: Finding[] = []
  if (!isValidName(target.page) || isReservedPageName(target.page)) {
    findings.push(
      finding('naming', {
        frame: ref,
        path,
        message: `Page name ${target.page} is not valid. Use letters, digits, dots, dashes, and underscores, opening with a letter or digit.`,
      }),
    )
  }
  if (!isValidName(target.name)) {
    findings.push(
      finding('naming', {
        frame: ref,
        path,
        message: `Frame name ${target.name} is not valid. Use letters, digits, dots, dashes, and underscores, opening with a letter or digit.`,
      }),
    )
  }
  return findings
}

/** `dot-folder`, over a project's folder names. */
export function checkDotFolders(
  root: string,
  projectDir: string,
  folders: string[],
): Finding[] {
  return folders
    .filter((name) => name.startsWith('.'))
    .map((name) =>
      finding('dot-folder', {
        frame: null,
        path: boardPath(root, `${projectDir}/${name}`),
        message: `Folder ${name} opens with a dot, so the board never shows it. Rename it or move it out of the project.`,
      }),
    )
}

/** `head-body` and `table-tbody`, which read what the parser had to imply. */
export function checkMarkup(source: FrameSource): Finding[] {
  const path = boardPath(source.root, source.path)
  const findings: Finding[] = []
  const head = source.elements.find((element) => element.name === 'head')
  const body = source.elements.find((element) => element.name === 'body')
  if (head && startTagLocation(head) && !(body && startTagLocation(body))) {
    findings.push(
      finding('head-body', {
        frame: source.ref,
        path,
        message:
          'The frame states <head> and no <body>. Wrap the visible content in <body>.',
        location: startTagLocation(head),
      }),
    )
  }
  for (const table of source.elements.filter(isTable)) {
    const implied = table.children.some(
      (child) =>
        child.type === 'tag' &&
        child.name === 'tbody' &&
        !child.sourceCodeLocation?.startTag,
    )
    if (implied) {
      findings.push(
        finding('table-tbody', {
          frame: source.ref,
          path,
          message:
            'This table holds rows with no <tbody>, so the browser adds one the file does not hold. State the <tbody>.',
          location: startTagLocation(table),
        }),
      )
    }
  }
  return findings
}

/**
 * `malformed-tag`, one finding per start tag the tokenizer refused, at its
 * first error, since one stray quote raises several codes in one tag.
 */
export function checkMalformedTags(source: FrameSource): Finding[] {
  const path = boardPath(source.root, source.path)
  const reported = new Set<Element>()
  const findings: Finding[] = []
  for (const error of source.parseErrors) {
    const message = MALFORMED[error.code]
    if (message === undefined) continue
    const tag = source.elements.find((element) => {
      const start = element.sourceCodeLocation?.startTag
      return (
        start !== undefined &&
        start.startOffset <= error.location.startOffset &&
        error.location.startOffset < start.endOffset
      )
    })
    if (tag) {
      if (reported.has(tag)) continue
      reported.add(tag)
    }
    findings.push(
      finding('malformed-tag', {
        frame: source.ref,
        path,
        message: `${tag ? `<${tag.name}> raises ${error.code}` : error.code}. ${message}`,
        location: error.location,
      }),
    )
  }
  return findings
}

/**
 * `nesting`, one finding per element the parser rebuilt: one it implied with
 * no start tag, an HTML element whose end tag never matched, and one moved
 * ahead of a sibling the file writes first, which is a table's foster
 * parenting. Foreign elements are left to close themselves.
 */
export function checkNesting(source: FrameSource): Finding[] {
  const path = boardPath(source.root, source.path)
  const findings: Finding[] = []
  const report = (message: string, location: FindingLocation | null) =>
    findings.push(
      finding('nesting', { frame: source.ref, path, message, location }),
    )
  const fostered = fosteredElements(source.elements)
  for (const element of source.elements) {
    const location = element.sourceCodeLocation
    if (!location?.startTag) {
      if (IMPLIED.has(element.name)) continue
      const hint =
        element.name === 'p'
          ? ' A <p> holds text alone, so a block such as <div> inside it closes it early. Use a <div> for the outer box.'
          : ''
      report(
        `The browser adds a <${element.name}> the file never opens, from a </${element.name}> with nothing open to close or a tag closed out of order.${hint}`,
        strayEndTag(source.html, element),
      )
    } else if (
      !location.endTag &&
      element.namespace === HTML_NAMESPACE &&
      !OPTIONAL_END.has(element.name)
    ) {
      report(
        `<${element.name}> never meets its own end tag, so the browser closes it where the file did not. Close it inside its parent, and check it holds nothing it cannot, such as an <a> inside an <a>.`,
        startTagLocation(element),
      )
    } else if (fostered.has(element)) {
      report(
        `The browser moves this <${element.name}> out ahead of its table, since a table holds its rows and cells alone. Put it inside a <td>, or outside the table.`,
        startTagLocation(element),
      )
    }
  }
  return findings
}

/** Elements placed ahead of a later sibling the file writes before them. */
function fosteredElements(elements: Element[]): Set<Element> {
  const parents = new Set(elements.map((element) => element.parent))
  const fostered = new Set<Element>()
  for (const parent of parents) {
    if (!parent) continue
    let earliest = Number.POSITIVE_INFINITY
    for (let index = parent.children.length - 1; index >= 0; index--) {
      const child = parent.children[index]
      if (child?.type !== 'tag' || !child.sourceCodeLocation?.startTag) {
        continue
      }
      const start = child.sourceCodeLocation.startOffset
      if (start > earliest) fostered.add(child)
      earliest = Math.min(earliest, start)
    }
  }
  return fostered
}

/**
 * Where the end tag a start-tagless element came from sits: the first one
 * of its name after whatever precedes the element in the file.
 */
function strayEndTag(html: string, element: Element): FindingLocation | null {
  let from = 0
  for (let previous = element.prev; previous; previous = previous.prev) {
    const end = previous.endIndex
    if (typeof end === 'number') {
      from = end
      break
    }
  }
  const tag = `</${element.name}`
  const start = html.toLowerCase().indexOf(tag, from)
  return start === -1 ? null : locate(html, start, start + tag.length + 1)
}

function isTable(element: Element): boolean {
  return element.name === 'table'
}
