import { readFileSync } from 'node:fs'

import type { Browser } from 'playwright-core'

import { contentHash, parseFrame } from '@/server/edit/address'
import { FrameboardError } from '@/shared/errors'
import type { InspectedElement, InspectResult } from '@/shared/records/inspect'
import type { FrameRecord } from '@/shared/records/list'
import type { Theme } from '@/shared/theme'

import { openFrame } from './render'

/** One element as the page reports it, `box` null when it has no layout box. */
export type LiveElement = Omit<InspectedElement, 'box'> & {
  box: InspectedElement['box'] | null
}

/**
 * The first place the browser's element order leaves the file's, by tag. A
 * script-added or browser-built element shifts every index after it, so past
 * this point an index from the page would edit another element.
 */
export function firstDisagreement(
  live: readonly string[],
  file: readonly string[],
): {
  index: number
  live: string | undefined
  file: string | undefined
} | null {
  const length = Math.max(live.length, file.length)
  for (let index = 0; index < length; index += 1) {
    if (live[index]?.toLowerCase() !== file[index]?.toLowerCase()) {
      return { index, live: live[index], file: file[index] }
    }
  }
  return null
}

/** The elements with a layout box, which keep the index of their place in the file. */
export function renderedOnly(live: readonly LiveElement[]): InspectedElement[] {
  return live.flatMap((element) =>
    element.box ? [{ ...element, box: element.box }] : [],
  )
}

/**
 * Loads a frame the way `capture` does and reports each rendered element with
 * its `edit` index, box, and computed color and type. The file is read before
 * and after the load, and a hash that moved refuses `stale-address`. A live
 * order that differs from the file's refuses `address-mismatch`.
 */
export async function inspectFrame(
  browser: Browser,
  {
    baseUrl,
    frame,
    theme,
    index,
  }: { baseUrl: string; frame: FrameRecord; theme: Theme; index?: number },
): Promise<InspectResult> {
  const bytes = readFileSync(frame.path)
  const hash = contentHash(bytes)
  const tree = parseFrame(bytes.toString('utf8'))

  const opened = await openFrame(browser, {
    baseUrl,
    ref: frame.ref,
    box: frame.box,
    theme,
  })
  let live: LiveElement[]
  try {
    live = await opened.page.evaluate(readLiveElements)
  } finally {
    await opened.close()
  }

  if (contentHash(readFileSync(frame.path)) !== hash) {
    throw new FrameboardError(
      'stale-address',
      `${frame.ref} changed while it was inspected, so nothing is reported. Inspect it again.`,
      { ref: frame.ref },
    )
  }

  const differs = firstDisagreement(
    live.map((element) => element.tag),
    tree.elements.map((element) => element.tagName),
  )
  if (differs) {
    throw new FrameboardError(
      'address-mismatch',
      `${frame.ref} renders ${describeTag(differs.live)} where its file has ${describeTag(differs.file)} at element ${differs.index}, so a script has added or removed elements and an index would edit the wrong one. State the elements in the file.`,
      { ref: frame.ref, ...differs },
    )
  }
  if (index !== undefined && index >= live.length) {
    throw new FrameboardError(
      'invalid-address',
      `${frame.ref} holds elements 0 to ${live.length - 1}, so ${index} names none`,
      { ref: frame.ref, index },
    )
  }

  const rendered = renderedOnly(live)
  if (
    index !== undefined &&
    !rendered.some((element) => element.index === index)
  ) {
    throw new FrameboardError(
      'invalid-address',
      `${frame.ref} element ${index} is <${live[index]?.tag}> and has no layout box, so inspect reports nothing for it`,
      { ref: frame.ref, index },
    )
  }
  return {
    ref: frame.ref,
    theme,
    hash,
    editable: tree.unstated === undefined,
    elements:
      index === undefined
        ? rendered
        : rendered.filter((element) => element.index === index),
  }
}

function describeTag(tag: string | undefined): string {
  return tag === undefined ? 'no element' : `<${tag.toLowerCase()}>`
}

// Runs in the page, so it carries everything it reads. It counts the way
// `readTextElements` does, skipping the elements the look routes inject, and
// reports every counted element so an unrendered one still holds its index.
function readLiveElements(): LiveElement[] {
  const found: LiveElement[] = []
  for (const element of document.querySelectorAll('*')) {
    if (element.closest('[data-frameboard]')) continue
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    const text = [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    found.push({
      index: found.length,
      tag: element.tagName.toLowerCase(),
      id: element.getAttribute('id'),
      classes: [...element.classList],
      text: text.slice(0, 80),
      box:
        element.getClientRects().length > 0
          ? {
              x: rect.x + window.scrollX,
              y: rect.y + window.scrollY,
              width: rect.width,
              height: rect.height,
            }
          : null,
      color: style.color,
      backgroundColor: style.backgroundColor,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
    })
  }
  return found
}
