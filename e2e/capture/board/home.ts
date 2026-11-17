import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { type Page } from '@playwright/test'

import type { ServerMessage } from '@/shared/live-messages'
import type { ListResult } from '@/shared/records/list'

import type { CaptureCase } from '../types'
import {
  agentChange,
  asWriter,
  AVATAR,
  both,
  browserSwept,
  chosenTheme,
  focusOnLoad,
  noAgentChanges,
  openOverlayOnLoad,
  PRESS_FRAMES,
  readyWhen,
  ROW_FRAMES,
  seededChanges,
  SERVED_BOARD,
  STATE_ONLY,
} from './setup'

/**
 * Waits for New project to light, which it does once the server grants
 * writes, then presses it once, so home opens New project's dialog.
 */
async function newProjectOnLoad(page: Page): Promise<void> {
  await page.addInitScript((frames) => {
    let left = frames
    const press = () => {
      const add = document.querySelector<HTMLButtonElement>(
        'button[aria-label="New project"]:not([aria-disabled])',
      )
      if (add) add.click()
      else if (--left > 0) requestAnimationFrame(press)
      else console.error('New project never lit')
    }
    document.addEventListener('DOMContentLoaded', press)
  }, PRESS_FRAMES)
}

/**
 * Lists the tablet width on the `about` frame, so the board draws one linked
 * box beside it, and puts the layout back once the capture page closes so no
 * later case shows it.
 */
async function aboutAtTabletWidth(page: Page): Promise<void> {
  const path = join(SERVED_BOARD, 'webapp/home/layout.json')
  const original = readFileSync(path, 'utf8')
  const layout = JSON.parse(original)
  layout.frames.about.widths = [{ width: 834, height: 1194 }]
  writeFileSync(path, JSON.stringify(layout))
  page.once('close', () => writeFileSync(path, original))
}

/**
 * Holds the live socket open with no server behind it, so no board ever
 * arrives and the page stays on its loading shell.
 */
async function neverConnects(page: Page): Promise<void> {
  await page.routeWebSocket('**/api/live', () => {})
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
 * Waits for New project to light, then picks up the `marketing` card or row
 * and holds it over the `webapp` one, never dropped, until the target raises
 * its hint. Both are found by name, since the fixture's order can change.
 */
async function holdDragOverWebapp(page: Page): Promise<void> {
  await page.addInitScript((frames) => {
    let left = frames
    const item = (name: string) =>
      [...document.querySelectorAll<HTMLAnchorElement>('main li a')].find(
        (link) => link.textContent?.startsWith(name),
      )
    const dataTransfer = new DataTransfer()
    const on = (link: HTMLElement) => {
      const box = link.getBoundingClientRect()
      return {
        bubbles: true,
        cancelable: true,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2,
        dataTransfer,
      }
    }
    const hold = (over: HTMLElement) => {
      over.dispatchEvent(new DragEvent('dragover', on(over)))
      if (document.querySelector('li[data-drop-over]')) return
      if (--left > 0) requestAnimationFrame(() => hold(over))
      else console.error('The webapp item never raised its drop hint')
    }
    const run = () => {
      const add = document.querySelector(
        'button[aria-label="New project"]:not([aria-disabled])',
      )
      const source = item('marketing')
      const target = item('webapp')
      if (!add || !source || !target) {
        if (--left > 0) requestAnimationFrame(run)
        else console.error('The home view never granted writes')
        return
      }
      source.dispatchEvent(new DragEvent('dragstart', on(source)))
      requestAnimationFrame(() => {
        target.dispatchEvent(new DragEvent('dragenter', on(target)))
        hold(target)
      })
    }
    document.addEventListener('DOMContentLoaded', () =>
      requestAnimationFrame(run),
    )
  }, ROW_FRAMES)
}

type ProjectRecord = ListResult['projects'][number]

/** A copy of `source` under `name`, every page and frame ref moved with it. */
function renamedProject(source: ProjectRecord, name: string): ProjectRecord {
  return {
    ...source,
    name,
    path: source.path.replace(/[^/]+$/, name),
    pages: source.pages.map((page) => ({
      ...page,
      ref: `${name}/${page.name}`,
      project: name,
      frames: page.frames.map((frame) => ({
        ...frame,
        ref: `${name}/${page.name}/${frame.name}`,
        project: name,
      })),
    })),
  }
}

/**
 * Serves home a board with `webapp` and two copies of it filed in Client A,
 * and with an archived copy when `archived` is set, by rewriting the board
 * message on the live socket, so the fixture on disk keeps no folder. A copy
 * names frames the server never captured, so its well draws boxes alone.
 */
function filedBoard({ archived = false }: { archived?: boolean } = {}): (
  page: Page,
) => Promise<void> {
  return async (page) => {
    await page.routeWebSocket('**/api/live', (socket) => {
      const server = socket.connectToServer()
      server.onMessage((message) => {
        const parsed = JSON.parse(String(message)) as ServerMessage
        if (parsed.type !== 'board') {
          socket.send(message)
          return
        }
        const webapp = parsed.data.projects.find(
          (project) => project.name === 'webapp',
        )
        if (!webapp) {
          socket.send(message)
          return
        }
        const filed = (project: ProjectRecord): ProjectRecord => ({
          ...project,
          group: 'Client A',
        })
        const projects = [
          ...parsed.data.projects.map((project) =>
            project.name === 'webapp' ? filed(project) : project,
          ),
          filed(renamedProject(webapp, 'client-app')),
          filed(renamedProject(webapp, 'client-email')),
          ...(archived
            ? [{ ...renamedProject(webapp, 'old-site'), archived: true }]
            : []),
        ]
        socket.send(
          JSON.stringify({ ...parsed, data: { ...parsed.data, projects } }),
        )
      })
      socket.onMessage((message) => server.send(message))
    })
  }
}

/** Sets a home view choice the browser keeps before the page loads. */
function homeStored(key: string, value: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ key, value }) => localStorage.setItem(key, value),
      { key, value },
    )
  }
}

