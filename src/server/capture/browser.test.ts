import { readFileSync } from 'node:fs'

import type { Browser, LaunchOptions } from 'playwright-core'
import { describe, expect, it } from 'vitest'

import { FrameboardError } from '@/shared/errors'

import {
  installCommands,
  launchCaptureBrowser,
  PLAYWRIGHT_VERSION,
} from './browser'

const BROWSER = { name: 'stub browser' } as unknown as Browser

/** A launcher that starts only the channels named, recording each it was asked for. */
function launcherFor(working: (string | undefined)[]) {
  const asked: (string | undefined)[] = []
  const launch = async ({ channel }: LaunchOptions) => {
    asked.push(channel)
    if (working.includes(channel)) return BROWSER
    throw new Error(`Executable doesn't exist for ${channel ?? 'shell'}\nmore`)
  }
  return { asked, launch }
}

async function refusal(launch: (options: LaunchOptions) => Promise<Browser>) {
  try {
    await launchCaptureBrowser({ purpose: 'capture', launch })
  } catch (error) {
    if (error instanceof FrameboardError) return error
    throw error
  }
  throw new Error('Expected a refusal.')
}

describe('launchCaptureBrowser', () => {
  it('launches the headless shell first', async () => {
    const { asked, launch } = launcherFor([undefined, 'chrome'])

    const browser = await launchCaptureBrowser({ purpose: 'capture', launch })

    expect(browser).toBe(BROWSER)
    expect(asked).toEqual([undefined])
  })

  it('falls through to Chrome when the shell is missing', async () => {
    const { asked, launch } = launcherFor(['chrome', 'msedge'])

    await launchCaptureBrowser({ purpose: 'capture', launch })

    expect(asked).toEqual([undefined, 'chrome'])
  })

  it('falls through to Edge when neither the shell nor Chrome launches', async () => {
    const { asked, launch } = launcherFor(['msedge'])

    await launchCaptureBrowser({ purpose: 'capture', launch })

    expect(asked).toEqual([undefined, 'chrome', 'msedge'])
  })

  it('refuses browser-not-found, exit 9, when no route launches', async () => {
    const { launch } = launcherFor([])

    const error = await refusal(launch)

    expect(error.code).toBe('browser-not-found')
    expect(error.exitCode).toBe(9)
  })

  it('names the pinned install command in the refusal', async () => {
    const { launch } = launcherFor([])

    const error = await refusal(launch)

    expect(error.message).toContain(
      `npx playwright-core@${PLAYWRIGHT_VERSION} install chromium-headless-shell`,
    )
    expect(error.message).toContain(
      `bunx playwright-core@${PLAYWRIGHT_VERSION} install chromium-headless-shell`,
    )
  })

  it("lists each route's first error line in the details", async () => {
    const { launch } = launcherFor([])

    const error = await refusal(launch)

    expect(error.details.attempts).toEqual([
      { route: 'headless-shell', error: "Executable doesn't exist for shell" },
      { route: 'chrome', error: "Executable doesn't exist for chrome" },
      { route: 'msedge', error: "Executable doesn't exist for msedge" },
    ])
  })
})

describe('installCommands', () => {
  it('names the version bun.lock resolves for playwright-core', () => {
    const lock = readFileSync(
      new URL('../../../bun.lock', import.meta.url),
      'utf8',
    )
    const resolved = /"playwright-core": \["playwright-core@([^"]+)"/.exec(
      lock,
    )?.[1]

    expect(installCommands().npx).toBe(
      `npx playwright-core@${resolved} install chromium-headless-shell`,
    )
  })
})
