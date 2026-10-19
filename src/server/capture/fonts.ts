import type { Page } from 'playwright-core'

import { FrameboardError } from '@/shared/errors'

/**
 * Families the browser maps to a face itself, so no frame has to supply one.
 * The two system aliases are here because system font stacks open with them.
 */
const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
  '-apple-system',
  'blinkmacsystemfont',
])

/** The families of a computed `font-family` list, unquoted, in order. */
export function parseFontFamilies(fontFamily: string): string[] {
  const families: string[] = []
  let current = ''
  let quote: string | null = null
  for (const char of fontFamily) {
    if (quote) {
      if (char === quote) quote = null
      else current += char
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === ',') {
      families.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  families.push(current.trim())
  return families.filter((family) => family !== '')
}

/**
 * The family a text element asks for, being the first in its stack, or null
 * when that one is generic or is the browser's own default. Later families
 * are fallbacks the author chose, so they are never looked for.
 *
 * The default is what a frame declaring no font computes to, such as "Times
 * New Roman" in the Linux headless shell, where it is not installed. A frame
 * naming that family on purpose is skipped too, since a computed style cannot
 * tell the two apart.
 */
export function requestedFamily(
  fontFamily: string,
  defaultFamily: string,
): string | null {
  const [first] = parseFontFamilies(fontFamily)
  if (first === undefined || GENERIC_FAMILIES.has(first.toLowerCase())) {
    return null
  }
  const [browserDefault] = parseFontFamilies(defaultFamily)
  if (first.toLowerCase() === browserDefault?.toLowerCase()) return null
  return first
}

interface TextRead {
  elements: TextElement[]
  /** The computed `font-family` of an unstyled document in this browser. */
  defaultFamily: string
}

interface TextElement {
  /** The element's address index, skipping Frameboard's own injected elements. */
  index: number
  /** Its position in `querySelectorAll('*')`, which the protocol's node list shares. */
  domIndex: number
  fontFamily: string
}

/**
 * Refuses `font-missing` when a text element's requested family neither
 * loaded as a web face nor rendered from an installed font of that name, so
 * a capture never shows the browser's fallback as the frame's design.
 */
export async function assertFontsPresent(
  page: Page,
  ref: string,
): Promise<void> {
  const { elements, defaultFamily } = await page.evaluate(readTextElements)
  const firstUse = new Map<string, TextElement>()
  for (const element of elements) {
    const family = requestedFamily(element.fontFamily, defaultFamily)
    if (family === null) continue
    const key = family.toLowerCase()
    if (!firstUse.has(key)) firstUse.set(key, element)
  }
  if (firstUse.size === 0) return

  const loaded = new Set(
    (await page.evaluate(loadedFamilies)).map((family) => family.toLowerCase()),
  )
  const unloaded = [...firstUse].filter(([key]) => !loaded.has(key))
  if (unloaded.length === 0) return

  const platform = await platformFamilies(
    page,
    unloaded.map(([, element]) => element.domIndex),
  )
  for (const [key, element] of unloaded) {
    if (platform.get(element.domIndex)?.has(key)) continue
    const family = requestedFamily(element.fontFamily, defaultFamily) ?? key
    throw new FrameboardError(
      'font-missing',
      `${ref} asks for the font ${family}, first at element ${element.index}, and it neither loads nor is installed. Load it from the project's assets/ or name an installed family.`,
      { ref, family, element: element.index },
    )
  }
}

// Runs in the page, so it carries everything it reads.
function readTextElements(): TextRead {
  const notText = new Set([
    'HTML',
    'HEAD',
    'TITLE',
    'SCRIPT',
    'STYLE',
    'NOSCRIPT',
    'TEMPLATE',
  ])
  // An unstyled document reads the browser's own default, which the frame's
  // styles cannot reach. The probe is gone before the elements are counted.
  const probe = document.createElement('iframe')
  document.documentElement.append(probe)
  const defaultFamily = probe.contentDocument
    ? getComputedStyle(probe.contentDocument.documentElement).fontFamily
    : ''
  probe.remove()

  const found: TextElement[] = []
  let index = 0
  const all = document.querySelectorAll('*')
  for (let domIndex = 0; domIndex < all.length; domIndex += 1) {
    const element = all[domIndex]
    if (!element) continue
    if (element.closest('[data-frameboard]')) continue
    const own = index
    index += 1
    if (notText.has(element.tagName.toUpperCase())) continue
    const hasText = [...element.childNodes].some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
    )
    if (!hasText) continue
    found.push({
      index: own,
      domIndex,
      fontFamily: getComputedStyle(element).fontFamily,
    })
  }
  return { elements: found, defaultFamily }
}

function loadedFamilies(): string[] {
  return [...document.fonts]
    .filter((face) => face.status === 'loaded')
    .map((face) => face.family.replace(/^["']|["']$/g, ''))
}

/**
 * The platform families the browser rendered each node's text in, by its
 * position in `querySelectorAll('*')`, read through the DevTools protocol.
 */
async function platformFamilies(
  page: Page,
  domIndexes: number[],
): Promise<Map<number, Set<string>>> {
  const session = await page.context().newCDPSession(page)
  try {
    await session.send('DOM.enable')
    await session.send('CSS.enable')
    const { root } = await session.send('DOM.getDocument', { depth: 0 })
    const { nodeIds } = await session.send('DOM.querySelectorAll', {
      nodeId: root.nodeId,
      selector: '*',
    })
    const families = new Map<number, Set<string>>()
    for (const domIndex of domIndexes) {
      const nodeId = nodeIds[domIndex]
      if (nodeId === undefined) continue
      const { fonts } = await session.send('CSS.getPlatformFontsForNode', {
        nodeId,
      })
      families.set(
        domIndex,
        new Set(fonts.map((font) => font.familyName.toLowerCase())),
      )
    }
    return families
  } finally {
    await session.detach()
  }
}
