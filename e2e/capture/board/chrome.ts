import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page } from '@playwright/test'

import type { ListResult } from '@/shared/records/list'

import { wholeBoards } from '../../support/whole-boards'
import type { CaptureCase } from '../types'
import { pointerPressOnLoad } from './canvas'
import {
  actWhen,
  asWriter,
  AVATAR,
  both,
  chooseOnLoad,
  focusOnLoad,
  LIVE_BOARD,
  noAgentChanges,
  noTokens,
  openOverlayOnLoad,
  PRESS_FRAMES,
  pressOnLoad,
  readyWhen,
  ROW_FRAMES,
  SERVED_BOARD,
  STATE_ONLY,
  TAB_FRAMES,
  themedFor,
  webappKits,
} from './setup'

/**
 * Answers the author read as a machine with no name, whatever git or the saved
 * config holds, and aborts any write on that path, since the preview server
 * would save it under the developer's real config folder.
 */
async function noAuthor(page: Page): Promise<void> {
  await page.route('**/api/author', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          json: { ok: true, data: { name: null, source: null } },
        })
      : route.abort(),
  )
}

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

/** The Theme dialog's sections in order, the first four opened by a card each. */
const THEME_SECTIONS = ['kits', 'fonts', 'color', 'radius', 'font', 'other']

/** Opens the Theme dialog on a section, the last two reached from Radius. */
function themeDialog(section: string): (page: Page) => Promise<void> {
  const at = THEME_SECTIONS.indexOf(section) + 1
  const card = `aside[aria-label="Pages and layers"] [role="tabpanel"] button[aria-haspopup="dialog"]:nth-of-type(${Math.min(at, 4)})`
  // A focused tab shows its section. Past the opening focus, which would put Radius back.
  const tab = `[role="dialog"] [role="tablist"]:focus-within [role="tab"]:nth-of-type(${at})`
  return at > 4
    ? both(themeTab, pointerPressOnLoad(card), focusOnLoad(tab))
    : both(themeTab, pointerPressOnLoad(card))
}

/**
 * Opens the Theme dialog on Fonts by a bare click, which marks no pointer, so
 * a control focused in it rings as it does for a key.
 */
const fontsByKey = both(themeTab, pressOnLoad('^Fonts ·'))

/** A drawn row of the token group the Theme dialog shows. */
const TOKEN_ROW = 'section[aria-labelledby^="tokens-"] li'

/** The fixture fonts, so a shot draws real faces offline. */
const FIXTURE_FONTS = 'test/fixtures/fonts'

/** Lora installed in `webapp`, used by `frames` and drawn from its file through the project's font sheet. */
function installedLora(frames: string[]): (page: Page) => Promise<void> {
  return async (page) => {
    // Ends in a wildcard, since the board reads the list with `?frames=false`.
    await page.route('**/api/projects/*/sourcing/fonts/installed*', (route) =>
      route.fulfill({
        json: {
          ok: true,
          data: {
            version: 1,
            project: 'webapp',
            fonts: [
              {
                id: 'lora',
                family: 'Lora',
                category: 'serif',
                license: 'OFL-1.1',
                licenseUrl: 'https://fontsource.org/fonts/lora',
                landingUrl: 'https://fontsource.org/fonts/lora',
                variable: true,
                weights: [{ min: 400, max: 700 }],
                styles: ['normal'],
                path: 'fonts/lora',
                files: 2,
                bundled: false,
                frames,
              },
            ],
          },
        },
      }),
    )
    await page.route('**/frames/webapp/fonts.css*', (route) =>
      route.fulfill({
        contentType: 'text/css',
        body: "@font-face{font-family:'Lora';src:url(/capture-fonts/lora.woff2) format('woff2');font-weight:400 700}",
      }),
    )
    await page.route('**/capture-fonts/*.woff2', (route) =>
      route.fulfill({
        contentType: 'font/woff2',
        body: readFileSync(
          join(
            FIXTURE_FONTS,
            new URL(route.request().url()).pathname.split('/').pop() ?? '',
          ),
        ),
      }),
    )
  }
}

/** A search for `serif` answering three families, their samples drawn from the fixture files. */
async function foundSerifs(page: Page): Promise<void> {
  const result = (number: number, id: string, family: string) => ({
    number,
    id,
    family,
    category: 'serif',
    license: 'OFL-1.1',
    variable: true,
    weights: [400, 700],
    styles: ['normal'],
    subsets: ['latin'],
    landingUrl: `https://fontsource.org/fonts/${id}`,
    sample: `https://cdn.jsdelivr.net/fontsource/fonts/${id}@latest/latin-400-normal.woff2`,
  })
  await page.route('**/api/projects/*/sourcing/fonts?*', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          version: 1,
          query: null,
          category: 'serif',
          licenses: ['OFL-1.1', 'Apache-2.0', 'UFL-1.0'],
          source: { name: 'Fontsource', url: 'https://fontsource.org' },
          total: 366,
          results: [
            result(1, 'lora', 'Lora'),
            result(2, 'playfair-display', 'Playfair Display'),
            result(3, 'source-serif-4', 'Source Serif 4'),
          ],
        },
      },
    }),
  )
  await page.route('https://cdn.jsdelivr.net/**', (route) => {
    const id = /fonts\/([a-z0-9-]+)@/.exec(route.request().url())?.[1]
    return id === 'lora' || id === 'playfair-display'
      ? route.fulfill({
          contentType: 'font/woff2',
          body: readFileSync(join(FIXTURE_FONTS, `${id}.woff2`)),
        })
      : route.abort()
  })
}

