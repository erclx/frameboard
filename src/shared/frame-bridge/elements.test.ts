import { describe, expect, it } from 'vitest'

import {
  elementAt,
  elementIndex,
  frameElements,
  renderedHash,
} from './elements'

function documentOf(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

// Indices past the skipped injected style: html 0, head 1, the own style 2, body 3, h1 4.
const PAGE = `<!doctype html><head><style data-frameboard data-hash="${'c'.repeat(64)}"></style><style data-hash="other"></style></head><body><h1>Hi</h1></body>`

describe('renderedHash', () => {
  it('reads the hash the frame route stamped on its style', () => {
    expect(renderedHash(documentOf(PAGE))).toBe('c'.repeat(64))
  })

  it('answers null for a document the route never stamped', () => {
    const document = documentOf(
      '<!doctype html><head><style data-hash="own"></style></head><body></body>',
    )

    expect(renderedHash(document)).toBeNull()
  })
})

describe('frameElements', () => {
  it('skips the elements the frame route injected', () => {
    const tags = frameElements(documentOf(PAGE)).map(
      ({ localName }) => localName,
    )

    expect(tags).toEqual(['html', 'head', 'style', 'body', 'h1'])
  })
})

describe('elementAt and elementIndex', () => {
  it('address the same element by its file index', () => {
    const document = documentOf(PAGE)
    const heading = document.querySelector('h1')

    expect(elementAt(document, 4)).toBe(heading)
    expect(heading && elementIndex(document, heading)).toBe(4)
  })

  it('answer null for an index past the file and an injected element', () => {
    const document = documentOf(PAGE)
    const injected = document.querySelector('style[data-frameboard]')

    expect(elementAt(document, 9)).toBeNull()
    expect(injected && elementIndex(document, injected)).toBeNull()
  })
})
