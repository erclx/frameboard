import { afterEach, describe, expect, it } from 'vitest'

import { BRIDGE_TAG } from '@/shared/frame-bridge/messages'

import { request } from './channel'
import { holdShown, shownHashOf, subscribeShown } from './shown'

const HASH = 'c'.repeat(64)
const NEXT = 'd'.repeat(64)
const BRIDGE =
  '<script data-frameboard type="module" src="/src/frame-bridge/main.ts"></script>'

let frames: HTMLIFrameElement[] = []
let stops: (() => void)[] = []

afterEach(() => {
  for (const stop of stops) stop()
  stops = []
  for (const frame of frames) frame.remove()
  frames = []
})

function page(hash: string, bridge = BRIDGE): string {
  return `<!doctype html><html><head><style data-frameboard data-hash="${hash}"></style>${bridge}</head><body></body></html>`
}

/** Shows `html` in the iframe, resolved once it has loaded. */
function show(iframe: HTMLIFrameElement, html: string): Promise<void> {
  const loaded = new Promise<void>((resolve) =>
    iframe.addEventListener('load', () => resolve(), { once: true }),
  )
  iframe.srcdoc = html
  return loaded
}

async function mount(html: string): Promise<HTMLIFrameElement> {
  const iframe = document.createElement('iframe')
  frames.push(iframe)
  document.body.append(iframe)
  await show(iframe, html)
  return iframe
}

/** Every iframe a held hash changed for, in order. */
function heard(): HTMLIFrameElement[] {
  const changed: HTMLIFrameElement[] = []
  stops.push(subscribeShown((iframe) => changed.push(iframe)))
  return changed
}

describe('shownHashOf', () => {
  it('holds the hash a new page announces', async () => {
    const iframe = await mount(page(HASH))

    await expect.poll(() => shownHashOf(iframe)).toBe(HASH)
  })

  it('moves to the hash a restamp announces', async () => {
    const iframe = await mount(page(HASH))
    await expect.poll(() => shownHashOf(iframe)).toBe(HASH)
    const changed = heard()

    await request(iframe, 'restamp', { hash: NEXT })

    expect(shownHashOf(iframe)).toBe(NEXT)
    expect(changed).toEqual([iframe])
  })

  it('drops the hash as the page goes, before the next one announces', async () => {
    const iframe = await mount(page(HASH))
    await expect.poll(() => shownHashOf(iframe)).toBe(HASH)
    const held: (string | null)[] = []
    stops.push(subscribeShown((changed) => held.push(shownHashOf(changed))))

    await show(iframe, page(NEXT))

    await expect.poll(() => held).toEqual([null, NEXT])
  })

  it('reads null for a page with no bridge', async () => {
    const iframe = await mount(page(HASH, ''))

    expect(shownHashOf(iframe)).toBeNull()
  })

  it('ignores a hash announced in another shape', async () => {
    const iframe = await mount(page(HASH, ''))
    const view = iframe.contentWindow as
      | (Window & { eval: (code: string) => unknown })
      | null
    const message = { tag: BRIDGE_TAG, kind: 'shown', page: 'p1', hash: 7 }

    view?.eval(`parent.postMessage(${JSON.stringify(message)}, '*')`)
    await request(iframe, 'element-box', { index: 0, hash: '' })

    expect(shownHashOf(iframe)).toBeNull()
  })
})

describe('holdShown', () => {
  it('holds a hash ahead of the frame, telling the listeners once', async () => {
    const iframe = await mount(page(HASH))
    await expect.poll(() => shownHashOf(iframe)).toBe(HASH)
    const changed = heard()

    holdShown(iframe, NEXT)
    holdShown(iframe, NEXT)

    expect(shownHashOf(iframe)).toBe(NEXT)
    expect(changed).toEqual([iframe])
  })
})
