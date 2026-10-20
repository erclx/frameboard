import type { Browser } from 'playwright-core'

/**
 * The budget for the hooks that start and close the shell. Chromium takes
 * longer than vitest's 10 s hook default to shut down when several test runs
 * share a machine, and no test in these files needs more than its own default.
 */
export const SHELL_HOOK_TIMEOUT_MS = 30_000

/**
 * The budget for each test that renders in the shell. One takes 250 to 540 ms
 * alone, and a machine running several test processes stretches that past
 * vitest's 5 s default.
 */
export const SHELL_TEST_TIMEOUT_MS = 15_000

/**
 * Playwright's headless shell, or null where it is not installed, as on the
 * unit test job in CI. A spec reading a rendered page skips on null. A launch
 * that fails with the shell installed throws, so it fails the file.
 */
export async function launchShellOrNull(): Promise<Browser | null> {
  const { chromium } = await import('playwright-core')
  try {
    return await chromium.launch()
  } catch (error) {
    // Playwright words a missing executable this way and throws no distinct type.
    if (
      error instanceof Error &&
      /Executable doesn't exist/.test(error.message)
    ) {
      console.warn(
        'Headless shell not installed, so browser specs skip. Run `bunx playwright install chromium`.',
      )
      return null
    }
    throw error
  }
}

/** The shell a `describe.skipIf(shell === null)` block runs on, narrowed. */
export function requireShell(shell: Browser | null): Browser {
  if (shell === null) throw new Error('This block runs only with the shell.')
  return shell
}
