import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { type Page } from '@playwright/test'

import { type Pose, POSE_SIZES, POSES } from '@/shared/frame-device'
import type { ServerMessage } from '@/shared/live-messages'
import type { Finding } from '@/shared/records/check'

import type { CaptureCase } from '../types'
import {
  actWhen,
  asWriter,
  AVATAR,
  both,
  elementInFrame,
  inspectorTab,
  noAgentChanges,
  onCanvas,
  PRESS_FRAMES,
  pressOnLoad,
  readyWhen,
  ROW_FRAMES,
  SERVED_BOARD,
  STATE_ONLY,
  themedFor,
  webappKits,
} from './setup'

/**
 * Answers the phone link's start with one fixed link and its stop with
 * nothing to end, so the card's code reads the same on every machine and no
 * listener opens on the capture host's network.
 */
async function fixedPhoneLink(page: Page): Promise<void> {
  const token = 'Jq7c2xTnV0pL4hYd'
  await page.route('**/api/preview', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          json: {
            ok: true,
            data: {
              url: `http://192.168.1.24:4400/v/${token}/frames/webapp/home/hero.html`,
              address: '192.168.1.24',
              port: 4400,
              token,
              project: 'webapp',
              ref: 'webapp/home/hero',
            },
          },
        })
      : route.fulfill({ json: { ok: true, data: { stopped: false } } }),
  )
}

/** Clicks the Export tab's Open on a phone button once a writing tab enables it. */
async function openPhoneLink(page: Page): Promise<void> {
  await page.addInitScript((frames) => {
    let left = frames
    const open = () => {
      const button = [
        ...document.querySelectorAll<HTMLButtonElement>('button'),
      ].find(
        (candidate) =>
          candidate.textContent?.trim() === 'Open on a phone' &&
          !candidate.disabled,
      )
      if (button) button.click()
      else if (--left > 0) requestAnimationFrame(open)
      else console.error('Open on a phone never lit')
    }
    document.addEventListener('DOMContentLoaded', open)
  }, ROW_FRAMES)
}

/**
 * Holds the about frame at a phone screen over a page four screens long, so
 * the selected frame draws its scroll rail, restoring both files once the
 * page closes, since a later case shows the frame at its own height.
 */
async function aboutScrolling(page: Page): Promise<void> {
  const layoutPath = join(SERVED_BOARD, 'webapp/home/layout.json')
  const htmlPath = join(SERVED_BOARD, 'webapp/home/about.html')
  const originalLayout = readFileSync(layoutPath, 'utf8')
  const originalHtml = readFileSync(htmlPath, 'utf8')
  const layout = JSON.parse(originalLayout)
  layout.frames.about.scroll = true
  writeFileSync(layoutPath, JSON.stringify(layout))
  writeFileSync(
    htmlPath,
    originalHtml.replace(
      '<h1>about</h1>',
      '<h1>about</h1><div style="height: 3200px"></div>',
    ),
  )
  page.once('close', () => {
    writeFileSync(layoutPath, originalLayout)
    writeFileSync(htmlPath, originalHtml)
  })
}

/**
 * Shows the device on the phone-sized about frame and the desktop hero, which
 * their widths draw as a phone and a laptop, putting the layout back when the
 * page closes.
 */
async function devicesShown(page: Page): Promise<void> {
  const layoutPath = join(SERVED_BOARD, 'webapp/home/layout.json')
  const originalLayout = readFileSync(layoutPath, 'utf8')
  const layout = JSON.parse(originalLayout)
  layout.frames.about.showDevice = true
  layout.frames.hero.showDevice = true
  writeFileSync(layoutPath, JSON.stringify(layout))
  page.once('close', () => {
    writeFileSync(layoutPath, originalLayout)
  })
}

/**
 * Shows the about frame as a phone as tall as its page, off Scroll, so
 * present mode and an entered Play frame show one screen of it.
 */
async function tallPhoneShown(page: Page): Promise<void> {
  const layoutPath = join(SERVED_BOARD, 'webapp/home/layout.json')
  const pagePath = join(SERVED_BOARD, 'webapp/home/about.html')
  const originalLayout = readFileSync(layoutPath, 'utf8')
  const originalPage = readFileSync(pagePath, 'utf8')
  const layout = JSON.parse(originalLayout)
  Object.assign(layout.frames.about, { showDevice: true, height: 2054 })
  writeFileSync(layoutPath, JSON.stringify(layout))
  writeFileSync(
    pagePath,
    originalPage.replace(
      '</body>',
      '<div style="height:1900px;background:linear-gradient(#e8eefc,#fce8f0)"></div></body>',
    ),
  )
  page.once('close', () => {
    writeFileSync(layoutPath, originalLayout)
    writeFileSync(pagePath, originalPage)
  })
}

/**
 * Shows the phone on the about frame with its wide island, putting the
 * layout back when the page closes.
 */
