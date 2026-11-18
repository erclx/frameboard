import { type DefaultTreeAdapterMap, parse } from 'parse5'

import {
  LOOK_MARKER,
  RENDERED_HASH,
  setFrameTheme,
  THEME_QUERY,
} from '@/shared/theme'
import { version } from '@/shared/version'

type ChildNode = DefaultTreeAdapterMap['childNode']
type Element = DefaultTreeAdapterMap['element']

const BOM = [0xef, 0xbb, 0xbf]

/**
 * Shows the frame's root in the theme the frame was served with, through the
 * same `setFrameTheme` the board calls on a theme change, then removes
 * itself, so the one injected element a live frame keeps is the stylesheet.
 */
export const THEME_SCRIPT = `(function(s,t){if(t==='light'||t==='dark')(${setFrameTheme.toString()})(document.documentElement,t);s.remove()})(document.currentScript,new URLSearchParams(location.search).get(${JSON.stringify(THEME_QUERY)}))`

/** Where the look route serves the frame bridge's script, under the running release. */
export const BRIDGE_URL = `/frameboard/bridge/v${version}/frame-bridge.js`

/**
 * The frame route's injected `head`, one stylesheet carrying `hash` as its one
 * other attribute, since another element would shift every live index. Given
 * no `bridge`, as a kit preview's policy allows none, it loads no bridge.
 */
export function frameHead(
  sheets: readonly string[],
  hash: string,
  bridge?: string,
): string {
  const imports = sheets.map((url) => `@import url(${JSON.stringify(url)});`)
  const script =
    bridge === undefined
      ? ''
      : `<script ${LOOK_MARKER} src=${JSON.stringify(bridge)}></script>`
  return `<style ${LOOK_MARKER} ${RENDERED_HASH}="${hash}">${imports.join('')}</style><script ${LOOK_MARKER}>${THEME_SCRIPT}</script>${script}`
}

/**
 * Splices `head` where the browser starts its `head`, keeping every byte of
 * the file around it.
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
 * The splice offset, decoded as Latin-1 so parse5's offsets are byte offsets.
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
