import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { type Page } from '@playwright/test'

import type { ListResult } from '@/shared/records/list'

import type { CaptureCase } from '../types'
import {
  asWriter,
  AVATAR,
  both,
  browserSwept,
  chooseOnLoad,
  chosenTheme,
  elementInFrame,
  focusOnLoad,
  headlineOnHero,
  inspectorTab,
  noAgentChanges,
  noTokens,
  onCanvas,
  onPagesList,
  PRESS_FRAMES,
  pressOnLoad,
  readyWhen,
  ROW_FRAMES,
  SERVED_BOARD,
  STATE_ONLY,
} from './setup'

/**
 * Answers the token read with the project's sheets and every token but its
 * colors, as a project whose sheets hold radius and font tokens alone, so
 * the inspector has no color to offer or match. Filtered in the page's own
 * `fetch`, since a route that fetches the real answer waits behind the held
 * `readyWhen` route and the board never draws.
 */
async function noColorTokens(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const pass = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const response = await pass(input, init)
      const url = input instanceof Request ? input.url : String(input)
      if (
        !/\/api\/projects\/[^/]+\/tokens$/.test(
          new URL(url, location.href).pathname,
        )
      ) {
        return response
      }
      const read = (await response.json()) as {
        data: { tokens: { group: string }[] }
      }
      read.data.tokens = read.data.tokens.filter(
        (token) => token.group !== 'color',
      )
      return Response.json(read, { status: response.status })
    }
  })
}

/** A box sliding 800 px right over 4 s, so a hold names the moment by where it stands. */
const SLIDE_FRAME = join(
  import.meta.dirname,
  '../../test/fixtures/frames/slide.html',
)

/**
 * Serves the slide in the hero's place, so the hero draws a Motion section,
 * and puts the file back once the capture page closes so no later case shows it.
 */
async function slidingHero(page: Page): Promise<void> {
  const path = join(SERVED_BOARD, 'webapp/home/hero.html')
  const original = readFileSync(path, 'utf8')
  writeFileSync(path, readFileSync(SLIDE_FRAME, 'utf8'))
  page.once('close', () => writeFileSync(path, original))
}

/**
 * Sets the Motion section's track to its middle once it lights, as a drag
 * releasing there would, then marks the body `data-capture-held` once the
 * hero's page reads its animation paused at that moment. The Held chip
 * draws before the seek lands, so the shot waits on the page rather than it.
 */
async function heldMidway(page: Page): Promise<void> {
  await page.addInitScript(
    ({ frames }) => {
      let left = frames
      let set = false
      const step = () => {
        const track = document.querySelector<HTMLInputElement>(
          'section[aria-labelledby="inspector-motion"] input[aria-label="Position"]',
        )
        if (!set && track && !track.disabled && Number(track.max) > 0) {
          const value = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
          )
          value?.set?.call(track, String(Number(track.max) / 2))
          track.dispatchEvent(new Event('input', { bubbles: true }))
          set = true
        }
        const hero = document.querySelector<HTMLIFrameElement>(
          '[data-frame="webapp/home/hero"] > iframe',
        )
        const animation = hero?.contentDocument?.getAnimations()[0]
        if (
          set &&
          animation?.playState === 'paused' &&
          animation.currentTime === 2000
        ) {
          document.body.dataset.captureHeld = ''
          return
        }
        if (--left > 0) requestAnimationFrame(step)
        else console.error('The hero never held mid-slide')
      }
      document.addEventListener('DOMContentLoaded', step)
    },
    { frames: PRESS_FRAMES },
  )
}

/**
 * Finishes the hero's slide on its own clock once its page runs it, as a
 * page left to play reaches its end, so the Motion section reads it ended.
 */
async function slideFinished(page: Page): Promise<void> {
  await page.addInitScript(
    ({ frames }) => {
      let left = frames
      const step = () => {
        const hero = document.querySelector<HTMLIFrameElement>(
          '[data-frame="webapp/home/hero"] > iframe',
        )
        const animations = hero?.contentDocument?.getAnimations() ?? []
        if (animations.length > 0) {
          for (const animation of animations) animation.finish()
          return
        }
        if (--left > 0) requestAnimationFrame(step)
        else console.error('The hero never ran its slide')
      }
      document.addEventListener('DOMContentLoaded', step)
    },
    { frames: PRESS_FRAMES },
  )
}

/**
 * Sets the hero's headline and caption in a raw indigo no token names, since
 * the fixture paints only through tokens, and puts the file back once the
 * capture page closes so no later case shows it.
 */
