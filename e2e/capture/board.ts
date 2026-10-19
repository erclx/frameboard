import { readFileSync } from 'node:fs'

import type { Page } from '@playwright/test'
import WebSocket from 'ws'

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

/** How many frames a left panel tab waits for its trigger, about ten seconds. */
const TAB_FRAMES = 600

/**
 * Opens the left panel's tab named `name` once the board has drawn it. A tab
 * is found by its role, since the toolbar's theme button shares the name.
 */
function leftTab(name: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ label, frames }) => {
        let left = frames
        const open = () => {
          const tab = [...document.querySelectorAll('[role="tab"]')].find(
            (candidate) =>
              candidate.textContent?.trim() === label &&
              !candidate.hasAttribute('data-disabled'),
          )
          if (tab instanceof HTMLElement) tab.click()
          else if (--left > 0) requestAnimationFrame(open)
          else console.error(`No ${label} tab to open`)
        }
        document.addEventListener('DOMContentLoaded', open)
      },
      { label: name, frames: TAB_FRAMES },
    )
  }
}

const themeTab = leftTab('Theme')

/** The reference's six files, for a preview board whose `assets/` holds none. */
const REFERENCE_ASSETS = [
  { path: 'hero.png', kind: 'image', size: 1_200_000 },
  { path: 'loader.gif', kind: 'gif', size: 240_000 },
  { path: 'logo.svg', kind: 'svg', size: 2_000 },
  { path: 'Inter.woff2', kind: 'font', size: 98_000 },
  { path: 'demo.mp4', kind: 'video', size: 4_100_000 },
  { path: 'shared.css', kind: 'stylesheet', size: 3_000 },
]