async function wideIslandShown(page: Page): Promise<void> {
  const layoutPath = join(SERVED_BOARD, 'webapp/home/layout.json')
  const originalLayout = readFileSync(layoutPath, 'utf8')
  const layout = JSON.parse(originalLayout)
  Object.assign(layout.frames.about, { showDevice: true, island: 'wide' })
  writeFileSync(layoutPath, JSON.stringify(layout))
  page.once('close', () => {
    writeFileSync(layoutPath, originalLayout)
  })
}

/**
 * Turns the about frame's phone left and the hero into a tablet turned left,
 * each at the box a turn writes, putting the layout back when the page closes.
 */
async function devicesTurned(page: Page): Promise<void> {
  const layoutPath = join(SERVED_BOARD, 'webapp/home/layout.json')
  const originalLayout = readFileSync(layoutPath, 'utf8')
  const layout = JSON.parse(originalLayout)
  Object.assign(layout.frames.about, {
    width: 844,
    height: 390,
    showDevice: true,
    turn: 'left',
    upright: { width: 390, height: 844 },
  })
  Object.assign(layout.frames.hero, {
    width: 1194,
    height: 834,
    showDevice: true,
    turn: 'left',
    upright: { width: 834, height: 1194 },
  })
  writeFileSync(layoutPath, JSON.stringify(layout))
  page.once('close', () => {
    writeFileSync(layoutPath, originalLayout)
  })
}

/**
 * Shows the about frame's phone with a tablet and a laptop width linked past
 * it, the hero hidden, so the row's three bodies fill the view.
 */
async function linkedDevicesShown(page: Page): Promise<void> {
  const layoutPath = join(SERVED_BOARD, 'webapp/home/layout.json')
  const originalLayout = readFileSync(layoutPath, 'utf8')
  const layout = JSON.parse(originalLayout)
  layout.frames.hero.hidden = true
  Object.assign(layout.frames.about, {
    showDevice: true,
    widths: [
      { width: 834, height: 1194 },
      { width: 1440, height: 900 },
    ],
  })
  writeFileSync(layoutPath, JSON.stringify(layout))
  page.once('close', () => {
    writeFileSync(layoutPath, originalLayout)
  })
}

/**
 * Shows the about frame's phone, upright at 390 by 844 or turned left at
 * the box a turn writes, with a page of rows running far past its box.
 */
function phoneOverflowing(turned: boolean): (page: Page) => Promise<void> {
  return async (page) => {
    const layoutPath = join(SERVED_BOARD, 'webapp/home/layout.json')
    const htmlPath = join(SERVED_BOARD, 'webapp/home/about.html')
    const originalLayout = readFileSync(layoutPath, 'utf8')
    const originalHtml = readFileSync(htmlPath, 'utf8')
    const layout = JSON.parse(originalLayout)
    Object.assign(
      layout.frames.about,
      turned
        ? {
            width: 844,
            height: 390,
            showDevice: true,
            turn: 'left',
            upright: { width: 390, height: 844 },
          }
        : { width: 390, height: 844, showDevice: true },
    )
    writeFileSync(layoutPath, JSON.stringify(layout))
    const row =
      '<section style="height:140px;margin:16px 0;box-shadow:inset 0 0 0 1px #d4d4d8"></section>'
    writeFileSync(
      htmlPath,
      originalHtml.replace(
        '<h1>about</h1>',
        `<h1>about</h1>${row.repeat(turned ? 6 : 8)}`,
      ),
    )
    page.once('close', () => {
      writeFileSync(layoutPath, originalLayout)
      writeFileSync(htmlPath, originalHtml)
    })
  }
}

/**
 * Shows the desktop hero inside its laptop with a page of rows running far
 * past the 900 tall box.
 */
async function laptopOverflowing(page: Page): Promise<void> {
  const layoutPath = join(SERVED_BOARD, 'webapp/home/layout.json')
  const htmlPath = join(SERVED_BOARD, 'webapp/home/hero.html')
  const originalLayout = readFileSync(layoutPath, 'utf8')
  const originalHtml = readFileSync(htmlPath, 'utf8')
  const layout = JSON.parse(originalLayout)
  layout.frames.hero.showDevice = true
  writeFileSync(layoutPath, JSON.stringify(layout))
  const row =
    '<section style="height:240px;margin:24px 0;box-shadow:inset 0 0 0 1px #d4d4d8"></section>'
  writeFileSync(
    htmlPath,
    originalHtml.replace(
      '<h1 data-name="Headline">hero</h1>',
      `<h1 data-name="Headline">hero</h1>${row.repeat(6)}`,
    ),
  )
  page.once('close', () => {
    writeFileSync(layoutPath, originalLayout)
    writeFileSync(htmlPath, originalHtml)
  })
}

/** A badge below a desktop frame's edge and a card crossing its right one. */
const PAST_EDGE = join(
  import.meta.dirname,
  '../../../scripts/lib/drive-past-edge.html',
)