/**
 * Types `text` into the font search once Find a font has opened it, through
 * the native value setter so React reads it as typing.
 */
function searchFontsOnLoad(text: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ typed, frames }) => {
        let left = frames
        const type = () => {
          const field = document.querySelector<HTMLInputElement>(
            'section[aria-labelledby="theme-fonts"] input[type="search"]',
          )
          if (!field) {
            if (--left > 0) requestAnimationFrame(type)
            else console.error('The font search never opened')
            return
          }
          const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
          )?.set
          setter?.call(field, typed)
          field.dispatchEvent(new Event('input', { bubbles: true }))
        }
        document.addEventListener('DOMContentLoaded', type)
      },
      { typed: text, frames: PRESS_FRAMES },
    )
  }
}

const REMOVE_LORA = 'button[aria-label="Remove Lora"]'
const CONFIRM_REMOVE =
  '[role="dialog"] [data-slot="dialog-footer"] button:last-child'

/**
 * Names the board sheet at a long absolute path in the token read, filtered
 * in the page's `fetch`, since a route fetching the real answer waits behind
 * the held `readyWhen` route.
 */
async function longBoardSheet(page: Page): Promise<void> {
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
        data: { sheets: { kind: string; path: string }[] }
      }
      for (const sheet of read.data.sheets) {
        if (sheet.kind === 'board') {
          sheet.path =
            '/home/someone/repositories/a-design-system-workspace/tokens/tokens.css'
        }
      }
      return Response.json(read, { status: response.status })
    }
  })
}

/** The reference's six files, for a preview board whose `assets/` holds none. */
const REFERENCE_ASSETS = [
  { path: 'hero.png', kind: 'image', size: 1_200_000 },
  { path: 'loader.gif', kind: 'gif', size: 240_000 },
  { path: 'logo.svg', kind: 'svg', size: 2_000 },
  { path: 'Inter.woff2', kind: 'font', size: 98_000 },
  { path: 'demo.mp4', kind: 'video', size: 4_100_000 },
  { path: 'phone.glb', kind: 'model', size: 5_576 },
  { path: 'shared.css', kind: 'stylesheet', size: 3_000 },
]

