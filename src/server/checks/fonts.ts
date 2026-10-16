import type { Element } from 'domhandler'

import type { ProjectChecks } from '@/shared/records/board'
import type { Finding } from '@/shared/records/check'

import type { Cascade } from './cascade'
import { boardPath, type FrameSource, startTagLocation } from './frame-source'
import { finding, type RuleDoc } from './rule'

export const FONT_RULES: RuleDoc[] = [
  {
    id: 'default-font',
    tier: 'selector',
    description:
      "Every text element reaches a font-family, so the browser's default font never renders",
  },
  {
    id: 'generic-font',
    tier: 'selector',
    description:
      'No text element renders in a generic family such as sans-serif or monospace as its first choice',
  },
  {
    id: 'allowed-fonts',
    tier: 'selector',
    configKey: 'allowedFonts',
    description:
      "Every text element's first family is one of the project's allowed fonts",
  },
]

const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
])

/** Elements whose text never renders as page text. */
const NOT_TEXT = new Set([
  'html',
  'head',
  'title',
  'script',
  'style',
  'noscript',
  'template',
])

/** Elements holding text of their own, in document order. */
export function textElements(source: FrameSource): Element[] {
  return source.elements.filter(
    (element) =>
      !NOT_TEXT.has(element.name) &&
      !insideHead(element) &&
      element.children.some(
        (child) => child.type === 'text' && child.data.trim() !== '',
      ),
  )
}

/** `default-font`, `generic-font`, and, when configured, `allowed-fonts`. */
export function checkFonts(
  source: FrameSource,
  cascade: Cascade,
  config: ProjectChecks,
): Finding[] {
  const defaults: Element[] = []
  const generic = new Map<string, Element[]>()
  const unlisted = new Map<string, Element[]>()
  const allowed = config.allowedFonts?.map((font) => font.toLowerCase())

  for (const element of textElements(source)) {
    const family = cascade.firstFamily(element)
    if (family === null) defaults.push(element)
    else if (GENERIC_FAMILIES.has(family.toLowerCase())) {
      push(generic, family, element)
    } else if (allowed && !allowed.includes(family.toLowerCase())) {
      push(unlisted, family, element)
    }
  }

  const path = boardPath(source.root, source.path)
  const at = (rule: string, elements: Element[], message: string) =>
    finding(rule, {
      frame: source.ref,
      path,
      message: `${message} ${described(elements)}`,
      location: startTagLocation(elements[0] as Element),
    })

  const findings: Finding[] = []
  if (defaults.length > 0) {
    findings.push(
      at(
        'default-font',
        defaults,
        "Text renders in the browser's default font. Set font-family on body or the element.",
      ),
    )
  }
  for (const [family, elements] of generic) {
    findings.push(
      at(
        'generic-font',
        elements,
        `Text renders in the generic family ${family}. Name a font first and keep the generic as the fallback.`,
      ),
    )
  }
  for (const [family, elements] of unlisted) {
    findings.push(
      at(
        'allowed-fonts',
        elements,
        `Text renders in ${family}, which the project does not allow. Use one of ${config.allowedFonts?.join(', ')}.`,
      ),
    )
  }
  return findings
}

/** "3 elements, first <p> at line 4." */
export function described(elements: Element[]): string {
  const first = elements[0]
  if (!first) return ''
  const line = first.sourceCodeLocation?.startLine
  const where = line === undefined ? '' : ` at line ${line}`
  return elements.length === 1
    ? `The element is <${first.name}>${where}.`
    : `${elements.length} elements, first <${first.name}>${where}.`
}

function insideHead(element: Element): boolean {
  for (let parent = element.parent; parent; parent = parent.parent) {
    if (parent.type === 'tag' && (parent as Element).name === 'head') {
      return true
    }
  }
  return false
}

function push(map: Map<string, Element[]>, key: string, element: Element) {
  const list = map.get(key)
  if (list) list.push(element)
  else map.set(key, [element])
}
