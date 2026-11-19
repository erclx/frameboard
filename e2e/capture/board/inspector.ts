import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'

import { type Page } from '@playwright/test'

import { VIEWER_SCRIPT } from '@/server/edit/insert'
import { shippedViewerPath } from '@/server/models/viewer'
import { VIEWER_FILE } from '@/shared/model-viewer'
import type { ListResult } from '@/shared/records/list'

import type { CaptureCase } from '../types'
import { probeFrames, type ProbeWindow } from './frame-probe'
import {
  asWriter,
  AVATAR,
  both,
  chooseOnLoad,
  elementInFrame,
  focusOnLoad,
  headlineOnHero,
  inspectorTab,
  LIVE_BOARD,
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
  themedFor,
} from './setup'

/**
 * Drops color tokens from the token read, filtered in the page's `fetch`, since
 * a route fetching the real answer waits behind the held `readyWhen` route.
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
  '../../../test/fixtures/frames/slide.html',
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
 * Serves hero with its headline tilted, so the inspector draws the 3D section
 * filled and the Rotation row off, and puts the file back once the page closes.
 */
async function tiltedHero(page: Page): Promise<void> {
  const path = join(SERVED_BOARD, 'webapp/home/hero.html')
  const original = readFileSync(path, 'utf8')
  writeFileSync(
    path,
    original.replace(
      '<h1 data-name="Headline">',
      // A gentle turn, since the headline spans the frame and a steep rotateY throws its near edge off it.
      '<h1 data-name="Headline" style="transform: perspective(800px) rotateX(20deg) rotateY(-8deg)">',
    ),
  )
  page.once('close', () => writeFileSync(path, original))
}

/** The Model section once the viewer lists its clip, which it does only after the model draws. */
const MODEL_READ =
  'section[aria-labelledby="inspector-model"] button[aria-label="Clip"]:not(:disabled)'

/**
 * Serves hero with a model whose clip never plays, restoring hero on close.
 * Its files stay in the project's assets, since removing the folder reloads
 * the next case's page, so these cases run last among the writing ones.
 */
async function modelOnHero(page: Page): Promise<void> {
  const path = join(SERVED_BOARD, 'webapp/home/hero.html')
  const assets = join(SERVED_BOARD, 'webapp/assets')
  const original = readFileSync(path, 'utf8')
  if (!existsSync(join(assets, VIEWER_FILE))) {
    mkdirSync(assets, { recursive: true })
    copyFileSync(
      resolve('test/fixtures/models/spin.glb'),
      join(assets, 'spin.glb'),
    )
    copyFileSync(shippedViewerPath(), join(assets, VIEWER_FILE))
  }
  writeFileSync(
    path,
    original
      .replace('</head>', `  ${VIEWER_SCRIPT}\n  </head>`)
      .replace(
        '</h1>',
        '</h1>\n    <model-viewer data-name="spin.glb" src="../assets/spin.glb" alt="" camera-orbit="-40deg 75deg auto" max-camera-orbit="auto auto auto" style="display: block; width: 240px; height: 180px"></model-viewer>',
      ),
  )
  page.once('close', () => writeFileSync(path, original))
}

/**
 * Double-clicks hero's model until the board selects it. A pick waits on its
 * frame's element tree, and one made before the server has read hero's new
 * bytes selects nothing, so the press repeats rather than trusting one.
 */
async function modelSelected(page: Page): Promise<void> {
  await probeFrames(page, ['model-viewer'], PRESS_FRAMES)
  await page.addInitScript(
    ({ frames, gap }) => {
      if (window !== window.top) return
      const { frameReport } = window as unknown as ProbeWindow
      let left = frames
      let wait = 0
      const pick = () => {
        if (document.querySelector('[data-element-selection]')) return
        if (--left <= 0) {
          console.error('No model on webapp/home/hero to select')
          return
        }
        requestAnimationFrame(pick)
        if (--wait > 0) return
        const shown = document.querySelector('[data-frame="webapp/home/hero"]')
        const iframe = shown?.querySelector('iframe')
        const model = iframe?.dataset.renderedAt
          ? frameReport(iframe)?.elements['model-viewer']
          : null
        const hit = document.querySelector('[data-hit-layer]')
        const layer = [
          ...document.querySelectorAll<HTMLElement>('[data-layer]'),
        ].find((each) => each.checkVisibility())
        if (!shown || !model || !hit || !layer) return
        if (layer.hasAttribute('data-staging')) return
        wait = gap
        const k = Number(layer.style.getPropertyValue('--zoom') || 1)
        const frame = shown.getBoundingClientRect()
        const inner = model
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
    },
    // Two seconds between presses, past the time a pick takes to land.
    { frames: PRESS_FRAMES, gap: 120 },
  )
}

/**
 * Double-clicks the selected model once its section reads it, which enters
 * turn mode as a second double-click on the canvas does.
 */
async function turningModel(page: Page): Promise<void> {
  await page.addInitScript(
    ({ frames, read }) => {
      let left = frames
      const turn = () => {
        const outline = document.querySelector('[data-element-selection]')
        const hit = document.querySelector('[data-hit-layer]')
        if (!document.querySelector(read) || !outline || !hit) {
          if (--left > 0) requestAnimationFrame(turn)
          else console.error('No selected model to turn')
          return
        }
        const box = outline.getBoundingClientRect()
        const at = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: box.left + box.width / 2,
          clientY: box.top + box.height / 2,
        }
        hit.dispatchEvent(new MouseEvent('mousedown', at))
        window.dispatchEvent(new MouseEvent('mouseup', at))
        hit.dispatchEvent(new MouseEvent('dblclick', at))
      }
      document.addEventListener('DOMContentLoaded', turn)
    },
    { frames: PRESS_FRAMES, read: MODEL_READ },
  )
}

