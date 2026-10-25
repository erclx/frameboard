import type { Element } from 'domhandler'

import { isReservedPageName, isValidName } from '@/shared/names'
import type { Finding } from '@/shared/records/check'

import {
  boardPath,
  type FrameSource,
  type FrameTarget,
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
]

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

function isTable(element: Element): boolean {
  return element.name === 'table'
}
