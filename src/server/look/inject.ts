import { type DefaultTreeAdapterMap, parse } from 'parse5'

import { LOOK_MARKER, setFrameTheme, THEME_QUERY } from '@/shared/theme'

type ChildNode = DefaultTreeAdapterMap['childNode']
type Element = DefaultTreeAdapterMap['element']

const BOM = [0xef, 0xbb, 0xbf]

/**
 * Shows the frame's root in the theme the frame was served with, through the
 * same `setFrameTheme` the board calls on a theme change, then removes
 * itself, so the one injected element a live frame keeps is the stylesheet.
 */
const THEME_SCRIPT = `(function(s,t){if(t==='light'||t==='dark')(${setFrameTheme.toString()})(document.documentElement,t);s.remove()})(document.currentScript,new URLSearchParams(location.search).get(${JSON.stringify(THEME_QUERY)}))`

/**
 * What the frame route puts first in a frame's `head`: one marked stylesheet
 * importing `sheets` in the order given, so a later sheet overrides an
 * earlier one and the frame's own sheets override them all, then the theme
 * script.
 */
export function frameHead(sheets: readonly string[]): string {
  const imports = sheets.map((url) => `@import url(${JSON.stringify(url)});`)
  return `<style ${LOOK_MARKER}>${imports.join('')}</style><script ${LOOK_MARKER}>${THEME_SCRIPT}</script>`
}

/**
 * Splices `head` into a frame's bytes where the browser starts its `head`:
 * after a stated `head` start tag, else after a stated `html` start tag,
 * else after the doctype, else at the start past any BOM. Every byte of the
 * file stays as it was around the splice.
 */
export function injectHead(
  bytes: Uint8Array,
  head: string,
): Uint8Array<ArrayBuffer> {
  const offset = headOffset(bytes)
  const inserted = new TextEncoder().encode(head)
  const out = new Uint8Array(bytes.length + inserted.length)
  out.set(bytes.subarray(0, offset))
  out.set(inserted, offset)
  out.set(bytes.subarray(offset), offset + inserted.length)
  return out
}

/**
 * The byte offset `injectHead` splices at. The bytes are decoded as Latin-1,
 * one character per byte, so parse5's offsets are byte offsets, and markup
 * is ASCII in either decoding. A BOM decodes as three spaces, which the
 * parser skips the way a browser drops the BOM.
 */
function headOffset(bytes: Uint8Array): number {
  const bom = BOM.every((byte, index) => bytes[index] === byte)
  const text = Buffer.from(bytes).toString('latin1')
  const document = parse(bom ? `   ${text.slice(3)}` : text, {
    sourceCodeLocationInfo: true,
  })

  const html = document.childNodes.find(isElement)
  const head = html?.childNodes.find(
    (node): node is Element => isElement(node) && node.tagName === 'head',
  )
  const stated =
    head?.sourceCodeLocation?.startTag ?? html?.sourceCodeLocation?.startTag
  if (stated) return stated.endOffset

  const doctype = document.childNodes.find(
    (node) => node.nodeName === '#documentType',
  )
  return doctype?.sourceCodeLocation?.endOffset ?? (bom ? BOM.length : 0)
}

function isElement(node: ChildNode): node is Element {
  return 'tagName' in node
}