/**
 * Seeks the Motion track to its middle and marks the body once hero reads
 * paused there, since the Held chip draws before the seek lands.
 */
async function heldMidway(page: Page): Promise<void> {
  await probeFrames(page, [], PRESS_FRAMES)
  await page.addInitScript(
    ({ frames }) => {
      if (window !== window.top) return
      const { frameReport } = window as unknown as ProbeWindow
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
        const animation = hero ? frameReport(hero)?.animation : null
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
      // Run in the hero frame itself, which sits on its own port.
      if (window === window.top) return
      if (!location.pathname.endsWith('/webapp/home/hero.html')) return
      let left = frames
      const step = () => {
        const animations = document.getAnimations()
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
      ({ text, frames, live }) => {
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
          const button = document.querySelector(live)
            ? document.querySelector<HTMLButtonElement>(
                'button[aria-label="Search pages"]',
              )
            : null
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
      { text: query, frames: ROW_FRAMES, live: LIVE_BOARD },
    )
  }
}

/** Set on the root once `exportInView` has scrolled the inspector, for `readyWhen` to wait on. */
const EXPORT_IN_VIEW = 'data-capture-export-in-view'

/**
 * Scrolls Export's foot to the panel's foot on every frame, since a section
 * above it grows once its styles answer.
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
 * Writes `PLACED_TEXT` into the served hero until the page closes, on disk
 * since the pick refuses bytes the server's element tree does not vouch for.
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
 * Refocuses `selector` every frame until it holds for `HELD_FRAMES`, since a
 * selection or a remount drops a focus set once.
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
  const themed = themedFor(theme)
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
      // Every element section for hero's headline, once its styles answer.
      setup: themed(
        both(
          asWriter,
          headlineOnHero,
          readyWhen('#inspector-selection-colors ~ ul li'),
        ),
      ),
    },
    {
      section: 'element-tilt',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // Hero's headline tilted, its 3D section filled and its Rotation row off.
      setup: themed(
        both(
          tiltedHero,
          noAgentChanges,
          asWriter,
          headlineOnHero,
          // The section draws only for an element, and filled once the tilt is read.
          readyWhen(
            'body:has(#inspector-tilt):has(#inspector-selection-colors ~ ul li)',
          ),
        ),
      ),
    },
    {
      section: 'model-section',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // Hero's model selected, its Model section naming the file, the angle, and the clip.
      setup: themed(
        both(
          modelOnHero,
          noAgentChanges,
          asWriter,
          modelSelected,
          readyWhen(`body:has(${MODEL_READ})`),
        ),
      ),
    },
    {
      section: 'model-turning',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // The same model in turn mode, its chip under the frame.
      setup: themed(
        both(
          modelOnHero,
          noAgentChanges,
          asWriter,
          modelSelected,
          turningModel,
          readyWhen(`body:has(${MODEL_READ}):has([data-turn-surface])`),
        ),
      ),
    },
    {
      section: 'text-hugs',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      // Hero's write can raise a toast that comes and goes between runs.
      mask: [AVATAR, '[data-slot="toast"]'],
      // A Free-placed paragraph hugging its words beside a Text tool one.
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
      // With no token sheet, the raw indigo row reads plain with no swap.
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
      // Indigo equals primary in light alone, so only light offers `Use primary`.
      setup: themed(
        both(
          rawIndigoHero,
          noAgentChanges,
          asWriter,
          headlineOnHero,
          // Focus scrolls Selection colors into view and shows Select alone.
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
      // The stroke Add stroke writes is seeded, since pressing it blocked selection.
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
      // Hero held mid-slide, with the Held chip on its label.
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
      // Hero run to its end on its own clock, so Motion reads Play.
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
      // The one-frame Export tab at its defaults, one line per file.
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
      // The Export tab named for the frame and the selected headline.
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
      // An animated hero's Export tab with its filmstrip.
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
      // Hero's headline on the Slides tab.
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
