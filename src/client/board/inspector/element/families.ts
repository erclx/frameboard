import { type Face, FACES } from '@/shared/faces'
import type { InstalledFont } from '@/shared/records/sourcing'
import type { TokenRow } from '@/shared/records/tokens'

/** One entry of the Family menu: a project font token, a served face, or a family the project installed. */
export interface FamilyOption {
  /** What a pick writes to `font-family`. */
  value: string
  name: string
  /** The custom property it names, null for a family. */
  token: string | null
  /** The stack it renders in, matched against the computed one and drawn as its preview. */
  stack: string
}

/** A stack's first family, unquoted, as `'Geist Mono', monospace` gives `Geist Mono`. */
export function firstFamily(stack: string): string {
  return (stack.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '')
}

/** The served face a stack renders in first, null for any other family. */
export function faceOf(stack: string): Face | null {
  const family = firstFamily(stack).toLowerCase()
  return FACES.find((face) => face.family.toLowerCase() === family) ?? null
}

/**
 * The project's font tokens holding a family stack, then every served face,
 * then each family the project installed that no face already names. A font
 * token holding a size or a weight, such as `--font-size-sm: 12px`, is left
 * out.
 */
export function familyOptions(
  fonts: readonly TokenRow[],
  installed: readonly Pick<InstalledFont, 'family'>[] = [],
): FamilyOption[] {
  const tokens = fonts.flatMap((row) => {
    const stack = row.light ?? row.dark
    if (!stack || /^-?[\d.]/.test(stack.trim())) return []
    return [
      {
        value: `var(${row.name})`,
        name: row.name.replace(/^--/, ''),
        token: row.name,
        stack,
      },
    ]
  })
  const served = new Set(FACES.map((face) => face.family.toLowerCase()))
  const families = [
    ...FACES.map((face) => face.family),
    ...installed
      .map((font) => font.family)
      .filter((family) => !served.has(family.toLowerCase())),
  ].map((family) => {
    const value = /\s/.test(family) ? `'${family}'` : family
    return { value, name: family, token: null, stack: value }
  })
  return [...tokens, ...families]
}

/**
 * The option an element shows as, its source's token read from the static
 * cascade since the computed stack never names one, else the stack's first
 * family where the menu lists it, else null. An unlisted token still shows by
 * its name.
 */
export function familyIn(
  stack: string,
  token: string | null,
  options: readonly FamilyOption[],
): FamilyOption | null {
  if (token) {
    return (
      options.find((option) => option.token === token) ?? {
        value: `var(${token})`,
        name: token.replace(/^--/, ''),
        token,
        stack,
      }
    )
  }
  const family = firstFamily(stack).toLowerCase()
  return (
    options.find(
      (option) => !option.token && option.name.toLowerCase() === family,
    ) ?? null
  )
}