async function rawIndigoHero(page: Page): Promise<void> {
  const path = join(SERVED_BOARD, 'webapp/home/hero.html')
  const original = readFileSync(path, 'utf8')
  writeFileSync(
    path,
    original
      .replace(
        '<h1 data-name="Headline">',
        '<h1 data-name="Headline" style="color: #4f46e5">',
      )
      .replace(
        '<p data-name="Caption">',
        '<p data-name="Caption" style="border: 1px solid #4f46e5">',
      ),
  )
  page.once('close', () => writeFileSync(path, original))
}

/**
 * Gives the hero's headline the stroke Add stroke writes where no color
 * token exists, and puts the file back once the capture page closes.
 */
async function greyStrokeHero(page: Page): Promise<void> {
  const path = join(SERVED_BOARD, 'webapp/home/hero.html')
  const original = readFileSync(path, 'utf8')
  writeFileSync(
    path,
    original.replace(
      '<h1 data-name="Headline">',
      '<h1 data-name="Headline" style="border: 1px solid #808080">',
    ),
  )
  page.once('close', () => writeFileSync(path, original))
}

/** The raw indigo row's swatch, which opens the tokens to replace it with. */
const REPLACE_INDIGO = '^Replace 4f46e5 with a token$'

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

/** Set on the root once `exportInView` has scrolled the inspector, for `readyWhen` to wait on. */
const EXPORT_IN_VIEW = 'data-capture-export-in-view'

/**
 * Scrolls the inspector until its Export section's foot sits at the panel's
 * foot, since an element's sections run past the panel and Export is the
 * second last. It scrolls again on every frame, so a section above that
 * grows once its styles answer cannot push Export back out of view.
 */
async function exportInView(page: Page): Promise<void> {
  await page.addInitScript(
    ({ marker, frames }) => {
      let left = frames
      const scroll = () => {
        const section = document
          .getElementById('inspector-export')
          ?.closest('section')
        if (section) {
          section.scrollIntoView({ block: 'end' })
          document.documentElement.setAttribute(marker, '')
        } else if (left === 1) console.error('No Export section to scroll to')
        if (--left > 0) requestAnimationFrame(scroll)
      }
      document.addEventListener('DOMContentLoaded', () =>
        requestAnimationFrame(scroll),
      )
    },
    { marker: EXPORT_IN_VIEW, frames: ROW_FRAMES },
  )
}

/**
 * The hero as Free leaves text alone: the Text tool's paragraph and a
 * centered one, each placed with offsets and no width, at the spots a
 * Free on the board wrote, so both hug their words.
 */
const PLACED_TEXT =
  '<p data-name="Text" style="font-family: var(--font-text); width: fit-content; position: absolute; left: 16px; top: 158px">Text</p>' +
  '<p data-name="Centered" style="text-align: center; position: absolute; left: 687px; top: 84px">Centered</p>'

/**
 * Writes `PLACED_TEXT` into the served hero before its closing body tag and
 * puts the file back when the case's page closes, so the server hashes and
 * reads the bytes the board shows while every later case reads the fixture.
 * A response rewritten in the browser instead would show bytes the server's
 * element tree does not vouch for, and the pick refuses them.
 */
async function placedTextOnHero(page: Page): Promise<void> {
  const path = join(SERVED_BOARD, 'webapp/home/hero.html')
  const original = readFileSync(path, 'utf8')
  writeFileSync(path, original.replace('</body>', `${PLACED_TEXT}</body>`))
  page.once('close', () => writeFileSync(path, original))
}

/**
 * Selects the hero's element matching `selector` once the frame has loaded,
 * as `headlineOnHero` does its headline, so the capture shows its outline,
 * its size chip, and its inspector.
 */
function elementOnHero(selector: string): (page: Page) => Promise<void> {
  return elementInFrame('webapp/home/hero', selector)
}

/**
 * Lists eight more empty pages in `webapp` through the socket's board
 * message, ten in all, then double-clicks the Pages divider once they draw,
 * so the list fits every page, marking the body `data-pages-fit` a frame on.
 */