function gradient(from: string, to: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="120" height="72" fill="url(#g)"/></svg>`
}

/** A folder of files the frames link or leave unused, with one subfolder, as the planned mock draws it. */
const COUNTED_ASSETS = [
  { path: 'brand.woff2', kind: 'font', size: 37_000, frames: 0 },
  { path: 'clip.mp4', kind: 'video', size: 14_000, frames: 1 },
  { path: 'hero.png', kind: 'image', size: 1_200_000, frames: 2 },
  { path: 'icons/star.svg', kind: 'svg', size: 149, frames: 1 },
  { path: 'logo.svg', kind: 'svg', size: 198, frames: 3 },
  { path: 'shared.css', kind: 'stylesheet', size: 3_000, frames: 0 },
]

/**
 * Answers the Assets tab's read with the reference's files and draws their
 * thumbnails as gradients, so no image joins the `basic` fixture. A video
 * plays the fixture's one second clip, so its tile shows a poster and length.
 */
async function referenceAssets(page: Page): Promise<void> {
  await answerAssets(page, REFERENCE_ASSETS)
}

/** The same, with frame counts and a subfolder, so the tab draws its groups and usage lines. */
async function countedAssets(page: Page): Promise<void> {
  await answerAssets(page, COUNTED_ASSETS)
}

/** Two files beside two kits' own, which Files leaves out for the kits line. */
async function kitAssets(page: Page): Promise<void> {
  await answerAssets(page, [
    { path: 'hero.png', kind: 'image', size: 1_200_000, frames: 1 },
    { path: 'logo.svg', kind: 'svg', size: 198, frames: 0 },
    { path: 'kits/clean/kit.css', kind: 'stylesheet', size: 900, frames: 0 },
    { path: 'kits/clean/kit.json', kind: 'other', size: 120, frames: 0 },
    { path: 'kits/sketch/kit.css', kind: 'stylesheet', size: 900, frames: 0 },
  ])
}

/** Answers a file's frames read with these refs, so Delete's confirm names them without a write. */
function linkingFrames(frames: string[]): (page: Page) => Promise<void> {
  return async (page) => {
    await page.route('**/api/projects/*/assets/*', (route) =>
      route.fulfill({
        json: { ok: true, data: { path: 'hero.png', frames } },
      }),
    )
  }
}

/** Presses the open menu's item reading `label` once it draws. */
function menuItemOnLoad(label: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ label, frames }) => {
        let left = frames
        const press = () => {
          const item = [
            ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
          ].find((candidate) => candidate.textContent?.trim() === label)
          if (item) item.click()
          else if (--left > 0) requestAnimationFrame(press)
          else console.error(`No ${label} item`)
        }
        document.addEventListener('DOMContentLoaded', press)
      },
      { label, frames: PRESS_FRAMES },
    )
  }
}

async function answerAssets(page: Page, files: unknown[]): Promise<void> {
  await page.route('**/api/projects/*/assets', (route) =>
    route.fulfill({ json: { ok: true, data: { files } } }),
  )
  await page.route('**/frames/*/assets/**', (route) =>
    route.request().url().endsWith('.mp4')
      ? route.fulfill({
          contentType: 'video/webm',
          body: readFileSync(join(SERVED_BOARD, 'marketing/assets/clip.webm')),
        })
      : route.fulfill({
          contentType: 'image/svg+xml',
          body: route.request().url().endsWith('hero.png')
            ? gradient('#6d5bd0', '#e07a5f')
            : gradient('#1d2a4a', '#3b2a5c'),
        }),
  )
}

/**
 * Five found images, their thumbnails served as gradients so no remote image
 * loads, and the last one's refused so its tile names its file type.
 */
const FOUND = [
  ['old', 'Old & modern house', 'cc0', '#9fc09a', '#4f7d5a'],
  ['praktica', 'Praktica BX20', 'cc0', '#c9ae8a', '#8a6a44'],
  // One line too long for its tile, so the capture shows the ellipsis.
  ['plattekill', 'House in Plattekill, New York', 'pdm', '#9fb2d0', '#586e96'],
  ['glass', 'Glass house', 'cc0', '#d6b4a0', '#a5645a'],
  ['plan', 'House plan', 'cc0', null, null],
] as const

async function foundThumbnails(page: Page): Promise<void> {
  await page.route('https://images.example.org/**', (route) => {
    const found = FOUND.find(([id]) =>
      route.request().url().includes(`/${id}.`),
    )
    if (found?.[3] === null) return route.abort()
    return route.fulfill({
      contentType: 'image/svg+xml',
      body: gradient(found?.[3] ?? '#888', found?.[4] ?? '#444'),
    })
  })
}

/** Answers a search with the five found images. */
async function foundImages(page: Page): Promise<void> {
  await foundThumbnails(page)
  await page.route('**/sourcing/find*', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          version: 1,
          query: 'modern house',
          licenses: ['cc0', 'pdm'],
          results: FOUND.map(([id, title, license], index) => ({
            number: index + 1,
            id,
            title,
            creator: null,
            creatorUrl: null,
            license,
            licenseVersion: null,
            licenseUrl: null,
            attribution: null,
            landingUrl: `https://www.flickr.com/photos/${id}`,
            url: `https://images.example.org/${id}.jpg`,
            thumbnail: `https://images.example.org/${id}.svg`,
            width: 1024,
            height: 768,
          })),
        },
      },
    }),
  )
}

/**
 * Holds every search open inside the page, so the grid shows its grey tiles.
 * A request held at the route would keep the capture's network idle wait
 * from ever settling.
 */
async function searchHeld(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const send = window.fetch.bind(window)
    window.fetch = (input, init) =>
      String(input instanceof Request ? input.url : input).includes(
        '/sourcing/find',
      )
        ? new Promise<Response>(() => {})
        : send(input, init)
  })
}

/** Answers every search as Openverse not answering. */
async function searchFailed(page: Page): Promise<void> {
  await page.route('**/sourcing/find*', (route) =>
    route.fulfill({
      status: 502,
      json: {
        ok: false,
        error: {
          code: 'source-failed',
          message: 'Openverse did not answer.',
          details: { source: 'openverse', status: null },
        },
      },
    }),
  )
}

/** Answers Generate's offer with fal ready, so no key is needed to capture it. */
async function offerReady(page: Page): Promise<void> {
  await page.route('**/sourcing/provider', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          version: 1,
          provider: {
            name: 'fal',
            model: 'fal-ai/flux/schnell',
            key: 'FAL_KEY',
            width: 1024,
            height: 1024,
            priceUsd: 0.0032,
          },
          keys: ['FAL_KEY', 'GEMINI_API_KEY'],
        },
      },
    }),
  )
}

