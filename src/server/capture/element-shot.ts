import type { Page } from 'playwright-core'

import { FrameboardError } from '@/shared/errors'

export interface ElementBox {
  x: number
  y: number
  width: number
  height: number
}

type Isolated =
  | { kind: 'shown'; box: ElementBox }
  | { kind: 'missing'; count: number }
  | { kind: 'unboxed'; tag: string }

/**
 * Leaves one element showing alone on a transparent ground, answering its box,
 * which can run past the frame's, so the page is shot once and closed.
 */
export async function isolateElement(
  page: Page,
  ref: string,
  index: number,
): Promise<ElementBox> {
  const isolated = await page.evaluate(hideAllBut, index)
  if (isolated.kind === 'missing') {
    throw new FrameboardError(
      'invalid-address',
      `${ref} holds elements 0 to ${isolated.count - 1}, so ${index} names none`,
      { ref, index },
    )
  }
  if (isolated.kind === 'unboxed') {
    throw new FrameboardError(
      'invalid-address',
      `${ref} element ${index} is <${isolated.tag}> and has no layout box or an empty one, so there is nothing to export`,
      { ref, index },
    )
  }
  return isolated.box
}

// Runs in the page, counting as `readLiveElements` does, and hides by
// `visibility`, which moves no layout.
function hideAllBut(index: number): Isolated {
  let count = 0
  let target: Element | null = null
  for (const element of document.querySelectorAll('*')) {
    if (element.closest('[data-frameboard]')) continue
    if (count === index) target = element
    count += 1
  }
  if (!target) return { kind: 'missing', count }
  const rect = target.getBoundingClientRect()
  // An empty element keeps a rect of no height, which a screenshot cannot clip.
  if (
    target.getClientRects().length === 0 ||
    rect.width === 0 ||
    rect.height === 0
  ) {
    return { kind: 'unboxed', tag: target.tagName.toLowerCase() }
  }
  target.setAttribute('data-frameboard-shot', '')
  const style = document.createElement('style')
  style.setAttribute('data-frameboard', '')
  style.textContent =
    'html,body{background:transparent!important}' +
    ':not([data-frameboard-shot],[data-frameboard-shot] *){visibility:hidden!important}' +
    '[data-frameboard-shot]{visibility:visible!important}'
  document.head.append(style)
  return {
    kind: 'shown',
    box: {
      x: rect.x + window.scrollX,
      y: rect.y + window.scrollY,
      width: rect.width,
      height: rect.height,
    },
  }
}
