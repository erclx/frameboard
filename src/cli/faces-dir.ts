import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { writeFaces } from '@/server/look/write-faces'
import { FACES } from '@/shared/faces'

/**
 * The folder the faces are served from. A built run reads the `faces` folder
 * the build put beside the bundle and never looks further, so a bundle missing
 * it fails loudly. A source run writes the faces once into the package's
 * `node_modules/.cache` from the installed packages, and completes a cache
 * missing any face.
 */
export function resolveFacesDir(moduleUrl: string = import.meta.url): string {
  if (!moduleUrl.endsWith('.ts')) {
    return fileURLToPath(new URL('./faces', moduleUrl))
  }

  const cache = fileURLToPath(
    new URL('../../node_modules/.cache/frameboard/faces', moduleUrl),
  )
  const complete = FACES.every((face) =>
    existsSync(join(cache, face.folder, 'index.css')),
  )
  if (!complete) {
    writeFaces(cache)
  }
  return cache
}
