import { describe, expect, it } from 'vitest'

import { renderedHash } from './frame-dom'

function documentOf(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

describe('renderedHash', () => {
  it('reads the hash the frame route stamped on its style', () => {
    const document = documentOf(
      `<!doctype html><head><style data-frameboard data-hash="${'c'.repeat(64)}"></style><style data-hash="other"></style></head><body></body>`,
    )

    expect(renderedHash(document)).toBe('c'.repeat(64))
  })

  it('answers null for a document the route never stamped', () => {
    const document = documentOf(
      '<!doctype html><head><style data-hash="own"></style></head><body></body>',
    )

    expect(renderedHash(document)).toBeNull()
  })
})
