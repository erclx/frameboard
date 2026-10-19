import { readFileSync } from 'node:fs'

import type { Browser } from 'playwright-core'
import { describe, expect, it } from 'vitest'

import { FrameboardError } from '@/shared/errors'

import {
  installCommands,
  launchCaptureBrowser,
  PLAYWRIGHT_VERSION,
} from './browser'

const BROWSER = { name: 'stub browser' } as unknown as Browser

async function missingShell(): Promise<Browser> {
  throw new Error("Executable doesn't exist at /ms-playwright/shell\nmore")
}

async function refusal() {
  try {
    await launchCaptureBrowser({ purpose: 'capture', launch: missingShell })
  } catch (error) {
    if (error instanceof FrameboardError) return error
    throw error
  }
  throw new Error('Expected a refusal.')
}

describe('launchCaptureBrowser', () => {
  it('launches the headless shell', async () => {
    const browser = await launchCaptureBrowser({
      purpose: 'capture',
      launch: async () => BROWSER,
    })

    expect(browser).toBe(BROWSER)
  })

  it('refuses browser-not-found, exit 9, when the shell does not launch', async () => {
    const error = await refusal()

    expect(error.code).toBe('browser-not-found')
    expect(error.exitCode).toBe(9)
  })

  it('names the pinned install command in the refusal', async () => {
    const error = await refusal()

    expect(error.message).toContain(
      `npx playwright-core@${PLAYWRIGHT_VERSION} install chromium-headless-shell`,
    )
    expect(error.message).toContain(
      `bunx playwright-core@${PLAYWRIGHT_VERSION} install chromium-headless-shell`,
    )
  })

  it("carries the launch error's first line in the details", async () => {
    const error = await refusal()

    expect(error.details.error).toBe(
      "Executable doesn't exist at /ms-playwright/shell",
    )
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
