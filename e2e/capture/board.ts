import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { Page } from '@playwright/test'
import WebSocket from 'ws'

import { scanBoard } from '@/server/board/scan'
import { claim, release } from '@/server/claims/store'
import type { ServerMessage } from '@/shared/live-messages'
import type { FrameChange } from '@/shared/records/changes'
import type { ListResult } from '@/shared/records/list'
import type { BoardNote } from '@/shared/records/notes'

import type { CaptureCase } from './types'

/**
 * The board the preview serves, under the checkout `CANON_PREVIEW_ROOT`
 * names as `scripts/preview.ts` reads it, so a run against a copy outside the
 * tree reads and writes that copy.
 */
const SERVED_BOARD = join(
  process.env.CANON_PREVIEW_ROOT || '.',
  'test/fixtures/boards/basic',
)

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
 * the app to render the control and enable it. A button is named by its
 * `aria-label`, or by its text where it has none, as Edit and Play are.
 */
function pressOnLoad(label: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ name, frames }) => {
        let left = frames
        const press = () => {
          const control = [...document.querySelectorAll('button')].find(
            (button) =>
              !button.disabled &&
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

/**
 * Presses the guide's Next until its drawer step draws, waiting in an init
 * script as `pressOnLoad` does. The name, size, and look steps write nothing
 * while the name is left as it is, so only Finish would touch the board.
 */
async function guideToAgentStep(page: Page): Promise<void> {
  await page.addInitScript((frames) => {
    let left = frames
    const press = () => {
      if (document.querySelector('input[name="guide-drawer"]')) return
      const next = [...document.querySelectorAll('button')].find(
        (button) => !button.disabled && button.textContent?.trim() === 'Next',
      )
      next?.click()
      if (--left > 0) requestAnimationFrame(press)
      else console.error('The guide never reached its drawer step')
    }
    document.addEventListener('DOMContentLoaded', press)
  }, PRESS_FRAMES)
}

/**
 * Chooses the menu item named `label` once an earlier press has opened its
 * menu, waiting in an init script as `pressOnLoad` does.
 */
function chooseOnLoad(label: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ name, frames }) => {
        let left = frames
        const choose = () => {
          const item = [
            ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
          ].find((candidate) => candidate.textContent?.trim().match(name))
          if (item) item.click()
          else if (--left > 0) requestAnimationFrame(choose)
          else console.error(`No menu item named ${name} to choose`)
        }
        document.addEventListener('DOMContentLoaded', choose)
      },
      { name: label, frames: PRESS_FRAMES },
    )
  }
}

/**
 * Opens the Shape menu and then the picker from its Image or video row, once
 * the server grants writes, which enable the row. Waits in an init script as
 * `pressOnLoad` does.
 */
async function imagePickerOnLoad(page: Page): Promise<void> {
  await page.addInitScript(
    ({ frames }) => {
      let left = frames
      const open = () => {
        const row = [
          ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
        ].find((item) => item.textContent?.includes('Image or video'))
        if (row && row.getAttribute('aria-disabled') !== 'true') {
          row.click()
          return
        }
        // One press opens the menu, and another before it draws would close it.
        const caret = document.querySelector<HTMLElement>(
          'button[aria-label="Shapes"]',
        )
        if (!row && caret && caret.getAttribute('aria-expanded') !== 'true') {
          caret.click()
        }
        if (--left > 0) requestAnimationFrame(open)
        else console.error('The Image or video row never enabled')
      }
      document.addEventListener('DOMContentLoaded', open)
    },
    { frames: PRESS_FRAMES },
  )
}

/**
 * Opens an overlay, or the left panel's find, with its key once the board has
 * drawn, and types `query` into its search. Like `pressOnLoad`, it waits in an
 * init script, since `setup` runs before the harness navigates, and it reads
 * the platform to send the modifier `$mod` means there. `drawn` names what
 * the route draws first, which is a board's frame unless the route is home.
 */
function openOverlayOnLoad(
  overlay: 'commands' | 'shortcuts' | 'find',
  query = '',
  drawn = '[data-layer] [data-frame]',
): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ kind, text, frames, target }) => {
        let left = frames
        const key = (init: KeyboardEventInit) =>
          window.dispatchEvent(
            new KeyboardEvent('keydown', { bubbles: true, ...init }),
          )
        const type = () => {
          const field = document.querySelector<HTMLInputElement>(
            'input[role="combobox"]',
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
        const open = () => {
          if (!document.querySelector(target)) {
            if (--left > 0) requestAnimationFrame(open)
            else console.error(`${target} never drew to open the overlay over`)
            return
          }
          if (kind === 'shortcuts') {
            key({ key: '?', code: 'Slash', shiftKey: true })
            return
          }
          const mac = /Mac/.test(navigator.platform)
          const [letter, code] = kind === 'find' ? ['f', 'KeyF'] : ['k', 'KeyK']
          key({ key: letter, code, metaKey: mac, ctrlKey: !mac })
          if (text) requestAnimationFrame(type)
        }
        document.addEventListener('DOMContentLoaded', () =>
          requestAnimationFrame(open),
        )
      },
      { kind: overlay, text: query, frames: GESTURE_FRAMES, target: drawn },
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
  /** Releases the `hold` press at `to`, so the move is sent. */
  drop?: boolean
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
          if (gesture.drop) send('mouseup', to)
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
    readFileSync(join(SERVED_BOARD, '.run/address.json'), 'utf8'),
  ) as { token: string }
  const response = await fetch(`${base}/api/access/ticket`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  })
  const { data } = (await response.json()) as { data: { url: string } }
  await page.goto(data.url)
}