/** Both pictures asked for, whose loading holds the page's own, beside the check's finding. */
const PAINTED_BOTH =
  'body:has([data-findings-badge="webapp/home/hero"]) div:has(> img[src^="/api/frames/png"]) + div > img[src^="/api/frames/png"]'

/**
 * Serves the past-edge page in the hero's place, with its clipping switched
 * off when `open`, putting both files back when the page closes.
 */
function heroPastEdge(open: boolean): (page: Page) => Promise<void> {
  return async (page) => {
    const layoutPath = join(SERVED_BOARD, 'webapp/home/layout.json')
    const htmlPath = join(SERVED_BOARD, 'webapp/home/hero.html')
    const originalLayout = readFileSync(layoutPath, 'utf8')
    const originalHtml = readFileSync(htmlPath, 'utf8')
    if (open) {
      const layout = JSON.parse(originalLayout)
      layout.frames.hero.showOverflow = true
      writeFileSync(layoutPath, JSON.stringify(layout))
    }
    writeFileSync(htmlPath, readFileSync(PAST_EDGE, 'utf8'))
    page.once('close', () => {
      writeFileSync(layoutPath, originalLayout)
      writeFileSync(htmlPath, originalHtml)
    })
  }
}

/**
 * Names the about frame a foldable in `pose`, at that pose's screen size, or
 * with its sides swapped when `turn` names a quarter turn, putting the layout
 * back when the page closes.
 */
function foldableShown(
  pose: Pose,
  turn?: 'left' | 'right',
): (page: Page) => Promise<void> {
  return async (page) => {
    const layoutPath = join(SERVED_BOARD, 'webapp/home/layout.json')
    const originalLayout = readFileSync(layoutPath, 'utf8')
    const layout = JSON.parse(originalLayout)
    const { width, height } = POSE_SIZES[pose]
    Object.assign(layout.frames.about, {
      ...(turn ? { width: height, height: width, turn } : { width, height }),
      showDevice: true,
      foldable: true,
      pose,
    })
    writeFileSync(layoutPath, JSON.stringify(layout))
    page.once('close', () => {
      writeFileSync(layoutPath, originalLayout)
    })
  }
}

/**
 * Presses `selector` with a whole pointer sequence once it renders, since a
 * menu trigger opens on the press, which a bare `click()` never sends.
 */
export function pointerPressOnLoad(
  selector: string,
): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ selector, frames }) => {
        let left = frames
        const press = () => {
          const target = document.querySelector<HTMLElement>(selector)
          if (!target || (target as HTMLButtonElement).disabled) {
            if (--left > 0) requestAnimationFrame(press)
            return
          }
          const init = { bubbles: true, cancelable: true, button: 0 }
          const pointer = { ...init, pointerType: 'mouse', isPrimary: true }
          target.dispatchEvent(new PointerEvent('pointerdown', pointer))
          target.dispatchEvent(new MouseEvent('mousedown', init))
          target.dispatchEvent(new PointerEvent('pointerup', pointer))
          target.dispatchEvent(new MouseEvent('mouseup', init))
          target.dispatchEvent(new MouseEvent('click', { ...init, detail: 1 }))
        }
        document.addEventListener('DOMContentLoaded', press)
      },
      { selector, frames: PRESS_FRAMES },
    )
  }
}

/** Sets the hero hugging its width, putting its layout back when the page closes. */
async function heroHugsWidth(page: Page): Promise<void> {
  const layoutPath = join(SERVED_BOARD, 'webapp/home/layout.json')
  const originalLayout = readFileSync(layoutPath, 'utf8')
  const layout = JSON.parse(originalLayout)
  layout.frames.hero.hugWidth = true
  writeFileSync(layoutPath, JSON.stringify(layout))
  page.once('close', () => {
    writeFileSync(layoutPath, originalLayout)
  })
}

/** Lists two linked widths on the hero, putting its layout back when the page closes. */
async function heroAtTwoWidths(page: Page): Promise<void> {
  const layoutPath = join(SERVED_BOARD, 'webapp/home/layout.json')
  const originalLayout = readFileSync(layoutPath, 'utf8')
  const layout = JSON.parse(originalLayout)
  layout.frames.hero.widths = [
    { width: 834, height: 1194 },
    { width: 390, height: 844 },
  ]
  writeFileSync(layoutPath, JSON.stringify(layout))
  page.once('close', () => {
    writeFileSync(layoutPath, originalLayout)
  })
}

/**
 * Sets a Push transition on the home page, so the Page section shows its
 * Direction and Duration rows, putting the layout back when the page closes.
 */
async function homePushes(page: Page): Promise<void> {
  const layoutPath = join(SERVED_BOARD, 'webapp/home/layout.json')
  const originalLayout = readFileSync(layoutPath, 'utf8')
  const layout = JSON.parse(originalLayout)
  layout.present = { transition: { name: 'push', ms: 500 } }
  writeFileSync(layoutPath, JSON.stringify(layout))
  page.once('close', () => writeFileSync(layoutPath, originalLayout))
}

