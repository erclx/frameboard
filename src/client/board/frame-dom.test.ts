import { afterEach, describe, expect, it } from 'vitest'

import { renderedHash } from '@/shared/frame-bridge/elements'

import { RESTAMPED, stampRenderedHash } from './frame-dom'

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