async function tenPagesFit(page: Page): Promise<void> {
  await page.routeWebSocket('**/api/live', (socket) => {
    const server = socket.connectToServer()
    server.onMessage((message) => {
      const parsed = JSON.parse(String(message)) as {
        type: string
        data?: ListResult
      }
      const webapp = parsed.data?.projects.find(
        (project) => project.name === 'webapp',
      )
      const last = webapp?.pages.at(-1)
      if (parsed.type !== 'board' || !webapp || !last) {
        socket.send(message)
        return
      }
      for (let at = 3; at <= 10; at++) {
        webapp.pages.push({ ...last, name: `page-${at}`, frames: [] })
      }
      socket.send(JSON.stringify(parsed))
    })
    socket.onMessage((message) => server.send(message))
  })
  await page.addInitScript((frames) => {
    let left = frames
    const run = () => {
      const rows = document.querySelectorAll(
        'nav[aria-labelledby="pages-heading"] a',
      )
      const divider = document.querySelector(
        '[aria-label="Resize the pages list"]',
      )
      if (rows.length === 10 && divider) {
        divider.dispatchEvent(
          new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
        )
        // The panel resizes on its next render, so readiness waits a frame past the press.
        requestAnimationFrame(() => (document.body.dataset.pagesFit = ''))
        return
      }
      if (--left > 0) requestAnimationFrame(run)
      else console.error('The ten pages never drew')
    }
    document.addEventListener('DOMContentLoaded', run)
  }, ROW_FRAMES)
}

/** Set on `body` once `focusHeld` has kept its target focused for `HELD_FRAMES`. */
const FOCUS_HELD = 'body[data-focus-held]'

const HELD_FRAMES = 30

/**
 * Focuses `selector` every frame until it has kept focus for `HELD_FRAMES`,
 * then marks `body` with `FOCUS_HELD`. A focus set once is lost when a
 * dblclick selects the frame before its element, or a write remounts the
 * inspector, and the focus scrolls a low inspector row into the shot.
 */
function focusHeld(selector: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ selector, frames, needed }) => {
        let left = frames
        let held = 0
        const step = () => {
          const target = document.querySelector<HTMLElement>(selector)
          if (target && document.activeElement === target) held += 1
          else {
            held = 0
            target?.focus()
          }
          if (held >= needed) document.body.dataset.focusHeld = ''
          else if (--left > 0) requestAnimationFrame(step)
          else console.error(`${selector} never held focus`)
        }
        document.addEventListener('DOMContentLoaded', step)
      },
      { selector, frames: PRESS_FRAMES * 2, needed: HELD_FRAMES },
    )
  }
}

