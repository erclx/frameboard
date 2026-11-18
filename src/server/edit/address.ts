import { createHash } from 'node:crypto'

import { type DefaultTreeAdapterTypes, parse } from 'parse5'

export type Element = DefaultTreeAdapterTypes.Element

/** The wrappers a browser builds around any frame, which the server marks as implied. */
const WRAPPERS = new Set(['html', 'head', 'body'])

export interface FrameTree {
  readonly document: DefaultTreeAdapterTypes.Document
  /** Every element the browser builds, in `querySelectorAll('*')` order. */
  readonly elements: readonly Element[]
  /** An element the tree builder made that the file does not state, beyond the wrappers. */
  readonly unstated: Element | undefined
}

/** SHA-256 hex over the file's raw bytes, the hash an address carries. */
export function contentHash(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function hasTag(node: DefaultTreeAdapterTypes.Node): node is Element {
  return 'tagName' in node
}

/**
 * Parses a frame as the browser builds it, a leading BOM read as a space,
 * since parse5 would imply wrappers where the browser drops it.
 */
export function parseFrame(source: string): FrameTree {
  const document = parse(source.replace(/^\uFEFF/, ' '), {
    sourceCodeLocationInfo: true,
  })
  const elements: Element[] = []
  // Skips a template's `content`, as `querySelectorAll` does.
  const walk = (node: DefaultTreeAdapterTypes.ParentNode): void => {
    for (const child of node.childNodes) {
      if (!hasTag(child)) continue
      elements.push(child)
      walk(child)
    }
  }
  walk(document)
  const unstated = elements.find(
    (element) =>
      !element.sourceCodeLocation?.startTag && !WRAPPERS.has(element.tagName),
  )
  return { document, elements, unstated }
}
