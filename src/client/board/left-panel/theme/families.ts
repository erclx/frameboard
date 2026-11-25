import { FACES, faceStack } from '@/shared/faces'
import type { InstalledFont } from '@/shared/records/sourcing'

/** One family a frame may name, built in or installed. */
export interface FamilyRow {
  family: string
  /** The stack its specimen is set in. */
  stack: string
  /** Where it came from, as `Built in` or a license such as `OFL`. */
  source: string
  installed: InstalledFont | null
}

/** Every family a frame may name, built in then installed. */
export function familyRows(installed: readonly InstalledFont[]): FamilyRow[] {
  const taken = new Set(installed.map((font) => font.family.toLowerCase()))
  const builtIn = FACES.filter(
    (face) => !taken.has(face.family.toLowerCase()),
  ).map((face) => ({
    family: face.family,
    stack: faceStack(face),
    source: 'Built in',
    installed: null,
  }))
  const own = installed.map((font) => ({
    family: font.family,
    stack: `'${font.family}', sans-serif`,
    source: licenseMark(font.license),
    installed: font,
  }))
  return [...builtIn, ...own]
}

/** A license's short mark, as `OFL-1.1` reads `OFL`. */
export function licenseMark(license: string): string {
  return license.replace(/-[\d.]+$/, '')
}