/**
 * Waits until the preview server's browser sweep has landed every frame, so
 * a label's findings pill holds its final count when the board is shot. The
 * checks route answers once no recheck of the asked frames is pending.
 */
async function browserSwept(): Promise<void> {
  const base = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:4173'
  const root = SERVED_BOARD
  const { token } = JSON.parse(
    readFileSync(`${root}/.run/address.json`, 'utf8'),
  ) as { token: string }
  const board = await scanBoard(root)
  const refs = board.projects.flatMap((project) =>
    project.pages.flatMap((page) => page.frames.map((frame) => frame.ref)),
  )
  const response = await fetch(`${base}/api/checks`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ refs }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) {
    throw new Error(`The browser sweep did not settle: ${response.status}`)
  }
}

/**
 * Holds one inbox follower open while the capture page is, as a listening
 * session would, so the composer counts it.
 */
async function listening(page: Page): Promise<void> {
  const base = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:4173'
  const { token } = JSON.parse(
    readFileSync(join(SERVED_BOARD, '.run/address.json'), 'utf8'),
  ) as { token: string }
  const socket = new WebSocket(`${base.replace(/^http/, 'ws')}/api/live`, {
    headers: { authorization: `Bearer ${token}` },
  })
  await new Promise((resolve) => socket.once('open', resolve))
  socket.send(
    JSON.stringify({
      type: 'hello',
      role: 'inbox',
      session: LISTENING_SESSION,
      tag: 'claude · frameboard',
    }),
  )
  // An open socket would hold the capture run open after its browser closes.
  page.once('close', () => socket.close())
}

/** The session `listening` registers, which the claimed-frame case's claim names. */
const LISTENING_SESSION = '4b7d2e90-1c3a-4f6e-9a1b-2d5c8e7f0a13'

/**
 * Claims `frame` for the listening session, held 40 seconds already, and
 * releases it once the capture page closes so no later case shows it. It
 * writes through the claims store with a fixed tag, since the CLI's tag
 * names the folder the run happens in.
 */
function claimed(frame: string): (page: Page) => Promise<void> {
  return async (page) => {
    const root = SERVED_BOARD
    await claim(
      root,
      {
        frame,
        session: LISTENING_SESSION,
        agent: 'claude',
        tag: 'claude · frameboard',
      },
      new Date(Date.now() - 40_000),
    )
    page.once('close', () => {
      void release(root, LISTENING_SESSION, undefined, new Date())
    })
  }
}

const claimedHero = claimed('webapp/home/hero')

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
 * writes, then opens the rename field on the home row, holds a drag of it
 * over the top of the settings row, never dropped, or renames the settings
 * row to `account`, which waits while one of its frames is claimed.
 */
function onPagesList(
  act: 'rename' | 'drag' | 'rename-settings',
): (page: Page) => Promise<void> {
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
          if (act === 'rename-settings') {
            settings.dispatchEvent(
              new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
            )
            requestAnimationFrame(() => {
              const field = document.querySelector<HTMLInputElement>(
                'input[aria-label="Rename page settings"]',
              )
              if (!field) {
                console.error('The settings row never opened its rename field')
                return
              }
              field.value = 'account'
              field.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
              )
            })
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
 * Waits for New project to light, which it does once the server grants
 * writes, then opens the `webapp` card's menu with a right click over the
 * card's well, clear of the masked edited time, or opens its name for
 * renaming with F2.
 */
function onHomeCard(act: 'menu' | 'rename'): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ act, frames }) => {
        let left = frames
        const run = () => {
          const add = document.querySelector(
            'button[aria-label="New project"]:not([aria-disabled])',
          )
          const card = [
            ...document.querySelectorAll<HTMLAnchorElement>('main li a'),
          ].find((link) => link.textContent?.startsWith('webapp'))
          if (!add || !card) {
            if (--left > 0) requestAnimationFrame(run)
            else console.error('The home view never granted writes')
            return
          }
          if (act === 'rename') {
            card.focus()
            card.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'F2', bubbles: true }),
            )
            return
          }
          const box = card.getBoundingClientRect()
          card.dispatchEvent(
            new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              button: 2,
              clientX: box.left + box.width * 0.53,
              clientY: box.top + 30,
            }),
          )
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
 * Tells the board `serve` holds a dispatch command, so a note can start a
 * session. Faked on the access message, since the capture server runs with
 * no `FRAMEBOARD_DISPATCH`.
 */