/** Answers a generation with one picture, drawn as a gradient, so nothing spends. */
async function generatedPicture(page: Page): Promise<void> {
  await page.route('**/sourcing/generate', (route) =>
    route.fulfill({
      json: {
        ok: true,
        data: {
          version: 1,
          provider: 'fal',
          model: 'fal-ai/flux/schnell',
          prompt: 'a modern house at dusk',
          width: 1024,
          height: 1024,
          priceUsd: 0.0032,
          dryRun: false,
          saved: {
            version: 1,
            project: 'webapp',
            path: 'a-modern-house-at-dusk.png',
            licensePath: 'a-modern-house-at-dusk.png.license.json',
            license: null,
          },
        },
      },
    }),
  )
  await page.route('**/frames/*/assets/a-modern-house-at-dusk.png*', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: gradient('#e07a5f', '#3b2a5c'),
    }),
  )
}

/** Types `prompt` into Generate's field once it draws, so its button can run. */
function promptOnLoad(prompt: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ text, frames }) => {
        let left = frames
        const type = () => {
          const field = document.querySelector(
            'textarea[aria-label="Describe the image"]',
          )
          if (!(field instanceof HTMLTextAreaElement)) {
            if (--left > 0) requestAnimationFrame(type)
            else console.error('No Generate field to type in')
            return
          }
          Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            'value',
          )?.set?.call(field, text)
          field.dispatchEvent(new Event('input', { bubbles: true }))
        }
        document.addEventListener('DOMContentLoaded', type)
      },
      { text: prompt, frames: TAB_FRAMES * 2 },
    )
  }
}

/** Types `query` into Find's field once it draws and submits it, as Enter would. */
function searchOnLoad(query: string): (page: Page) => Promise<void> {
  return async (page) => {
    await page.addInitScript(
      ({ text, frames }) => {
        let left = frames
        const search = () => {
          const field = document.querySelector(
            'input[aria-label="Search free images"]',
          )
          if (!(field instanceof HTMLInputElement) || !field.form) {
            if (--left > 0) requestAnimationFrame(search)
            else console.error('No Find field to search from')
            return
          }
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
          )?.set?.call(field, text)
          field.dispatchEvent(new Event('input', { bubbles: true }))
          field.form.requestSubmit()
        }
        document.addEventListener('DOMContentLoaded', search)
      },
      { text: query, frames: TAB_FRAMES * 2 },
    )
  }
}

/**
 * Opens the Shape menu and then the picker from its Image, video, audio, or model row, once
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
        ].find((item) =>
          item.textContent?.includes('Image, video, audio, or model'),
        )
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
        else
          console.error('The Image, video, audio, or model row never enabled')
      }
      document.addEventListener('DOMContentLoaded', open)
    },
    { frames: PRESS_FRAMES },
  )
}

/** The drive seed's photo tuner, a photo beside a column of three sliders bound to it. */
const TUNER_FRAME = join(
  import.meta.dirname,
  '../../../scripts/lib/drive-tuner.html',
)

/**
 * Serves the photo tuner in the hero's place, so the hero draws drawn
 * controls, and puts the file back once the capture page closes so no later
 * case shows it.
 */
async function tunerHero(page: Page): Promise<void> {
  const path = join(SERVED_BOARD, 'webapp/home/hero.html')
  const original = readFileSync(path, 'utf8')
  writeFileSync(path, readFileSync(TUNER_FRAME, 'utf8'))
  page.once('close', () => writeFileSync(path, original))
}

/**
 * The hero frame's half of a slider capture, run in the frame on its own
 * port. It tells the board once the frame holds a slider, then on the board's
 * word moves the slider to 130 or presses Esc on it.
 */
async function answerInHero(page: Page, act: 'slide' | 'esc'): Promise<void> {
  await page.addInitScript(
    ({ frames, act }) => {
      if (window === window.top) return
      if (!location.pathname.endsWith('/webapp/home/hero.html')) return
      const control = () =>
        document.querySelector<HTMLInputElement>('[data-binds]')
      addEventListener('message', (event) => {
        const field = control()
        if (event.source !== parent || event.data !== `capture:${act}`) return
        if (!field) return
        if (act === 'slide') {
          field.value = '130'
          field.dispatchEvent(new Event('input', { bubbles: true }))
          return
        }
        field.focus()
        field.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true,
            cancelable: true,
          }),
        )
      })
      let left = frames
      const announce = () => {
        if (control()) parent.postMessage('capture:control', '*')
        else if (--left > 0) requestAnimationFrame(announce)
      }
      document.addEventListener('DOMContentLoaded', announce)
    },
    { frames: PRESS_FRAMES, act },
  )
}

/**
 * Enters hero in Play and drags its first slider so Keep values draws. Play is
 * pressed late, since the loading chrome's Play does nothing, and a reload resets.
 * The hero frame sits on its own port, so its half of the script moves the slider.
 */
