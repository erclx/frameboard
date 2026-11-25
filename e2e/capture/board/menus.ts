import { type Page } from '@playwright/test'

import type { ListResult } from '@/shared/records/list'

import { wholeBoards } from '../../support/whole-boards'
import type { CaptureCase } from '../types'
import { elementsInFrame } from './editing'
import {
  asWriter,
  AVATAR,
  both,
  focusOnLoad,
  headlineOnHero,
  menuOn,
  noTokens,
  PRESS_FRAMES,
  pressOnLoad,
  readyWhen,
  ROW_FRAMES,
  STATE_ONLY,
  themedFor,
} from './setup'

/**
 * Presses Next until `heading` draws, read off the heading since a step
 * paints after the press. No step before Finish writes the board.
 */
function guideTo(heading: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ heading, frames }) => {
        let left = frames
        const press = () => {
          if (document.getElementById('guide-step')?.textContent === heading) {
            return
          }
          const next = [...document.querySelectorAll('button')].find(
            (button) =>
              !button.disabled && button.textContent?.trim() === 'Next',
          )
          next?.click()
          if (--left > 0) requestAnimationFrame(press)
          else console.error(`The guide never reached ${heading}`)
        }
        document.addEventListener('DOMContentLoaded', press)
      },
      { heading, frames: PRESS_FRAMES },
    )
  }
}

/** The guide's drawer step, the last before Finish. */
const guideToAgentStep = guideTo('Who draws the first frame?')

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
    socket.onMessage((message) => server.send(wholeBoards(message)))
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
    socket.onMessage((message) => server.send(wholeBoards(message)))
  })
}

export function menusCases(theme: 'light' | 'dark'): CaptureCase[] {
  const themed = themedFor(theme)
  return [
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
      // The Element menu with its four restack rows above Copy frame as PNG.
      section: 'menu-element-restack',
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
      section: 'menu-pages-space',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          menuOn({ space: 'pages' }),
          readyWhen('[data-slot="context-menu-content"]'),
        ),
      ),
    },
    {
      section: 'menu-layers-space',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          menuOn({ space: 'layers' }),
          readyWhen('[data-slot="context-menu-content"]'),
        ),
      ),
    },
    {
      // Hero's headline and caption share a parent, so two of them leave Use auto layout leading the menu.
      section: 'menu-element-wrap',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          elementsInFrame('webapp/home/hero', ['h1', 'p']),
          menuOn({ element: true, several: true }),
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
      // About sits 20px under hero, so its label hides at the fitted zoom.
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
      // The printed folder path differs per checkout.
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
    {
      // The flipped marker under keyboard focus, its ring against the canvas.
      section: 'flipped-marker-focus',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          pressOnLoad('^Flip hero to'),
          focusOnLoad('button[aria-label*=": flip hero to"]'),
          readyWhen('button[aria-label*=": flip hero to"]:focus-visible'),
        ),
      ),
    },
  ]
}
