import type { Browser, LaunchOptions } from 'playwright-core'

import { FrameboardError } from '@/shared/errors'

import manifest from '../../../package.json' with { type: 'json' }

/**
 * The exact `playwright-core` this copy launches, so the printed install
 * command fetches the browser revision it pins.
 */
export const PLAYWRIGHT_VERSION: string =
  manifest.dependencies['playwright-core']

export type Launcher = (options: LaunchOptions) => Promise<Browser>

// The pinned headless shell first, since it is the revision this copy was
// tested against, then the branded browsers a developer already has.
const ROUTES: { route: string; options: LaunchOptions }[] = [
  { route: 'headless-shell', options: {} },
  { route: 'chrome', options: { channel: 'chrome' } },
  { route: 'msedge', options: { channel: 'msedge' } },
]

/** The commands that install the browser the first route launches. */
export function installCommands(): { npx: string; bunx: string } {
  const args = `playwright-core@${PLAYWRIGHT_VERSION} install chromium-headless-shell`
  return { npx: `npx ${args}`, bunx: `bunx ${args}` }
}

/**
 * Launches the first browser that starts, trying Playwright's headless shell,
 * then Chrome, then Edge. With none it refuses `browser-not-found` and
 * downloads nothing, since a verb never fetches a browser unasked.
 * `purpose` names what needed the browser in the refusal.
 */
export async function launchCaptureBrowser({
  purpose,
  launch = launchChromium,
}: {
  purpose: string
  launch?: Launcher
}): Promise<Browser> {
  const attempts: { route: string; error: string }[] = []
  for (const { route, options } of ROUTES) {
    try {
      return await launch(options)
    } catch (error) {
      attempts.push({ route, error: firstLine(error) })
    }
  }
  const install = installCommands()
  throw new FrameboardError(
    'browser-not-found',
    `${purpose} needs a browser, and neither Playwright's headless shell, Chrome, nor Edge launched. Install the shell with ${install.npx}, or ${install.bunx}.`,
    { purpose, install, attempts },
  )
}

// A dynamic import, so a verb that never renders never loads the library.
async function launchChromium(options: LaunchOptions): Promise<Browser> {
  const { chromium } = await import('playwright-core')
  return chromium.launch(options)
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.split('\n').find((line) => line.trim() !== '') ?? message
}