async function canStartSessions(page: Page): Promise<void> {
  await page.routeWebSocket('**/api/live', (socket) => {
    const server = socket.connectToServer()
    server.onMessage((message) => {
      const parsed = JSON.parse(String(message)) as {
        type: string
        write?: boolean
      }
      socket.send(
        parsed.type === 'access'
          ? JSON.stringify({ ...parsed, dispatch: parsed.write })
          : message,
      )
    })
    socket.onMessage((message) => server.send(message))
  })
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
 * Holds the shot until `selector` has drawn and `absent`, when given, matches
 * nothing. The harness waits on the load event and on every image
 * completing, so a hidden image the page adds is answered only once the
 * state a setup drove has drawn, every SVG image on the page has decoded,
 * which the harness's own wait skips, and two frames have painted it, which
 * a state reached after a fetch needs to shoot alike twice.
 */
function readyWhen(
  selector: string,
  absent?: string,
): (page: Page) => Promise<void> {
  return async (page) => {
    let ready: () => void = () => {}
    const drawn = new Promise<void>((resolve) => (ready = resolve))
    await page.exposeFunction('captureReady', () => ready())
    await page.route('**/capture-ready.gif', async (route) => {
      await drawn
      await route.fulfill({ contentType: 'image/gif', body: PIXEL })
    })
    await page.addInitScript(
      ({ target, missing, frames }) => {
        let left = frames
        const painted = () =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              (
                window as unknown as { captureReady: () => void }
              ).captureReady(),
            ),
          )
        const wait = () => {
          if (
            document.querySelector(target) &&
            !(missing && document.querySelector(missing))
          ) {
            const images = [...document.querySelectorAll('svg image')].map(
              (image) => {
                const decoding = new Image()
                decoding.src = image.getAttribute('href') ?? ''
                return decoding.decode().catch(() => {})
              },
            )
            void Promise.all(images).then(painted)
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
      { target: selector, missing: absent ?? null, frames: ROW_FRAMES },
    )
  }
}

/** A card well drawing a capture, which the home case waits on beside `CARD_UNCAPTURED`. */
const CARD_CAPTURED = '[data-skeleton] image'
/** A frame in a card's well still showing its box alone. */
const CARD_UNCAPTURED = 'main li [data-skeleton] g:not(:has(image))'

/**
 * Selects the hero frame and double-clicks its headline once the frame has
 * loaded, so the capture shows the element outline, its size chip, and the
 * layers rows opened down to it.
 */
async function headlineOnHero(page: Page): Promise<void> {
  await page.addInitScript((frames) => {
    let left = frames
    const pick = () => {
      const hero = document.querySelector('[data-frame="webapp/home/hero"]')
      const iframe = hero?.querySelector('iframe')
      // A frame names the file it shows only once its load has stamped it.
      const heading = iframe?.dataset.renderedAt
        ? iframe.contentDocument?.querySelector('h1')
        : null
      const hit = document.querySelector('[data-hit-layer]')
      const layer = document.querySelector<HTMLElement>('[data-layer]')
      if (!hero || !heading || !hit || !layer) {
        if (--left > 0) requestAnimationFrame(pick)
        else console.error('No hero headline to select')
        return
      }
      const k = Number(layer.style.getPropertyValue('--zoom') || 1)
      const frame = hero.getBoundingClientRect()
      const inner = heading.getBoundingClientRect()
      const at = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: frame.left + (inner.left + inner.width / 2) * k,
        clientY: frame.top + (inner.top + inner.height / 2) * k,
      }
      hit.dispatchEvent(new MouseEvent('mousedown', at))
      window.dispatchEvent(new MouseEvent('mouseup', at))
      hit.dispatchEvent(new MouseEvent('dblclick', at))
    }
    document.addEventListener('DOMContentLoaded', pick)
  }, PRESS_FRAMES)
}

/**
 * Lists a hidden `sketch` frame at the bottom of `webapp/home` through the
 * socket's board message, so the layers list shows a hidden row with no
 * frame joining the fixture.
 */
async function hiddenSketch(page: Page): Promise<void> {
  await page.routeWebSocket('**/api/live', (socket) => {
    const server = socket.connectToServer()
    server.onMessage((message) => {
      const parsed = JSON.parse(String(message)) as {
        type: string
        data?: ListResult
      }
      if (parsed.type !== 'board' || !parsed.data) {
        socket.send(message)
        return
      }
      for (const project of parsed.data.projects) {
        for (const shown of project.pages) {
          const about = shown.frames.find(
            (frame) => frame.ref === 'webapp/home/about',
          )
          if (!about) continue
          shown.frames.unshift({
            ...about,
            ref: 'webapp/home/sketch',
            name: 'sketch',
            path: about.path.replace(/about\.html$/, 'sketch.html'),
            order: -1,
            hidden: true,
            locked: false,
          })
        }
      }
      socket.send(JSON.stringify(parsed))
    })
    socket.onMessage((message) => server.send(message))
  })
}

/**
 * Answers the socket's board message with the board `serve` starts in an
 * empty folder, being `untitled` alone with an empty `page-1`, so the guide a
 * new board shows draws over the preview fixture.
 */
async function untouchedBoard(page: Page): Promise<void> {
  await page.routeWebSocket('**/api/live', (socket) => {
    const server = socket.connectToServer()
    server.onMessage((message) => {
      const parsed = JSON.parse(String(message)) as {
        type: string
        data?: ListResult
      }
      const [first] = parsed.data?.projects ?? []
      if (parsed.type !== 'board' || !parsed.data || !first) {
        socket.send(message)
        return
      }
      const path = first.path.replace(/[^/]+$/, 'untitled')
      parsed.data.projects = [
        {
          ...first,
          name: 'untitled',
          path,
          pages: [
            {
              ref: 'untitled/page-1',
              project: 'untitled',
              name: 'page-1',
              path: `${path}/page-1`,
              index: 0,
              layoutError: null,
              frames: [],
              sections: [],
            },
          ],
        },
      ]
      socket.send(JSON.stringify(parsed))
    })
    socket.onMessage((message) => server.send(message))
  })
}

/**
 * Lists `webapp/home/about` 20px under the hero through the socket's board
 * message, so the fitted view crowds its label with no fixture edit.
 */
async function stackedAbout(page: Page): Promise<void> {
  await page.routeWebSocket('**/api/live', (socket) => {
    const server = socket.connectToServer()
    server.onMessage((message) => {
      const parsed = JSON.parse(String(message)) as {
        type: string
        data?: ListResult
      }
      if (parsed.type !== 'board' || !parsed.data) {
        socket.send(message)
        return
      }
      for (const project of parsed.data.projects) {
        for (const shown of project.pages) {
          const hero = shown.frames.find(
            (frame) => frame.ref === 'webapp/home/hero',
          )
          const about = shown.frames.find(
            (frame) => frame.ref === 'webapp/home/about',
          )
          if (!hero || !about) continue
          about.box = {
            ...about.box,
            x: hero.box.x,
            y: hero.box.y + hero.box.height + 20,
          }
        }
      }
      socket.send(JSON.stringify(parsed))
    })
    socket.onMessage((message) => server.send(message))
  })
}

/** One change an agent made, as the server's change log carries it. */
function agentChange(frame: string, at: number): FrameChange {
  return {
    id: `c${at}`,
    frame,
    at: new Date(Date.UTC(2026, 9, 19, 12, 0, at)).toISOString(),
    // Names no file the board renders, so no glow plays and the shot holds still.
    hash: '0'.repeat(64),
    author: {
      session: LISTENING_SESSION,
      agent: 'claude',
      tag: 'claude · frameboard',
    },
    elements: [5, 6],
    removed: 0,
    whole: false,
    created: false,
  }
}

/**
 * Hands the board `changes` as the server's change log on hello, through the
 * socket, so no frame in the fixture is written. The tab reads as hidden, so
 * the dwell never marks a frame on screen seen before the shot.
 */
function seededChanges(changes: FrameChange[]): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, 'visibilityState', {
        get: () => 'hidden',
      })
    })
    await page.routeWebSocket('**/api/live', (socket) => {
      const server = socket.connectToServer()
      server.onMessage((message) => {
        const parsed = JSON.parse(String(message)) as { type: string }
        socket.send(
          parsed.type === 'changes'
            ? JSON.stringify({ type: 'changes', changes })
            : message,
        )
      })
      socket.onMessage((message) => server.send(message))
    })
  }
}

