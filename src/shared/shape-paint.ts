import type { TokenRow } from '@/shared/records/tokens'

/** The colors a shape is painted in, each a `var()` of a token or a raw hex. */
export interface ShapePaint {
  readonly fill: string
  readonly line: string
}

const FILL_TOKENS = ['--muted', '--secondary', '--accent']
const LINE_TOKEN = '--border'
/** Raw on purpose, so the check names it once the project sets no color token. */
export const RAW_GREY = '#d9d9d9'

/**
 * A shape's fill and line from the project's tokens, shared so the server's
 * placed shape and the board's drag preview match.
 */
export function shapePaint(tokens: readonly TokenRow[]): ShapePaint {
  const names = new Set(tokens.map((row) => row.name))
  const firstColor = tokens.find((row) => row.group === 'color')?.name
  const paint = (name: string | undefined) =>
    name === undefined ? RAW_GREY : `var(${name})`
  return {
    fill: paint(FILL_TOKENS.find((name) => names.has(name)) ?? firstColor),
    line: paint(names.has(LINE_TOKEN) ? LINE_TOKEN : firstColor),
  }
}
