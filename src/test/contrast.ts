type Rgba = [number, number, number, number]

/** A computed color, being `rgb()`, `rgba()`, or the `color(srgb …)` a `color-mix` computes to. */
function parse(color: string): Rgba {
  const srgb =
    /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(color)
  if (srgb) {
    const [r, g, b] = [srgb[1], srgb[2], srgb[3]].map((part) => Number(part))
    return [r * 255, g * 255, b * 255, Number(srgb[4] ?? 1)] as Rgba
  }
  const rgb = /^rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)$/.exec(
    color,
  )
  if (!rgb) throw new Error(`unread color ${color}`)
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4] ?? 1)]
}

function over(top: Rgba, under: Rgba): Rgba {
  const a = top[3]
  return [0, 1, 2].map(
    (at) => top[at]! * a + under[at]! * (1 - a),
  ) as unknown as Rgba
}

function luminance([r, g, b]: Rgba): number {
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
  const layers: Rgba[] = []
  for (let at: HTMLElement | null = element; at; at = at.parentElement) {
    const fill = parse(getComputedStyle(at).backgroundColor)
    if (fill[3] > 0) layers.push(fill)
    if (fill[3] === 1) break
  }
  const ground = layers
    .reverse()
    .reduce<Rgba>(
      (under, top) => [...over(top, under), 1] as Rgba,
      [255, 255, 255, 1],
    )
  const text = over(parse(getComputedStyle(element).color), ground)
  const [light, dark] = [luminance(text), luminance(ground)].sort(
    (a, b) => b - a,
  )
  return (light! + 0.05) / (dark! + 0.05)
}
