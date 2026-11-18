import { flowOf, type LiveLayout } from '@/shared/frame-bridge/live-element'

/** A computed px length to two places. */
export function hundredths(length: string): number {
  return Math.round(parseFloat(length) * 100) / 100
}

/** The flow `element` lays out and its parent lays it in, as the page computes them. */
export function readLayout(
  element: Element,
  style: CSSStyleDeclaration,
): LiveLayout {
  const parent = element.parentElement
  const above = parent ? getComputedStyle(parent) : null
  const node = element instanceof HTMLElement ? element : null
  const px = (length: string) => hundredths(length) || 0
  return {
    flow: flowOf(style.display, style.flexDirection, style.flexWrap),
    inline: style.display.startsWith('inline-'),
    direction: style.flexDirection,
    wrap: style.flexWrap,
    justify: style.justifyContent,
    alignItems: style.alignItems,
    ownJustify: !!node?.style.getPropertyValue('justify-content'),
    rowGap: style.rowGap === 'normal' ? 0 : px(style.rowGap),
    columnGap: style.columnGap === 'normal' ? 0 : px(style.columnGap),
    padding: {
      top: px(style.paddingTop),
      right: px(style.paddingRight),
      bottom: px(style.paddingBottom),
      left: px(style.paddingLeft),
    },
    parent: above
      ? flowOf(above.display, above.flexDirection, above.flexWrap)
      : 'block',
    parentAlignItems: above?.alignItems ?? 'normal',
    width: Math.round(node?.offsetWidth ?? 0),
    height: Math.round(node?.offsetHeight ?? 0),
  }
}