/**
 * Gives hero a two-line speaker note, so it draws a strip while notes are
 * shown and a label mark while hidden, taking the layout back on close.
 */
async function heroHoldsNote(page: Page): Promise<void> {
  const layoutPath = join(SERVED_BOARD, 'webapp/home/layout.json')
  const originalLayout = readFileSync(layoutPath, 'utf8')
  const layout = JSON.parse(originalLayout)
  layout.frames.hero.speakerNotes =
    'Open on the price, then the plan picker.\nPause before the demo.'
  writeFileSync(layoutPath, JSON.stringify(layout))
  page.once('close', () => writeFileSync(layoutPath, originalLayout))
}

/** Turns the Notes button on before the board loads, so every frame draws its strip. */
async function notesShownOnLoad(page: Page): Promise<void> {
  await page.addInitScript(() =>
    localStorage.setItem('frameboard.speakerNotes', 'shown'),
  )
}

/**
 * Gives webapp a `wipe` transition of its own and sets it on the home page,
 * so the Page section's grid shows a project's tile after the built-ins,
 * taking the file and the layout back when the page closes.
 */
async function homeWipes(page: Page): Promise<void> {
  const folder = join(SERVED_BOARD, 'webapp/assets/transitions')
  const layoutPath = join(SERVED_BOARD, 'webapp/home/layout.json')
  const originalLayout = readFileSync(layoutPath, 'utf8')
  const layout = JSON.parse(originalLayout)
  layout.present = { transition: { name: 'wipe', ms: 500 } }
  mkdirSync(folder, { recursive: true })
  writeFileSync(
    join(folder, 'wipe.css'),
    '@keyframes enter { from { clip-path: inset(0 0 0 100%) } to { clip-path: inset(0) } }',
  )
  writeFileSync(layoutPath, JSON.stringify(layout))
  page.once('close', () => {
    writeFileSync(layoutPath, originalLayout)
    rmSync(join(SERVED_BOARD, 'webapp/assets'), { recursive: true })
  })
}

/**
 * Marks three steps on `about`, so presenting it draws the bar's step dots
 * with none revealed yet, putting the file back when the page closes.
 */
async function aboutStepped(page: Page): Promise<void> {
  const path = join(SERVED_BOARD, 'webapp/home/about.html')
  const original = readFileSync(path, 'utf8')
  writeFileSync(
    path,
    '<!doctype html><title>about</title><h1>about</h1>' +
      '<p data-step="1">One</p><p data-step="2">Two</p><p data-step="3">Three</p>',
  )
  page.once('close', () => writeFileSync(path, original))
}

/** Gives `hero` a speaker note, so the presenter view has notes to draw. */
async function heroNoted(page: Page): Promise<void> {
  const path = join(SERVED_BOARD, 'webapp/home/layout.json')
  const original = readFileSync(path, 'utf8')
  const layout = JSON.parse(original)
  layout.frames.hero.speakerNotes =
    'Start with the problem: two frames for one phone. Then fold it live.'
  writeFileSync(path, JSON.stringify(layout))
  page.once('close', () => writeFileSync(path, original))
}

/** The presentation the presenter view case joins, which its own page answers. */
const PRESENTER_ID = 'capture'

/**
 * Answers the presenter window's hello from inside its own page, as a tab
 * presenting `hero` four minutes in would, since a capture drives one page.
 */
async function presenterFedOnLoad(page: Page): Promise<void> {
  await page.addInitScript((id) => {
    const channel = new BroadcastChannel(`frameboard.present.${id}`)
    const state = {
      type: 'state',
      page: 'webapp/home',
      frame: 'webapp/home/hero',
      step: 0,
      startedAt: Date.now() - 252_000,
      themes: {},
    }
    channel.addEventListener('message', (event) => {
      if (event.data?.type === 'hello') channel.postMessage(state)
    })
  }, PRESENTER_ID)
}

/**
 * Shrinks `about` to a 390 by 264 card, under half the window each way, so
 * presenting it shows the scale stopping at twice the frame's size.
 */
async function aboutSmall(page: Page): Promise<void> {
  const layoutPath = join(SERVED_BOARD, 'webapp/home/layout.json')
  const originalLayout = readFileSync(layoutPath, 'utf8')
  const layout = JSON.parse(originalLayout)
  layout.frames.about.height = 264
  writeFileSync(layoutPath, JSON.stringify(layout))
  page.once('close', () => writeFileSync(layoutPath, originalLayout))
}

/**
 * Presents from the toolbar and moves the pointer every half second, since the
 * bar hides after two still seconds. With no user activation it stays windowed.
 */
async function presentOnLoad(page: Page): Promise<void> {
  await presentingOnLoad(page, null)
}

/**
 * Presents as `presentOnLoad` does, then puts keyboard focus on the bar
 * button named `focus`, so the capture shows its focus ring.
 */
