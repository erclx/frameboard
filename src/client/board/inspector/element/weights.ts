import type { Face } from '@/shared/faces'

export interface NamedWeight {
  value: number
  name: string
}

/** The CSS weights by the names a design tool gives them. */
export const WEIGHTS: readonly NamedWeight[] = [
  { value: 100, name: 'Thin' },
  { value: 200, name: 'Extra Light' },
  { value: 300, name: 'Light' },
  { value: 400, name: 'Regular' },
  { value: 500, name: 'Medium' },
  { value: 600, name: 'Semi Bold' },
  { value: 700, name: 'Bold' },
  { value: 800, name: 'Extra Bold' },
  { value: 900, name: 'Black' },
]

/** The named weights a face ships, every one for a family the board does not serve. */
export function weightsOf(face: Face | null): readonly NamedWeight[] {
  if (!face) return WEIGHTS
  const { min, max } = face.weights
  return WEIGHTS.filter(({ value }) => value >= min && value <= max)
}

/** A weight's name among those offered, else its number, so a weight the face lacks reads as written. */
export function weightLabel(
  weight: number,
  offered: readonly NamedWeight[],
): string {
  return offered.find(({ value }) => value === weight)?.name ?? String(weight)
}