/**
 * Hides what `selector` matches without moving the layout, for a value that
 * changes between runs under an overlay a mask would paint over.
 */
function hiddenBehind(selector: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript((rule) => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style')
        style.textContent = `${rule} { visibility: hidden; }`
        document.head.append(style)
      })
    }, selector)
  }
}

/** Clicks the Client A folder's card or row once home draws it. */
async function openClientFolder(page: Page): Promise<void> {
  await page.addInitScript((frames) => {
    let left = frames
    const run = () => {
      const folder = [
        ...document.querySelectorAll<HTMLButtonElement>(
          'main button[data-project-link]',
        ),
      ].find((button) => button.textContent?.startsWith('Client A'))
      if (folder) folder.click()
      else if (--left > 0) requestAnimationFrame(run)
      else console.error('The Client A folder never drew')
    }
    document.addEventListener('DOMContentLoaded', () =>
      requestAnimationFrame(run),
    )
  }, ROW_FRAMES)
}

/** Opens the Client A folder, then its pen, so the panel header holds the open rename field. */
async function renameClientFolder(page: Page): Promise<void> {
  await openClientFolder(page)
  await page.addInitScript((frames) => {
    let left = frames
    const run = () => {
      const pen = document.querySelector<HTMLButtonElement>(
        '[role="dialog"] button[aria-label="Rename folder"]',
      )
      if (pen) pen.click()
      else if (--left > 0) requestAnimationFrame(run)
      else console.error('The folder pen never drew')
    }
    document.addEventListener('DOMContentLoaded', () =>
      requestAnimationFrame(run),
    )
  }, ROW_FRAMES)
}

/** A card well drawing a capture, which the home case waits on beside `CARD_UNCAPTURED`. */
const CARD_CAPTURED = '[data-skeleton] image'

/** A frame in a card's well still showing its box alone. */
const CARD_UNCAPTURED = 'main li [data-skeleton] g:not(:has(image))'

/** The hint on the one home item a held project is over. */
const DROP_HINT = 'li[data-drop-over] > [role="status"]'

/**
 * The home bundle's states: the change toast with Next under focus naming its
 * key in a tooltip, the open folder with its pen under focus, the Deleted
 * toast a delete raises with its Undo, the Pinned label over the pinned
 * group in the grid and the list, a pinned card's corner buttons under
 * keyboard focus, and a folder card's tab ringed under focus. The delete is
 * answered in the browser, so the served board keeps its project.
 */
