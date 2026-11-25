import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { type Page } from '@playwright/test'
import WebSocket from 'ws'

import { claim, release, reserve } from '@/server/claims/store'
import type { ServerMessage } from '@/shared/live-messages'
import type { BoardNote } from '@/shared/records/notes'

import type { CaptureCase } from '../types'
import {
  actWhen,
  agentChange,
  asWriter,
  AVATAR,
  both,
  focusOnLoad,
  hoverOnLoad,
  LISTENING_SESSION,
  menuOn,
  onCanvas,
  onPagesList,
  PRESS_FRAMES,
  pressOnLoad,
  readyWhen,
  ROW_FRAMES,
  seededChanges,
  SERVED_BOARD,
  STATE_ONLY,
  themedFor,
} from './setup'

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

/**
 * Claims `frame` for the listening session until the page closes, through the
 * claims store with a fixed tag, since the CLI's tag names the run's folder.
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
 * Reserves a row of three settings frames and claims `faq` so it reads drawing,
 * under its own session, since the last page's release lands after this reserve.
 */
async function reservedRow(page: Page): Promise<void> {
  const root = SERVED_BOARD
  const session = `reserved-${randomUUID()}`
  const holder = { session, agent: 'claude', tag: 'claude · frameboard' }
  const at = new Date(Date.now() - 20_000)
  await reserve(
    root,
    holder,
    ['pricing', 'faq', 'footer'].map((name, index) => ({
      frame: `webapp/settings/${name}`,
      box: { x: index * 260, y: 0, width: 180, height: 200, hugHeight: true },
    })),
    at,
  )
  await claim(root, { ...holder, frame: 'webapp/settings/faq' }, new Date())
  page.once('close', () => {
    void release(root, session, undefined, new Date())
  })
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

/**
 * Sends three hero notes over the socket so they stack into one pin, which
 * reads 4 since the fixture's note on hero's heading sits close enough to join.
 */
async function stackedNotes(page: Page): Promise<void> {
  const notes: BoardNote[] = [
    'Tighten the hero spacing',
    'Make the headline bigger, it feels small next to the image',
    'Can we try a darker surface here?',
  ].map((text, index) => ({
    id: `n_5ac0b00${index}`,
    number: 3 + index,
    frame: 'hero',
    anchor: null,
    text,
    from: 'developer',
    author: 'Ada Lovelace',
    session: null,
    to: null,
    state: 'open',
    thread: null,
    createdAt: new Date(Date.UTC(2026, 9, 30, 10, index)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 9, 30, 10, index)).toISOString(),
    element: null,
  }))
  await page.routeWebSocket('**/api/live', (socket) => {
    const server = socket.connectToServer()
    server.onMessage((message) => {
      const parsed = JSON.parse(String(message)) as ServerMessage
      socket.send(
        parsed.type === 'notes' && parsed.page === 'webapp/home'
          ? JSON.stringify({ ...parsed, notes: [...parsed.notes, ...notes] })
          : message,
      )
    })
    socket.onMessage((message) => server.send(message))
  })
}

/** The toast once it has slid in. */
const TOAST_SHOWN = '[data-change-toast]:not([data-starting-style])'

/** The show offer once it has slid in. */
const OFFER_SHOWN = '[data-show-offer]:not([data-starting-style])'

/**
 * Sends the board an agent's `show` of a frame in the other project once the
 * hello's changes land, through the socket, so it raises the offer and marks
 * no frame.
 */
async function shownElsewhere(page: Page): Promise<void> {
  await page.routeWebSocket('**/api/live', (socket) => {
    const server = socket.connectToServer()
    server.onMessage((message) => {
      socket.send(message)
      const parsed = JSON.parse(String(message)) as { type: string }
      if (parsed.type !== 'changes') return
      socket.send(
        JSON.stringify({
          type: 'show',
          ref: 'marketing/states/free',
        } satisfies ServerMessage),
      )
    })
    socket.onMessage((message) => server.send(message))
  })
}

/**
 * Clicks the change toast's Mark all seen, its last button on the many form,
 * once the toast has slid in. The button carries no aria-label, since its
 * text names it, so `actWhen` cannot find it.
 */