export function inspectorCases(theme: 'light' | 'dark'): CaptureCase[] {
  const themed = (setup: (page: Page) => Promise<void>) =>
    both(browserSwept, chosenTheme(theme), setup)
  return [
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
      // Ten pages after a double-click on the divider, every row shown with no scroll.
      section: 'pages-fit-all',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(both(tenPagesFit, readyWhen('body[data-pages-fit]'))),
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
      section: 'text-hugs',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      // The hero's write can land as an unseen change, whose toast comes and
      // goes between runs with no code change.
      mask: [AVATAR, '[data-slot="toast"]'],
      // The centered paragraph Free placed, hugging its words where it
      // rendered, beside the Text tool's paragraph placed the same way.
      setup: themed(
        both(
          asWriter,
          placedTextOnHero,
          elementOnHero('[data-name="Centered"]'),
          readyWhen('[data-element-selection]'),
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
      section: 'replace-colors',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // The hero's Selection colors with the raw indigo row's token list open.
      setup: themed(
        both(
          rawIndigoHero,
          noAgentChanges,
          asWriter,
          onCanvas({ select: ['webapp/home/hero'] }),
          pressOnLoad(REPLACE_INDIGO),
          readyWhen('[data-slot="popover-content"] li button'),
        ),
      ),
    },
    {
      section: 'replace-colors-done',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // The same row once primary replaced it, with the toast counting the elements.
      setup: themed(
        both(
          rawIndigoHero,
          noAgentChanges,
          asWriter,
          onCanvas({ select: ['webapp/home/hero'] }),
          pressOnLoad(REPLACE_INDIGO),
          pressOnLoad('^primary'),
          readyWhen(
            'button[aria-label="Copy var(--primary)"]',
            'button[aria-label="Replace 4f46e5 with a token"]',
          ),
        ),
      ),
    },
    {
      section: 'colors-no-tokens',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // The hero's Selection colors in a project no token sheet reaches,
      // whose raw indigo row reads plain, with no mark and no swap.
      setup: themed(
        both(
          rawIndigoHero,
          noAgentChanges,
          noTokens,
          asWriter,
          onCanvas({ select: ['webapp/home/hero'] }),
          readyWhen('button[aria-label="Copy #4f46e5"]'),
        ),
      ),
    },
    {
      section: 'use-token',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // The raw indigo headline equals primary in light alone, so its Fill
      // row and Selection colors offer `Use primary` in light and nothing
      // in dark, where primary reads 818cf8.
      setup: themed(
        both(
          rawIndigoHero,
          noAgentChanges,
          asWriter,
          headlineOnHero,
          // Focus brings Selection colors into view under the Fill row, and
          // shows Select over the percent alone, short of the swap.
          focusHeld('button[aria-label="Copy #4f46e5"]'),
          readyWhen(FOCUS_HELD),
        ),
      ),
    },
    {
      section: 'stroke-no-tokens',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // The headline holding the 1px 808080 stroke Add stroke writes in a
      // project whose sheets name no color token. Seeded rather than
      // pressed, since a press here kept the headline from selecting.
      setup: themed(
        both(
          greyStrokeHero,
          noAgentChanges,
          noColorTokens,
          asWriter,
          headlineOnHero,
          focusHeld('button[aria-label="Stroke color"]'),
          readyWhen(FOCUS_HELD),
        ),
      ),
    },
    {
      section: 'select-color',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // The raw indigo row with the keyboard on it, which shows its Select.
      setup: themed(
        both(
          rawIndigoHero,
          noAgentChanges,
          asWriter,
          onCanvas({ select: ['webapp/home/hero'] }),
          focusOnLoad('button[aria-label="Copy #4f46e5"]'),
          readyWhen('button[aria-label="Copy #4f46e5"]:focus-visible'),
        ),
      ),
    },
    {
      section: 'select-color-done',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // The elements Select reached, each outlined, under the count and the color.
      setup: themed(
        both(
          rawIndigoHero,
          noAgentChanges,
          asWriter,
          onCanvas({ select: ['webapp/home/hero'] }),
          pressOnLoad('^Select 2 elements using 4f46e5$'),
          readyWhen(
            'body:has(#inspector-elements):has([data-element-selection] ~ [data-element-selection]):has(#inspector-selection-colors ~ ul li)',
          ),
        ),
      ),
    },
    {
      section: 'motion-held',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // An animated hero held mid-slide: the Motion section with its time
      // and track, and the Held chip on the label.
      setup: themed(
        both(
          slidingHero,
          noAgentChanges,
          onCanvas({ select: ['webapp/home/hero'] }),
          heldMidway,
          readyWhen('[data-capture-held] [data-held-chip]'),
        ),
      ),
    },
    {
      section: 'motion-ended',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // An animated hero that ran to its end on its own clock: the Motion
      // section reads Play at its end time, with the track full.
      setup: themed(
        both(
          slidingHero,
          noAgentChanges,
          onCanvas({ select: ['webapp/home/hero'] }),
          slideFinished,
          readyWhen(
            'section[aria-labelledby="inspector-motion"] button[aria-label="Play"]',
          ),
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
      // The one-frame Export tab at its 2x and Both themes default, the
      // Name field on the frame's name over one line per file.
      setup: themed(
        both(
          onCanvas({ select: ['webapp/home/hero'] }),
          inspectorTab('Export'),
          exportInView,
          readyWhen(`[${EXPORT_IN_VIEW}]`),
        ),
      ),
    },
    {
      section: 'export-element',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // The hero's headline selected, its Export tab named for the frame
      // and the element.
      setup: themed(
        both(
          headlineOnHero,
          inspectorTab('Export'),
          exportInView,
          readyWhen(`[${EXPORT_IN_VIEW}]`),
        ),
      ),
    },
    {
      section: 'export-filmstrip',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // An animated hero's Export tab, the filmstrip under the frame's
      // own Export and over Open on a phone.
      setup: themed(
        both(
          slidingHero,
          noAgentChanges,
          onCanvas({ select: ['webapp/home/hero'] }),
          inspectorTab('Export'),
          readyWhen('#inspector-filmstrip'),
        ),
      ),
    },
    {
      section: 'export-none',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // Two frames on the Export tab, which says one exports at a time.
      setup: themed(
        both(
          onCanvas({ select: ['webapp/home/hero', 'webapp/home/about'] }),
          inspectorTab('Export'),
          readyWhen('[data-inspector] [role="tabpanel"] p'),
        ),
      ),
    },
    {
      section: 'slides-element',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // The hero's headline on the Slides tab: the frame's crumb, then its
      // step, This slide, and Page.
      setup: themed(
        both(
          headlineOnHero,
          inspectorTab('Slides'),
          readyWhen('[aria-labelledby="inspector-step"]'),
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
  ]
}