async function slideOnLoad(page: Page): Promise<void> {
  await answerInHero(page, 'slide')
  await page.addInitScript((frames) => {
    if (window !== window.top) return
    let left = frames
    let control = false
    addEventListener('message', (event) => {
      if (event.data === 'capture:control') control = true
    })
    const slide = () => {
      const iframe = document.querySelector<HTMLIFrameElement>(
        '[data-frame="webapp/home/hero"] iframe',
      )
      const shield = document.querySelector('[data-play-shield]')
      const entered = document.body?.textContent?.includes(
        'In frame, Esc to leave',
      )
      const bar = document.querySelector('[data-keep-bar]')
      if (iframe && control && !shield) {
        ;[...document.querySelectorAll('button')]
          .find((button) => button.textContent?.trim() === 'Play')
          ?.click()
      } else if (iframe && control && shield && !entered) {
        const box = iframe.getBoundingClientRect()
        shield.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            clientX: box.left + box.width / 2,
            clientY: box.top + box.height / 2,
          }),
        )
      } else if (iframe && control && entered && !bar) {
        iframe.contentWindow?.postMessage('capture:slide', '*')
      }
      if (--left > 0) requestAnimationFrame(slide)
      else if (!bar) console.error('No slider in the entered hero to move')
    }
    document.addEventListener('DOMContentLoaded', slide)
  }, PRESS_FRAMES)
}

/**
 * Enters hero in Play, focuses its first slider, and presses Esc there, marking
 * the root `data-esc-left` once the frame is left with Play still on. The
 * hero frame's half of the script presses the key.
 */
async function escFromSliderOnLoad(page: Page): Promise<void> {
  await answerInHero(page, 'esc')
  await page.addInitScript((frames) => {
    if (window !== window.top) return
    let left = frames
    let pressed = false
    let control = false
    addEventListener('message', (event) => {
      if (event.data === 'capture:control') control = true
    })
    const leave = () => {
      const iframe = document.querySelector<HTMLIFrameElement>(
        '[data-frame="webapp/home/hero"] iframe',
      )
      const shield = document.querySelector('[data-play-shield]')
      const entered = document.body?.textContent?.includes(
        'In frame, Esc to leave',
      )
      if (iframe && control && !shield) {
        ;[...document.querySelectorAll('button')]
          .find((button) => button.textContent?.trim() === 'Play')
          ?.click()
      } else if (iframe && control && shield && !entered && !pressed) {
        const box = iframe.getBoundingClientRect()
        shield.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            clientX: box.left + box.width / 2,
            clientY: box.top + box.height / 2,
          }),
        )
      } else if (iframe && control && entered && !pressed) {
        iframe.contentWindow?.postMessage('capture:esc', '*')
        pressed = true
      } else if (pressed && shield && !entered) {
        document.documentElement.dataset.escLeft = ''
        return
      }
      if (--left > 0) requestAnimationFrame(leave)
      else console.error('Esc on the hero slider never left the frame')
    }
    document.addEventListener('DOMContentLoaded', leave)
  }, PRESS_FRAMES)
}

/**
 * Holds the `clip.webm` tile over bare canvas until the drop ghost draws, at
 * the first grid point no frame holds, since the fixture's frames can move.
 */
async function holdTileOverCanvas(page: Page): Promise<void> {
  await page.addInitScript((frames) => {
    let left = frames
    const dataTransfer = new DataTransfer()
    const at = (clientX: number, clientY: number) => ({
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      dataTransfer,
    })
    const barePoint = (layer: Element) => {
      const area = layer.getBoundingClientRect()
      const taken = [...document.querySelectorAll('[data-frame]')].map(
        (frame) => frame.getBoundingClientRect(),
      )
      for (let row = 1; row < 8; row++) {
        for (let column = 1; column < 8; column++) {
          const x = area.left + (area.width * column) / 8
          const y = area.top + (area.height * row) / 8
          // Clear of every frame by the ghost's own reach, so it overlaps none.
          const clear = taken.every(
            (box) =>
              x < box.left - 120 ||
              x > box.right + 120 ||
              y < box.top - 80 ||
              y > box.bottom + 80,
          )
          if (clear) return { x, y }
        }
      }
      return null
    }
    const hold = (layer: Element, point: { x: number; y: number }) => {
      layer.dispatchEvent(new DragEvent('dragover', at(point.x, point.y)))
      if (document.querySelector('[data-drop-ghost]')) return
      if (--left > 0) requestAnimationFrame(() => hold(layer, point))
      else console.error('The canvas never drew the drop ghost')
    }
    const run = () => {
      const tile = document.querySelector(
        // Draggable once the server grants writes, and an earlier start is lost.
        'button[aria-label^="Copy path of clip.webm,"][draggable="true"]',
      )
      const layer = document.querySelector('[data-hit-layer]')
      const point =
        layer && document.querySelector('[data-frame] iframe')
          ? barePoint(layer)
          : null
      if (!tile || !layer || !point) {
        if (--left > 0) requestAnimationFrame(run)
        else console.error('The board never drew a tile and bare canvas')
        return
      }
      const from = tile.getBoundingClientRect()
      tile.dispatchEvent(
        new DragEvent('dragstart', at(from.left + 4, from.top + 4)),
      )
      requestAnimationFrame(() => {
        layer.dispatchEvent(new DragEvent('dragenter', at(point.x, point.y)))
        hold(layer, point)
      })
    }
    document.addEventListener('DOMContentLoaded', () =>
      requestAnimationFrame(run),
    )
  }, ROW_FRAMES)
}

