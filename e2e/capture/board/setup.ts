import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { type Page } from '@playwright/test'

import { scanBoard } from '@/server/board/scan'
import type { FrameChange } from '@/shared/records/changes'

import { probeFrames, type ProbeWindow } from './frame-probe'

/**
 * The board the preview serves, under the checkout `CANON_PREVIEW_ROOT`
 * names as `scripts/preview.ts` reads it, so a run against a copy outside the
 * tree reads and writes that copy.
 */
export const SERVED_BOARD = join(
  process.env.CANON_PREVIEW_ROOT || '.',
  'test/fixtures/boards/basic',
)

/**
 * Saves a theme choice before the board loads, as `theme.light` and
 * `theme.dark` save it, so the board starts in that theme whatever the
 * capture browser's own scheme is.
 */
export function chosenTheme(
  theme: 'light' | 'dark',
): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript((choice) => {
      localStorage.setItem('frameboard.theme', choice)
    }, theme)
  }
}

/** Answers the Theme tab's read with no sheets, since the preview board always has one. */
export async function noTokens(page: Page): Promise<void> {
  await page.route('**/api/projects/*/tokens', (route) =>
    route.fulfill({ json: { ok: true, data: { sheets: [], tokens: [] } } }),
  )
}

/** How many frames a left panel tab waits for its trigger, about ten seconds. */
export const TAB_FRAMES = 600

/**
 * Opens the inspector's tab named `name` once the board has drawn it, scoped
 * to the inspector, since the left panel's strip also holds a Design tab. The
 * pick holds across the selection a later setup makes.
 */
export function inspectorTab(name: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ label, frames }) => {
        let left = frames
        const open = () => {
          const tab = [
            ...document.querySelectorAll('[data-inspector] [role="tab"]'),
          ].find((candidate) => candidate.textContent?.trim() === label)
          if (tab instanceof HTMLElement) tab.click()
          else if (--left > 0) requestAnimationFrame(open)
          else console.error(`No ${label} inspector tab to open`)
        }
        document.addEventListener('DOMContentLoaded', open)
      },
      { label: name, frames: TAB_FRAMES },
    )
  }
}

/** How many frames the press waits for its control, about ten seconds, before giving up. */
export const PRESS_FRAMES = 600

/**
 * Drawn by the live board in every mode and never by `BoardLoading`, whose
 * controls are inert, so a board-route load script waits.
 */
export const LIVE_BOARD = '[data-layer]'

/**
 * Presses the control named `label`, by `aria-label` or else its text, from an
 * init script, since `setup` runs before the harness navigates. It waits out a
 * `disabled` or `aria-disabled` control, which the loading chrome draws inert.
 */
export function pressOnLoad(label: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ name, frames, live }) => {
        let left = frames
        const press = () => {
          const boardLive =
            !location.pathname.startsWith('/p/') ||
            document.querySelector(live) !== null
          const control = boardLive
            ? [...document.querySelectorAll('button')].find(
                (button) =>
                  !button.disabled &&
                  button.getAttribute('aria-disabled') !== 'true' &&
                  (
                    button.getAttribute('aria-label') ??
                    button.textContent?.trim() ??
                    ''
                  ).match(name),
              )
            : undefined
          if (control) control.click()
          else if (--left > 0) requestAnimationFrame(press)
          else console.error(`No button named ${name} to press`)
        }
        document.addEventListener('DOMContentLoaded', press)
      },
      { name: label, frames: PRESS_FRAMES, live: LIVE_BOARD },
    )
  }
}

/**
 * Chooses the menu item named `label` once an earlier press has opened its
 * menu, waiting in an init script as `pressOnLoad` does.
 */
export function chooseOnLoad(label: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ name, frames, live }) => {
        let left = frames
        const choose = () => {
          const boardLive =
            !location.pathname.startsWith('/p/') ||
            document.querySelector(live) !== null
          const item = boardLive
            ? [
                ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
              ].find((candidate) => candidate.textContent?.trim().match(name))
            : undefined
          if (item) item.click()
          else if (--left > 0) requestAnimationFrame(choose)
          else console.error(`No menu item named ${name} to choose`)
        }
        document.addEventListener('DOMContentLoaded', choose)
      },
      { name: label, frames: PRESS_FRAMES, live: LIVE_BOARD },
    )
  }
}

