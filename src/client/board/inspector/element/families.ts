import { type Face, FACES } from '@/shared/faces'
import type { TokenRow } from '@/shared/records/tokens'

/** One entry of the Family menu: a project font token, or a served face. */
export interface FamilyOption {
  /** What a pick writes to `font-family`. */
  value: string
  name: string
  /** The custom property it names, null for a face. */
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
 * The project's font tokens holding a family stack, then every served face.
 * A font token holding a size or a weight, such as `--font-size-sm: 12px`,
 * is left out.
 */
export function familyOptions(fonts: readonly TokenRow[]): FamilyOption[] {
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
  const faces = FACES.map((face) => {
    const value = /\s/.test(face.family) ? `'${face.family}'` : face.family
    return { value, name: face.family, token: null, stack: value }
  })
  return [...tokens, ...faces]
}

/**
 * The option an element shows as: the token its source names, read from the
 * static cascade since the computed stack never names one, else the face
 * the computed stack starts with, else null for a family the menu does not
 * hold. A token the menu does not list, such as one holding another
 * token's `var()`, still shows by its name.
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
  const face = faceOf(stack)
  return (
    options.find((option) => !option.token && option.name === face?.family) ??
    null
  )
}