/**
 * Lists two rules as turned off on `webapp` through the socket's board
 * message, so the project menu's Rules turned off submenu has rows with no
 * rule leaving the fixture's `project.json`.
 */
async function rulesOff(page: Page): Promise<void> {
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
        if (project.name === 'webapp') {
          project.checksOff = ['generic-font', 'unknown-token']
        }
      }
      socket.send(JSON.stringify(parsed))
    })
    socket.onMessage((message) => server.send(wholeBoards(message)))
  })
}

/**
 * Opens the avatar's name row into a field, waiting on `Edit your name`, since
 * the `Set your name` row drawn before the read lands opens an empty field.
 */
async function nameEditOnLoad(page: Page): Promise<void> {
  await page.addInitScript(
    ({ frames, live }) => {
      let left = frames
      const edit = () => {
        const row = document.querySelector<HTMLElement>(
          '[role="menuitem"][aria-label^="Edit your name"]',
        )
        if (row) row.click()
        else if (--left > 0) requestAnimationFrame(edit)
        else console.error('The name row never lit')
      }
      const open = () => {
        const trigger = document.querySelector(live)
          ? [...document.querySelectorAll('button')].find((button) =>
              /from git user\.name$|saved on this machine$|^Account$/.test(
                button.getAttribute('aria-label') ?? '',
              ),
            )
          : undefined
        if (!trigger) {
          if (--left > 0) requestAnimationFrame(open)
          else console.error('No avatar to open')
          return
        }
        trigger.click()
        requestAnimationFrame(edit)
      }
      document.addEventListener('DOMContentLoaded', open)
    },
    { frames: PRESS_FRAMES, live: LIVE_BOARD },
  )
}

/**
 * Draws a Rectangle in hero's body and undoes it through the board on close,
 * synchronously, since a file write would mark hero agent-changed in later cases.
 */
async function rectangleDrawnFree(page: Page): Promise<void> {
  const hero = join(SERVED_BOARD, 'webapp/home/hero.html')
  const base = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:4173'
  const { token } = JSON.parse(
    readFileSync(join(SERVED_BOARD, '.run/address.json'), 'utf8'),
  ) as { token: string }
  page.on('close', () => {
    execFileSync('curl', [
      '-sf',
      '-X',
      'POST',
      '-H',
      `authorization: Bearer ${token}`,
      `${base}/api/undo`,
    ])
  })
  await page.goto(`${base}/p/webapp/home`)
  const tools = page.getByRole('toolbar', { name: 'Tools' })
  await tools.getByRole('button', { name: 'Rectangle' }).click()
  const frame = await page
    .locator('[data-frame="webapp/home/hero"] iframe')
    .boundingBox()
  if (!frame) throw new Error('The hero draws no frame to draw in')
  const k = frame.width / 1440
  const at = (x: number, y: number) => ({
    x: frame.x + x * k,
    y: frame.y + y * k,
  })
  const from = at(560, 360)
  const to = at(900, 560)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, {
    steps: 4,
  })
  await page.mouse.move(to.x, to.y, { steps: 4 })
  await page.mouse.up()
  await expect
    .poll(() => readFileSync(hero, 'utf8'), { timeout: 10_000 })
    .toContain('position: absolute')
}

