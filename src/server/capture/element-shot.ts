import type { Page } from 'playwright-core'

import { FrameboardError } from '@/shared/errors'

export interface ElementBox {
  x: number
  y: number
  width: number
  height: number
}

type Isolated =
  | { kind: 'shown' }
  | { kind: 'missing'; count: number }
  | { kind: 'unboxed'; tag: string }

/**
 * Leaves one element showing alone on a transparent ground, so the page is
 * shot once and closed. The box is what Chromium paints at `scale`, can run past
 * the frame's right and bottom, and reads no place past the left or top.
 */
export async function isolateElement(
  page: Page,
  ref: string,
  index: number,
  scale: number,
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
  const box = await page.evaluate(paintedBox, scale)
  if (box.x >= 0 && box.y >= 0) return box
  await page.evaluate(anchorRoot)
  const anchored = await page.evaluate(paintedBox, scale)
  await page.evaluate(shiftRoot, {
    x: Math.max(0, -Math.floor(anchored.x)),
    y: Math.max(0, -Math.floor(anchored.y)),
  })
  return page.evaluate(paintedBox, scale)
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
  return { kind: 'shown' }
}

// Runs in the page. Chromium snaps a box to whole CSS pixels of the space its
// nearest transform makes, and starts that space on a whole pixel too, so this
// walks the spaces from the root down and moves the rectangle by their snaps.
function paintedBox(scale: number): ElementBox {
  type Styled = HTMLElement | SVGElement
  const target = document.querySelector<Styled>('[data-frameboard-shot]')
  if (!target) throw new Error('No element is isolated.')

  const rect = (element: Element) => {
    const { left, top, width, height } = element.getBoundingClientRect()
    return { x: left + window.scrollX, y: top + window.scrollY, width, height }
  }
  const sides = (matrix: DOMMatrix, { x, y, width, height }: ElementBox) => {
    const corners = [
      matrix.transformPoint({ x, y }),
      matrix.transformPoint({ x: x + width, y }),
      matrix.transformPoint({ x, y: y + height }),
      matrix.transformPoint({ x: x + width, y: y + height }),
    ]
    const xs = corners.map((corner) => corner.x / corner.w)
    const ys = corners.map((corner) => corner.y / corner.w)
    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    }
  }
  const hold = (element: Styled, styles: Record<string, string>) => {
    for (const [name, value] of Object.entries(styles)) {
      element.style.setProperty(name, value, 'important')
    }
  }
  const restore = (element: Styled, style: string | null) => {
    if (style === null) element.removeAttribute('style')
    else element.setAttribute('style', style)
  }
  const turned = (rotate: string) => {
    const words = rotate.split(' ')
    const angle = parseFloat(words.pop() ?? '0')
    const [axis = 'z'] = words
    const [x = 0, y = 0, z = 0] =
      words.length === 3
        ? words.map(Number)
        : [axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0]
    return new DOMMatrix().rotateAxisAngle(x, y, z, angle)
  }
  const linear = (rotate: string, scale: string, transform: string) => {
    let matrix = rotate === 'none' ? new DOMMatrix() : turned(rotate)
    if (scale !== 'none') {
      const [x = 1, y = x, z = 1] = scale.split(' ').map(Number)
      matrix = matrix.scale(x, y, z)
    }
    return transform === 'none'
      ? matrix
      : matrix.multiply(new DOMMatrix(transform))
  }

  const reshapes = ({ effect }: Animation) =>
    effect instanceof KeyframeEffect &&
    effect
      .getKeyframes()
      .some(
        ({ transform, rotate, scale }) =>
          rotate ??
          scale ??
          /(^|\s)(?!translate)\w+\(/.test(String(transform ?? '')),
      )

  const shown = rect(target)
  // Geometry inside an SVG takes its outermost SVG's snap and none of its own.
  let outermost: Element = target
  for (
    let svg = target.closest('svg');
    svg;
    svg = svg.parentElement?.closest('svg') ?? null
  ) {
    outermost = svg
  }

  const replaced = 'img, svg, video, canvas, object, embed, iframe'
  const spaces = []
  for (let at: Element | null = outermost; at; at = at.parentElement) {
    if (!(at instanceof HTMLElement || at instanceof SVGElement)) continue
    const computed = getComputedStyle(at)
    const { display, transform, translate, rotate, offsetPath } = computed
    // A box of no kind that transforms keeps the value and ignores it.
    const inline = display === 'inline' && !at.matches(replaced)
    if (inline || display === 'contents') continue
    // Chromium starts the space these make on a whole pixel.
    const layered =
      /\b(transform|rotate|scale)\b/.test(computed.willChange) ||
      /\b(paint|strict|content)\b/.test(computed.contain) ||
      computed.contentVisibility !== 'visible' ||
      at.getAnimations().some(reshapes)
    const still = [
      transform,
      translate,
      rotate,
      computed.scale,
      offsetPath,
    ].every((value) => value === 'none')
    if (still && !layered) continue
    const matrix = linear(rotate, computed.scale, transform)
    spaces.unshift({
      element: at,
      style: at.getAttribute('style'),
      matrix,
      translate,
      origin: computed.transformOrigin.split(' ').map(parseFloat),
      zoom: at.currentCSSZoom,
      // A space under anything but a move loses the fraction it starts at.
      keepsFraction:
        !layered &&
        offsetPath === 'none' &&
        [matrix.m11, matrix.m12, matrix.m21, matrix.m22].join() === '1,0,0,1',
    })
  }

  for (const { element } of spaces) {
    hold(element, {
      transition: 'none',
      // Not `none`, which would let a fixed descendant escape to the page.
      transform: 'translate(0px)',
      translate: 'none',
      rotate: 'none',
      scale: 'none',
      'offset-path': 'none',
    })
  }
  let laid = new DOMMatrix()
  let painted = new DOMMatrix()
  let start = { x: 0, y: 0 }
  let fraction = { x: 0, y: 0 }
  for (const space of spaces) {
    const { element, translate, zoom } = space
    const place = rect(element)
    hold(element, { translate })
    const slid = rect(element)
    hold(element, { translate: 'none' })
    const [x = 0, y = 0, z = 0] = space.origin
    const own = new DOMMatrix()
      .translate(slid.x - place.x, slid.y - place.y)
      .scale(zoom)
      .translate(x, y, z)
      .multiply(space.matrix)
      .translate(-x, -y, -z)
      .scale(1 / zoom)
    const from = { x: place.x - start.x, y: place.y - start.y }
    const exact = { x: from.x + fraction.x, y: from.y + fraction.y }
    const whole = { x: Math.round(exact.x), y: Math.round(exact.y) }
    laid = laid.translate(from.x, from.y).multiply(own)
    painted = painted.translate(whole.x, whole.y).multiply(own)
    start = place
    fraction = space.keepsFraction
      ? { x: exact.x - whole.x, y: exact.y - whole.y }
      : { x: 0, y: 0 }
  }
  const { x: flatX, y: flatY, ...size } = rect(outermost)
  const box = { x: flatX - start.x, y: flatY - start.y, ...size }
  const exact = { x: box.x + fraction.x, y: box.y + fraction.y }
  const whole = { x: Math.round(exact.x), y: Math.round(exact.y) }
  // A box under one pixel paints as one whole pixel.
  const snapped = {
    width: Math.max(1, Math.round(exact.x + box.width) - whole.x),
    height: Math.max(1, Math.round(exact.y + box.height) - whole.y),
  }
  const before = sides(laid, box)
  const after = sides(painted, {
    ...whole,
    ...(outermost === target ? snapped : size),
  })
  for (const { element, style } of spaces) {
    restore(element, style)
    hold(element, { transition: 'none' })
  }
  // Settled before its transition comes back, which would run from flat.
  rect(target)
  for (const { element, style } of spaces) restore(element, style)

  // Less of a pixel than this paints no alpha.
  const slack = 0.002
  // Adding zero turns the negative zero a rounded place can be into zero.
  const down = (at: number) => Math.floor(at * scale + slack) / scale + 0
  const up = (at: number) => Math.ceil(at * scale - slack) / scale
  const x = down(shown.x + after.left - before.left)
  const y = down(shown.y + after.top - before.top)
  const right = up(shown.x + shown.width + after.right - before.right)
  const bottom = up(shown.y + shown.height + after.bottom - before.bottom)
  return {
    x,
    y,
    width: Math.max(1 / scale, right - x),
    height: Math.max(1 / scale, bottom - y),
  }
}

