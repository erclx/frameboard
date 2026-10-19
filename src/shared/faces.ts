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
}

export const FACES: readonly Face[] = [
  {
    family: 'Geist',
    package: '@fontsource-variable/geist',
    packageFamily: 'Geist Variable',
    folder: 'geist',
  },
  {
    family: 'Geist Mono',
    package: '@fontsource-variable/geist-mono',
    packageFamily: 'Geist Mono Variable',
    folder: 'geist-mono',
  },
  {
    family: 'Caveat',
    package: '@fontsource-variable/caveat',
    packageFamily: 'Caveat Variable',
    folder: 'caveat',
  },
]

/** Where the server serves the faces folder. */
export const FACES_URL = '/frameboard/faces'

/** The sheet a frame imports to get one face. */
export function faceSheetUrl(face: Face): string {
  return `${FACES_URL}/${face.folder}/index.css`
}
