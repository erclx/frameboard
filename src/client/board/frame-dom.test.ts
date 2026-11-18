import { afterEach, describe, expect, it } from 'vitest'

import { renderedHash } from '@/shared/frame-bridge/elements'

import { request } from './bridge/channel'
import { shownHashOf } from './bridge/shown'
import { RESTAMPED, stampRenderedHash } from './frame-dom'

const BRIDGE =
  '<script data-frameboard type="module" src="/src/frame-bridge/main.ts"></script>'

describe('stampRenderedHash', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  /** An iframe showing `head` beside the bridge, once the bridge has announced what it shows. */
  async function iframeWith(head: string): Promise<HTMLIFrameElement> {
    const iframe = document.createElement('iframe')
    const loaded = new Promise((resolve) =>
      iframe.addEventListener('load', resolve, { once: true }),
    )
    iframe.srcdoc = `<!doctype html><head>${head}${BRIDGE}</head><body></body>`
    document.body.append(iframe)
    await loaded
    return iframe
  }

  it('holds the new hash at once and tells the iframe once', async () => {
    const iframe = await iframeWith(
      '<style data-frameboard data-hash="old"></style>',
    )
    await expect.poll(() => shownHashOf(iframe)).toBe('old')
    let told = 0
    iframe.addEventListener(RESTAMPED, () => (told += 1))

    stampRenderedHash(iframe, 'new')

    expect(shownHashOf(iframe)).toBe('new')
    expect(told).toBe(1)
  })

  it("moves the frame's own stamp to the new hash", async () => {
    const iframe = await iframeWith(
      '<style data-frameboard data-hash="old"></style>',
    )
    await expect.poll(() => shownHashOf(iframe)).toBe('old')

    stampRenderedHash(iframe, 'new')
    // The frame answers a later request after the restamp it was sent first.
    await request(iframe, 'element-box', { index: 0, hash: '' })

    const shown = iframe.contentDocument
    expect(shown && renderedHash(shown)).toBe('new')
  })

  it('leaves a page the route never stamped alone, telling nothing', async () => {
    const iframe = await iframeWith('<style data-hash="own"></style>')
    await request(iframe, 'element-box', { index: 0, hash: '' })
    let told = 0
    iframe.addEventListener(RESTAMPED, () => (told += 1))

    stampRenderedHash(iframe, 'new')

    expect(shownHashOf(iframe)).toBeNull()
    expect(told).toBe(0)
  })
})
