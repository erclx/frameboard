type Rgb = [number, number, number]

interface Color {
  rgb: Rgb
  alpha: number
}

/** A computed color, being `rgb()`, `rgba()`, or the `color(srgb …)` a `color-mix` computes to. */
function parse(color: string): Color {
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
