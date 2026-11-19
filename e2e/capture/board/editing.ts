import { type Page } from '@playwright/test'

import type { ServerMessage } from '@/shared/live-messages'
import type { ListResult } from '@/shared/records/list'

import type { CaptureCase } from '../types'
import {
  type ProbedElement,
  probeFrames,
  type ProbeWindow,
} from './frame-probe'
import {
  actWhen,
  asWriter,
  AVATAR,
  both,
  elementInFrame,
  focusOnLoad,
  headlineOnHero,
  onCanvas,
  PRESS_FRAMES,
  pressOnLoad,
  readyWhen,
  ROW_FRAMES,
  STATE_ONLY,
  themedFor,
  WRITES_GRANTED,
} from './setup'

/**
 * Serves the hero with a Free 160 by 120 box at `left` in its 1440 px width,
 * added to the bytes on the way to the tab, so the fixture on disk never
 * holds it and the frame keeps the hash its file stamps.
 */
function freeBoxOnHero(left: number): (page: Page) => Promise<void> {
  return async (page) => {
    await page.route('**/frames/webapp/home/hero.html*', async (route) => {
      const response = await route.fetch()
      const box = `<div data-name="Box" style="position: absolute; left: ${left}px; top: 300px; width: 160px; height: 120px; background: var(--primary)"></div>`
      await route.fulfill({
        response,
        body: (await response.text()).replace('</body>', `${box}</body>`),
      })
    })
  }
}

/**
 * Selects the first element matching `selectors` in the frame `ref` as
 * `elementInFrame` does, then Shift-clicks each of the rest once the one before
 * draws its outline, and marks the page once all of them draw.
 */
export function elementsInFrame(
  ref: string,
  selectors: readonly string[],
): (page: Page) => Promise<void> {
  return async (page) => {
    await probeFrames(page, [...selectors], PRESS_FRAMES)
    await page.addInitScript(
      ({ owner, targets, frames }) => {
        if (window !== window.top) return
        const { frameReport } = window as unknown as ProbeWindow
        let left = frames
        let picked = 0
        const pick = () => {
          const shown = document.querySelector(`[data-frame="${owner}"]`)
          const iframe = shown?.querySelector('iframe')
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
          const drawn = document.querySelectorAll(
            '[data-element-selection]',
          ).length
          if (drawn === targets.length) {
            document.documentElement.setAttribute('data-elements-picked', '')
            return
          }
          const target = targets[picked]
          const element =
            target && drawn === picked && iframe?.dataset.renderedAt
              ? frameReport(iframe)?.elements[target]
              : null
          if (shown && element && hit && layer && decoded) {
            const k = Number(layer.style.getPropertyValue('--zoom') || 1)
            const frame = shown.getBoundingClientRect()
            const inner = element
            const at = {
              bubbles: true,
              cancelable: true,
              view: window,
              shiftKey: picked > 0,
              clientX: frame.left + (inner.left + inner.width / 2) * k,
              clientY: frame.top + (inner.top + inner.height / 2) * k,
            }
            hit.dispatchEvent(new MouseEvent('mousedown', at))
            window.dispatchEvent(new MouseEvent('mouseup', at))
            if (picked === 0) hit.dispatchEvent(new MouseEvent('dblclick', at))
            picked += 1
          }
          if (--left > 0) requestAnimationFrame(pick)
          else console.error(`Never picked ${targets.join(', ')} on ${owner}`)
        }
        document.addEventListener('DOMContentLoaded', pick)
      },
      { owner: ref, targets: selectors, frames: PRESS_FRAMES },
    )
  }
}

/**
 * Holds a marquee mid-drag inside the frame `ref`, once it is selected, from
 * a point on its bare body up over what it holds, which outlines what it touches.
 */
