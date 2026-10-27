import { type Face, FACES } from '@/shared/faces'

/** A stack's first family, unquoted, as `'Geist Mono', monospace` gives `Geist Mono`. */
export function firstFamily(stack: string): string {
  return (stack.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '')
}

/** The served face a stack renders in first, null for any other family. */
export function faceOf(stack: string): Face | null {
  const family = firstFamily(stack).toLowerCase()
  return FACES.find((face) => face.family.toLowerCase() === family) ?? null
}
