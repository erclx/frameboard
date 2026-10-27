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
 * The option a computed stack shows as: a token whose stack it equals, since
 * the computed value never names the token, else the face it starts with,
 * else null for a family the menu does not hold.
 */
export function familyIn(
  stack: string,
  options: readonly FamilyOption[],
): FamilyOption | null {
  const computed = normalized(stack)
  const token = options.find(
    (option) => option.token && normalized(option.stack) === computed,
  )
  if (token) return token
  const face = faceOf(stack)
  return (
    options.find((option) => !option.token && option.name === face?.family) ??
    null
  )
}

function normalized(stack: string): string {
  return stack
    .split(',')
    .map((family) =>
      family
        .trim()
        .replace(/^["']|["']$/g, '')
        .toLowerCase(),
    )
    .join(',')
}
