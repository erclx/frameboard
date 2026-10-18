import type { Page } from '@playwright/test'

import type { CaptureCase } from './types'

/**
 * No toggle sets the chrome's `.dark` class yet, so a dark case adds it to the
 * root itself. An init script runs before the parser has created `<html>`, so
 * the class waits for the document to be parsed.
 */
async function darkChrome(page: Page): Promise<void> {
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.classList.add('dark')
    })
  })
}

/** How many frames the press waits for its control, about ten seconds, before giving up. */
const PRESS_FRAMES = 600

/**
 * Presses the control named `label` once the board has drawn it. The harness
 * runs `setup` before it navigates, so the press waits in an init script for
 * the app to render the control. A button is named by its `aria-label`, or
 * by its text where it has none, as Edit and Play are.
 */
function pressOnLoad(label: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ name, frames }) => {
        let left = frames
        const press = () => {
          const control = [...document.querySelectorAll('button')].find(
            (button) =>
              (
                button.getAttribute('aria-label') ??
                button.textContent?.trim() ??
                ''
              ).match(name),
          )
          if (control) control.click()
          else if (--left > 0) requestAnimationFrame(press)
          else console.error(`No button named ${name} to press`)
        }
        document.addEventListener('DOMContentLoaded', press)
      },
      { name: label, frames: PRESS_FRAMES },
    )
  }
}

function both(
  ...setups: ((page: Page) => Promise<void>)[]
): (page: Page) => Promise<void> {
  return async (page) => {
    for (const setup of setups) await setup(page)
  }
}

/** The avatar draws the initials of the machine's git user.name, which differ between runs. */
const AVATAR = '[data-avatar]'

/** A state rather than a layout, so it takes the desktop width alone. */
const STATE_ONLY = ['320', '768', '1536']

/**
 * The home view and one board page of the preview's `basic` fixture, then the
 * board under Hide UI, in Play, and with the avatar menu open. The "Edited"
 * times count back from each file's checkout time, so they are masked. Every
 * `basic` frame sets no font, so the board cases also hold the label's check
 * findings mark in both themes.
 */
export const BOARD_CASES: CaptureCase[] = [
  {
    section: 'home',
    theme: 'light',
    route: '/',
    evidence: true,
    mask: ['[data-edited]'],
  },
  {
    section: 'home',
    theme: 'dark',
    route: '/',
    evidence: true,
    mask: ['[data-edited]'],
    setup: darkChrome,
  },
  {
    section: 'board',
    theme: 'light',
    route: '/p/webapp/home',
    evidence: true,
    mask: [AVATAR],
  },
  {
    section: 'board',
    theme: 'dark',
    route: '/p/webapp/home',
    evidence: true,
    mask: [AVATAR],
    setup: darkChrome,
  },
  ...(['light', 'dark'] as const).flatMap((theme): CaptureCase[] => {
    const themed = (setup: (page: Page) => Promise<void>) =>
      theme === 'dark' ? both(darkChrome, setup) : setup
    return [
      {
        section: 'hide-ui',
        theme,
        route: '/p/webapp/home',
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(pressOnLoad('^Hide UI$')),
      },
      {
        section: 'play',
        theme,
        route: '/p/webapp/home',
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(pressOnLoad('^Play$')),
      },
      {
        section: 'avatar-menu',
        theme,
        route: '/p/webapp/home',
        excludeViewports: STATE_ONLY,
        setup: themed(pressOnLoad('from git user.name$|^Account$')),
      },
    ]
  }),
]
