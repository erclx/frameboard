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
 * any fade has finished.
 */
export function contrastOnPage(element: HTMLElement): number {
  const layers: Color[] = []
  for (let at: HTMLElement | null = element; at; at = at.parentElement) {
    const fill = parse(getComputedStyle(at).backgroundColor)
    if (fill.alpha > 0) layers.push(fill)
    if (fill.alpha === 1) break
  }
  const ground = layers
    .reverse()
    .reduce<Rgb>((under, top) => over(top, under), [255, 255, 255])
  const text = over(parse(getComputedStyle(element).color), ground)
  const [light, dark] = [luminance(text), luminance(ground)].sort(
    (a, b) => b - a,
  )
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}
