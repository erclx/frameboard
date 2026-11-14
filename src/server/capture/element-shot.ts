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
 * Leaves one element of a loaded frame showing alone on a transparent
 * ground, and answers its box in page coordinates, which can run past the
 * frame's. `index` is the element's `edit` index, the one `inspect` reports.
 * An index naming no element, or one with no layout box, refuses
 * `invalid-address`. The page stays that way, so it is shot once and closed.
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
      `${ref} element ${index} is <${isolated.tag}> and has no layout box, so there is nothing to export`,
      { ref, index },
    )
  }
  return isolated.box
}

// Runs in the page, so it carries everything it reads. It counts the way
// inspect's `readLiveElements` does, skipping the elements the look routes
// inject. Hiding is by `visibility`, which moves no layout, and it leaves the
// element's descendants as the frame styled them.
function hideAllBut(index: number): Isolated {
  let count = 0
  let target: Element | null = null
  for (const element of document.querySelectorAll('*')) {
    if (element.closest('[data-frameboard]')) continue
    if (count === index) target = element
    count += 1
  }
  if (!target) return { kind: 'missing', count }
  if (target.getClientRects().length === 0) {
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
  const rect = target.getBoundingClientRect()
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