/**
 * Hands the board seven long agent replies on the home page's Note 1 through
 * the socket's notes message, so its thread outgrows the canvas with no note
 * written into the fixture.
 */
async function longThread(page: Page): Promise<void> {
  const body =
    'The about card now opens with the outcome and gives the fold more room. '.repeat(
      11,
    )
  const replies: BoardNote[] = [1, 2, 3, 4, 5, 6, 7].map((turn) => ({
    id: `n_10ae0b0${turn}`,
    number: null,
    frame: 'about',
    anchor: null,
    text: `${turn}. ${body.trim()}`,
    from: 'agent',
    author: null,
    session: LISTENING_SESSION,
    to: null,
    state: 'open',
    thread: 'n_5e1a0b01',
    createdAt: new Date(Date.UTC(2026, 9, 19, 16, 10 + turn)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 9, 19, 16, 10 + turn)).toISOString(),
    element: null,
  }))
  await page.routeWebSocket('**/api/live', (socket) => {
    const server = socket.connectToServer()
    server.onMessage((message) => {
      const parsed = JSON.parse(String(message)) as ServerMessage
      socket.send(
        parsed.type === 'notes' && parsed.page === 'webapp/home'
          ? JSON.stringify({ ...parsed, notes: [...parsed.notes, ...replies] })
          : message,
      )
    })
    socket.onMessage((message) => server.send(message))
  })
}

