import type { Page } from 'playwright-core'

import type { Finding } from '@/shared/records/check'

import { findingFor, type RuleDoc } from '../rule'
import type { RenderedTarget } from './layout'

export const SCROLL_EFFECT_RULES: RuleDoc[] = [
  {
    id: 'scroll-effect',
    tier: 'browser',
    severity: 'warning',
    description:
      'A frame whose height hugs its content holds an effect driven by scrolling, being position: sticky, a window or document scroll listener, or a scroll or view timeline, which never runs since the frame never scrolls',
  },
]

const finding = findingFor(SCROLL_EFFECT_RULES)

/** What drives the effect, as the finding names it. */
type Trigger =
  | { kind: 'sticky'; index: number; tag: string }
  | { kind: 'timeline'; index: number; tag: string }
  | { kind: 'listener'; target: 'window' | 'document' }

/**
 * `scroll-effect`, at most one finding, on a frame that hugs its height and
 * holds no `scroll` key, naming the first trigger found. A listener counts
 * only on the window or the document, since those are the objects the
 * DevTools protocol is asked about, so one on an inner scroll container or an
 * observer driving the effect goes unseen and costs a hint, never an error.
 */
export async function checkScrollEffect(
  page: Page,
  target: RenderedTarget,
): Promise<Finding[]> {
  if (target.scroll || !target.hugHeight) return []
  const trigger =
    (await page.evaluate(readScrollStyles)) ?? (await readListener(page))
  if (!trigger) return []
  return [
    finding('scroll-effect', {
      frame: target.ref,
      path: target.path,
      message: `${target.ref} ${describe(trigger)}, which needs the frame to scroll, but its height hugs the content so it never does. Run frame resize --scroll to hold a screen height and scroll past it.`,
    }),
  ]
}

function describe(trigger: Trigger): string {
  switch (trigger.kind) {
    case 'sticky':
      return `holds position: sticky on <${trigger.tag}> at element ${trigger.index}`
    case 'timeline':
      return `runs an animation on a scroll or view timeline from <${trigger.tag}> at element ${trigger.index}`
    case 'listener':
      return `listens for scroll on the ${trigger.target}`
  }
}

async function readListener(page: Page): Promise<Trigger | null> {
  const session = await page.context().newCDPSession(page)
  try {
    for (const name of ['window', 'document'] as const) {
      const { result } = await session.send('Runtime.evaluate', {
        expression: name,
      })
      if (!result.objectId) continue
      const { listeners } = await session.send(
        'DOMDebugger.getEventListeners',
        { objectId: result.objectId },
      )
      if (listeners.some((listener) => listener.type === 'scroll')) {
        return { kind: 'listener', target: name }
      }
    }
    return null
  } finally {
    await session.detach()
  }
}

// Runs in the page, so it carries everything it reads. The index counts
// `querySelectorAll('*')` skipping Frameboard's own elements, as the layout
// rules do, so a finding names the index edit takes. A timeline started from
// script carries no element, so it reads as the root's.
function readScrollStyles(): Trigger | null {
  const isScrollTimeline = (timeline: AnimationTimeline | null) => {
    const name = timeline?.constructor.name
    return name === 'ScrollTimeline' || name === 'ViewTimeline'
  }
  // A sticky element inside its own scroll box sticks there whatever the
  // frame does, so only one sticking to the page counts.
  const insideScroller = (element: Element) => {
    for (
      let parent = element.parentElement;
      parent && parent !== document.body && parent !== document.documentElement;
      parent = parent.parentElement
    ) {
      const { overflowX, overflowY } = getComputedStyle(parent)
      if (overflowX !== 'visible' || overflowY !== 'visible') return true
    }
    return false
  }
  let index = 0
  for (const node of document.querySelectorAll('*')) {
    if (node.closest('[data-frameboard]')) continue
    const own = index
    index += 1
    const style = getComputedStyle(node)
    const tag = node.tagName.toLowerCase()
    if (style.position === 'sticky' && !insideScroller(node)) {
      return { kind: 'sticky', index: own, tag }
    }
    const timeline = style.getPropertyValue('animation-timeline')
    if (/\b(scroll|view)\(/.test(timeline)) {
      return { kind: 'timeline', index: own, tag }
    }
  }
  const scripted = document
    .getAnimations()
    .some((animation) => isScrollTimeline(animation.timeline))
  return scripted ? { kind: 'timeline', index: 0, tag: 'html' } : null
}