function innerMarqueeHeld(ref: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ owner, frames }) => {
        let left = frames
        // The press reads the frame's tree, so it waits on that answer being read.
        let treeRead = false
        const elements = `/api/frames/elements?ref=${encodeURIComponent(owner)}`
        const sent = window.fetch.bind(window)
        window.fetch = async (...args) => {
          const answer = await sent(...args)
          if (String(args[0]).includes(elements)) {
            void answer
              .clone()
              .text()
              .then(() => {
                treeRead = true
              })
          }
          return answer
        }
        const run = () => {
          const shown = document.querySelector(`[data-frame="${owner}"]`)
          const hit = document.querySelector('[data-hit-layer]')
          const layer = document.querySelector<HTMLElement>('[data-layer]')
          const iframe = shown?.querySelector('iframe')
          if (
            !shown ||
            !hit ||
            !layer ||
            !iframe?.dataset.renderedAt ||
            !treeRead ||
            !document.querySelector('[data-overlay]')
          ) {
            if (--left > 0) requestAnimationFrame(run)
            else console.error(`No selected ${owner} to marquee inside`)
            return
          }
          const box = shown.getBoundingClientRect()
          const send = (
            target: EventTarget,
            type: string,
            clientX: number,
            clientY: number,
          ) =>
            target.dispatchEvent(
              new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX,
                clientY,
              }),
            )
          const startX = box.left + box.width * 0.7
          const startY = box.bottom - 12
          // The frame answers whether the press is on its bare body, then the marquee's boxes, so the drag moves again each frame until both have.
          let moves = 60
          const drag = () => {
            send(window, 'mousemove', startX - 10, startY - 20)
            send(
              window,
              'mousemove',
              box.left + box.width * 0.2,
              box.top + box.height * 0.3,
            )
            const drawn =
              document.querySelector('[data-marquee]:not([hidden])') &&
              document.querySelector('[data-marquee-hits] > *')
            if (drawn) {
              document.documentElement.setAttribute('data-marquee-held', '')
            } else if (--moves > 0) {
              requestAnimationFrame(drag)
            } else {
              console.error(`No marquee drew inside ${owner}`)
            }
          }
          // The store takes the tree a frame after the answer is read.
          requestAnimationFrame(() => {
            send(hit, 'mousedown', startX, startY)
            requestAnimationFrame(drag)
          })
        }
        document.addEventListener('DOMContentLoaded', () =>
          requestAnimationFrame(run),
        )
      },
      { owner: ref, frames: PRESS_FRAMES },
    )
  }
}

/**
 * Holds an Ellipse drag mid-way in `ref`'s body so the preview draws, never
 * released, so nothing is placed.
 */
function ellipseHeld(ref: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ owner, frames }) => {
        let left = frames
        const run = () => {
          const iframe = document.querySelector<HTMLIFrameElement>(
            `[data-frame="${owner}"] iframe`,
          )
          const hit = document.querySelector('[data-hit-layer]')
          const armed = document.querySelector(
            '[aria-label="Tools"] button[aria-label="Ellipse"][aria-pressed="true"]',
          )
          // The Shapes menu lists each shape as a radio row.
          ;[...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
            .find((row) => row.textContent?.trim().startsWith('Ellipse'))
            ?.click()
          if (!iframe?.dataset.renderedAt || !hit || !armed) {
            if (--left > 0) requestAnimationFrame(run)
            else console.error(`No Ellipse tool over ${owner} to drag`)
            return
          }
          const box = iframe.getBoundingClientRect()
          const at = (x: number, y: number) => ({
            bubbles: true,
            cancelable: true,
            view: window,
            button: 0,
            clientX: box.left + box.width * x,
            clientY: box.top + box.height * y,
          })
          hit.dispatchEvent(new PointerEvent('pointerdown', at(0.4, 0.45)))
          window.dispatchEvent(new PointerEvent('pointermove', at(0.5, 0.55)))
          window.dispatchEvent(new PointerEvent('pointermove', at(0.62, 0.7)))
        }
        document.addEventListener('DOMContentLoaded', () =>
          requestAnimationFrame(run),
        )
      },
      { owner: ref, frames: PRESS_FRAMES },
    )
  }
}