/** The toast once it has slid in. */
const TOAST_SHOWN = '[data-change-toast]:not([data-starting-style])'

/**
 * Once `ready` matches, which a control lit by write access stands for,
 * fires `event` on the button labelled `label`. Like `pressOnLoad`, it waits
 * in an init script, since `setup` runs before the harness navigates.
 */
function actWhen(
  ready: string,
  label: string,
  event: 'click' | 'dblclick',
): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ ready, label, event, frames }) => {
        let left = frames
        const act = () => {
          const target = document.querySelector<HTMLButtonElement>(
            `button[aria-label="${label}"]`,
          )
          if (!document.querySelector(ready) || !target) {
            if (--left > 0) requestAnimationFrame(act)
            else console.error(`${label} never lit`)
            return
          }
          if (event === 'click') target.click()
          else {
            target.dispatchEvent(
              new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
            )
          }
        }
        document.addEventListener('DOMContentLoaded', act)
      },
      { ready, label, event, frames: ROW_FRAMES },
    )
  }
}

/**
 * Once the server grants writes, double-clicks the canvas label of the frame
 * `ref` through the hit layer, as a mouse sends it, so its rename field
 * opens on the label.
 */
function labelRename(ref: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ ready, ref, frames }) => {
        let left = frames
        const act = () => {
          const hit = document.querySelector('[data-hit-layer]')
          const label = document.querySelector(
            `[data-frame="${ref}"] > [title]`,
          )
          if (!document.querySelector(ready) || !hit || !label) {
            if (--left > 0) requestAnimationFrame(act)
            else console.error(`The ${ref} label never drew`)
            return
          }
          const box = label.getBoundingClientRect()
          const send = (target: EventTarget, type: string, detail: number) =>
            target.dispatchEvent(
              new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: box.left + 8,
                clientY: box.top + box.height / 2,
                detail,
              }),
            )
          for (const detail of [1, 2]) {
            send(hit, 'mousedown', detail)
            send(window, 'mouseup', detail)
            send(hit, 'click', detail)
          }
          send(hit, 'dblclick', 2)
        }
        document.addEventListener('DOMContentLoaded', act)
      },
      { ready: WRITES_GRANTED, ref, frames: ROW_FRAMES },
    )
  }
}

/** The unlocked about row's lock button enables once the server grants writes, so it marks a tab that may write. */
const WRITES_GRANTED = 'button[aria-label="Lock about"]:not([disabled])'

/** Where `menuOn` right-clicks: a frame's center, empty canvas, the selected element, or a panel row. */
type MenuSpot =
  | { frame: string }
  | { empty: true }
  | { element: true }
  | { row: string }

/**
 * Once the server grants writes, right-clicks `spot` so its menu opens.
 * With `copy`, it first runs the menu's Copy as PNG, waits for its toast,
 * and opens the menu again, so the frame menu shows beside the toast. The
 * clipboard answers the write at once, since a synthetic click carries no
 * user activation for the browser to grant it.
 */
function menuOn(
  spot: MenuSpot,
  { copy = false }: { copy?: boolean } = {},
): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ spot, copy, ready, frames }) => {
        if (copy) {
          navigator.clipboard.write = async (items) => {
            await items[0]?.getType('image/png').catch(() => null)
          }
        }
        let left = frames
        const point = (): { x: number; y: number } | null => {
          const at = (element: Element | null | undefined) => {
            const box = element?.getBoundingClientRect()
            return box
              ? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
              : null
          }
          if ('frame' in spot) {
            return at(document.querySelector(`[data-frame="${spot.frame}"]`))
          }
          if ('element' in spot) {
            return at(document.querySelector('[data-element-selection]'))
          }
          if ('row' in spot) {
            return at(
              document.querySelector(
                `button[aria-label="${spot.row}"], nav a[href$="/${spot.row}"]`,
              ),
            )
          }
          const hit = document.querySelector('[data-hit-layer]')
          const box = hit?.getBoundingClientRect()
          return box ? { x: box.left + 24, y: box.bottom - 120 } : null
        }
        const open = (at: { x: number; y: number }) => {
          const target =
            'row' in spot
              ? document.elementFromPoint(at.x, at.y)
              : document.querySelector('[data-hit-layer]')
          target?.dispatchEvent(
            new MouseEvent('contextmenu', {
              bubbles: true,
              cancelable: true,
              button: 2,
              clientX: at.x,
              clientY: at.y,
            }),
          )
        }
        const reopen = (at: { x: number; y: number }) => {
          const toast = document.querySelector(
            '[data-slot="toast"]:not([data-starting-style])',
          )
          const menu = document.querySelector(
            '[data-slot="context-menu-content"]',
          )
          if (toast && !menu) open(at)
          else if (--left > 0) requestAnimationFrame(() => reopen(at))
          else console.error('The copy never toasted')
        }
        const run = () => {
          const at = point()
          if (!document.querySelector(ready) || !at) {
            if (--left > 0) requestAnimationFrame(run)
            else console.error('No spot to open a menu on')
            return
          }
          open(at)
          if (!copy) return
          const item = () =>
            [
              ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
            ].find((candidate) =>
              candidate.textContent?.startsWith('Copy as PNG'),
            )
          const press = () => {
            const found = item()
            if (found) {
              found.click()
              requestAnimationFrame(() => reopen(at))
            } else if (--left > 0) requestAnimationFrame(press)
            else console.error('No Copy as PNG item')
          }
          requestAnimationFrame(press)
        }
        document.addEventListener('DOMContentLoaded', () =>
          requestAnimationFrame(run),
        )
      },
      { spot, copy, ready: WRITES_GRANTED, frames: ROW_FRAMES },
    )
  }
}

