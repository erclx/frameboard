import type { Browser } from 'playwright-core'

/**
 * Playwright's headless shell, or null where it is not installed, as on the
 * unit test job in CI. A spec reading a rendered page skips on null.
 */
export async function launchShellOrNull(): Promise<Browser | null> {
  try {
    const { chromium } = await import('playwright-core')
    return await chromium.launch()
  } catch {
    return null
  }
}

/** The shell a `describe.skipIf(shell === null)` block runs on, narrowed. */
export function requireShell(shell: Browser | null): Browser {
  if (shell === null) throw new Error('This block runs only with the shell.')
  return shell
}