// Runs in the page and anchors the root, so a later move takes an ancestor's
// crop along. A box that resizes is held at its used size, and no other, which
// would turn an auto height definite.
function anchorRoot(): void {
  const root = document.documentElement
  const target = document.querySelector<HTMLElement>('[data-frameboard-shot]')
  if (!target) throw new Error('No element is isolated.')
  const hold = (element: HTMLElement, styles: Record<string, string>) => {
    for (const [name, value] of Object.entries(styles)) {
      element.style.setProperty(name, value, 'important')
    }
  }
  const chain: { element: HTMLElement; width: string; height: string }[] = []
  for (
    let element: HTMLElement | null = target;
    element && element !== root;
    element = element.parentElement
  ) {
    const { width, height } = getComputedStyle(element)
    chain.unshift({ element, width, height })
  }
  // Anchored first, since a box the root newly anchors can move and resize.
  hold(root, { transition: 'none', translate: '0px' })
  for (const { element, ...used } of chain) {
    for (const side of ['width', 'height'] as const) {
      const size = used[side]
      if (getComputedStyle(element)[side] === size) continue
      hold(element, {
        transition: 'none',
        [side]: size,
        [`min-${side}`]: size,
        [`max-${side}`]: size,
      })
    }
  }
}

// Runs in the page, after the root is anchored.
function shiftRoot({ x, y }: { x: number; y: number }): void {
  const root = document.documentElement
  // A zoomed root scales its own translate.
  const zoom = root.currentCSSZoom
  root.style.setProperty(
    'translate',
    `${x / zoom}px ${y / zoom}px`,
    'important',
  )
}
