import { readFileSync } from 'node:fs'

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

/** A pointer gesture in canvas pixels, which the init script maps to the screen through the layer's transform. */
interface CanvasGesture {
  /** Frames clicked in turn before the gesture, Shift held from the second on. */
  select?: readonly string[]
  /** Waits for the inspector's fields to enable, which they do once the server grants writes, before pressing. */
  awaitWrite?: boolean
  /** A press at `from` dragged to `to` and held there, never released. */
  hold?: { from: [number, number]; to: [number, number] }
}

/** How many frames a gesture waits for the canvas to draw, about ten seconds. */
const GESTURE_FRAMES = 600

/**
 * Drives the Move tool once the canvas has drawn its frames, so a capture
 * shows a selection, a marquee mid-drag, or a move mid-drag. Like
 * `pressOnLoad`, it waits in an init script, since `setup` runs before the
 * harness navigates.
 */
function onCanvas(gesture: CanvasGesture): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ gesture, frames }) => {
        let left = frames
        const ready = () =>
          document.querySelector('[data-hit-layer]') &&
          document.querySelector('[data-layer] [data-frame]')
        const screenAt = ([x, y]: [number, number]) => {
          const layer = document.querySelector<HTMLElement>('[data-layer]')
          const origin = layer?.getBoundingClientRect()
          const k = Number(layer?.style.getPropertyValue('--zoom') || 1)
          return {
            x: (origin?.left ?? 0) + x * k,
            y: (origin?.top ?? 0) + y * k,
          }
        }
        const send = (
          type: string,
          at: { x: number; y: number },
          shiftKey = false,
        ) => {
          const init = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: at.x,
            clientY: at.y,
            shiftKey,
          }
          const target =
            type === 'mousedown'
              ? document.querySelector('[data-hit-layer]')
              : window
          target?.dispatchEvent(new MouseEvent(type, init))
        }
        const centerOf = (ref: string) => {
          const box = document
            .querySelector(`[data-frame="${ref}"]`)
            ?.getBoundingClientRect()
          return box
            ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
            : { x: 0, y: 0 }
        }
        const press = () => {
          if (!gesture.hold) return
          const from = screenAt(gesture.hold.from)
          const to = screenAt(gesture.hold.to)
          send('mousedown', from)
          send('mousemove', {
            x: (from.x + to.x) / 2,
            y: (from.y + to.y) / 2,
          })
          send('mousemove', to)
        }
        const writable = () => {
          const field = document.querySelector<HTMLInputElement>(
            'input[aria-label="X position"]',
          )
          if (field && !field.disabled) press()
          else if (--left > 0) requestAnimationFrame(writable)
          else console.error('The board never granted writes')
        }
        const run = () => {
          if (!ready()) {
            if (--left > 0) requestAnimationFrame(run)
            else console.error('No canvas to drive')
            return
          }
          for (const [index, ref] of (gesture.select ?? []).entries()) {
            const at = centerOf(ref)
            send('mousedown', at, index > 0)
            send('mouseup', at, index > 0)
          }
          if (gesture.awaitWrite) requestAnimationFrame(writable)
          else press()
        }
        document.addEventListener('DOMContentLoaded', () =>
          requestAnimationFrame(run),
        )
      },
      { gesture, frames: GESTURE_FRAMES },
    )
  }
}

/**
 * Redeems a ticket for the preview's board cookie before the harness opens
 * the board, so a move can start. The preview's `serve` writes the address
 * file into the fixture it serves.
 */
async function asWriter(page: Page): Promise<void> {
  const base = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:4173'
  const { token } = JSON.parse(
    readFileSync('test/fixtures/boards/basic/.run/address.json', 'utf8'),
  ) as { token: string }
  const response = await fetch(`${base}/api/access/ticket`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
  const { data } = (await response.json()) as { data: { url: string } }
  await page.goto(data.url)
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
      {
        section: 'select-one',
        theme,
        route: '/p/webapp/home',
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(onCanvas({ select: ['webapp/home/hero'] })),
      },
      {
        section: 'select-two',
        theme,
        route: '/p/webapp/home',
        excludeViewports: STATE_ONLY,
        // Carries the overlay, the `N frames` section, and Arrange into the evidence comparison.
        evidence: true,
        mask: [AVATAR],
        setup: themed(
          onCanvas({ select: ['webapp/home/hero', 'webapp/home/about'] }),
        ),
      },
      {
        section: 'marquee',
        theme,
        route: '/p/webapp/home',
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        // From above the hero's left edge to inside the locked about frame.
        setup: themed(
          onCanvas({ hold: { from: [-60, -80], to: [1700, 400] } }),
        ),
      },
      {
        section: 'snap',
        theme,
        route: '/p/webapp/home',
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        // The hero's top lands 3 px below the about frame's, which snaps it
        // up and draws the top guide with the 120 px gap between them.
        setup: themed(
          both(
            asWriter,
            onCanvas({
              select: ['webapp/home/hero'],
              awaitWrite: true,
              hold: { from: [700, 450], to: [660, 453] },
            }),
          ),
        ),
      },
    ]
  }),
]
