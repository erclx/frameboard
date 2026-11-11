type Rgb = [number, number, number]

interface Color {
  rgb: Rgb
  alpha: number
}

function encode(linear: number): number {
  const c = Math.min(1, Math.max(0, linear))
  return (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255
}

/** An `oklab()` color as sRGB, by the reference matrices in CSS Color 4. */
function fromOklab(L: number, a: number, b: number): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

/** A computed color, being `rgb()`, `rgba()`, `oklab()`, or the `color(srgb …)` a `color-mix` computes to. */
function parse(color: string): Color {
  const oklab =
    /^oklab\(([-\d.]+) ([-\d.]+) ([-\d.]+)(?: \/ ([\d.]+))?\)$/.exec(color)
  if (oklab) {
    return {
      rgb: fromOklab(Number(oklab[1]), Number(oklab[2]), Number(oklab[3])),
      alpha: Number(oklab[4] ?? 1),
    }
  }
  const srgb =
    /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(color)
  if (srgb) {
    return {
      rgb: [
        Number(srgb[1]) * 255,
        Number(srgb[2]) * 255,
        Number(srgb[3]) * 255,
      ],
      alpha: Number(srgb[4] ?? 1),
    }
  }
  const rgb = /^rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)$/.exec(
    color,
  )
  if (!rgb) throw new Error(`unread color ${color}`)
  return {
    rgb: [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])],
    alpha: Number(rgb[4] ?? 1),
  }
}

function over({ rgb, alpha }: Color, [r, g, b]: Rgb): Rgb {
  return [
    rgb[0] * alpha + r * (1 - alpha),
    rgb[1] * alpha + g * (1 - alpha),
    rgb[2] * alpha + b * (1 - alpha),
  ]
}

function luminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/**
 * An element's text against its background as WCAG measures it, each
 * translucent background up its ancestors laid over the ones beneath, on
 * white when none is opaque. Element opacity is not read, so measure once
 * any fade has finished. A `pseudo` such as `::placeholder` reads that
 * pseudo-element's text over the element's own background.
 */
export function contrastOnPage(element: Element, pseudo?: string): number {
  const ground = groundOf(element)
  const text = over(parse(getComputedStyle(element, pseudo).color), ground)
  return ratio(text, ground)
}

/** An unblurred box shadow's color and spread, the shape a `ring-*` utility draws. */
const SPREAD = /((?:rgba?|oklab|color)\([^)]*\)) 0px 0px 0px ([\d.]+)px/g

/**
 * The focus ring a `ring-*` utility draws round an element, being its widest
 * unblurred box shadow, against the ground outside the element it sits on.
 * An element drawing no ring reads 1, since nothing sets it apart.
 */
export function ringContrastOnPage(element: Element): number {
  let ring: Color | null = null
  let widest = 0
  for (const [, color = '', spread] of getComputedStyle(
    element,
  ).boxShadow.matchAll(SPREAD)) {
    const shadow = parse(color)
    if (Number(spread) > widest && shadow.alpha > 0) {
      widest = Number(spread)
      ring = shadow
    }
  }
  if (!ring) return 1
  const ground = groundOf(element.parentElement)
  return ratio(over(ring, ground), ground)
}

/** The opaque color showing through `element`: its translucent fill and its ancestors' laid over each other, on white when none is opaque. */
function groundOf(element: Element | null): Rgb {
  const layers: Color[] = []
  for (let at = element; at; at = at.parentElement) {
    const fill = parse(getComputedStyle(at).backgroundColor)
    if (fill.alpha > 0) layers.push(fill)
    if (fill.alpha === 1) break
  }
  return layers
    .reverse()
    .reduce<Rgb>((under, top) => over(top, under), [255, 255, 255])
}

function ratio(one: Rgb, other: Rgb): number {
  const [light, dark] = [luminance(one), luminance(other)].sort((a, b) => b - a)
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}
