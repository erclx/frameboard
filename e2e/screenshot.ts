import type { Locator, Page } from '@playwright/test'
import { chromium } from '@playwright/test'
import { mkdir } from 'fs/promises'
import path from 'path'

import { CAPTURE_CASES, EVIDENCE_ROOT } from './capture'

/** One addressable part of a route, captured beside the whole-page frame. */
interface CaptureSection {
  name: string
  selector: string
}

interface Viewport {
  readonly name: string
  readonly width: number
  readonly height: number
  /** Whether a case flagged `evidence: true` also writes its frames at this width. */
  readonly evidence: boolean
}

/**
 * Widths every case is crossed with. Only the 320 base and the desktop width
 * carry `evidence`, since committing every width multiplies the tracked frames.
 */
const VIEWPORTS: readonly Viewport[] = [
  { name: '320', width: 320, height: 800, evidence: true },
  { name: '768', width: 768, height: 800, evidence: false },
  { name: '1280', width: 1280, height: 800, evidence: true },
  { name: '1536', width: 1536, height: 800, evidence: false },
]

interface CaptureCase {
  section: string
  theme: string
  route: string
  /** Names of viewports this case skips, for a route that reflows rather than breaks at that width. */
  excludeViewports?: readonly string[]
  evidence?: boolean
  /** Selectors painted over in every frame the case writes, for a value that moves between runs with no code change. */
  mask?: readonly string[]
  sections?: CaptureSection[]
  setup?: (page: Page) => Promise<void>
}

// Frameboard's cases live in e2e/capture/, which a tooling sync never writes.
const CASES: CaptureCase[] = CAPTURE_CASES

/** One case at one viewport, which is the unit a filter selects and a context is built for. */
interface CaptureRun {
  readonly captureCase: CaptureCase
  readonly viewport: Viewport
  readonly label: string
}

const ALL_RUNS: readonly CaptureRun[] = CASES.flatMap((captureCase) =>
  VIEWPORTS.filter(
    (viewport) => !captureCase.excludeViewports?.includes(viewport.name),
  ).map((viewport) => ({
    captureCase,
    viewport,
    label: `${captureCase.section}/${viewport.name}--${captureCase.theme}`,
  })),
)

const args = process.argv.slice(2)
const checkConsoleClean = args.includes('--check-console-clean')
const requireBaseUrl = args.includes('--require-base-url')

if (requireBaseUrl && !process.env.SCREENSHOT_BASE_URL) {
  console.error('SCREENSHOT_BASE_URL is required with --require-base-url')
  process.exit(1)
}

const BASE_URL = process.env.SCREENSHOT_BASE_URL ?? 'http://localhost:4173'

let hostname: string
try {
  hostname = new URL(BASE_URL).hostname
} catch {
  console.error(`SCREENSHOT_BASE_URL is not a valid URL: ${BASE_URL}`)
  process.exit(1)
}

const OUT_DIR = path.join('screenshots', hostname)

const SCREENSHOT_FILTER = process.env.SCREENSHOT_FILTER?.trim() ?? ''

const filterTerms = SCREENSHOT_FILTER.split(',')
  .map((term) => term.trim())
  .filter(Boolean)

const RUNS =
  filterTerms.length > 0
    ? ALL_RUNS.filter((run) =>
        filterTerms.some((term) => run.label.includes(term)),
      )
    : ALL_RUNS

if (filterTerms.length > 0 && RUNS.length === 0) {
  console.error(
    `No cases matched SCREENSHOT_FILTER=${SCREENSHOT_FILTER}. Available labels:\n${ALL_RUNS.map(
      (run) => `  ${run.label}`,
    ).join('\n')}`,
  )
  process.exit(1)
}

/** Every wait on a lazy load is bounded explicitly. */
const SETTLE_TIMEOUT = 15_000

/** Marks the chrome a section frame drops, set on the page and read by the screenshot's own stylesheet. */
const FLOATING_ATTRIBUTE = 'data-capture-floating'

/**
 * Scrolls each named section into view once before anything is shot, since a
 * full page capture scrolls nothing and lazy loads wait on a scroll.
 */
