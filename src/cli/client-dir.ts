import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { FrameboardError } from '@/shared/errors'

/**
 * The client folder, refused without an `index.html`, so a broken package or
 * an interrupted build never serves 404s.
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