function presentFocusedOnLoad(focus: string): (page: Page) => Promise<void> {
  return (page) => presentingOnLoad(page, focus)
}

/** Presents as `presentOnLoad` does, then opens the slide overview from the bar. */
async function presentOverviewOnLoad(page: Page): Promise<void> {
  await presentingOnLoad(page, 'Slide overview', true)
}

async function presentingOnLoad(
  page: Page,
  focus: string | null,
  click = false,
): Promise<void> {
  await page.addInitScript(
    ({ frames, focus, click }) => {
      let left = frames
      const press = () => {
        const button = document.querySelector<HTMLButtonElement>(
          'button[aria-label="Present page"]:not([aria-disabled])',
        )
        if (!button) {
          if (--left > 0) requestAnimationFrame(press)
          else console.error('The Present button never lit')
          return
        }
        button.click()
        setInterval(() => {
          document
            .querySelector('[data-presenting]')
            ?.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
        }, 500)
        if (focus === null) return
        let tries = frames
        const reach = () => {
          const target = document.querySelector<HTMLButtonElement>(
            `[data-presenting] button[aria-label="${focus}"]`,
          )
          if (target && click) target.click()
          else if (target) {
            target.focus({ focusVisible: true } as FocusOptions)
            target.setAttribute('data-focused', '')
          } else if (--tries > 0) requestAnimationFrame(reach)
        }
        reach()
      }
      document.addEventListener('DOMContentLoaded', press)
    },
    { frames: ROW_FRAMES, focus, click },
  )
}

/**
 * Opens the selected frame's size menu once write access lights its
 * trigger, waiting in an init script as `pressOnLoad` does. The trigger is
 * named by its text, which the toolbar's Frame tool shares as a label.
 */
async function sizeMenuOnLoad(page: Page): Promise<void> {
  await page.addInitScript(
    ({ frames }) => {
      let left = frames
      const press = () => {
        const trigger = document.querySelector<HTMLButtonElement>(
          '#inspector-frame button:not(:disabled)',
        )
        if (trigger) trigger.click()
        else if (--left > 0) requestAnimationFrame(press)
        else console.error('The size menu never lit')
      }
      document.addEventListener('DOMContentLoaded', press)
    },
    { frames: ROW_FRAMES },
  )
}

/**
 * Adds one finding on the about frame to every findings message the server
 * sends. Faked, since a frame tripping it in the committed fixture would
 * change every board case.
 */
function aboutFinding(
  added: Pick<Finding, 'rule' | 'severity' | 'path' | 'message' | 'location'>,
): (page: Page) => Promise<void> {
  const frame = 'webapp/home/about'
  return async (page) => {
    await page.routeWebSocket('**/api/live', (socket) => {
      const server = socket.connectToServer()
      server.onMessage((message) => {
        const parsed = JSON.parse(String(message)) as ServerMessage
        const held = parsed.type === 'findings' ? parsed.findings[frame] : null
        if (parsed.type !== 'findings' || !held) {
          socket.send(message)
          return
        }
        socket.send(
          JSON.stringify({
            ...parsed,
            findings: {
              ...parsed.findings,
              [frame]: [...held, { ...added, frame }],
            },
          }),
        )
      })
      socket.onMessage((message) => server.send(message))
    })
  }
}

/** A warning in a sheet the about frame links, so its list shows that sheet's path beside the line. */
const linkedSheetFinding = aboutFinding({
  rule: 'unknown-token',
  severity: 'warning',
  path: 'webapp/home/site.css',
  message:
    "var(--brand) names a custom property nothing declares, so the declaration resolves to nothing. Use a token the project's tokens.css declares, or give it a fallback, such as var(--brand, red).",
  location: { line: 1, column: 9, startOffset: 8, endOffset: 28 },
})

/** An error beside the about frame's warning, so its mark draws the filled pill a warning alone leaves out. */
const errorFinding = aboutFinding({
  rule: 'clipped',
  severity: 'error',
  path: 'webapp/home/about.html',
  message:
    'webapp/home/about is 640 px tall in its 480 px box, so 160 px is cut off. Fit the frame, or give the content a height of its own.',
  location: null,
})

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

/**
 * Keeps the hero frame's load from reaching the board, so it reads the frame
 * as still waiting and draws the loading block. A held document would stall
 * the sweep, which waits on the network and on every frame's own load.
 */
async function heroNeverLoads(page: Page): Promise<void> {
  // On the document, since a load event's path stops short of the window.
  await page.addInitScript(() => {
    document.addEventListener(
      'load',
      (event) => {
        const target = event.target
        if (
          target instanceof HTMLIFrameElement &&
          target.closest('[data-frame="webapp/home/hero"]')
        ) {
          event.stopImmediatePropagation()
        }
      },
      true,
    )
  })
}