export const HOME_BUNDLE_CASES: CaptureCase[] = (
  ['light', 'dark'] as const
).flatMap((theme): CaptureCase[] => [
  {
    section: 'unseen-next-tooltip',
    theme,
    route: '/p/webapp/home',
    evidence: true,
    excludeViewports: STATE_ONLY,
    mask: [AVATAR],
    setup: both(
      browserSwept,
      chosenTheme(theme),
      seededChanges([
        agentChange('webapp/home/about', 1),
        agentChange('webapp/home/hero', 2),
        agentChange('webapp/settings/profile', 3),
      ]),
      focusOnLoad('[data-change-toast] button[aria-label="Next"]'),
      readyWhen('[data-slot="tooltip-content"]'),
    ),
  },
  {
    section: 'home-folder-pen',
    theme,
    route: '/',
    evidence: true,
    excludeViewports: STATE_ONLY,
    mask: ['[role="dialog"] [data-edited]'],
    setup: both(
      chosenTheme(theme),
      asWriter,
      filedBoard(),
      hiddenBehind('main [data-edited]'),
      openClientFolder,
      focusOnLoad('[role="dialog"] button[aria-label="Rename folder"]'),
      readyWhen(
        '[role="dialog"] button[aria-label="Rename folder"]:focus-visible',
      ),
    ),
  },
  {
    section: 'home-folder-rename',
    theme,
    route: '/',
    evidence: true,
    excludeViewports: STATE_ONLY,
    mask: ['[role="dialog"] [data-edited]'],
    setup: both(
      chosenTheme(theme),
      asWriter,
      filedBoard(),
      hiddenBehind('main [data-edited]'),
      renameClientFolder,
      readyWhen('[role="dialog"] input[aria-label="Rename folder Client A"]'),
    ),
  },
  {
    section: 'home-deleted-toast',
    theme,
    route: '/',
    evidence: true,
    excludeViewports: STATE_ONLY,
    mask: ['[data-edited]'],
    setup: both(
      chosenTheme(theme),
      asWriter,
      async (page) => {
        await page.route('**/api/project/delete', (route) =>
          route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, data: { deleted: 'webapp' } }),
          }),
        )
      },
      focusOnLoad('main a[href^="/p/webapp"]', 'Backspace'),
      readyWhen('[data-slot="toast"]:not([data-starting-style])'),
    ),
  },
  {
    section: 'home-pinned',
    theme,
    route: '/',
    evidence: true,
    mask: ['[data-edited]'],
    setup: both(
      chosenTheme(theme),
      homeStored('frameboard.home.pins', JSON.stringify(['webapp'])),
      readyWhen('[data-pin-label]'),
    ),
  },
  {
    section: 'home-card-corner',
    theme,
    route: '/',
    evidence: true,
    excludeViewports: STATE_ONLY,
    mask: ['[data-edited]'],
    setup: both(
      chosenTheme(theme),
      asWriter,
      homeStored('frameboard.home.pins', JSON.stringify(['webapp'])),
      focusOnLoad('main a[href^="/p/webapp"]'),
      readyWhen('main a[href^="/p/webapp"]:focus-visible'),
    ),
  },
  {
    section: 'home-folder-focus',
    theme,
    route: '/',
    evidence: true,
    excludeViewports: STATE_ONLY,
    mask: ['[data-edited]'],
    setup: both(
      chosenTheme(theme),
      asWriter,
      filedBoard(),
      focusOnLoad('main button[data-project-link]'),
      readyWhen('main button[data-project-link]:focus-visible'),
    ),
  },
  {
    section: 'home-pinned-list',
    theme,
    route: '/',
    evidence: true,
    excludeViewports: STATE_ONLY,
    mask: ['[data-edited]'],
    setup: both(
      chosenTheme(theme),
      homeStored('frameboard.home.pins', JSON.stringify(['webapp'])),
      homeStored('frameboard.home.layout', 'list'),
      readyWhen('[data-pin-label]'),
    ),
  },
])