function gradient(from: string, to: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="120" height="72" fill="url(#g)"/></svg>`
}

/**
 * Answers the Assets tab's read with the reference's files and draws their
 * thumbnails as gradients, so no binary joins the `basic` fixture.
 */
async function referenceAssets(page: Page): Promise<void> {
  await page.route('**/api/projects/*/assets', (route) =>
    route.fulfill({ json: { ok: true, data: { files: REFERENCE_ASSETS } } }),
  )
  await page.route('**/frames/*/assets/*', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: route.request().url().endsWith('hero.png')
        ? gradient('#6d5bd0', '#e07a5f')
        : gradient('#1d2a4a', '#3b2a5c'),
    }),
  )
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

/**
 * Holds one inbox follower open while the capture page is, as a listening
 * session would, so the composer counts it.
 */
async function listening(page: Page): Promise<void> {
  const base = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:4173'
  const { token } = JSON.parse(
    readFileSync('test/fixtures/boards/basic/.run/address.json', 'utf8'),
  ) as { token: string }
  const socket = new WebSocket(`${base.replace(/^http/, 'ws')}/api/live`, {
    headers: { authorization: `Bearer ${token}` },
  })
  await new Promise((resolve) => socket.once('open', resolve))
  socket.send(
    JSON.stringify({
      type: 'hello',
      role: 'inbox',
      session: '4b7d2e90-1c3a-4f6e-9a1b-2d5c8e7f0a13',
      tag: 'claude · frameboard',
    }),
  )
  // An open socket would hold the capture run open after its browser closes.
  page.once('close', () => socket.close())
}

/**
 * Picks the Note tool and clicks the hero frame once the board has drawn it,
 * opening the composer for a new note on it.
 */
async function noteOnHero(page: Page): Promise<void> {
  await page.addInitScript((frames) => {
    let left = frames
    const click = () => {
      const tool = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Note"]:not([aria-disabled])',
      )
      const hero = document.querySelector('[data-frame="webapp/home/hero"]')
      const hit = document.querySelector('[data-hit-layer]')
      if (!tool || !hero || !hit) {
        if (--left > 0) requestAnimationFrame(click)
        else console.error('No Note tool or hero frame to note on')
        return
      }
      tool.click()
      const box = hero.getBoundingClientRect()
      requestAnimationFrame(() =>
        hit.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            clientX: box.left + box.width * 0.6,
            clientY: box.top + box.height * 0.5,
          }),
        ),
      )
    }
    document.addEventListener('DOMContentLoaded', click)
  }, PRESS_FRAMES)
}

/** How many frames a pages list step waits for its row, about ten seconds. */
const ROW_FRAMES = 600

/**
 * Opens the pages search and types `query` into it once the list has drawn,
 * as a person typing would, so the list filters and marks the match.
 */
function searchPages(query: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ text, frames }) => {
        let left = frames
        const type = () => {
          const field = document.querySelector<HTMLInputElement>(
            'input[aria-label="Search pages"]',
          )
          if (!field) {
            if (--left > 0) requestAnimationFrame(type)
            return
          }
          const set = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
          )?.set
          set?.call(field, text)
          field.dispatchEvent(new Event('input', { bubbles: true }))
        }
        const run = () => {
          const button = document.querySelector<HTMLButtonElement>(
            'button[aria-label="Search pages"]',
          )
          if (!button) {
            if (--left > 0) requestAnimationFrame(run)
            else console.error('No pages search to open')
            return
          }
          button.click()
          requestAnimationFrame(type)
        }
        document.addEventListener('DOMContentLoaded', run)
      },
      { text: query, frames: ROW_FRAMES },
    )
  }
}

/**
 * Waits for the add button to light, which it does once the server grants
 * writes, then opens the rename field on the home row, or holds a drag of it
 * over the top of the settings row, never dropped.
 */
function onPagesList(act: 'rename' | 'drag'): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ act, frames }) => {
        let left = frames
        const row = (name: string) =>
          [
            ...document.querySelectorAll<HTMLAnchorElement>(
              'nav[aria-labelledby="pages-heading"] a',
            ),
          ].find((link) => link.textContent === name)
        const run = () => {
          const add = document.querySelector(
            'button[aria-label="Add page"]:not([aria-disabled])',
          )
          const home = row('home')
          const settings = row('settings')
          if (!add || !home || !settings) {
            if (--left > 0) requestAnimationFrame(run)
            else console.error('The pages list never granted writes')
            return
          }
          if (act === 'rename') {
            home.dispatchEvent(
              new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
            )
            return
          }
          const from = home.getBoundingClientRect()
          const over = settings.getBoundingClientRect()
          const dataTransfer = new DataTransfer()
          const at = (box: DOMRect, y: number) => ({
            bubbles: true,
            cancelable: true,
            clientX: box.left + 20,
            clientY: y,
            dataTransfer,
          })
          home.parentElement?.dispatchEvent(
            new DragEvent('dragstart', at(from, from.top + 8)),
          )
          requestAnimationFrame(() => {
            settings.dispatchEvent(
              new DragEvent('dragenter', at(over, over.top + 4)),
            )
            settings.dispatchEvent(
              new DragEvent('dragover', at(over, over.top + 4)),
            )
          })
        }
        document.addEventListener('DOMContentLoaded', () =>
          requestAnimationFrame(run),
        )
      },
      { act, frames: ROW_FRAMES },
    )
  }
}

/**
 * Shows the server holding one step to undo, answers the undo with the
 * refusal an agent's later write causes, and presses Undo once it lights.
 * The step is faked, since a real one would rewrite the committed fixture.
 */
async function refusedUndo(page: Page): Promise<void> {
  await page.routeWebSocket('**/api/live', (socket) => {
    const server = socket.connectToServer()
    server.onMessage((message) => {
      const parsed = JSON.parse(String(message)) as { type: string }
      socket.send(
        parsed.type === 'history'
          ? JSON.stringify({ type: 'history', undo: 1, redo: 0 })
          : message,
      )
    })
    socket.onMessage((message) => server.send(message))
  })
  await page.route('**/api/undo', (route) =>
    route.fulfill({
      status: 409,
      json: {
        ok: false,
        error: {
          code: 'undo-overtaken',
          message:
            'An agent changed about after your edit, so that step was dropped.',
        },
      },
    }),
  )
  await page.addInitScript((frames) => {
    let left = frames
    const press = () => {
      const undo = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Undo"]:not([aria-disabled])',
      )
      if (undo) undo.click()
      else if (--left > 0) requestAnimationFrame(press)
      else console.error('Undo never lit')
    }
    document.addEventListener('DOMContentLoaded', press)
  }, ROW_FRAMES)
}

/** A one-pixel GIF, the body the ready gate's image answers with. */
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
)

/**
 * Holds the shot until `selector` has drawn. The harness waits on the load
 * event and on every image completing, so a hidden image the page adds is
 * answered only once the state a setup drove has drawn and two frames have
 * painted it, which a state reached after a fetch needs to shoot alike twice.
 */
function readyWhen(selector: string): (page: Page) => Promise<void> {
  return async (page) => {
    let ready: () => void = () => {}
    const drawn = new Promise<void>((resolve) => (ready = resolve))
    await page.exposeFunction('captureReady', () => ready())
    await page.route('**/capture-ready.gif', async (route) => {
      await drawn
      await route.fulfill({ contentType: 'image/gif', body: PIXEL })
    })
    await page.addInitScript(
      ({ target, frames }) => {
        let left = frames
        const wait = () => {
          if (document.querySelector(target)) {
            requestAnimationFrame(() =>
              requestAnimationFrame(() =>
                (
                  window as unknown as { captureReady: () => void }
                ).captureReady(),
              ),
            )
          } else if (--left > 0) requestAnimationFrame(wait)
          else console.error(`${target} never drew`)
        }
        document.addEventListener('DOMContentLoaded', () => {
          const image = document.createElement('img')
          image.src = '/capture-ready.gif'
          image.alt = ''
          image.hidden = true
          document.body.append(image)
          requestAnimationFrame(wait)
        })
      },
      { target: selector, frames: ROW_FRAMES },
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
 * tab open, with tokens and with none, and the Assets tab with the reference's
 * six files. The "Edited" times count back from
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
        section: 'assets-tab',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(both(referenceAssets, leftTab('Assets'))),
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
      {
        section: 'note-thread',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(pressOnLoad('^Note 2 on hero$')),
      },
      {
        section: 'note-composer',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(both(asWriter, noteOnHero)),
      },
      {
        section: 'note-composer-listening',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(both(asWriter, listening, noteOnHero)),
      },
      {
        section: 'pages-search',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(both(searchPages('ho'), readyWhen('nav mark'))),
      },
      {
        section: 'pages-rename',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            asWriter,
            onPagesList('rename'),
            readyWhen('input[aria-label="Rename page home"]'),
          ),
        ),
      },
      {
        section: 'pages-drag',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            asWriter,
            onPagesList('drag'),
            readyWhen('nav li > span[aria-hidden]'),
          ),
        ),
      },
      {
        section: 'undo-refused',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            asWriter,
            refusedUndo,
            readyWhen('[data-slot="toast"]:not([data-starting-style])'),
          ),
        ),
      },
    ]
  }),
]
