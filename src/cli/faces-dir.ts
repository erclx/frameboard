import { fileURLToPath } from 'node:url'

import { hasFaces, writeFaces } from '@/server/look/write-faces'

/**
 * The faces folder, a built run never looking past its bundle so a missing
 * folder fails loudly, and a source run filling `node_modules/.cache`.
 */
export function resolveFacesDir(moduleUrl: string = import.meta.url): string {
  if (!moduleUrl.endsWith('.ts')) {
    return fileURLToPath(new URL('./faces', moduleUrl))
  }

  const cache = fileURLToPath(
    new URL('../../node_modules/.cache/frameboard/faces', moduleUrl),
  )
  if (!hasFaces(cache)) {
    writeFaces(cache, { keepComplete: true })
  }
  return cache
}
