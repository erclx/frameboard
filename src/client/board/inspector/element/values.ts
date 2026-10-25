import type { StyleValue } from '@/shared/records/elements'
import type { TokenRow } from '@/shared/records/tokens'
import type { Theme } from '@/shared/theme'

export const HEX = /^#[0-9a-f]{6}$/i

/** The row's shell, as the reference's `.crow`. */
export const COLOR_ROW =
  'flex h-[26px] items-center gap-2 rounded-md bg-input px-2 text-xs'

/** A token's chip, as the reference's `.tok`. */
export const TOKEN_CHIP =
  '-ml-1 max-w-max truncate rounded-[4px] bg-[color-mix(in_srgb,var(--foreground)_9%,transparent)] px-1.5 py-px'

/** A color as the source names it: a token, or a raw value. */
export type ColorSource = { token: string } | { raw: string }

/**
 * The CSS a color row writes. A token at 100 percent is `var(--token)`, and
 * below it `color-mix()` over the token, so it keeps following the theme. A
 * raw hex below 100 percent gains an alpha pair, and any other raw value is
 * mixed like a token.
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
