/** A color in sRGB, each channel 0 to 255, with alpha 0 to 1. */
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/** Hue 0 to 360, saturation and value 0 to 1, as the picker's square and hue bar hold them. */
export interface Hsv {
  h: number
  s: number
  v: number
}

/** Hue 0 to 360, saturation and lightness 0 to 100, as CSS writes `hsl()`. */
export interface Hsl {
  h: number
  s: number
  l: number
}

const HEX = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** A hex color of 3, 4, 6, or 8 digits, with or without `#`, or null for anything else. */
export function parseHex(text: string): Rgba | null {
  const digits = HEX.exec(text.trim())?.[1]
  if (!digits) return null
  const full =
    digits.length <= 4
      ? [...digits].map((digit) => digit + digit).join('')
      : digits
  const channel = (at: number) => parseInt(full.slice(at, at + 2), 16)
  return {
    r: channel(0),
    g: channel(2),
    b: channel(4),
    a: full.length === 8 ? round(channel(6) / 255, 3) : 1,
  }
}

/** Six uppercase hex digits for a color's channels, without `#`, its alpha dropped. */
export function toHex({ r, g, b }: Rgba): string {
  return [r, g, b]
    .map((channel) =>
      Math.round(clamp(channel, 0, 255))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()
}

/**
 * A color as a browser computes it, being `rgb()`, `rgba()`, or
 * `color(srgb …)` with an optional alpha, or a hex, or null for anything else.
 */
export function parseComputed(text: string): Rgba | null {
  const value = text.trim().toLowerCase()
  const rgb = /^rgba?\(([^)]*)\)$/.exec(value)
  if (rgb?.[1]) {
    const parts = rgb[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number)
    const [r, g, b, a = 1] = parts
    if (r === undefined || g === undefined || b === undefined) return null
    if (parts.some((part) => !Number.isFinite(part))) return null
    return { r, g, b, a }
  }
  const srgb = /^color\(srgb ([^)]*)\)$/.exec(value)
  if (srgb?.[1]) {
    const parts = srgb[1]
      .split(/[\s/]+/)
      .filter(Boolean)
      .map(Number)
    const [r, g, b, a = 1] = parts
    if (r === undefined || g === undefined || b === undefined) return null
    if (parts.some((part) => !Number.isFinite(part))) return null
    return { r: r * 255, g: g * 255, b: b * 255, a }
  }
  return parseHex(value)
}

/**
 * The color a CSS value shows, as hue, saturation, and value, resolved by
 * the browser so a keyword, `rgb()`, or `color-mix()` opens at its color.
 * Null where the browser reads no color.
 */
export function resolveColor(css: string, within: HTMLElement): Hsv | null {
  const probe = within.ownerDocument.createElement('span')
  probe.style.color = css
  if (probe.style.color === '') return null
  probe.style.display = 'none'
  within.append(probe)
  const computed = getComputedStyle(probe).color
  probe.remove()
  const rgb = parseComputed(computed)
  return rgb ? rgbToHsv(rgb) : null
}

export function rgbToHsv({ r, g, b }: Rgba): Hsv {
  const [red, green, blue] = [r / 255, g / 255, b / 255]
  const max = Math.max(red, green, blue)
  const delta = max - Math.min(red, green, blue)
  return {
    h: hueOf(red, green, blue, max, delta),
    s: max === 0 ? 0 : delta / max,
    v: max,
  }
}

export function hsvToRgb({ h, s, v }: Hsv, a = 1): Rgba {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6
    return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255
  }
  return { r: channel(5), g: channel(3), b: channel(1), a }
}

export function rgbToHsl({ r, g, b }: Rgba): Hsl {
  const [red, green, blue] = [r / 255, g / 255, b / 255]
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const delta = max - min
  const l = (max + min) / 2
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))
  return { h: hueOf(red, green, blue, max, delta), s: s * 100, l: l * 100 }
}

export function hslToRgb({ h, s, l }: Hsl, a = 1): Rgba {
  const sat = s / 100
  const light = l / 100
  const chroma = sat * Math.min(light, 1 - light)
  const channel = (n: number) => {
    const k = (n + h / 30) % 12
    return (light - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255
  }
  return { r: channel(0), g: channel(8), b: channel(4), a }
}

/** The hue of a color whose largest channel is `max` and range is `delta`, 0 for a grey. */
function hueOf(
  red: number,
  green: number,
  blue: number,
  max: number,
  delta: number,
): number {
  if (delta === 0) return 0
  const sixth =
    max === red
      ? ((green - blue) / delta) % 6
      : max === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4
  return (sixth * 60 + 360) % 360
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

function round(value: number, places: number): number {
  const scale = 10 ** places
  return Math.round(value * scale) / scale
}