export function chromeCases(theme: 'light' | 'dark'): CaptureCase[] {
  const themed = themedFor(theme)
  return [
    {
      section: 'theme-tab',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(themeTab),
    },
    {
      // A writing tab, whose button edits where a reading one views.
      section: 'theme-tab-writer',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(both(asWriter, themeTab)),
    },
    {
      // Colors in a writing tab, each value in words beside its swatch.
      section: 'theme-tab-colors',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          themeDialog('color'),
          readyWhen(`${TOKEN_ROW}:last-child`),
        ),
      ),
    },
    {
      // A color open in the picker, under its value.
      section: 'theme-tab-picker',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          themeDialog('color'),
          actWhen(TOKEN_ROW, 'Dark: #38bdf8', 'click'),
          readyWhen('[data-slot="popover-content"] input'),
        ),
      ),
    },
    {
      // Radius, where numbers scrub and write on release.
      section: 'theme-tab-radius',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(asWriter, themeDialog('radius'), readyWhen(`${TOKEN_ROW} input`)),
      ),
    },
    {
      // Font tokens, each value in the face it names.
      section: 'theme-tab-font-tokens',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          themeDialog('font'),
          readyWhen('section[aria-labelledby="tokens-font"] li'),
        ),
      ),
    },
    {
      // Other, the last section.
      section: 'theme-tab-other',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          themeDialog('other'),
          readyWhen('section[aria-labelledby="tokens-other"] li'),
        ),
      ),
    },
    {
      // A reading tab, whose values take no edit and say why.
      section: 'theme-tab-view-only',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(themeDialog('color'), readyWhen(`${TOKEN_ROW}:last-child`)),
      ),
    },
    {
      // A board sheet outside the board folder at a long path, which wraps in the open help mark.
      section: 'theme-tab-long-path',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          longBoardSheet,
          themeDialog('color'),
          focusOnLoad('[role="dialog"] [aria-label="About token source"]'),
          readyWhen('[data-slot="tooltip-content"]'),
        ),
      ),
    },
    {
      // Two kits added, one on a frame, and the Add kit list open over them.
      section: 'theme-tab-kits',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          webappKits,
          noAgentChanges,
          themeDialog('kits'),
          pointerPressOnLoad(
            'section[aria-labelledby="theme-kits"] [aria-haspopup="menu"]',
          ),
          readyWhen('[role="menu"] [role="menuitem"][aria-disabled="true"]'),
        ),
      ),
    },
    {
      // The built-in five and Lora installed, each in its own face.
      section: 'theme-tab-fonts',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          installedLora([]),
          themeDialog('fonts'),
          readyWhen(REMOVE_LORA),
        ),
      ),
    },
    {
      // Find a font opened on a search for serif, three results in their samples.
      section: 'theme-tab-fonts-find',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          installedLora([]),
          foundSerifs,
          themeDialog('fonts'),
          pressOnLoad('Find a font'),
          searchFontsOnLoad('serif'),
          readyWhen(
            '[aria-label="Fonts found"] button[aria-label="Install Playfair Display"]',
          ),
        ),
      ),
    },
    {
      // Removing Lora, which hero draws in, asks first and names the frame.
      section: 'theme-tab-fonts-remove',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          installedLora(['webapp/home/hero']),
          themeDialog('fonts'),
          actWhen(REMOVE_LORA, 'Remove Lora', 'click'),
          readyWhen(CONFIRM_REMOVE),
        ),
      ),
    },
    {
      // Remove under keyboard focus, its ring the focus blue rather than red.
      section: 'theme-tab-fonts-remove-focus',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          installedLora(['webapp/home/hero']),
          fontsByKey,
          actWhen(REMOVE_LORA, 'Remove Lora', 'click'),
          focusOnLoad(CONFIRM_REMOVE),
          readyWhen(
            `${CONFIRM_REMOVE}:focus-visible:not([data-pointer-focus])`,
          ),
        ),
      ),
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
      setup: themed(
        both(
          referenceAssets,
          leftTab('Assets'),
          readyWhen('[data-video-length]'),
        ),
      ),
    },
    {
      section: 'assets-groups',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          countedAssets,
          leftTab('Assets'),
          readyWhen('[data-video-length]'),
        ),
      ),
    },
    {
      section: 'assets-menu',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          countedAssets,
          asWriter,
          leftTab('Assets'),
          pointerPressOnLoad('button[aria-label="Actions for hero.png"]'),
          readyWhen('[role="menu"] [role="menuitem"]'),
        ),
      ),
    },
    {
      section: 'assets-rename',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          countedAssets,
          asWriter,
          leftTab('Assets'),
          pointerPressOnLoad('button[aria-label="Actions for hero.png"]'),
          menuItemOnLoad('Rename'),
          readyWhen('input[aria-label="Rename hero.png"]'),
        ),
      ),
    },
    {
      section: 'assets-delete',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          countedAssets,
          linkingFrames(['webapp/home/hero', 'webapp/home/about']),
          asWriter,
          leftTab('Assets'),
          pointerPressOnLoad('button[aria-label="Actions for hero.png"]'),
          menuItemOnLoad('Delete'),
          readyWhen('[role="dialog"] [data-slot="dialog-footer"]'),
        ),
      ),
    },
    {
      section: 'assets-kits',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(kitAssets, leftTab('Assets'), readyWhen('img[src$="hero.png"]')),
      ),
    },
    {
      section: 'assets-find-idle',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          leftTab('Assets'),
          pressOnLoad('Find…'),
          readyWhen('input[aria-label="Search free images"]'),
        ),
      ),
    },
    {
      section: 'assets-find-searching',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          searchHeld,
          leftTab('Assets'),
          pressOnLoad('Find…'),
          searchOnLoad('modern house'),
          readyWhen('[aria-label="Searching"]'),
        ),
      ),
    },
    {
      section: 'assets-find-results',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          foundImages,
          leftTab('Assets'),
          pressOnLoad('Find…'),
          searchOnLoad('modern house'),
          // The refused thumbnail has given way to its file type.
          readyWhen('[aria-label="Results"] li:last-child b'),
        ),
      ),
    },
    {
      section: 'assets-find-failed',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          searchFailed,
          leftTab('Assets'),
          pressOnLoad('Find…'),
          searchOnLoad('modern house'),
          readyWhen('[role="alert"]'),
        ),
      ),
    },
    {
      section: 'assets-generate-idle',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          offerReady,
          leftTab('Assets'),
          pressOnLoad('Generate…'),
          readyWhen('textarea[aria-label="Describe the image"]'),
        ),
      ),
    },
    {
      section: 'assets-generate-done',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          offerReady,
          generatedPicture,
          leftTab('Assets'),
          pressOnLoad('Generate…'),
          promptOnLoad('a modern house at dusk'),
          // Held until the prompt is in, and past the header tab of the same name.
          pointerPressOnLoad(
            '[role="tabpanel"] button[data-slot="button"][aria-disabled="false"]',
          ),
          readyWhen('[aria-label="Generated"] img'),
        ),
      ),
    },
    {
      // The fixture's own media, a ProRes .mov naming the codec it cannot play.
      section: 'assets-media',
      theme,
      route: '/p/marketing/states',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(asWriter, leftTab('Assets'), readyWhen('[data-video-unplayable]')),
      ),
    },
    {
      // A video tile held over bare canvas, wearing the ghost of the frame a drop would make.
      section: 'drop-ghost',
      theme,
      route: '/p/marketing/states',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          asWriter,
          leftTab('Assets'),
          holdTileOverCanvas,
          readyWhen('[data-drop-ghost]'),
        ),
      ),
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
      section: 'pointer-caret',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(both(asWriter, pressOnLoad('^Pointer tools$'))),
    },
    {
      section: 'rectangle-drawn-free',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(both(asWriter, rectangleDrawnFree)),
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
      // A 1024 window leaves the 513 stage, so the 1280 shot shows the bar folded.
      section: 'toolbar-narrow',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          (page) => page.setViewportSize({ width: 1024, height: 800 }),
          pressOnLoad('^More tools$'),
        ),
      ),
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
      // The row press follows Play's in the same frame, so it enters the hero rather than selecting it.
      section: 'play-entered',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(both(pressOnLoad('^Play$'), pressOnLoad('^Select hero$'))),
    },
    {
      // The photo tuner selected in the hero's place, so each slider wears its tag and dashed link.
      section: 'controls-edit',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          tunerHero,
          pressOnLoad('^Select hero$'),
          readyWhen('[data-binding-link]'),
        ),
      ),
    },
    {
      // Play entered on the tuner with one slider moved, so Keep values draws in the hero's corner.
      section: 'controls-play',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(tunerHero, asWriter, slideOnLoad, readyWhen('[data-keep-bar]')),
      ),
    },
    {
      // Esc pressed on the tuner's focused slider, so the hero is left and Play stays on.
      section: 'controls-play-left',
      writes: 'board',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(tunerHero, escFromSliderOnLoad, readyWhen('[data-esc-left]')),
      ),
    },
    {
      section: 'avatar-menu',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      setup: themed(pressOnLoad('from git user.name$|^Account$')),
    },
    {
      section: 'rules-off',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      setup: themed(
        both(
          asWriter,
          rulesOff,
          pressOnLoad('^Project menu$'),
          chooseOnLoad('^Rules turned off$'),
          readyWhen('[role="menuitem"][aria-label="unknown-token, Turn on"]'),
        ),
      ),
    },
    {
      section: 'avatar-name-edit',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      setup: themed(
        both(
          asWriter,
          nameEditOnLoad,
          readyWhen('input[aria-label="Your name"]'),
        ),
      ),
    },
    {
      section: 'avatar-name-set',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      setup: themed(
        both(
          asWriter,
          noAuthor,
          pressOnLoad('^Account$'),
          readyWhen('[role="menuitem"][aria-label="Set your name"]'),
        ),
      ),
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
      section: 'palette-empty',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          openOverlayOnLoad('commands'),
          readyWhen('[role="listbox"] [role="option"]'),
        ),
      ),
    },
    {
      section: 'palette-no-match',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          openOverlayOnLoad('commands', 'zzzz'),
          readyWhen('[data-slot="command-empty"]'),
        ),
      ),
    },
    {
      section: 'palette-add',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      // The add rows write, so they list only in a tab that may.
      setup: themed(
        both(
          asWriter,
          openOverlayOnLoad('commands', 'add'),
          readyWhen('[role="listbox"] [role="option"]'),
        ),
      ),
    },
    {
      // The palette's way into the Theme dialog, in a reading tab too.
      section: 'palette-edit-theme',
      theme,
      route: '/p/webapp/home',
      evidence: true,
      excludeViewports: STATE_ONLY,
      mask: [AVATAR],
      setup: themed(
        both(
          openOverlayOnLoad('commands', 'edit theme'),
          readyWhen('[role="listbox"] [role="option"]'),
        ),
      ),
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
  ]
}
