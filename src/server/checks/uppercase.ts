import type { Element } from 'domhandler'

import type { Finding } from '@/shared/records/check'

import type { Cascade } from './cascade'
import { described, textElements } from './fonts'
import { boardPath, type FrameSource, startTagLocation } from './frame-source'
import { findingFor, type RuleDoc } from './rule'

export const UPPERCASE_RULES: RuleDoc[] = [
  {
    id: 'uppercase',
    tier: 'selector',
    severity: 'warning',
    configKey: 'noUppercase',
    description:
      'No text is set in capitals, through text-transform: uppercase or a word of more than three capital letters',
  },
]

const finding = findingFor(UPPERCASE_RULES)

const CAPITALS = /(?<![\p{L}\p{N}])\p{Lu}{4,}(?![\p{L}\p{N}])/u

/** `uppercase`, which runs only when the project sets `noUppercase`. */
export function checkUppercase(
  source: FrameSource,
  cascade: Cascade,
): Finding[] {
  const capitalized = textElements(source).filter(
    (element) =>
      cascade.textTransform(element) === 'uppercase' ||
      ownText(element).some((text) => CAPITALS.test(text)),
  )
  const first = capitalized[0]
  if (!first) return []
  return [
    finding('uppercase', {
      frame: source.ref,
      path: boardPath(source.root, source.path),
      message: `Text is set in capitals, which the project does not allow. Write it in sentence case. ${described(capitalized)}`,
      location: startTagLocation(first),
    }),
  ]
}

function ownText(element: Element): string[] {
  return element.children.flatMap((child) =>
    child.type === 'text' ? [child.data] : [],
  )
}
