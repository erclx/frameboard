import type { Page } from '@playwright/test'

import type { CaptureCase } from '../types'
import {
  AVATAR,
  both,
  PRESS_FRAMES,
  pressOnLoad,
  readyWhen,
  STATE_ONLY,
  themedFor,
} from './setup'

const CONFIRM = '[role="dialog"] [data-slot="dialog-title"]'

/**
 * Offers the Edit button to the reading tab. Faked on the access message,
 * since the capture server runs with no `--edit-button`.
 */
async function editOffered(page: Page): Promise<void> {
  await page.routeWebSocket('**/api/live', (socket) => {
    const server = socket.connectToServer()
    server.onMessage((message) => {
      const parsed = JSON.parse(String(message)) as { type: string }
      socket.send(
        parsed.type === 'access'
          ? JSON.stringify({ ...parsed, editButton: true })
          : message,
      )
    })
    socket.onMessage((message) => server.send(message))
  })
}

/** Refuses the grant as the server refuses a page that is not the board's. */
async function grantRefused(page: Page): Promise<void> {
  await page.route('**/api/access/edit', (route) =>
    route.fulfill({
      status: 403,
      json: {
        ok: false,
        error: {
          code: 'forbidden',
          message: "Only the board's own page can ask for edit access.",
        },
      },
    }),
  )
}

/** Presses Edit inside the confirmation, scoped to it since the toolbar's mode also reads Edit. */
async function confirmOnLoad(page: Page): Promise<void> {
  await page.addInitScript((frames) => {
    let left = frames
    const press = () => {
      const edit = document.querySelector<HTMLElement>(
        '[role="dialog"] [data-slot="dialog-footer"] button:last-child',
      )
      if (edit) edit.click()
      else if (--left > 0) requestAnimationFrame(press)
      else console.error('No confirmation to press')
    }
    document.addEventListener('DOMContentLoaded', press)
  }, PRESS_FRAMES)
}

/** The Edit button a view-only tab draws under `--edit-button`, and what it opens. */
export function accessCases(theme: 'light' | 'dark'): CaptureCase[] {
  const themed = themedFor(theme)
  const board = {
    theme,
    route: '/p/webapp/home',
    evidence: true,
    excludeViewports: STATE_ONLY,
    mask: [AVATAR],
  }
  return [
    {
      ...board,
      section: 'view-only-edit',
      setup: themed(
        both(editOffered, readyWhen('[data-view-only-notice] button')),
      ),
    },
    {
      ...board,
      section: 'view-only-edit-confirm',
      setup: themed(
        both(editOffered, pressOnLoad('^Edit this board$'), readyWhen(CONFIRM)),
      ),
    },
    {
      ...board,
      section: 'view-only-edit-refused',
      setup: themed(
        both(
          editOffered,
          grantRefused,
          pressOnLoad('^Edit this board$'),
          confirmOnLoad,
          readyWhen('[role="dialog"] [role="alert"]'),
        ),
      ),
    },
    {
      ...board,
      section: 'view-only-expired-link',
      route: '/p/webapp/home?link=expired',
      setup: themed(both(editOffered, readyWhen('[data-slot="toast-action"]'))),
    },
  ]
}
