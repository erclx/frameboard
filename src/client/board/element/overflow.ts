import { frameElements } from '../frame-dom'
import type { Box } from '../geometry/box'

/** An element whose box runs past its frame's viewport, by file index. */
export interface Overflowing {
  index: number
  /** In the frame's own pixels, from the viewport's top left. */
  box: Box
}

/**
 * The slack a box takes before it counts as past the edge, so a subpixel
 * edge rounding up never draws a ghost. The `clipped` check takes the same.
 */
const SLACK_PX = 1

/**
 * A live frame's elements whose box runs past its viewport on any side, in
 * file order. A reported element's descendants travel with it, so the walk
 * lists none of them. A fixed element sits against the viewport by design,
 * and one an ancestor crops shows nothing past the edge, so neither counts.
 */
export function overflowing(document: Document): Overflowing[] {
  const view = document.defaultView
  const body = document.body
  if (!view || !body) return []
  const width = view.innerWidth
  const height = view.innerHeight
  const found: Overflowing[] = []
  const reported: Element[] = []
  frameElements(document).forEach((element, index) => {
    if (!body.contains(element) || element === body) return
    if (reported.some((parent) => parent.contains(element))) return
    const style = view.getComputedStyle(element)
    if (style.position === 'fixed') return
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return
    const past =
      rect.left < -SLACK_PX ||
      rect.top < -SLACK_PX ||
      rect.right > width + SLACK_PX ||
      rect.bottom > height + SLACK_PX
    if (!past || isCropped(element, body)) return
    reported.push(element)
    found.push({
      index,
      box: {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    })
  })
  return found
}

/**
 * Whether an ancestor below the body crops the element. An ancestor crops
 * only what its box contains, so the walk follows the containing block
 * chain, as the `clipped` check does: an absolute element skips every static
 * ancestor up to the one positioned.
 */
function isCropped(element: Element, body: HTMLElement): boolean {
  const view = element.ownerDocument.defaultView
  if (!view) return false
  const styleOf = (node: Element) => view.getComputedStyle(node)
  const containingBlock = (node: Element) => {
    let parent = node.parentElement
    if (styleOf(node).position !== 'absolute') return parent
    while (
      parent &&
      styleOf(parent).position === 'static' &&
      styleOf(parent).transform === 'none'
    ) {
      parent = parent.parentElement
    }
    return parent
  }
  for (
    let parent = containingBlock(element);
    parent && parent !== body && body.contains(parent);
    parent = containingBlock(parent)
  ) {
    const style = styleOf(parent)
    if (style.overflowX !== 'visible' || style.overflowY !== 'visible') {
      return true
    }
  }
  return false
}
