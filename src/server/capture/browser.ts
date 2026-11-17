import type { Browser } from 'playwright-core'

import { FrameboardError } from '@/shared/errors'

import manifest from '../../../package.json' with { type: 'json' }

/**
 * The exact `playwright-core` this copy launches, so the printed install
 * command fetches the browser revision it pins.
 */
export const PLAYWRIGHT_VERSION: string =
  manifest.dependencies['playwright-core']

export type Launcher = () => Promise<Browser>

/** The commands that install the browser capture launches. */
export function installCommands(): { npx: string; bunx: string } {
  const args = `playwright-core@${PLAYWRIGHT_VERSION} install chromium-headless-shell`
  return { npx: `npx ${args}`, bunx: `bunx ${args}` }
}

/**
 * Launches the pinned headless shell, never an installed Chrome, which
 * rasterizes text differently, and refuses `browser-not-found` rather than
 * download one unasked.
 */
export async function launchCaptureBrowser({
  purpose,
  launch = launchShell,
}: {
  purpose: string
  launch?: Launcher
}): Promise<Browser> {
  try {
    return await launch()
  } catch (error) {
    const install = installCommands()
    throw new FrameboardError(
      'browser-not-found',
      `${purpose} needs Playwright's headless shell, and it did not launch. Install it with ${install.npx}, or ${install.bunx}.`,
      { purpose, install, error: firstLine(error) },
      { cause: error },
    )
  }
}

// A dynamic import, so a verb that never renders never loads the library.
async function launchShell(): Promise<Browser> {
  const { chromium } = await import('playwright-core')
  return chromium.launch()
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.split('\n').find((line) => line.trim() !== '') ?? message
}
