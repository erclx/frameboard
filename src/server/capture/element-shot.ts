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
 * which can run past the frame's and starts inside the page whatever its own
 * place, so the page is shot once and closed.
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
  const { box } = isolated
  if (box.x >= 0 && box.y >= 0) return box
  return page.evaluate(shiftIntoView)
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

// Runs in the page and moves the root, so an ancestor's crop moves along. A
// moved root anchors absolute and fixed boxes, so the element's used size is
// held, and the box takes the whole pixels its edges paint on.
function shiftIntoView(): ElementBox {
  const root = document.documentElement
  const target = document.querySelector<HTMLElement>('[data-frameboard-shot]')
  if (!target) throw new Error('No element is isolated.')
  const painted = (): ElementBox => {
    const { left, top, right, bottom } = target.getBoundingClientRect()
    const x = Math.round(left + window.scrollX)
    const y = Math.round(top + window.scrollY)
    return {
      x,
      y,
      width: Math.max(1, Math.round(right + window.scrollX) - x),
      height: Math.max(1, Math.round(bottom + window.scrollY) - y),
    }
  }
  const hold = (element: HTMLElement, styles: Record<string, string>) => {
    for (const [name, value] of Object.entries(styles)) {
      element.style.setProperty(name, value, 'important')
    }
  }
  const { width, height } = getComputedStyle(target)
  hold(target, {
    transition: 'none',
    width,
    'min-width': width,
    'max-width': width,
    height,
    'min-height': height,
    'max-height': height,
  })
  // Anchored first, since a box the root newly anchors can move.
  hold(root, { transition: 'none', translate: '0px' })
  const { x, y } = painted()
  hold(root, { translate: `${Math.max(0, -x)}px ${Math.max(0, -y)}px` })
  const box = painted()
  // A clip refuses a place under zero, which a page scaling its root leaves.
  return { ...box, x: Math.max(0, box.x), y: Math.max(0, box.y) }
}
