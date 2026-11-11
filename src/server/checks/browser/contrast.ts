import type { Page } from 'playwright-core'

import type { Finding } from '@/shared/records/check'

import { findingFor, type RuleDoc } from '../rule'
import type { RenderedTarget } from './layout'

export const CONTRAST_RULES: RuleDoc[] = [
  {
    id: 'min-contrast',
    tier: 'browser',
    severity: 'warning',
    configKey: 'minContrast',
    description:
      "Text contrasts with the solid color behind it at a lower ratio than the project sets, 4.5 being WCAG's, with large text held to two thirds of it. Text over an image, a gradient, or an effect is not measured.",
  },
]

const finding = findingFor(CONTRAST_RULES)

/** WCAG's large text is 18 pt, or 14 pt bold, which hold 3:1 against 4.5:1. */
const LARGE_SHARE = 2 / 3

interface MeasuredText {
  index: number
  tag: string
  ratio: number
  large: boolean
  foreground: string
  background: string
}

/**
 * Reports text whose contrast with the solid color behind it falls under
 * `minContrast`, naming the element furthest under and how many more fall
 * under, at most one finding per frame.
 */
export async function checkContrast(
  page: Page,
  target: RenderedTarget,
  minContrast: number,
): Promise<Finding[]> {
  const under = (await page.evaluate(readContrasts))
    .map((text) => ({
      ...text,
      minimum: text.large ? minContrast * LARGE_SHARE : minContrast,
    }))
    .filter((text) => text.ratio < text.minimum)
  if (under.length === 0) return []
  const worst = under.reduce((least, text) =>
    text.ratio / text.minimum < least.ratio / least.minimum ? text : least,
  )
  const others = under.length - 1
  const rest =
    others === 0
      ? ''
      : `, and ${others} more ${others === 1 ? 'element is' : 'elements are'} under it`
  const minimum = worst.large
    ? `${formatRatio(worst.minimum)}:1 minimum for large text`
    : `${formatRatio(worst.minimum)}:1 minimum`
  return [
    finding('min-contrast', {
      frame: target.ref,
      path: target.path,
      message: `${target.ref} sets text in <${worst.tag}> at element ${worst.index} at ${floorRatio(worst.ratio)}:1, ${worst.foreground} on ${worst.background}, under the project's ${minimum}${rest}.`,
    }),
  ]
}

/** Floors to two places, so a ratio just under the minimum never prints as it. */
function floorRatio(ratio: number): string {
  return (Math.floor(ratio * 100) / 100).toFixed(2)
}

function formatRatio(ratio: number): string {
  return String(Math.round(ratio * 100) / 100)
}