/**
 * Opens `ref`'s headline and types a second line, holding the write back so
 * the served board keeps its bytes whatever ends the edit.
 */
function textLinesHeld(ref: string): (page: Page) => Promise<void> {
  return async (page) => {
    await probeFrames(page, ['h1'], PRESS_FRAMES)
    await page.addInitScript(
      ({ owner, frames }) => {
        if (window !== window.top) return
        const { frameReport, frameAct } = window as unknown as ProbeWindow
        let left = frames
        const sent = window.fetch.bind(window)
        window.fetch = (...args) =>
          String(args[0]).includes('/api/frames/edit')
            ? new Promise<Response>(() => {})
            : sent(...args)
        const iframe = () =>
          document.querySelector<HTMLIFrameElement>(
            `[data-frame="${owner}"] iframe`,
          )
        const doubleClick = (own: ProbedElement, width: number) => {
          const frame = iframe()
          const hit = document.querySelector('[data-hit-layer]')
          if (!frame || !hit) return
          const box = frame.getBoundingClientRect()
          const k = box.width / (width || box.width)
          const clientX = box.left + (own.left + own.width / 2) * k
          const clientY = box.top + (own.top + own.height / 2) * k
          const send = (type: string, detail: number) =>
            (type === 'mouseup' ? window : hit).dispatchEvent(
              new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX,
                clientY,
                detail,
              }),
            )
          for (const detail of [1, 2]) {
            send('mousedown', detail)
            send('mouseup', detail)
            send('click', detail)
          }
          send('dblclick', 2)
        }
        let asked = 0
        let typed = false
        const run = () => {
          const frame = iframe()
          const report = frame ? frameReport(frame) : null
          const heading = report?.elements.h1
          if (frame && report && heading && frame.dataset.renderedAt) {
            // The frame types in its own page, so the shot waits for the line.
            if (typed && heading.text.includes('Ship it')) {
              document.documentElement.setAttribute('data-text-lines-held', '')
              return
            }
            if (heading.editing && !typed) {
              frameAct(frame, { type: 'h1', text: 'Ship it' })
              typed = true
            } else if (!heading.editing && asked++ % 60 === 0) {
              // The pick waits on the frame's tree, so the press repeats slowly.
              doubleClick(heading, report.width)
            }
          }
          if (--left > 0) requestAnimationFrame(run)
          else console.error(`No headline in ${owner} opened for typing`)
        }
        document.addEventListener('DOMContentLoaded', () =>
          requestAnimationFrame(run),
        )
      },
      { owner: ref, frames: PRESS_FRAMES },
    )
  }
}

/**
 * Serves hero with words around its caption's `code`, rewriting the bytes in
 * flight, which adds text nodes alone so every tree index holds.
 */
async function wordsAroundCommandOnHero(page: Page): Promise<void> {
  await page.route('**/frames/webapp/home/hero.html*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: (await response.text())
        .replace(
          '<p data-name="Caption"><code',
          '<p data-name="Caption">Run <code',
        )
        .replace(
          'frameboard serve</code></p>',
          'frameboard serve</code> to start a board</p>',
        ),
    })
  })
}

const CAPTION = '[data-name="Caption"]'

/**
 * Double-clicks the words after `ref`'s caption command, holding the write
 * back so the edit stays open on that run with its words selected.
 */
