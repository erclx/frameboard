import { boundsOf, type Box } from './box'
import type { Gap, Guide } from './snap'

/**
 * The overlay's DOM writers, which a gesture calls from its handler so a
 * drag renders nothing through React. Each finds its part of the overlay by
 * the data attribute `overlay.tsx` draws it with.
 */

/** A length that keeps its screen size on the zoomed layer. */
export const screen = (px: number) => `calc(${px}px / var(--zoom, 1))`

export const OUTLINE = `${screen(1.5)} solid var(--primary)`

export function sizeLabel(box: Box): string {
  return `${box.width} × ${box.height}`
}

/** A box's left, top, width, and height, relative to `within` when given. */
export function place(box: Box, within?: Box) {
  return {
    left: box.x - (within?.x ?? 0),
    top: box.y - (within?.y ?? 0),
    width: box.width,
    height: box.height,
  }
}

/** Shifts the drawn selection by a canvas offset and shows its new position in the chip. */
export function drawMove(
  overlay: HTMLElement,
  dx: number,
  dy: number,
  at: Box,
): void {
  const selection = part(overlay, '[data-selection]')
  if (!selection) return
  selection.style.transform = `translate(${dx}px, ${dy}px)`
  hide(selection, '[data-handles]', true)
  hide(selection, '[data-chip]', true)
  const chip = part(selection, '[data-move-chip]')
  if (chip) {
    chip.hidden = false
    chip.textContent = `${at.x}, ${at.y}`
  }
}

/** Redraws the selection at new boxes while a resize drags. */
export function drawResize(
  overlay: HTMLElement,
  boxes: Readonly<Record<string, Box>>,
): void {
  const selection = part(overlay, '[data-selection]')
  const bounds = boundsOf(Object.values(boxes))
  if (!selection || !bounds) return
  Object.assign(selection.style, px(place(bounds)))
  for (const [ref, box] of Object.entries(boxes)) {
    const outline = part(selection, `[data-outline="${CSS.escape(ref)}"]`)
    if (outline) Object.assign(outline.style, px(place(box, bounds)))
  }
  const chip = part(selection, '[data-chip]')
  if (chip && Object.keys(boxes).length === 1) {
    chip.textContent = sizeLabel(bounds)
  }
}

/** Draws the marquee rectangle and outlines the frames it touches, or clears both for null. */
export function drawMarquee(
  overlay: HTMLElement,
  rect: Box | null,
  touched: readonly Box[],
): void {
  const marquee = part(overlay, '[data-marquee]')
  if (marquee) {
    marquee.hidden = rect === null
    if (rect) Object.assign(marquee.style, px(place(rect)))
  }
  part(overlay, '[data-marquee-hits]')?.replaceChildren(
    ...touched.map((box) => {
      const outline = document.createElement('div')
      outline.className = 'absolute'
      Object.assign(outline.style, px(place(box)), { outline: OUTLINE })
      return outline
    }),
  )
}

/** Draws the snap guides and gap tags in the guide color, or clears them for empty lists. */
export function drawGuides(
  overlay: HTMLElement,
  guides: readonly Guide[],
  gaps: readonly Gap[],
): void {
  part(overlay, '[data-guides]')?.replaceChildren(
    ...guides.map((guide) =>
      line(guide.axis === 'x' ? 'vertical' : 'horizontal', guide),
    ),
    ...gaps.flatMap((gap) => [
      line(gap.axis === 'x' ? 'horizontal' : 'vertical', gap),
      gapTag(gap),
    ]),
  )
}

/** Puts the drawn selection back to what React drew once a gesture ends. */
export function drawRest(overlay: HTMLElement): void {
  const selection = part(overlay, '[data-selection]')
  if (selection) {
    selection.style.transform = ''
    hide(selection, '[data-handles]', false)
    hide(selection, '[data-chip]', false)
    hide(selection, '[data-move-chip]', true)
  }
  drawMarquee(overlay, null, [])
  drawGuides(overlay, [], [])
}

/** A 1 px screen line, `at` across the run and `from` to `to` along it. */
function line(
  direction: 'vertical' | 'horizontal',
  { at, from, to }: { at: number; from: number; to: number },
): HTMLElement {
  const element = document.createElement('div')
  element.className = 'absolute bg-guide'
  element.dataset.guide = direction
  Object.assign(
    element.style,
    direction === 'vertical'
      ? {
          left: `${at}px`,
          top: `${from}px`,
          height: `${to - from}px`,
          width: screen(1),
        }
      : {
          top: `${at}px`,
          left: `${from}px`,
          width: `${to - from}px`,
          height: screen(1),
        },
  )
  return element
}

/** The gap's size in a tag beside the middle of its line, at a constant screen size. */
function gapTag(gap: Gap): HTMLElement {
  const tag = document.createElement('span')
  const size = Math.round(gap.to - gap.from)
  tag.dataset.gap = String(size)
  tag.textContent = String(size)
  tag.className =
    'absolute origin-top-left rounded-[4px] bg-guide px-[5px] py-px text-[10px] leading-[14px] text-white tabular-nums'
  const middle = (gap.from + gap.to) / 2
  Object.assign(tag.style, {
    left: `${gap.axis === 'x' ? middle : gap.at}px`,
    top: `${gap.axis === 'x' ? gap.at : middle}px`,
    transform: 'scale(calc(1 / var(--zoom, 1))) translate(-50%, -120%)',
  })
  return tag
}

function px(style: Record<string, number>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(style).map(([key, value]) => [key, `${value}px`]),
  )
}

function part(root: HTMLElement, selector: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(selector)
}

function hide(root: HTMLElement, selector: string, hidden: boolean): void {
  const element = part(root, selector)
  if (element) element.hidden = hidden
}