/**
 * Opens an overlay by its key once `drawn` shows and types `query`, sending the
 * modifier `$mod` means on the page's platform.
 */
export function openOverlayOnLoad(
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
  /** Presses Esc with the `hold` button still down, so the drag cancels. */
  cancel?: boolean
}

/** How many frames a gesture waits for the canvas to draw, about ten seconds. */
const GESTURE_FRAMES = 600

/**
 * Drives the Move tool once the canvas draws, for a selection, a marquee, or a
 * move held mid-drag.
 */
export function onCanvas(
  gesture: CanvasGesture,
): (page: Page) => Promise<void> {
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
          if (gesture.cancel) {
            window.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
            )
          }
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
export async function asWriter(page: Page): Promise<void> {
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
export async function browserSwept(): Promise<void> {
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

/** The session `listening` registers, which the claimed-frame case's claim names. */
export const LISTENING_SESSION = '4b7d2e90-1c3a-4f6e-9a1b-2d5c8e7f0a13'

/**
 * Hands the board an empty change log on every `changes` message, since
 * `rawIndigoHero` writes the hero as an outside write the change tracker
 * would otherwise raise as an agent's, racing the shot.
 */
export async function noAgentChanges(page: Page): Promise<void> {
  await page.routeWebSocket('**/api/live', (socket) => {
    const server = socket.connectToServer()
    server.onMessage((message) => {
      const parsed = JSON.parse(String(message)) as { type: string }
      socket.send(
        parsed.type === 'changes'
          ? JSON.stringify({ type: 'changes', changes: [] })
          : message,
      )
    })
    socket.onMessage((message) => server.send(message))
  })
}

/** How many frames a pages list step waits for its row, about ten seconds. */
export const ROW_FRAMES = 600

/**
 * Once writes are granted, renames the home row, holds it dragged over
 * settings, or renames settings, which waits on its claimed frame.
 */
export function onPagesList(
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

/** A one-pixel GIF, the body the ready gate's image answers with. */
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
)

/**
 * Holds the load until `selector` draws, `absent` matches nothing, SVG images
 * decode, and two frames paint. A miss stays held, since any answer shoots the
 * wrong state as a pass, and is named on stderr ahead of the timeout.
 */
export function readyWhen(
  selector: string,
  absent?: string,
): (page: Page) => Promise<void> {
  return async (page) => {
    let ready: () => void = () => {}
    const drawn = new Promise<void>((resolve) => (ready = resolve))
    await page.exposeFunction('captureReady', () => ready())
    await page.exposeFunction('captureLost', () =>
      console.error(`${page.url()}: ${selector} never drew`),
    )
    await page.route('**/capture-ready.gif', async (route) => {
      await drawn
      await route.fulfill({ contentType: 'image/gif', body: PIXEL })
    })
    await page.addInitScript(
      ({ target, missing, frames }) => {
        // A frame's held image would hold the load that stamps its iframe.
        if (window !== window.top) return
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
          else {
            console.error(`${target} never drew`)
            ;(window as unknown as { captureLost: () => void }).captureLost()
          }
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

/**
 * Selects the hero frame and double-clicks its headline once the frame has
 * loaded, so the capture shows the element outline, its size chip, and the
 * layers rows opened down to it.
 */
export async function headlineOnHero(page: Page): Promise<void> {
  await probeFrames(page, ['h1'], PRESS_FRAMES)
  await page.addInitScript((frames) => {
    if (window !== window.top) return
    const { frameReport } = window as unknown as ProbeWindow
    let left = frames
    const pick = () => {
      const hero = document.querySelector('[data-frame="webapp/home/hero"]')
      const iframe = hero?.querySelector('iframe')
      // A frame names the file it shows only once its load has stamped it.
      const heading = iframe?.dataset.renderedAt
        ? frameReport(iframe)?.elements.h1
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
      const inner = heading
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
 * Double-clicks `selector` in `ref` once every canvas video decodes, at its
 * middle or with `low` its bottom left, clear of a container's children.
 */
export function elementInFrame(
  ref: string,
  selector: string,
  low = false,
): (page: Page) => Promise<void> {
  return async (page) => {
    await probeFrames(page, [selector], PRESS_FRAMES)
    await page.addInitScript(
      ({ owner, target, frames, low }) => {
        if (window !== window.top) return
        const { frameReport } = window as unknown as ProbeWindow
        let left = frames
        const pick = () => {
          const shown = document.querySelector(`[data-frame="${owner}"]`)
          const iframe = shown?.querySelector('iframe')
          const element = iframe?.dataset.renderedAt
            ? frameReport(iframe)?.elements[target]
            : null
          const hit = document.querySelector('[data-hit-layer]')
          // The page just left stays mounted and hidden, so check the shown layer.
          const layer =
            [...document.querySelectorAll<HTMLElement>('[data-layer]')].find(
              (each) => each.checkVisibility(),
            ) ?? null
          // A staging layer has unbuilt iframes that decoding cannot speak for.
          const decoded =
            layer !== null &&
            !layer.hasAttribute('data-staging') &&
            [...document.querySelectorAll('iframe')].every(
              // A frame yet to report shows no video, as a blank page does.
              (each) => frameReport(each)?.videosDecoded !== false,
            )
          if (!shown || !element || !hit || !layer || !decoded) {
            if (--left > 0) requestAnimationFrame(pick)
            else console.error(`No ${target} on ${owner} to select`)
            return
          }
          const k = Number(layer.style.getPropertyValue('--zoom') || 1)
          const frame = shown.getBoundingClientRect()
          const inner = element
          const at = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX:
              frame.left +
              (low ? inner.left + 8 : inner.left + inner.width / 2) * k,
            clientY:
              frame.top +
              (low ? inner.bottom - 8 : inner.top + inner.height / 2) * k,
          }
          hit.dispatchEvent(new MouseEvent('mousedown', at))
          window.dispatchEvent(new MouseEvent('mouseup', at))
          hit.dispatchEvent(new MouseEvent('dblclick', at))
        }
        document.addEventListener('DOMContentLoaded', pick)
      },
      { owner: ref, target: selector, frames: PRESS_FRAMES, low },
    )
  }
}

/** One change an agent made, as the server's change log carries it. */
export function agentChange(frame: string, at: number): FrameChange {
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
export function seededChanges(
  changes: FrameChange[],
): (page: Page) => Promise<void> {
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
 * Focuses the first control matching `selector` once it draws, then sends
 * `key` to it, so a shot shows where a keyboard user's focus rests. A focus
 * from script draws its ring only while no real pointer has moved the page.
 */
export function focusOnLoad(
  selector: string,
  key?: string,
): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ selector, key, frames, live }) => {
        let left = frames
        const act = () => {
          const boardLive =
            !location.pathname.startsWith('/p/') ||
            document.querySelector(live) !== null
          const target = boardLive
            ? document.querySelector<HTMLElement>(selector)
            : null
          if (!target) {
            if (--left > 0) requestAnimationFrame(act)
            return
          }
          // A popup moves focus to itself after it mounts, so wait that out.
          const afterFrames = (run: () => void) =>
            requestAnimationFrame(() => requestAnimationFrame(run))
          afterFrames(() => {
            target.focus()
            // Sent in the focus's own task, the key strands the tooltip it opened.
            if (key) {
              afterFrames(() =>
                target.dispatchEvent(
                  new KeyboardEvent('keydown', { key, bubbles: true }),
                ),
              )
            }
          })
        }
        document.addEventListener('DOMContentLoaded', act)
      },
      { selector, key, frames: ROW_FRAMES, live: LIVE_BOARD },
    )
  }
}

/**
 * Once `ready` matches, which a control lit by write access stands for,
 * fires `event` on the button labelled `label`. Like `pressOnLoad`, it waits
 * in an init script, since `setup` runs before the harness navigates.
 */
export function actWhen(
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

/** The unlocked about row's lock button enables once the server grants writes, so it marks a tab that may write. */
export const WRITES_GRANTED = 'button[aria-label="Lock about"]:not([disabled])'

/** Where `menuOn` right-clicks: a frame's center, empty canvas, the selected element, a panel row, or a panel list's empty space. */
type MenuSpot =
  | { frame: string }
  | { reserved: string }
  | { empty: true }
  | { element: true; several?: true }
  | { row: string }
  | { space: 'pages' | 'layers' }

/**
 * Right-clicks `spot` once writes are granted, after a Copy as PNG with `copy`,
 * whose clipboard is stubbed since a synthetic click carries no activation.
 */
export function menuOn(
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
          if ('reserved' in spot) {
            return at(
              document.querySelector(`[data-reserved="${spot.reserved}"]`),
            )
          }
          if ('element' in spot) {
            // Several picks draw one after another, so the menu waits for the last.
            if (
              spot.several &&
              !document.documentElement.hasAttribute('data-elements-picked')
            ) {
              return null
            }
            return at(document.querySelector('[data-element-selection]'))
          }
          if ('row' in spot) {
            return at(
              document.querySelector(
                `button[aria-label="${spot.row}"], nav a[href$="/${spot.row}"]`,
              ),
            )
          }
          if ('space' in spot) {
            return at(
              document.querySelector(
                `[aria-labelledby="${spot.space}-heading"] [aria-hidden]:is(li, div)`,
              ),
            )
          }
          const hit = document.querySelector('[data-hit-layer]')
          const box = hit?.getBoundingClientRect()
          return box ? { x: box.left + 24, y: box.bottom - 120 } : null
        }
        const open = (at: { x: number; y: number }) => {
          const target =
            'row' in spot || 'space' in spot
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
      {
        spot,
        copy,
        // Settings has no `about` row, so a reserved spot waits on its frame's lock.
        ready:
          'reserved' in spot
            ? 'button[aria-label="Lock profile"]:not([disabled])'
            : WRITES_GRANTED,
        frames: ROW_FRAMES,
      },
    )
  }
}

/** Set on the root while `scrolledToEnd` holds a panel's body at its end, for `readyWhen` to wait on. */
export const AT_END = 'data-capture-at-end'

/**
 * Holds the body of the side panel named `label` at its end on every frame,
 * since a section above the end grows once its read answers.
 */
export function scrolledToEnd(label: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ label, marker, frames }) => {
        if (window !== window.top) return
        let left = frames
        const scroll = () => {
          const body = document.querySelector(
            `aside[aria-label="${label}"] [role="tabpanel"]:not([hidden])`,
          )
          if (body) {
            body.scrollTop = body.scrollHeight
            document.documentElement.toggleAttribute(marker, body.scrollTop > 0)
          }
          if (--left > 0) requestAnimationFrame(scroll)
          else if (!body?.scrollTop) console.error(`${label} never scrolled`)
        }
        document.addEventListener('DOMContentLoaded', () =>
          requestAnimationFrame(scroll),
        )
      },
      { label, marker: AT_END, frames: ROW_FRAMES },
    )
  }
}

export function both(
  ...setups: ((page: Page) => Promise<void>)[]
): (page: Page) => Promise<void> {
  return async (page) => {
    for (const setup of setups) await setup(page)
  }
}

/** Runs a case's setup after the startup browser sweep, in the chosen theme. */
export function themedFor(
  theme: 'light' | 'dark',
): (setup: (page: Page) => Promise<void>) => (page: Page) => Promise<void> {
  return (setup) => both(browserSwept, chosenTheme(theme), setup)
}

/** The avatar draws the initials of the machine's git user.name, which differ between runs. */
export const AVATAR = '[data-avatar]'

/** A state rather than a layout, so it takes the desktop width alone. */
export const STATE_ONLY = ['320', '390', '768', '1536']

/**
 * Adds the shipped Sketch and Wireframe kits to `webapp` and sets Sketch on
 * its hero, as `kit add` and `frame kit` would, taking both back when the
 * page closes so no later case shows them.
 */
export async function webappKits(page: Page): Promise<void> {
  const kits = join(SERVED_BOARD, 'webapp/assets/kits')
  for (const kit of ['sketch', 'wireframe']) {
    cpSync(join('src/server/kits/shipped', kit), join(kits, kit), {
      recursive: true,
      // The sample page stays behind, as an install leaves it.
      filter: (path) => !path.endsWith(`${kit}/kit`),
    })
  }
  const layoutPath = join(SERVED_BOARD, 'webapp/home/layout.json')
  const originalLayout = readFileSync(layoutPath, 'utf8')
  const layout = JSON.parse(originalLayout)
  layout.frames.hero.kit = 'sketch'
  writeFileSync(layoutPath, JSON.stringify(layout))
  page.once('close', () => {
    writeFileSync(layoutPath, originalLayout)
    rmSync(join(SERVED_BOARD, 'webapp/assets'), {
      recursive: true,
      force: true,
    })
  })
}
