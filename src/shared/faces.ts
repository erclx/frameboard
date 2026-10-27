/** A face served into every frame, copied from its package at build. */
export interface Face {
  /** The family a frame names, which the copied sheet declares in place of the package's own. */
  family: string
  /** The `@fontsource-variable` package the face is copied from. */
  package: string
  /** The family the package's sheet declares, rewritten to `family` on copy. */
  packageFamily: string
  /** The folder under the faces folder, and under the URL the frames import it from. */
  folder: string
  /** The weights the package's variable face spans, both ends included. */
  weights: { min: number; max: number }
  /** The generic family a stack naming this face falls back to. */
  fallback: 'sans-serif' | 'serif' | 'monospace' | 'cursive'
  /** Whether a new project's look may start from it, which a handwriting face may not. */
  startsLook: boolean
}

export const FACES = [
  {
    family: 'Geist',
    package: '@fontsource-variable/geist',
    packageFamily: 'Geist Variable',
    folder: 'geist',
    weights: { min: 100, max: 900 },
    fallback: 'sans-serif',
    startsLook: true,
  },
  {
    family: 'Geist Mono',
    package: '@fontsource-variable/geist-mono',
    packageFamily: 'Geist Mono Variable',
    folder: 'geist-mono',
    weights: { min: 100, max: 900 },
    fallback: 'monospace',
    startsLook: true,
  },
  {
    family: 'Inter',
    package: '@fontsource-variable/inter',
    packageFamily: 'Inter Variable',
    folder: 'inter',
    weights: { min: 100, max: 900 },
    fallback: 'sans-serif',
    startsLook: true,
  },
  {
    family: 'Source Serif 4',
    package: '@fontsource-variable/source-serif-4',
    packageFamily: 'Source Serif 4 Variable',
    folder: 'source-serif-4',
    weights: { min: 200, max: 900 },
    fallback: 'serif',
    startsLook: true,
  },
  {
    family: 'Caveat',
    package: '@fontsource-variable/caveat',
    packageFamily: 'Caveat Variable',
    folder: 'caveat',
    weights: { min: 400, max: 700 },
    fallback: 'cursive',
    startsLook: false,
  },
] as const satisfies readonly Face[]

/** Where the server serves the faces folder. */
export const FACES_URL = '/frameboard/faces'

/** The sheet a frame imports to get one face. */
export function faceSheetUrl(face: Face): string {
  return `${FACES_URL}/${face.folder}/index.css`
}

/** The stack naming a face then its fallback, as `'Geist Mono', monospace`. */
export function faceStack(face: Face): string {
  const family = /\s/.test(face.family) ? `'${face.family}'` : face.family
  return `${family}, ${face.fallback}`
}