async function settle(
  page: Page,
  label: string,
  sections: readonly CaptureSection[],
): Promise<CaptureSection[]> {
  const present: CaptureSection[] = []
  for (const section of sections) {
    const element = page.locator(section.selector)
    // A miss is warned and skipped, since a scroll on nothing waits out the timeout.
    if ((await element.count()) === 0) {
      console.warn(
        `${label}: no element matches ${section.selector}, named as section "${section.name}". Skipped.`,
      )
      continue
    }
    present.push(section)
    await element.scrollIntoViewIfNeeded()
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  // A second `networkidle` never re-arms for a load the scroll started.
  await page.waitForFunction(
    () => {
      if (document.readyState !== 'complete') return false
      // A visible staging layer still has empty frames, and a hidden one never settles.
      const staging = document.querySelectorAll('[data-staging]')
      if ([...staging].some((layer) => layer.checkVisibility())) return false
      for (const image of document.images) if (!image.complete) return false
      return true
    },
    undefined,
    { timeout: SETTLE_TIMEOUT },
  )
  // Waited on from inside, since a frame on its own port hides its fonts.
  for (const frame of page.mainFrame().childFrames()) {
    await frame
      .waitForFunction(
        () =>
          document.readyState === 'complete' &&
          document.fonts.status === 'loaded',
        undefined,
        { timeout: SETTLE_TIMEOUT },
      )
      .catch((error: unknown) => {
        // A frame the board unmounted meanwhile has nothing left to wait on.
        if (!frame.isDetached()) throw error
      })
  }
  return present
}

/**
 * Marks sticky and fixed chrome, which would ride a section's scroll over the
 * part it shows. An attribute leaves no state behind for the shot to restore.
 */
async function markFloatingChrome(page: Page) {
  await page.evaluate((attribute) => {
    for (const node of document.querySelectorAll('body *')) {
      const { position } = getComputedStyle(node)
      if (position === 'sticky' || position === 'fixed') {
        node.setAttribute(attribute, '')
      }
    }
  }, FLOATING_ATTRIBUTE)
}

/**
 * Whether an opaque element outside this one paints over its center, since a
 * mask's bar draws above every layer and would land across an open dialog.
 */
async function isCovered(element: Locator): Promise<boolean> {
  return element.evaluate((target: HTMLElement | SVGElement) => {
    const box = target.getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    // The hit test answers only inside the window.
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) {
      return false
    }
    // A dimmed backdrop still shows the value through, so only a solid box covers.
    const isOpaque = (node: Element) => {
      const style = getComputedStyle(node)
      if (style.visibility === 'hidden') return false
      const alpha = style.backgroundColor.match(/[\d.]+/g)?.[3]
      const solid =
        style.backgroundColor !== 'transparent' &&
        (alpha === undefined || Number(alpha) === 1)
      if (!solid && !(node instanceof HTMLImageElement)) return false
      for (let at: Element | null = node; at !== null; at = at.parentElement) {
        if (Number(getComputedStyle(at).opacity) < 1) return false
      }
      return true
    }
    // The hit test skips `pointer-events: none`, so the target is made hittable.
    const { pointerEvents } = target.style
    const priority = target.style.getPropertyPriority('pointer-events')
    target.style.setProperty('pointer-events', 'auto', 'important')
    try {
      for (const hit of document.elementsFromPoint(x, y)) {
        if (target === hit || target.contains(hit) || hit.contains(target)) {
          return false
        }
        if (isOpaque(hit)) return true
      }
      return false
    } finally {
      target.style.setProperty('pointer-events', pointerEvents, priority)
    }
  })
}

/**
 * Turns a case's mask selectors into the locators every frame paints over,
 * reporting and keeping out a selector matching nothing or a covered match.
 */
async function resolveMask(
  page: Page,
  label: string,
  selectors: readonly string[],
): Promise<Locator[]> {
  const mask: Locator[] = []
  for (const selector of selectors) {
    const element = page.locator(selector)
    const count = await element.count()
    if (count === 0) {
      console.warn(
        `${label}: no element matches ${selector}, named as a mask. Skipped.`,
      )
      continue
    }
    const matches = Array.from({ length: count }, (_, index) =>
      element.nth(index),
    )
    const covered = await Promise.all(matches.map(isCovered))
    const shown = matches.filter((_, index) => !covered[index])
    const skipped = count - shown.length
    if (skipped > 0) {
      console.warn(
        `${label}: ${skipped} of ${count} elements matching ${selector}, named as a mask, are covered by another element. Skipped.`,
      )
    }
    if (skipped === 0) mask.push(element)
    else mask.push(...shown)
  }
  return mask
}

async function shoot(
  page: Page,
  dir: string,
  file: string,
  mask: Locator[],
  selector?: string,
) {
  await mkdir(dir, { recursive: true })
  const target = path.join(dir, file)
  if (selector === undefined) {
    await page.screenshot({ path: target, fullPage: true, mask })
  } else {
    // Dropping floating chrome from its layer moves no box, since it keeps its space.
    await page.locator(selector).screenshot({
      path: target,
      mask,
      style: `[${FLOATING_ATTRIBUTE}] { position: static !important; }`,
    })
  }
  console.log(`captured ${target}`)
}

const browser = await chromium.launch()
const consoleErrors: string[] = []
let ranCases = 0

for (const { captureCase, viewport, label } of RUNS) {
  if (captureCase.evidence && requireBaseUrl) continue

  ranCases++
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    // A page honoring the preference lands its own motion at the end state,
    // which is what a still frame has to show. Playwright reads it as a
    // context option, so it reaches no page written beside `viewport` above.
    reducedMotion: 'reduce',
  })
  const page = await context.newPage()

  if (checkConsoleClean) {
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(`${label}: ${msg.text()}`)
      }
    })
  }

  if (captureCase.setup) await captureCase.setup(page)

  await page.goto(`${BASE_URL}${captureCase.route}`)
  await page.waitForLoadState('networkidle')

  const sections = await settle(page, label, captureCase.sections ?? [])
  const mask = await resolveMask(page, label, captureCase.mask ?? [])

  const sweepDir = path.join(OUT_DIR, captureCase.section)
  const evidenceDir = path.join(EVIDENCE_ROOT, captureCase.section)
  const file = `${viewport.name}--${captureCase.theme}.png`
  const writesEvidence = captureCase.evidence && viewport.evidence

  await shoot(page, sweepDir, file, mask)
  if (writesEvidence) await shoot(page, evidenceDir, file, mask)

  if (sections.length > 0) await markFloatingChrome(page)

  for (const { name, selector } of sections) {
    await shoot(page, path.join(sweepDir, name), file, mask, selector)
    if (writesEvidence) {
      await shoot(page, path.join(evidenceDir, name), file, mask, selector)
    }
  }

  await context.close()
}

await browser.close()

if (requireBaseUrl && ranCases === 0) {
  console.error(
    'every CASES entry is flagged evidence: true, so --require-base-url skipped all of them and checked nothing',
  )
  process.exit(1)
}

if (checkConsoleClean && consoleErrors.length > 0) {
  console.error('console errors detected:')
  for (const error of consoleErrors) console.error(`  ${error}`)
  process.exit(1)
}
