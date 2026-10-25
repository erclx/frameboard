import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { FrameboardError } from '@/shared/errors'

/**
 * The folder the board client is served from. A built run reads the `client`
 * folder the build put beside the bundle and never looks further. A source run
 * reads the repository's `dist/client`, which `bun run build` leaves, and
 * writes nothing since the client changes with every branch. Either folder
 * without an `index.html` refuses, so a broken package or an interrupted build
 * never serves 404s. A folder given outright is held to the same test.
 */
export function resolveClientDir(
  moduleUrl: string = import.meta.url,
  given?: string,
): string {
  const built = !moduleUrl.endsWith('.ts')
  const dir =
    given ??
    fileURLToPath(new URL(built ? './client' : '../../dist/client', moduleUrl))
  if (!existsSync(`${dir}/index.html`)) {
    throw new FrameboardError(
      'client-not-built',
      built
        ? `The board client is missing at ${dir}. Reinstall frameboard.`
        : `The board client is not built at ${dir}. Run bun run build first.`,
      { clientDir: dir },
    )
  }
  return dir
}