/**
 * Presses a frame's findings badge through the hit layer above it once the
 * badge has drawn, the way a click reaches it, so its list opens.
 */
function findingsOn(frame: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ frame, frames }) => {
        let left = frames
        const press = () => {
          const badge = document.querySelector(
            `[data-findings-badge="${frame}"]`,
          )
          const hit = document.querySelector('[data-hit-layer]')
          if (!badge || !hit) {
            if (--left > 0) requestAnimationFrame(press)
            else console.error(`${frame} drew no findings badge`)
            return
          }
          const box = badge.getBoundingClientRect()
          const init = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: box.left + box.width / 2,
            clientY: box.top + box.height / 2,
          }
          hit.dispatchEvent(new MouseEvent('mousedown', init))
          window.dispatchEvent(new MouseEvent('mouseup', init))
        }
        document.addEventListener('DOMContentLoaded', () =>
          requestAnimationFrame(press),
        )
      },
      { frame, frames: ROW_FRAMES },
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
 * The home view and one board page of the preview's `basic` fixture, the
 * home view with a card's menu open and with a card's name being renamed,
 * then the board under Hide UI, in Play, with the avatar menu open, the element
 * inspector for the hero's headline with its token menu open, the hero's
 * Selection colors, and with the Theme
 * tab open, with tokens and with none, the Assets tab with the reference's
 * six files, a frame's findings list open from its badge and listed under
 * Checks, and the right-click menus on a frame, beside its copy toast, on
 * the selected element, on empty canvas, and on a page and a layers row, and
 * the guide a new board's start page shows. The "Edited" times count back from
 * each file's checkout time, so they are masked. The `about` frame sets no
 * font, so the board cases also hold the label's check findings mark in both
 * themes, beside the hero taking its colors and faces from the tokens. Every
 * board case waits on the server's browser sweep first, so the mark's count
 * is settled.
 */
