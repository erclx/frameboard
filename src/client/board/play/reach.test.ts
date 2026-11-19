import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { frameOf } from '@/test/board'
import { BRIDGE } from '@/test/frame-bridge'

import { pageReach, watchReach } from './reach'

/** Mounts a frame's root holding a live, bridged iframe of `body`, as the canvas draws one. */
async function mount(ref: string, body: string): Promise<void> {
  const root = document.createElement('div')
  root.dataset.frame = ref
  const iframe = document.createElement('iframe')
  root.append(iframe)
  document.body.append(root)
  await new Promise((resolve) => {
    iframe.addEventListener('load', resolve, { once: true })
    iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${'c'.repeat(64)}"></style>${BRIDGE}</head><body>${body}</body></html>`
  })
}

describe('pageReach', () => {
  let stop: (() => void) | undefined

  beforeEach(() => {
    stop = watchReach(() => {})
  })

  afterEach(() => {
    stop?.()
    document.body.replaceChildren()
  })

  it('reads a page of static frames as static once both answer', async () => {
    const a = frameOf('a')
    const b = frameOf('b')
    await mount(a.ref, '<h1>A</h1>')
    await mount(b.ref, '<p>B</p>')

    await expect.poll(() => pageReach([a, b])).toBe('static')
  })

  it('reads a page with one button as clickable', async () => {
    const a = frameOf('a')
    const b = frameOf('b')
    await mount(a.ref, '<h1>A</h1>')
    await mount(b.ref, '<button>B</button>')

    await expect.poll(() => pageReach([a, b])).toBe('clickable')
  })

  it('cannot tell while a shown frame has no live page', async () => {
    const a = frameOf('a')
    const culled = frameOf('culled')
    await mount(a.ref, '<h1>A</h1>')
    await expect.poll(() => pageReach([a])).toBe('static')

    expect(pageReach([a, culled])).toBe('unread')
  })

  it('leaves a hidden frame out', async () => {
    const a = frameOf('a')
    const hidden = frameOf('hidden', { hidden: true })
    await mount(a.ref, '<h1>A</h1>')

    await expect.poll(() => pageReach([a, hidden])).toBe('static')
  })

  it('cannot tell on a page showing no frame', () => {
    expect(pageReach([])).toBe('unread')
  })

  it('cannot tell for a frame whose page never answered', async () => {
    const a = frameOf('a')
    const root = document.createElement('div')
    root.dataset.frame = a.ref
    const iframe = document.createElement('iframe')
    root.append(iframe)
    document.body.append(root)
    await new Promise((resolve) => {
      iframe.addEventListener('load', resolve, { once: true })
      iframe.srcdoc = '<h1>No bridge</h1>'
    })

    expect(pageReach([a])).toBe('unread')
  })
})