function textRunHeld(ref: string): (page: Page) => Promise<void> {
  return async (page) => {
    await probeFrames(page, [CAPTION], PRESS_FRAMES)
    await page.addInitScript(
      ({ owner, frames, caption: named }) => {
        if (window !== window.top) return
        const { frameReport } = window as unknown as ProbeWindow
        let left = frames
        const sent = window.fetch.bind(window)
        window.fetch = (...args) =>
          String(args[0]).includes('/api/frames/edit')
            ? new Promise<Response>(() => {})
            : sent(...args)
        const iframe = () =>
          document.querySelector<HTMLIFrameElement>(
            `[data-frame="${owner}"] iframe`,
          )
        const doubleClick = (
          own: { left: number; top: number; width: number; height: number },
          width: number,
        ) => {
          const frame = iframe()
          const hit = document.querySelector('[data-hit-layer]')
          if (!frame || !hit) return
          const box = frame.getBoundingClientRect()
          const k = box.width / (width || box.width)
          const clientX = box.left + (own.left + own.width / 2) * k
          const clientY = box.top + (own.top + own.height / 2) * k
          const send = (type: string, detail: number) =>
            (type === 'mouseup' ? window : hit).dispatchEvent(
              new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX,
                clientY,
                detail,
              }),
            )
          for (const detail of [1, 2]) {
            send('mousedown', detail)
            send('mouseup', detail)
            send('click', detail)
          }
          send('dblclick', 2)
        }
        let asked = 0
        const run = () => {
          const frame = iframe()
          const report = frame ? frameReport(frame) : null
          const caption = report?.elements[named]
          const after = caption?.lastRun
          if (frame?.dataset.renderedAt && report && caption && after) {
            if (caption.editing) {
              document.documentElement.setAttribute('data-text-run-held', '')
              return
            }
            // The pick waits on the frame's tree, so the press repeats slowly.
            if (asked++ % 60 === 0) doubleClick(after, report.width)
          }
          if (--left > 0) requestAnimationFrame(run)
          else console.error(`No caption run in ${owner} opened for typing`)
        }
        document.addEventListener('DOMContentLoaded', () =>
          requestAnimationFrame(run),
        )
      },
      { owner: ref, frames: PRESS_FRAMES, caption: CAPTION },
    )
  }
}

/**
 * Serves hero with its headline placed Free, rewriting the bytes in flight so
 * the headline keeps its tree index and a pick still selects it.
 */
async function freeHeadlineOnHero(page: Page): Promise<void> {
  await page.route('**/frames/webapp/home/hero.html*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        '<h1 data-name="Headline">',
        '<h1 data-name="Headline" style="position: absolute; left: 100px; top: 300px; margin: 0">',
      ),
    })
  })
}

/**
 * Drops hero's Free headline and answers the write as landed on the shown
 * bytes, so no reload comes and the outline holds at the drop.
 */
async function freeDragReleased(page: Page): Promise<void> {
  await page.route('**/api/frames/edit', async (route) => {
    const { ref, index, hash } = route.request().postDataJSON() as {
      ref: string
      index: number
      hash: string
    }
    await route.fulfill({ json: { ok: true, data: { ref, index, hash } } })
  })
  await probeFrames(page, ['h1'], PRESS_FRAMES)
  await page.addInitScript((frames) => {
    if (window !== window.top) return
    const { frameReport } = window as unknown as ProbeWindow
    let left = frames
    const send = (
      target: EventTarget | null,
      type: string,
      x: number,
      y: number,
    ) =>
      target?.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y,
        }),
      )
    const drag = (x: number, y: number, k: number) => {
      const hit = document.querySelector('[data-hit-layer]')
      send(hit, 'mousedown', x, y)
      for (let step = 1; step <= 8; step += 1) {
        send(
          window,
          'mousemove',
          x + (200 * k * step) / 8,
          y + (100 * k * step) / 8,
        )
      }
      send(window, 'mouseup', x + 200 * k, y + 100 * k)
      document.documentElement.setAttribute('data-free-dropped', '')
    }
    const run = () => {
      const hero = document.querySelector('[data-frame="webapp/home/hero"]')
      const iframe = hero?.querySelector('iframe')
      const box = iframe?.dataset.renderedAt
        ? frameReport(iframe)?.elements.h1
        : null
      const hit = document.querySelector('[data-hit-layer]')
      const layer = document.querySelector<HTMLElement>('[data-layer]')
      // The element's X field, which enables once the server grants writes.
      const writable = document.querySelector<HTMLInputElement>(
        'input[aria-label^="X position"]',
      )
      if (!hero || !box || !hit || !layer) {
        if (--left > 0) requestAnimationFrame(run)
        else console.error('No Free headline on the hero to drag')
        return
      }
      const k = Number(layer.style.getPropertyValue('--zoom') || 1)
      const frame = hero.getBoundingClientRect()
      const inner = box
      const x = frame.left + (inner.left + inner.width / 2) * k
      const y = frame.top + (inner.top + inner.height / 2) * k
      const outline = document.querySelector('[data-element-selection]')
      if (!outline) {
        send(hit, 'mousedown', x, y)
        send(window, 'mouseup', x, y)
        send(hit, 'dblclick', x, y)
      }
      // The drag needs the outline drawn and the tab granted writes.
      if (outline && writable && !writable.disabled) drag(x, y, k)
      else if (--left > 0) requestAnimationFrame(run)
      else console.error('The Free headline never took a drag')
    }
    document.addEventListener('DOMContentLoaded', () =>
      requestAnimationFrame(run),
    )
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
 * Selects hero's Headline and Shift-clicks the Command in Layers, leaving the
 * Caption between them unselected.
 */
