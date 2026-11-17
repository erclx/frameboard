import type { StyleValue } from '@/shared/records/elements'
import type { TokenRow } from '@/shared/records/tokens'
import type { Theme } from '@/shared/theme'

import { parseComputed, parseHex, type Rgba } from './color-picker/space'

export const HEX = /^#[0-9a-f]{6}$/i

/** The row's shell, as the reference's `.crow`. */
export const COLOR_ROW =
  'flex h-[26px] items-center gap-2 rounded-md bg-input px-2 text-xs'

/** A token's chip, as the reference's `.tok`. */
export const TOKEN_CHIP =
  '-ml-1 max-w-max truncate rounded-[4px] bg-[color-mix(in_srgb,var(--foreground)_9%,transparent)] px-1.5 py-px'

/**
 * The inset ring every color swatch draws, so a swatch near the panel's own
 * color still shows its edge. `--faint` rather than a fixed grey, which on
 * the dark sidebar left a near-black swatch with no edge at all.
 */
export const SWATCH_RING = 'shadow-[inset_0_0_0_1px_var(--faint)]'

/** A color as the source names it: a token, or a raw value. */
export type ColorSource = { token: string } | { raw: string }

/**
 * The CSS a color row writes, `color-mix()` over a token below 100 percent so
 * it keeps following the theme, and an alpha pair on a raw hex.
 */
export function colorCss(source: ColorSource, percent: number): string {
  const color = 'token' in source ? `var(${source.token})` : source.raw
  if (percent >= 100) return color
  if ('raw' in source && HEX.test(source.raw)) {
    const alpha = Math.round((percent / 100) * 255)
      .toString(16)
      .padStart(2, '0')
    return `${source.raw}${alpha}`
  }
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`
}

/** A token's value in one theme, or null when no sheet sets it. */
export function tokenValue(
  tokens: readonly TokenRow[],
  name: string,
  theme: Theme,
): string | null {
  return tokens.find((row) => row.name === name)?.[theme] ?? null
}

function rgbOf(css: string): Rgba | null {
  return parseHex(css) ?? parseComputed(css)
}

/**
 * The first token whose theme value equals the raw opaque `value` exactly, or
 * null. Both must be opaque, since a translucent value reads 100 percent and
 * a swap written at it would drop the alpha.
 */
export function matchingToken(
  value: string,
  tokens: readonly TokenRow[],
  theme: Theme,
): TokenRow | null {
  const from = rgbOf(value)
  if (!from || from.a !== 1) return null
  return (
    tokens.find((token) => {
      const shown = token[theme]
      const to = shown === null ? null : rgbOf(shown)
      return (
        to !== null &&
        to.a === 1 &&
        to.r === from.r &&
        to.g === from.g &&
        to.b === from.b
      )
    }) ?? null
  )
}

/** The color a swatch paints for a stated value, null for a token with no value. */
export function swatchOf(
  value: StyleValue,
  tokens: readonly TokenRow[],
  theme: Theme,
): string | null {
  const base = value.token
    ? tokenValue(tokens, value.token, theme)
    : value.value
  if (base === null) return null
  return value.percent >= 100
    ? base
    : `color-mix(in srgb, ${base} ${value.percent}%, transparent)`
}

/** The token's name as its chip shows it, with no leading dashes. */
export function chipName(token: string): string {
  return token.replace(/^--/, '')
}
