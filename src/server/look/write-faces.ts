import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { type Face, FACES } from '@/shared/faces'

const require = createRequire(import.meta.url)

/** Whether `dir` holds a sheet for every face. */
export function hasFaces(dir: string): boolean {
  return FACES.every((face) => existsSync(join(dir, face.folder, 'index.css')))
}

const FILE_REFERENCE = /url\(\s*(['"]?)\.\/files\/([^'")\s]+)\1\s*\)/g

/** The distinct file names a package sheet loads from its `files` folder. */
export function referencedFiles(sheet: string): string[] {
  const names = [...sheet.matchAll(FILE_REFERENCE)].flatMap((m) =>
    m[2] ? [m[2]] : [],
  )
  return [...new Set(names)]
}

/**
 * Copies each face every frame imports from its package into `outDir`,
 * replacing what was there. Only the files a package sheet references are
 * copied, and a reference to a file the package lacks throws. The faces fill
 * a sibling folder first and rename into place, so `outDir` holds every file or does not exist, and an
 * interrupted write leaves no half-filled face behind. Each sheet is
 * rewritten to declare the plain family a frame names, such as Geist, rather
 * than the package's own, such as Geist Variable. With `keepComplete`, a
 * complete folder already there, as from a parallel run, stays as it is, so
 * several processes can fill one cold folder at once.
 */
export function writeFaces(
  outDir: string,
  {
    keepComplete = false,
    faces = FACES,
  }: { keepComplete?: boolean; faces?: readonly Face[] } = {},
): void {
  const staging = `${outDir}.${process.pid}.tmp`
  rmSync(staging, { recursive: true, force: true })
  try {
    for (const face of faces) {
      const from = dirname(require.resolve(`${face.package}/package.json`))
      const to = join(staging, face.folder)
      mkdirSync(join(to, 'files'), { recursive: true })

      const sheet = readFileSync(join(from, 'index.css'), 'utf8')
      writeFileSync(
        join(to, 'index.css'),
        sheet.replaceAll(`'${face.packageFamily}'`, `'${face.family}'`),
      )
      copyFileSync(join(from, 'LICENSE'), join(to, 'LICENSE'))
      for (const file of referencedFiles(sheet)) {
        copyFileSync(join(from, 'files', file), join(to, 'files', file))
      }
    }
    mkdirSync(dirname(outDir), { recursive: true })
    if (keepComplete) {
      placeKeepingComplete(staging, outDir)
      return
    }
    rmSync(outDir, { recursive: true, force: true })
    renameSync(staging, outDir)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

// Two runs meeting a stale partial folder each remove it once, so a third
// attempt is enough for every run to land on the folder one of them placed.
const PLACE_ATTEMPTS = 3

/**
 * Renames `staging` into `outDir` unless a complete folder is already there,
 * as when another process filled a cold cache first. Only an incomplete
 * folder is removed before the next attempt, since a reader may hold the path
 * of a complete one.
 */
function placeKeepingComplete(staging: string, outDir: string): void {
  for (let attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
    try {
      renameSync(staging, outDir)
      return
    } catch (error) {
      if (!isOccupied(error)) throw error
    }
    if (hasFaces(outDir)) return
    rmSync(outDir, { recursive: true, force: true })
  }
  throw new Error(
    `${outDir} stayed incomplete after ${PLACE_ATTEMPTS} attempts to place the faces`,
  )
}

/** Whether a rename failed because its target is a folder with files in it. */
function isOccupied(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === 'ENOTEMPTY' || code === 'EEXIST'
}