async function markAllSeenOnLoad(page: Page): Promise<void> {
  await page.addInitScript(
    ({ shown, frames }) => {
      let left = frames
      const press = () => {
        const button = document.querySelector<HTMLButtonElement>(
          `${shown} button:last-of-type`,
        )
        if (button?.textContent?.startsWith('Mark all seen')) button.click()
        else if (--left > 0) requestAnimationFrame(press)
        else console.error('Mark all seen never showed')
      }
      document.addEventListener('DOMContentLoaded', press)
    },
    { shown: TOAST_SHOWN, frames: ROW_FRAMES },
  )
}

export function agentCases(theme: 'light' | 'dark'): CaptureCase[] {
  const themed = themedFor(theme)
  return [
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
      section: 'note-pin-list',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(both(stackedNotes, pressOnLoad('^4 notes on hero$'))),
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
      // The elapsed time falls past the truncated tag, so a mask would draw outside it.
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
      // Three reserved frames, the middle one drawing, per the reserve-row mock.
      section: 'reserved-row',
      theme,
      route: '/p/webapp/settings',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(both(listening, reservedRow, readyWhen('[data-drawing]'))),
    },
    {
      section: 'reserved-menu',
      theme,
      route: '/p/webapp/settings',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          listening,
          reservedRow,
          menuOn({ reserved: 'webapp/settings/pricing' }),
          readyWhen('[data-slot="context-menu-content"]'),
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
      // The claim's release on page close takes the waiting move with it.
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
      // The claimed profile frame is off this page, so the waiting card docks.
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
      // The compare button under keyboard focus, its ring against the canvas.
      section: 'compare-label-focus',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          seededChanges([
            {
              ...agentChange('webapp/home/about', 1),
              before: '1'.repeat(64),
            },
          ]),
          focusOnLoad('button[aria-label="Compare about with before"]'),
          readyWhen(
            'button[aria-label="Compare about with before"]:focus-visible',
          ),
        ),
      ),
    },
    {
      section: 'compare-flip',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // The seeded `before` hash names no stored version, so its page is served here.
      setup: themed(
        both(
          seededChanges([
            {
              ...agentChange('webapp/home/about', 1),
              before: '1'.repeat(64),
            },
          ]),
          async (page) => {
            await page.route(/[?&]at=/, (route) =>
              route.fulfill({
                contentType: 'text/html',
                body: '<!doctype html><title>about</title><h1>about, before</h1>',
              }),
            )
          },
          pressOnLoad('Compare about with before'),
          readyWhen('[data-compare-before]'),
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
      // The toast once Mark all seen cleared the pile, offering Undo alone.
      section: 'unseen-cleared',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          seededChanges([
            agentChange('webapp/home/about', 1),
            agentChange('webapp/home/hero', 2),
            agentChange('webapp/settings/profile', 3),
          ]),
          markAllSeenOnLoad,
          readyWhen(`${TOAST_SHOWN}:has(button:only-of-type)`),
        ),
      ),
    },
    {
      // The offer of a frame in another project at rest, per agents/show-offer.
      section: 'show-offer',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(both(shownElsewhere, readyWhen(OFFER_SHOWN))),
    },
    {
      // The pointer on it, so the close button draws clear of Go.
      section: 'show-offer-hover',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          shownElsewhere,
          hoverOnLoad(OFFER_SHOWN),
          readyWhen(`${OFFER_SHOWN}:hover`),
        ),
      ),
    },
    {
      // Keyboard focus on the close button, its ring clear of Go.
      section: 'show-offer-close-focus',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          shownElsewhere,
          focusOnLoad(`${OFFER_SHOWN} [data-slot="toast-close"]`),
          readyWhen('[data-slot="toast-close"]:focus-visible'),
        ),
      ),
    },
    {
      // An agent showed several frames with no edit, so the toast says showed.
      section: 'shown-many',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          seededChanges([
            { ...agentChange('webapp/home/about', 1), shown: true },
            { ...agentChange('webapp/settings/profile', 2), shown: true },
          ]),
          readyWhen(TOAST_SHOWN),
        ),
      ),
    },
  ]
}
