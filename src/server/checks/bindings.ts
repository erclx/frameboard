import { selectOne } from 'css-select'

import {
  BINDS_ATTRIBUTE,
  isCustomProperty,
  parseBinds,
} from '@/shared/bindings'
import type { Finding } from '@/shared/records/check'

import { attributeLocation, boardPath, type FrameSource } from './frame-source'
import { findingFor, type RuleDoc } from './rule'

export const BINDING_RULES: RuleDoc[] = [
  {
    id: 'binding-target',
    tier: 'exact',
    severity: 'warning',
    description:
      'A control\'s data-binds names a selector matching an element in its frame, then a custom property opening with "--"',
  },
]

const finding = findingFor(BINDING_RULES)

/**
 * `binding-target`, one finding per control whose `data-binds` tunes nothing,
 * a warning since the frame still renders.
 */
export function checkBindings(source: FrameSource): Finding[] {
  const path = boardPath(source.root, source.path)
  return source.elements.flatMap((element) => {
    const value = element.attribs[BINDS_ATTRIBUTE]
    if (value === undefined) return []
    const problem = problemOf(value, source)
    if (problem === null) return []
    return [
      finding('binding-target', {
        frame: source.ref,
        path,
        location: attributeLocation(element, BINDS_ATTRIBUTE),
        message: `${BINDS_ATTRIBUTE}="${value}" ${problem}`,
      }),
    ]
  })
}

function problemOf(value: string, source: FrameSource): string | null {
  const binding = parseBinds(value)
  if (binding === null) {
    return 'needs a selector and then a custom property, as "#photo --brightness".'
  }
  const { selector, property } = binding
  if (!isCustomProperty(property)) {
    return `sets ${property}, which is not a custom property. Name one opening with "--" that the target's CSS reads.`
  }
  let target
  try {
    target = selectOne(selector, source.document)
  } catch {
    return `names ${selector}, which does not parse as a selector. Point it at the element the control tunes.`
  }
  if (target === null) {
    return `matches no element. Point it at the element the control tunes, or remove it.`
  }
  return null
}
