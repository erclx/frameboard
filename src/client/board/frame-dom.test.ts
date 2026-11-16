import { afterEach, describe, expect, it } from 'vitest'

import { renderedHash, RESTAMPED, stampRenderedHash } from './frame-dom'

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

describe('stampRenderedHash', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  function iframeWith(head: string): HTMLIFrameElement {
    const iframe = document.createElement('iframe')
    document.body.append(iframe)
    iframe.contentDocument?.write(
      `<!doctype html><head>${head}</head><body></body>`,
    )
    iframe.contentDocument?.close()
    return iframe
  }

  it('moves the stamp to the new hash and tells the iframe once', () => {
    const iframe = iframeWith('<style data-frameboard data-hash="old"></style>')
    let told = 0
    iframe.addEventListener(RESTAMPED, () => (told += 1))

    stampRenderedHash(iframe, 'new')

    const shown = iframe.contentDocument
    expect(shown && renderedHash(shown)).toBe('new')
    expect(told).toBe(1)
  })

  it('leaves a page the route never stamped alone, telling nothing', () => {
    const iframe = iframeWith('<style data-hash="own"></style>')
    let told = 0
    iframe.addEventListener(RESTAMPED, () => (told += 1))

    stampRenderedHash(iframe, 'new')

    const shown = iframe.contentDocument
    expect(shown && renderedHash(shown)).toBeNull()
    expect(told).toBe(0)
  })
})