/** The home view and the loading shells, in both themes, then the home bundle. */
export function homeCases(): CaptureCase[] {
  return [
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
          readyWhen(
            'input[aria-label="Rename project webapp"]',
            CARD_UNCAPTURED,
          ),
        ),
      },
      {
        // New project's dialog over the grid, each kit a live render of its sample frame.
        section: 'home-new-project-kit',
        theme,
        route: '/',
        evidence: true,
        excludeViewports: STATE_ONLY,
        // A mask paints above the dialog, so the edited times behind it are hidden instead.
        setup: both(
          chosenTheme(theme),
          asWriter,
          hiddenBehind('main [data-edited]'),
          newProjectOnLoad,
          readyWhen(
            'input[name="new-project-kit"]',
            '[role="dialog"] iframe:not([data-loaded])',
          ),
        ),
      },
      {
        section: 'home-folders',
        theme,
        route: '/',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: ['[data-edited]'],
        setup: both(
          chosenTheme(theme),
          asWriter,
          filedBoard(),
          readyWhen('main button[data-project-link]'),
        ),
      },
      {
        section: 'home-folder-open',
        theme,
        route: '/',
        evidence: true,
        excludeViewports: STATE_ONLY,
        // A mask paints above the dialog, so the cards behind it hide their times instead.
        mask: ['[role="dialog"] [data-edited]'],
        setup: both(
          chosenTheme(theme),
          asWriter,
          filedBoard(),
          hiddenBehind('main [data-edited]'),
          openClientFolder,
          readyWhen('[role="dialog"] li a'),
        ),
      },
      {
        section: 'home-folders-list',
        theme,
        route: '/',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: ['[data-edited]'],
        setup: both(
          chosenTheme(theme),
          asWriter,
          homeStored('frameboard.home.layout', 'list'),
          filedBoard(),
          openClientFolder,
          readyWhen('ul[aria-label="Client A"] li a'),
        ),
      },
      {
        section: 'home-drop-hint',
        theme,
        route: '/',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: ['[data-edited]'],
        setup: both(
          chosenTheme(theme),
          asWriter,
          holdDragOverWebapp,
          readyWhen(DROP_HINT, CARD_UNCAPTURED),
        ),
      },
      {
        section: 'home-drop-hint-list',
        theme,
        route: '/',
        evidence: true,
        excludeViewports: STATE_ONLY,
        setup: both(
          chosenTheme(theme),
          asWriter,
          homeStored('frameboard.home.layout', 'list'),
          // A mask paints above the hint, which sits over the row's date columns.
          hiddenBehind('main [data-edited]'),
          holdDragOverWebapp,
          readyWhen(DROP_HINT),
        ),
      },
      {
        section: 'home-filter',
        theme,
        route: '/',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: ['[data-edited]'],
        setup: both(
          chosenTheme(theme),
          asWriter,
          homeStored('frameboard.home.filter', 'client'),
          filedBoard(),
          readyWhen('main li a[href*="client-app"]'),
        ),
      },
      {
        section: 'home-archived',
        theme,
        route: '/',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: ['[data-edited]'],
        setup: both(
          chosenTheme(theme),
          asWriter,
          filedBoard({ archived: true }),
          readyWhen('#home-archived'),
        ),
      },
      {
        section: 'home-new-project',
        theme,
        route: '/',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: ['[data-edited]'],
        sections: [
          { name: 'button', selector: 'button[aria-label="New project"]' },
        ],
        setup: both(
          chosenTheme(theme),
          asWriter,
          readyWhen(CARD_CAPTURED, CARD_UNCAPTURED),
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
      {
        section: 'home-loading',
        theme,
        route: '/',
        evidence: true,
        setup: both(
          chosenTheme(theme),
          neverConnects,
          readyWhen('main li[data-placeholder]'),
        ),
      },
      {
        section: 'board-loading',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        mask: [AVATAR],
        setup: both(
          chosenTheme(theme),
          neverConnects,
          readyWhen('main [data-placeholder]'),
        ),
      },
      {
        section: 'linked-widths',
        theme,
        route: '/p/webapp/home',
        evidence: true,
        excludeViewports: STATE_ONLY,
        mask: [AVATAR],
        setup: both(
          aboutAtTabletWidth,
          noAgentChanges,
          browserSwept,
          chosenTheme(theme),
          readyWhen('[data-linked-width="834"] iframe'),
        ),
      },
    ]),
  ]
}