async function twoLayersSelected(page: Page): Promise<void> {
  await page.addInitScript((frames) => {
    let left = frames
    const row = (name: string) =>
      [
        ...document.querySelectorAll<HTMLButtonElement>(
          'ul[aria-label="Elements of hero"] button:not([aria-label])',
        ),
      ].find((button) => button.textContent?.trim() === name)
    const run = () => {
      const open = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Show the elements of hero"]',
      )
      const headline = row('Headline')
      const command = row('Command')
      if (headline && command) {
        headline.click()
        command.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            shiftKey: true,
          }),
        )
        return
      }
      const caption = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Show what Caption holds"]',
      )
      if (open?.getAttribute('aria-expanded') === 'false') open.click()
      else if (caption?.getAttribute('aria-expanded') === 'false') {
        caption.click()
      }
      if (--left > 0) requestAnimationFrame(run)
      else console.error("hero's element rows never drew")
    }
    document.addEventListener('DOMContentLoaded', run)
  }, ROW_FRAMES)
}

/**
 * Focuses hero's Layers row once it draws, after a pointer press when
 * `pointer` is set and with no press otherwise, so the shot shows the ring a
 * keyboard reaches and the ringless row a click leaves.
 */
function focusHeroRow(pointer: boolean): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ pointer, frames }) => {
        let left = frames
        const run = () => {
          const row = document.querySelector<HTMLButtonElement>(
            'button[aria-label="Select hero"]',
          )
          if (!row) {
            if (--left > 0) requestAnimationFrame(run)
            else console.error("hero's Layers row never drew")
            return
          }
          if (pointer) {
            window.dispatchEvent(new PointerEvent('pointerdown'))
          }
          row.focus()
        }
        document.addEventListener('DOMContentLoaded', run)
      },
      { pointer, frames: ROW_FRAMES },
    )
  }
}

/**
 * Draws webapp/home with one section around hero and about, by adding it to
 * every board the server sends, so the tracked fixture holds no section.
 */
