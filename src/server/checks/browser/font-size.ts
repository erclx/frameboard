import type { Page } from 'playwright-core'

import type { Finding } from '@/shared/records/check'

import { findingFor, type RuleDoc } from '../rule'
import type { RenderedTarget } from './layout'

export const FONT_SIZE_RULES: RuleDoc[] = [
  {
    id: 'min-font-size',
    tier: 'browser',
    severity: 'warning',
    configKey: 'minFontSize',
    description:
      'Text renders smaller than the project sets as its minimum size in pixels',
  },
]

const finding = findingFor(FONT_SIZE_RULES)

interface SizedText {
  index: number
  tag: string
  size: number
}

/**
 * Reports text under `minFontSize` pixels, naming the smallest element and
 * how many more fall under, at most one finding per frame.
 */
export async function checkFontSize(
  page: Page,
  target: RenderedTarget,
  minFontSize: number,
): Promise<Finding[]> {
  const under = (await page.evaluate(readTextSizes)).filter(
    (text) => text.size < minFontSize,
  )
  if (under.length === 0) return []
  const smallest = under.reduce((least, text) =>
    text.size < least.size ? text : least,
  )
  const others = under.length - 1
  const rest =
    others === 0
      ? ''
      : `, and ${others} more ${others === 1 ? 'element is' : 'elements are'} under it`
  return [
    finding('min-font-size', {
      frame: target.ref,
      path: target.path,
      message: `${target.ref} sets text at ${smallest.size} px in <${smallest.tag}> at element ${smallest.index}, under the project's ${minFontSize} px minimum${rest}.`,
    }),
  ]
}

// Runs in the page, so it carries everything it reads. It picks text
// elements the way the capture font check's `readTextElements` does, being
// any element with a text node of its own, and counts the same index.
function readTextSizes(): SizedText[] {
  const notText = new Set([
    'HTML',
    'HEAD',
    'TITLE',
    'SCRIPT',
    'STYLE',
    'NOSCRIPT',
    'TEMPLATE',
  ])
  const found: SizedText[] = []
  let index = 0
  for (const element of document.querySelectorAll('*')) {
    if (element.closest('[data-frameboard]')) continue
    const own = index
    index += 1
    if (notText.has(element.tagName.toUpperCase())) continue
    const hasText = [...element.childNodes].some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
    )
    if (!hasText) continue
    found.push({
      index: own,
      tag: element.tagName.toLowerCase(),
      size: Number.parseFloat(getComputedStyle(element).fontSize),
    })
  }
  return found
}