export function canvasCases(theme: 'light' | 'dark'): CaptureCase[] {
  const themed = themedFor(theme)
  return [
    {
      section: 'select-one',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(onCanvas({ select: ['webapp/home/hero'] })),
    },
    {
      section: 'frame-loading',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(both(heroNeverLoads, readyWhen('[data-loading-block]'))),
    },
    {
      section: 'scroll-rail',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          aboutScrolling,
          noAgentChanges,
          onCanvas({ select: ['webapp/home/about'] }),
          readyWhen('[data-rail-thumb]'),
        ),
      ),
    },
    {
      section: 'scroll-no-ghost',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // A scroll frame shows its rail and no overflow ghost under it.
      setup: themed(
        both(
          aboutScrolling,
          noAgentChanges,
          onCanvas({ select: ['webapp/home/about'] }),
          readyWhen('[data-rail-thumb]', '[data-element-ghost]'),
        ),
      ),
    },
    // Clip content off with nothing selected, the badge and the card whole past the edge.
    {
      section: 'clip-off',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          heroPastEdge(true),
          noAgentChanges,
          readyWhen(PAINTED_BOTH, '[data-element-ghost]'),
        ),
      ),
    },
    // Clip content on, each picture inside the selected frame's ghost.
    {
      section: 'clip-on-selected',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          heroPastEdge(false),
          noAgentChanges,
          onCanvas({ select: ['webapp/home/hero'] }),
          readyWhen(PAINTED_BOTH),
        ),
      ),
    },
    {
      section: 'device-bezel',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          devicesShown,
          noAgentChanges,
          onCanvas({ select: ['webapp/home/about'] }),
          readyWhen(
            'body:has([data-bezel="phone"]):has([data-bezel="laptop"])',
          ),
        ),
      ),
    },
    {
      // A phone's linked widths, each in the body its width names and clear of the last.
      section: 'device-linked-widths',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          linkedDevicesShown,
          noAgentChanges,
          onCanvas({ select: ['webapp/home/about'] }),
          readyWhen(
            'body:has([data-linked-width="834"] [data-bezel="tablet"]):has([data-linked-width="1440"] [data-bezel="laptop"])',
          ),
        ),
      ),
    },
    {
      section: 'device-island-wide',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          wideIslandShown,
          noAgentChanges,
          onCanvas({ select: ['webapp/home/about'] }),
          readyWhen('[data-bezel="phone"] [data-bezel-timer]'),
        ),
      ),
    },
    {
      // A selected phone turned left with Rotate under it, beside a turned tablet.
      section: 'device-turned',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          devicesTurned,
          noAgentChanges,
          onCanvas({ select: ['webapp/home/about'] }),
          readyWhen(
            'body:has([data-bezel="phone"][data-bezel-turn="left"]):has([data-bezel="tablet"][data-bezel-turn="left"]):has([data-turns])',
          ),
        ),
      ),
    },
    // A selected phone, upright or turned, keeps its page's rows inside its box, with no overflow ghost under it.
    {
      section: 'device-upright-overflow',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          phoneOverflowing(false),
          noAgentChanges,
          onCanvas({ select: ['webapp/home/about'] }),
          readyWhen(
            'body:has([data-bezel="phone"]:not([data-bezel-turn="left"])):has([data-turns])',
            '[data-element-ghost]',
          ),
        ),
      ),
    },
    {
      section: 'device-laptop-overflow',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          laptopOverflowing,
          noAgentChanges,
          onCanvas({ select: ['webapp/home/hero'] }),
          readyWhen('body:has([data-bezel="laptop"])', '[data-element-ghost]'),
        ),
      ),
    },
    {
      section: 'device-turned-overflow',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          phoneOverflowing(true),
          noAgentChanges,
          onCanvas({ select: ['webapp/home/about'] }),
          readyWhen(
            'body:has([data-bezel="phone"][data-bezel-turn="left"]):has([data-turns])',
            '[data-element-ghost]',
          ),
        ),
      ),
    },
    // A selected foldable in each pose, with its buttons under the body.
    ...POSES.map((pose): CaptureCase => ({
      section: `device-foldable-${pose}`,
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          foldableShown(pose),
          noAgentChanges,
          onCanvas({ select: ['webapp/home/about'] }),
          readyWhen('body:has([data-bezel="foldable"]):has([data-poses])'),
        ),
      ),
    })),
    {
      // A selected open foldable turned left, its island in the left strip and its page between the strips.
      section: 'device-foldable-turned',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          foldableShown('open', 'left'),
          noAgentChanges,
          onCanvas({ select: ['webapp/home/about'] }),
          readyWhen(
            'body:has([data-bezel="foldable"][data-bezel-turn="left"] [data-bezel-strip]):has([data-poses])',
          ),
        ),
      ),
    },
    {
      section: 'inspector-widths',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // A frame holding two linked widths, a chip each in the More widths row.
      setup: themed(
        both(
          asWriter,
          heroAtTwoWidths,
          noAgentChanges,
          onCanvas({ select: ['webapp/home/hero'] }),
          readyWhen(
            'body:has([data-linked-width="390"]):has([aria-labelledby="inspector-widths"] button[aria-label="Remove 390"])',
          ),
        ),
      ),
    },
    {
      section: 'inspector-widths-menu',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // The plus menu offers only the sizes the frame neither holds nor lists.
      setup: themed(
        both(
          asWriter,
          heroAtTwoWidths,
          noAgentChanges,
          onCanvas({ select: ['webapp/home/hero'] }),
          pointerPressOnLoad(
            '[aria-labelledby="inspector-widths"] button[aria-haspopup="menu"]',
          ),
          readyWhen('[role="menu"] [role="menuitem"]'),
        ),
      ),
    },
    {
      section: 'inspector-kit',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // The hero on Sketch, chipped on the canvas and named in the Kit row, beside the plain about.
      setup: themed(
        both(
          asWriter,
          webappKits,
          noAgentChanges,
          onCanvas({ select: ['webapp/home/hero'] }),
          readyWhen('body:has([data-kit-chip]):has(#inspector-kit-value)'),
        ),
      ),
    },
    {
      section: 'inspector-widths-hug',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // A frame hugging its width holds the plus until a width is set.
      setup: themed(
        both(
          asWriter,
          heroHugsWidth,
          noAgentChanges,
          onCanvas({ select: ['webapp/home/hero'] }),
          readyWhen(
            '[aria-labelledby="inspector-widths"] button[aria-disabled="true"]',
          ),
        ),
      ),
    },
    {
      section: 'present',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      setup: themed(
        both(
          noAgentChanges,
          presentOnLoad,
          readyWhen('[data-presenting] [data-shown]'),
        ),
      ),
    },
    {
      section: 'present-small',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      setup: themed(
        both(
          aboutSmall,
          noAgentChanges,
          onCanvas({ select: ['webapp/home/about'] }),
          presentOnLoad,
          readyWhen('[data-presenting] [data-shown]'),
        ),
      ),
    },
    {
      section: 'present-device',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      setup: themed(
        both(
          devicesShown,
          noAgentChanges,
          onCanvas({ select: ['webapp/home/about'] }),
          presentOnLoad,
          readyWhen('[data-presenting] [data-bezel="phone"]'),
        ),
      ),
    },
    {
      // A phone as tall as its page presents one screen tall, its page scrolling inside.
      section: 'present-phone-tall',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      setup: themed(
        both(
          tallPhoneShown,
          noAgentChanges,
          onCanvas({ select: ['webapp/home/about'] }),
          presentOnLoad,
          readyWhen('[data-presenting] [data-bezel="phone"]'),
        ),
      ),
    },
    {
      // The same phone entered in Play shrinks to one screen, its label where it stood.
      section: 'play-entered-phone-tall',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          tallPhoneShown,
          noAgentChanges,
          pressOnLoad('^Play$'),
          pressOnLoad('^Select about$'),
          readyWhen('[data-entered] [data-bezel="phone"]'),
        ),
      ),
    },
    {
      // A turned phone presented landscape, Rotate in the bar after the count.
      section: 'present-turned',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      setup: themed(
        both(
          asWriter,
          devicesTurned,
          noAgentChanges,
          onCanvas({ select: ['webapp/home/about'] }),
          presentOnLoad,
          readyWhen(
            '[data-presenting]:has([data-bezel-turn="left"]) [role="toolbar"] button:has(svg)',
          ),
        ),
      ),
    },
    {
      // An open foldable turned left presented, its page between its strips.
      section: 'present-foldable-turned',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      setup: themed(
        both(
          foldableShown('open', 'left'),
          noAgentChanges,
          onCanvas({ select: ['webapp/home/about'] }),
          presentOnLoad,
          readyWhen(
            '[data-presenting] [data-bezel="foldable"][data-bezel-turn="left"] [data-bezel-strip]',
          ),
        ),
      ),
    },
    {
      // The turned phone entered in Play, Rotate in the banner beside its text.
      section: 'play-entered-turned',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          devicesTurned,
          noAgentChanges,
          pressOnLoad('^Play$'),
          pressOnLoad('^Select about$'),
          readyWhen(
            'body:has([data-entered] [data-bezel-turn="left"]):has([role="status"] + button)',
          ),
        ),
      ),
    },
    {
      section: 'present-focus',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      setup: themed(
        both(
          noAgentChanges,
          presentFocusedOnLoad('Next frame'),
          readyWhen('[data-presenting] [data-focused]'),
        ),
      ),
    },
    {
      section: 'present-overview',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      setup: themed(
        both(
          noAgentChanges,
          presentOverviewOnLoad,
          readyWhen('[data-overview] li:last-child img'),
        ),
      ),
    },
    {
      section: 'present-steps',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      setup: themed(
        both(
          aboutStepped,
          noAgentChanges,
          onCanvas({ select: ['webapp/home/about'] }),
          presentOnLoad,
          readyWhen('[data-presenting] [aria-label="Step 0 of 3"]'),
        ),
      ),
    },
    {
      section: 'presenter-view',
      writes: 'board',
      theme,
      route: `/p/webapp/home/presenter?id=${PRESENTER_ID}`,
      evidence: true,
      excludeViewports: STATE_ONLY,
      // The timer and the clock read the time of the run.
      mask: ['[data-presenter] header button', '[data-presenter] time'],
      setup: themed(
        both(
          aboutStepped,
          heroNoted,
          noAgentChanges,
          presenterFedOnLoad,
          readyWhen(
            '[data-presenter] iframe[title="about"]',
            '[data-presenter] iframe.invisible',
          ),
        ),
      ),
    },
    {
      section: 'page-transition',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          homePushes,
          noAgentChanges,
          asWriter,
          inspectorTab('Slides'),
          readyWhen(
            '[aria-labelledby="inspector-page"] button[aria-label="Direction"]',
          ),
        ),
      ),
    },
    {
      // The grid a project's own transition joins, marked on the one the page holds.
      section: 'page-transition-own',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          homeWipes,
          noAgentChanges,
          asWriter,
          inspectorTab('Slides'),
          readyWhen(
            '[aria-labelledby="inspector-page-transition"] [data-tile="wipe"][aria-checked="true"]:not(:disabled)',
          ),
        ),
      ),
    },
    {
      // A stepped element's effect tiles and its start buttons.
      section: 'step-effect',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          aboutStepped,
          noAgentChanges,
          asWriter,
          elementInFrame('webapp/home/about', '[data-step="2"]'),
          inspectorTab('Slides'),
          readyWhen(
            '[aria-labelledby="inspector-step-effect"] [aria-checked="true"]:not(:disabled)',
          ),
        ),
      ),
    },
    {
      section: 'speaker-notes',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          heroHoldsNote,
          notesShownOnLoad,
          noAgentChanges,
          asWriter,
          onCanvas({ select: ['webapp/home/hero'] }),
          inspectorTab('Slides'),
          readyWhen('[data-speaker-notes] textarea'),
        ),
      ),
    },
    {
      // Notes hidden, the first-visit default, so hero's label carries its note mark.
      section: 'speaker-notes-hidden',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          heroHoldsNote,
          noAgentChanges,
          asWriter,
          inspectorTab('Slides'),
          readyWhen('[data-note-mark]'),
        ),
      ),
    },
    {
      section: 'frame-size-menu',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          onCanvas({ select: ['webapp/home/hero'] }),
          sizeMenuOnLoad,
          readyWhen('[data-slot="dropdown-menu-content"]'),
        ),
      ),
    },
    {
      // The about frame sets no font, a warning, so its quiet mark opens on one card ending on Turn off.
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
      // A finding in a sheet the frame links names that sheet beside its line.
      section: 'findings-linked',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      // The note marker's edge over the hero frame antialiases differently between runs.
      mask: [AVATAR, '[data-note-marker]'],
      setup: themed(
        both(
          asWriter,
          linkedSheetFinding,
          findingsOn('webapp/home/about'),
          readyWhen('[data-slot="popover-content"]'),
        ),
      ),
    },
    {
      // An error among the warnings keeps the filled pill, and each card ends on its Turn off button.
      section: 'findings-error',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR, '[data-note-marker]'],
      setup: themed(
        both(
          asWriter,
          errorFinding,
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
          readyWhen(
            '[aria-labelledby="inspector-frame"] button[aria-label^="Rename frame"]',
          ),
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
      // The Preview row, the label's chip, and the frame at phone width.
      evidence: true,
      mask: [AVATAR],
      setup: themed(
        both(
          onCanvas({ select: ['webapp/home/hero'] }),
          actWhen(
            '[data-selection]',
            'Preview at phone width, 320 to 479, default 390',
            'click',
          ),
          readyWhen('[data-preview-chip]'),
        ),
      ),
    },
    {
      section: 'phone-link',
      theme,
      route: '/p/webapp/home',
      excludeViewports: STATE_ONLY,
      // The Open on a phone button and its open card.
      evidence: true,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          fixedPhoneLink,
          onCanvas({ select: ['webapp/home/hero'] }),
          inspectorTab('Export'),
          openPhoneLink,
          readyWhen('[data-slot="popover-content"] svg[role="img"]'),
        ),
      ),
    },
    {
      section: 'preview-tablet',
      theme,
      route: '/p/webapp/home',
      excludeViewports: STATE_ONLY,
      // A 1440 frame outside the tablet range takes the 834 default.
      evidence: true,
      mask: [AVATAR],
      setup: themed(
        both(
          onCanvas({ select: ['webapp/home/hero'] }),
          actWhen(
            '[data-selection]',
            'Preview at tablet width, 480 to 1023, default 834',
            'click',
          ),
          readyWhen('[data-preview-chip]'),
        ),
      ),
    },
  ]
}
