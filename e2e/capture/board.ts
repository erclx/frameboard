import type { Page } from '@playwright/test'

import type { CaptureCase } from './types'

/**
 * Saves a theme choice before the board loads, as `theme.light` and
 * `theme.dark` save it, so the board starts in that theme whatever the
 * capture browser's own scheme is.
 */
function chosenTheme(theme: 'light' | 'dark'): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript((choice) => {
      localStorage.setItem('frameboard.theme', choice)
    }, theme)
  }
}

/** Answers the Theme tab's read with no sheets, since the preview board always has one. */
async function noTokens(page: Page): Promise<void> {
  await page.route('**/api/projects/*/tokens', (route) =>
    route.fulfill({ json: { ok: true, data: { sheets: [], tokens: [] } } }),
  )
}

/** How many frames the Theme tab waits for its trigger, about ten seconds. */
const TAB_FRAMES = 600

/**
 * Opens the left panel's Theme tab once the board has drawn it. A tab is
 * found by its role, since the toolbar's theme button shares the name.
 */
async function themeTab(page: Page): Promise<void> {
  await page.addInitScript((frames) => {
    let left = frames
    const open = () => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find(
        (candidate) =>
          candidate.textContent?.trim() === 'Theme' &&
          !candidate.hasAttribute('data-disabled'),
      )
      if (tab instanceof HTMLElement) tab.click()
      else if (--left > 0) requestAnimationFrame(open)
      else console.error('No Theme tab to open')
    }
    document.addEventListener('DOMContentLoaded', open)
  }, TAB_FRAMES)
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
 * board under Hide UI, in Play, with the avatar menu open, and with the Theme
 * tab open, with tokens and with none. The "Edited" times count back from
 * each file's checkout time, so they are masked. The `about` frame sets no
 * font, so the board cases also hold the label's check findings mark in both
 * themes, beside the hero taking its colors and faces from the tokens.
 */
export const BOARD_CASES: CaptureCase[] = [
  ...(['light', 'dark'] as const).flatMap((theme): CaptureCase[] => [
    {
      section: 'home',
      theme,
      route: '/',
      evidence: true,
      mask: ['[data-edited]'],
      setup: chosenTheme(theme),
    },
    {
      section: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      mask: [AVATAR],
      setup: chosenTheme(theme),
    },
  ]),
  ...(['light', 'dark'] as const).flatMap((theme): CaptureCase[] => {
    const themed = (setup: (page: Page) => Promise<void>) =>
      both(chosenTheme(theme), setup)
    return [
      {
        section: 'theme-tab',
        theme,
        route: '/p/webapp/home',
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(themeTab),
      },
      {
        section: 'theme-tab-empty',
        theme,
        route: '/p/webapp/home',
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(both(noTokens, themeTab)),
      },
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