// Runs in the page, so it carries everything it reads. It picks text
// elements and counts their index the way `font-size.ts` does, so `inspect`
// and `edit` reach the element named. Colors convert to sRGB by painting a
// canvas pixel, which reads every syntax the browser does. Text the reader
// cannot measure against one solid color is left out rather than guessed.
function readContrasts(): MeasuredText[] {
  type Rgba = [number, number, number, number]
  const notText = new Set([
    'HTML',
    'HEAD',
    'TITLE',
    'SCRIPT',
    'STYLE',
    'NOSCRIPT',
    'TEMPLATE',
  ])
  const opaqueTags = new Set([
    'IMG',
    'VIDEO',
    'CANVAS',
    'IFRAME',
    'OBJECT',
    'EMBED',
    'PICTURE',
  ])

  const candidates: { element: Element; index: number; text: Text }[] = []
  let index = 0
  for (const element of document.querySelectorAll('*')) {
    if (element.closest('[data-frameboard]')) continue
    const own = index
    index += 1
    if (notText.has(element.tagName.toUpperCase())) continue
    const text = [...element.childNodes].find(
      (node): node is Text =>
        node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
    )
    if (text) candidates.push({ element, index: own, text })
  }

  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return []
  const toRgba = (color: string): Rgba => {
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = '#000'
    context.fillStyle = color
    context.fillRect(0, 0, 1, 1)
    const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data
    // The pixel holds alpha in 8 bits, so a computed alpha is read exactly.
    const written =
      /^rgba\(.*,\s*([\d.]+)()\)$/.exec(color) ??
      /\/\s*([\d.]+)(%?)\s*\)$/.exec(color)
    const alpha = written?.[1]
      ? Number.parseFloat(written[1]) / (written[2] ? 100 : 1)
      : a / 255
    return [r, g, b, alpha]
  }
  const over = (top: Rgba, below: Rgba): Rgba => {
    const [r, g, b, a] = top
    return [
      r * a + below[0] * (1 - a),
      g * a + below[1] * (1 - a),
      b * a + below[2] * (1 - a),
      1,
    ]
  }
  const luminance = ([r, g, b]: Rgba) => {
    const channel = (value: number) => {
      const s = value / 255
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  }
  const hex = (color: Rgba) =>
    `#${color
      .slice(0, 3)
      .map((value) => Math.round(value).toString(16).padStart(2, '0'))
      .join('')}`
  const opacityOf = (element: Element) => {
    let opacity = 1
    for (let at: Element | null = element; at; at = at.parentElement) {
      opacity *= Number.parseFloat(getComputedStyle(at).opacity)
    }
    return opacity
  }
  const paintsEffect = (style: CSSStyleDeclaration) =>
    style.backgroundImage !== 'none' ||
    style.filter !== 'none' ||
    style.backdropFilter !== 'none' ||
    style.mixBlendMode !== 'normal'

  const probe = document.createElement('div')
  probe.style.backgroundColor = 'Canvas'
  document.documentElement.append(probe)
  const canvasColor = toRgba(getComputedStyle(probe).backgroundColor)
  probe.remove()

  // The root's background propagates to the canvas, and body's does when
  // the root's is transparent, so text below body's box still sits on it.
  const html = document.documentElement
  const htmlStyle = getComputedStyle(html)
  const body = document.body
  const bodyStyle = body ? getComputedStyle(body) : null
  const htmlColor = toRgba(htmlStyle.backgroundColor)
  const bodyPropagates =
    htmlColor[3] === 0 && htmlStyle.backgroundImage === 'none'
  const rootStyle = bodyPropagates && bodyStyle ? bodyStyle : htmlStyle
  const rootUnmeasurable = paintsEffect(rootStyle)
  const root = over(toRgba(rootStyle.backgroundColor), canvasColor)

  const running = document
    .getAnimations()
    .filter((animation) => animation.playState === 'running')
    .flatMap((animation) => {
      const effect = animation.effect
      return effect instanceof KeyframeEffect && effect.target
        ? [effect.target]
        : []
    })

  // A hit test leaves out an element with pointer-events: none, which a
  // background layer often sets, so every element takes hits while it runs.
  const hits = document.createElement('style')
  hits.textContent = '* { pointer-events: auto !important; }'
  document.head.append(hits)
  const found: MeasuredText[] = []
  try {
    for (const { element, index: own, text } of candidates) {
      const style = getComputedStyle(element)
      if (style.visibility !== 'visible') continue
      const range = document.createRange()
      range.selectNodeContents(text)
      const rect = range.getBoundingClientRect()
      if (rect.width <= 1 || rect.height <= 1) continue
      if (running.some((target) => target.contains(element))) continue
      let clipped = false
      for (let at: Element | null = element; at; at = at.parentElement) {
        const clip = getComputedStyle(at).backgroundClip
        if (clip === 'text') clipped = true
      }
      if (clipped) continue

      const stack = document.elementsFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      )
      const from = stack.indexOf(element)
      if (from === -1) continue
      const layers: Rgba[] = []
      let measurable = !rootUnmeasurable
      for (const layer of stack.slice(from)) {
        if (layer === html || (bodyPropagates && layer === body)) continue
        const layerStyle = getComputedStyle(layer)
        if (
          opaqueTags.has(layer.tagName.toUpperCase()) ||
          layer instanceof SVGElement ||
          paintsEffect(layerStyle)
        ) {
          measurable = false
          break
        }
        const color = toRgba(layerStyle.backgroundColor)
        color[3] *= opacityOf(layer)
        if (color[3] === 0) continue
        layers.push(color)
        if (color[3] >= 1) break
      }
      if (!measurable) continue
      const background = layers.reduceRight(
        (below, layer) => over(layer, below),
        root,
      )

      const fill = toRgba(style.webkitTextFillColor || style.color)
      fill[3] *= opacityOf(element)
      const foreground = over(fill, background)
      const lighter = Math.max(luminance(foreground), luminance(background))
      const darker = Math.min(luminance(foreground), luminance(background))
      const size = Number.parseFloat(style.fontSize)
      const weight = Number.parseFloat(style.fontWeight)
      found.push({
        index: own,
        tag: element.tagName.toLowerCase(),
        ratio: (lighter + 0.05) / (darker + 0.05),
        large: size >= 24 || (size >= 18.66 && weight >= 700),
        foreground: hex(foreground),
        background: hex(background),
      })
    }
  } finally {
    hits.remove()
  }
  return found
}