export const BOARD_CASES: CaptureCase[] = [
  ...(['light', 'dark'] as const).flatMap((theme): CaptureCase[] => [
    {
      section: 'home',
      theme,
      route: '/',
      evidence: true,
      mask: ['[data-edited]'],
      setup: both(
        chosenTheme(theme),
        readyWhen(CARD_CAPTURED, CARD_UNCAPTURED),
      ),
    },
    {
      section: 'shortcuts-home',
      theme,
      route: '/',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: ['[data-edited]'],
      setup: both(
        chosenTheme(theme),
        readyWhen(CARD_CAPTURED, CARD_UNCAPTURED),
        openOverlayOnLoad('shortcuts', '', 'main li'),
      ),
    },
    {
      section: 'home-menu',
      theme,
      route: '/',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: ['[data-edited]'],
      setup: both(
        chosenTheme(theme),
        asWriter,
        onHomeCard('menu'),
        readyWhen('[data-slot="context-menu-content"]', CARD_UNCAPTURED),
      ),
    },
    {
      section: 'home-rename',
      theme,
      route: '/',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: ['[data-edited]'],
      setup: both(
        chosenTheme(theme),
        asWriter,
        onHomeCard('rename'),
        readyWhen('input[aria-label="Rename project webapp"]', CARD_UNCAPTURED),
      ),
    },
    {
      section: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      mask: [AVATAR],
      setup: both(browserSwept, chosenTheme(theme)),
    },
  ]),
  ...(['light', 'dark'] as const).flatMap((theme): CaptureCase[] => {
    const themed = (setup: (page: Page) => Promise<void>) =>
      both(browserSwept, chosenTheme(theme), setup)
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
        section: 'shape-menu',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(both(asWriter, pressOnLoad('^Shapes$'))),
      },
      {
        section: 'image-picker',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(both(referenceAssets, asWriter, imagePickerOnLoad)),
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
        section: 'palette',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(openOverlayOnLoad('commands', 'ho')),
      },
      {
        section: 'shortcuts',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(openOverlayOnLoad('shortcuts')),
      },
      {
        section: 'find',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            openOverlayOnLoad('find', 'o'),
            readyWhen('[role="listbox"] [role="option"]'),
          ),
        ),
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
        // The about frame sets no font, so its badge opens on its one finding.
        section: 'findings-open',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            asWriter,
            findingsOn('webapp/home/about'),
            readyWhen('[data-slot="popover-content"]'),
          ),
        ),
      },
      {
        section: 'select-checks',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            asWriter,
            onCanvas({ select: ['webapp/home/about'] }),
            readyWhen('[aria-labelledby="inspector-checks"]'),
          ),
        ),
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
        section: 'preview-phone',
        theme,
        route: '/p/webapp/home',
        excludeViewports: STATE_ONLY,
        // Carries the active Preview row, the label's chip, and the frame at
        // phone width into the evidence comparison.
        evidence: true,
        mask: [AVATAR],
        setup: themed(
          both(
            onCanvas({ select: ['webapp/home/hero'] }),
            actWhen('[data-selection]', 'Preview at phone width, 390', 'click'),
            readyWhen('[data-preview-chip]'),
          ),
        ),
      },
      {
        section: 'marquee',
        theme,
        route: '/p/webapp/home',
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        // From above the hero's left edge to inside the about frame.
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
        section: 'element-select',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(headlineOnHero),
      },
      {
        section: 'layers-expanded',
        theme,
        route: '/p/webapp/home',
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            onCanvas({ select: ['webapp/home/hero'] }),
            pressOnLoad('^Show the elements of hero$'),
          ),
        ),
      },
      {
        // The hero selected, and a hidden sketch at the bottom.
        section: 'layers-rows',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            hiddenSketch,
            onCanvas({ select: ['webapp/home/hero'] }),
            readyWhen('li[aria-label="sketch, hidden"]'),
          ),
        ),
      },
      {
        section: 'layers-rename',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            asWriter,
            actWhen(WRITES_GRANTED, 'Select hero', 'dblclick'),
            readyWhen('input[aria-label="Rename frame hero"]'),
          ),
        ),
      },
      {
        section: 'label-rename',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            asWriter,
            labelRename('webapp/home/hero'),
            readyWhen(
              '[data-notes-layer] input[aria-label="Rename frame hero"]',
            ),
          ),
        ),
      },
      {
        section: 'frame-presets',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            asWriter,
            actWhen(WRITES_GRANTED, 'Frame', 'click'),
            readyWhen('[role="radiogroup"]'),
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
        section: 'note-thread-long',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(longThread, asWriter, pressOnLoad('^Note 1 on about$')),
        ),
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
        section: 'note-composer-new-session',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(both(asWriter, canStartSessions, noteOnHero)),
      },
      {
        section: 'claimed-frame',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR, '[data-claim-elapsed]'],
        setup: themed(
          both(listening, claimedHero, readyWhen('[data-claim-tag]')),
        ),
      },
      {
        // The 390 px about frame at the fitted zoom, claimed beside its
        // findings badge, so the label has to truncate the claim tag. The
        // elapsed time sits wholly past the ellipsis, so it takes no mask,
        // whose box would draw outside the label.
        section: 'claimed-narrow',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            listening,
            claimed('webapp/home/about'),
            readyWhen(
              '[data-frame="webapp/home/about"] [data-claim-tag] ~ [data-findings-badge]',
            ),
          ),
        ),
      },
      {
        section: 'claimed-frame-waiting',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR, '[data-claim-elapsed]', '[data-waiting-elapsed]'],
        // A move of the claimed hero, dropped and waiting on its card. The
        // claim is released as the page closes, which takes the wait with it.
        setup: themed(
          both(
            asWriter,
            listening,
            claimedHero,
            onCanvas({
              select: ['webapp/home/hero'],
              awaitWrite: true,
              hold: { from: [700, 450], to: [760, 490] },
              drop: true,
            }),
            readyWhen('[data-waiting-card]'),
          ),
        ),
      },
      {
        section: 'claimed-frame-docked',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR, '[data-waiting-elapsed]'],
        // A rename of the settings page, waiting on its claimed profile frame,
        // which this page does not show, so its card docks above the toolbar.
        setup: themed(
          both(
            asWriter,
            listening,
            claimed('webapp/settings/profile'),
            onPagesList('rename-settings'),
            readyWhen('[data-waiting-dock]'),
          ),
        ),
      },
      {
        section: 'unseen-one',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            seededChanges([agentChange('webapp/home/about', 1)]),
            readyWhen(TOAST_SHOWN),
          ),
        ),
      },
      {
        section: 'compare-label',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        // A `before` hash gives the frame a base, so its label offers compare.
        setup: themed(
          both(
            seededChanges([
              {
                ...agentChange('webapp/home/about', 1),
                before: '1'.repeat(64),
              },
            ]),
            readyWhen('button[aria-label="Compare about with before"]'),
          ),
        ),
      },
      {
        section: 'unseen-many',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        // Following the agent that wrote them, so its initial is the chip.
        setup: themed(
          both(
            listening,
            seededChanges([
              agentChange('webapp/home/about', 1),
              agentChange('webapp/home/hero', 2),
              agentChange('webapp/settings/profile', 3),
            ]),
            actWhen(TOAST_SHOWN, 'claude · frameboard, listening', 'click'),
            readyWhen('button[aria-pressed="true"]'),
          ),
        ),
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
        section: 'element-inspector',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        // Every element section of `inspector/text` for the hero's headline,
        // once its styles have answered and Selection colors has drawn.
        setup: themed(
          both(
            asWriter,
            headlineOnHero,
            readyWhen('#inspector-selection-colors ~ ul li'),
          ),
        ),
      },
      {
        section: 'frame-colors',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            onCanvas({ select: ['webapp/home/hero'] }),
            readyWhen('#inspector-selection-colors ~ ul li'),
          ),
        ),
      },
      {
        section: 'export-section',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        // The one-frame inspector ending on Export at its 2x and Both themes default.
        setup: themed(
          both(
            onCanvas({ select: ['webapp/home/hero'] }),
            readyWhen('#inspector-export'),
          ),
        ),
      },
      {
        section: 'token-menu',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            asWriter,
            headlineOnHero,
            pressOnLoad('^Fill token$'),
            readyWhen('[data-slot="popover-content"]'),
          ),
        ),
      },
      {
        section: 'weight-menu',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            asWriter,
            headlineOnHero,
            pressOnLoad('^Font weight$'),
            readyWhen('[data-slot="dropdown-menu-content"]'),
          ),
        ),
      },
      {
        section: 'color-picker',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            asWriter,
            headlineOnHero,
            pressOnLoad('^Fill color$'),
            readyWhen('[data-slot="popover-content"] [role="slider"]'),
          ),
        ),
      },
      {
        // The channels sit on a row of their own, which Hex mode never shows.
        section: 'color-picker-rgb',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            asWriter,
            headlineOnHero,
            pressOnLoad('^Fill color$'),
            pressOnLoad('^Color format$'),
            chooseOnLoad('^RGB$'),
            readyWhen('[data-slot="popover-content"] [aria-label="Blue"]'),
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
      {
        section: 'menu-frame',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            asWriter,
            menuOn({ frame: 'webapp/home/hero' }),
            readyWhen('[data-slot="context-menu-content"]'),
          ),
        ),
      },
      {
        // The frame menu over the copy's success toast and an undo's refusal, per menus/toast.
        section: 'menu-frame-toasts',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            asWriter,
            refusedUndo,
            menuOn({ frame: 'webapp/home/hero' }, { copy: true }),
            readyWhen(
              'body:has([data-slot="context-menu-content"]):has([data-slot="toast"] ~ [data-slot="toast"]:not([data-starting-style]))',
            ),
          ),
        ),
      },
      {
        section: 'menu-element',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            asWriter,
            headlineOnHero,
            menuOn({ element: true }),
            readyWhen('[data-slot="context-menu-content"]'),
          ),
        ),
      },
      {
        section: 'menu-empty',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            asWriter,
            menuOn({ empty: true }),
            readyWhen('[data-slot="context-menu-content"]'),
          ),
        ),
      },
      {
        section: 'menu-page',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            asWriter,
            menuOn({ row: 'home' }),
            readyWhen('[data-slot="context-menu-content"]'),
          ),
        ),
      },
      {
        section: 'menu-layers',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            asWriter,
            menuOn({ row: 'Select hero' }),
            readyWhen('[data-slot="context-menu-content"]'),
          ),
        ),
      },
      {
        // The about frame sits 20px under the hero, so at the fitted zoom
        // its label has no room and hides.
        section: 'labels-low-zoom',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(stackedAbout, readyWhen('[data-frame][data-label-crowded]')),
        ),
      },
      {
        section: 'guide',
        theme,
        route: '/p/untitled/page-1',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(
          both(
            untouchedBoard,
            noTokens,
            asWriter,
            readyWhen('section[aria-labelledby="guide-title"]'),
          ),
        ),
      },
      {
        // The drawer step, where the unchecked radio ring shows beside the
        // checked one. The folder path it prints differs per checkout.
        section: 'guide-agent',
        theme,
        route: '/p/untitled/page-1',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR, '#guide-agent-hint code'],
        setup: themed(
          both(
            untouchedBoard,
            noTokens,
            asWriter,
            guideToAgentStep,
            readyWhen('input[name="guide-drawer"]'),
          ),
        ),
      },
      {
        // The settings page's one frame is hidden.
        section: 'empty-hidden',
        theme,
        route: '/p/webapp/settings',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(both(asWriter, readyWhen('[role="status"] button'))),
      },
      {
        section: 'flipped-marker',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: themed(pressOnLoad('^Flip hero to')),
      },
    ]
  }),
]