async function sectionOnHome(page: Page): Promise<void> {
  const onboarding = {
    name: 'onboarding',
    box: { x: -40, y: -200, width: 1990, height: 1140 },
    order: 0,
    frames: ['hero', 'about'],
  }
  await page.routeWebSocket('**/api/live', (socket) => {
    const server = socket.connectToServer()
    server.onMessage((message) => {
      const parsed = JSON.parse(String(message)) as ServerMessage
      if (parsed.type !== 'board') {
        socket.send(message)
        return
      }
      const projects = parsed.data.projects.map((project) => ({
        ...project,
        pages: project.pages.map((shown) =>
          shown.ref === 'webapp/home'
            ? { ...shown, sections: [onboarding] }
            : shown,
        ),
      }))
      socket.send(
        JSON.stringify({ ...parsed, data: { ...parsed.data, projects } }),
      )
    })
    socket.onMessage((message) => server.send(message))
  })
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

export function editingCases(theme: 'light' | 'dark'): CaptureCase[] {
  const themed = themedFor(theme)
  return [
    {
      section: 'marquee',
      theme,
      route: '/p/webapp/home',
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // From above the hero's left edge to inside the about frame.
      setup: themed(onCanvas({ hold: { from: [-60, -80], to: [1700, 400] } })),
    },
    {
      // The same drag as the marquee above, cancelled with the button down.
      section: 'marquee-cancelled',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        onCanvas({
          hold: { from: [-60, -80], to: [1700, 400] },
          cancel: true,
        }),
      ),
    },
    {
      // An Ellipse held mid-drag in the hero, drawn in the fill it lands in.
      section: 'shape-draft',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          pressOnLoad('^Shapes$'),
          ellipseHeld('webapp/home/hero'),
          readyWhen('[data-shape-draft]'),
        ),
      ),
    },
    {
      // The hero's headline opened by one double-click, a line added with Enter.
      section: 'text-edit-lines',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          textLinesHeld('webapp/home/hero'),
          readyWhen('[data-text-lines-held]'),
        ),
      ),
    },
    {
      // The words after the caption's command opened by one double-click, the command left shut.
      section: 'text-edit-run',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          wordsAroundCommandOnHero,
          textRunHeld('webapp/home/hero'),
          readyWhen('[data-text-run-held]'),
        ),
      ),
    },
    {
      // A section dragged by its name, then put back with the button down.
      section: 'section-move-cancelled',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          sectionOnHome,
          onCanvas({
            select: ['webapp/home/hero'],
            awaitWrite: true,
            hold: { from: [-30, -190], to: [90, -110] },
            cancel: true,
          }),
          readyWhen('[data-section="onboarding"]'),
        ),
      ),
    },
    {
      section: 'snap',
      theme,
      route: '/p/webapp/home',
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // Hero lands 3 px below about's top, so it snaps and draws the guide.
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
      // An arrow key moved the Decoration row's focus ring off its lit button.
      section: 'segmented-focus',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          headlineOnHero,
          actWhen(
            'button[aria-label="Type details"]:not([disabled])',
            'Type details',
            'click',
          ),
          focusOnLoad(
            '[aria-labelledby="type-details-decoration"] button',
            'ArrowRight',
          ),
          readyWhen(
            '[aria-labelledby="type-details-decoration"] button:nth-child(2):focus-visible',
            // The first button's tooltip, still closing, would overlap the second's.
            '[data-slot="tooltip-content"][data-closed]',
          ),
        ),
      ),
    },
    {
      // Focus on the Play half opens its tooltip, naming the P key.
      section: 'mode-tooltip',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          focusOnLoad('button[aria-pressed]:has(.lucide-play)'),
          readyWhen('[data-slot="tooltip-content"]'),
        ),
      ),
    },
    {
      // A Free headline dragged and released, its outline and size chip held at the drop.
      section: 'free-drag-held',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          freeHeadlineOnHero,
          freeDragReleased,
          readyWhen('[data-free-dropped]'),
        ),
      ),
    },
    {
      // A container wears its four marks, as a shape does.
      section: 'corner-marks-container',
      theme,
      route: '/p/marketing/states',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          elementInFrame('marketing/states/free', '[data-name="Column"]', true),
          readyWhen('[data-element-selection]'),
        ),
      ),
    },
    ...(
      [
        // Text wearing its marks, its chip naming the height as hugging.
        ['corner-marks-text', 'free', '[data-name="Free text"]'],
        // An image and a video wearing their marks, both sides in px.
        ['corner-marks-image', 'free', '[data-name="Free image"]'],
        ['corner-marks-video', 'free', '[data-name="Free video"]'],
        // A shape keeps its marks and its size.
        ['corner-marks-shape', 'free', '[data-name="Free shape"]'],
        // Text at the width a corner writes, wrapping with its height hugging.
        ['corner-resized-text', 'sized', '[data-name="Sized text"]'],
        // An image and a video at the size a corner writes, stating both sides.
        ['corner-resized-image', 'sized', '[data-name="Sized image"]'],
        ['corner-resized-video', 'sized', '[data-name="Sized video"]'],
      ] as const
    ).map(([section, frame, target]) => ({
      section,
      theme,
      route: '/p/marketing/states',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          elementInFrame(`marketing/states/${frame}`, target),
          readyWhen('[data-element-selection]'),
        ),
      ),
    })),
    ...(
      [
        // A video wearing the media bar inside its bottom edge, the Video section and its four switches in the inspector.
        ['media-video', '[data-name="Free video"]'],
        // An audio player wearing the bar under it, the section named Audio with no Controls switch.
        ['media-audio', '[data-name="Free audio"]'],
      ] as const
    ).map(([section, target]) => ({
      section,
      theme,
      route: '/p/marketing/states',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          elementInFrame('marketing/states/free', target),
          readyWhen('[data-media-bar]'),
        ),
      ),
    })),
    ...(
      [
        // Text, a shape, and an image: Mixed sizes, Typography 1 of 3, Fill 2 of 3.
        [
          'multi-elements',
          [
            '[data-name="Free text"]',
            '[data-name="Free shape"]',
            '[data-name="Free image"]',
          ],
        ],
        // An image and a video sharing one size, with no type or fill to count.
        [
          'multi-elements-shared',
          ['[data-name="Free image"]', '[data-name="Free video"]'],
        ],
      ] as const
    ).map(([section, targets]) => ({
      section,
      theme,
      route: '/p/marketing/states',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          elementsInFrame('marketing/states/free', targets),
          readyWhen('[data-elements-picked]'),
        ),
      ),
    })),
    {
      // A marquee held mid-drag inside the selected frame, what it touches outlined.
      section: 'multi-elements-marquee',
      theme,
      route: '/p/marketing/states',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          onCanvas({ select: ['marketing/states/free'] }),
          innerMarqueeHeld('marketing/states/free'),
          readyWhen('[data-marquee-held]'),
        ),
      ),
    },
    {
      // A Free box running 60 px past the hero's right edge, ghosted there while the hero is selected.
      section: 'free-drag-ghost',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          freeBoxOnHero(1340),
          onCanvas({ select: ['webapp/home/hero'] }),
          readyWhen('[data-element-ghost]'),
        ),
      ),
    },
    {
      // A section around both frames, its box on the canvas and its row in Layers.
      section: 'sections',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(sectionOnHome, readyWhen('[data-section="onboarding"]')),
      ),
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
      // Two of hero's elements selected, the Caption between them and the frame row untinted.
      section: 'layers-selected',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          twoLayersSelected,
          readyWhen(
            'ul[aria-label="Elements of hero"] li:has([aria-current="true"]) ~ li:has([aria-current="true"])',
          ),
        ),
      ),
    },
    {
      // Hero's row focused with no pointer press, so it draws the keyboard ring.
      section: 'focus-ring-keyboard',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          focusHeroRow(false),
          readyWhen('button[aria-label="Select hero"]:focus-visible'),
        ),
      ),
    },
    {
      // Hero's row focused after a pointer press, so it carries the mark and draws no ring.
      section: 'focus-ring-clicked',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          focusHeroRow(true),
          readyWhen('button[aria-label="Select hero"][data-pointer-focus]'),
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
          readyWhen('[data-notes-layer] input[aria-label="Rename frame hero"]'),
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
  ]
}
