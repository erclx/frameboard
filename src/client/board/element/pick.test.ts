import { afterEach, describe, expect, it } from 'vitest'

import type { ElementTree } from '@/shared/records/elements'
import { frameOf } from '@/test/board'

import { pickElement } from './pick'

const HASH = 'c'.repeat(64)
const HERO = frameOf('hero', {
  box: { x: 100, y: 50, width: 400, height: 300 },
})

// Indices: html 0, head 1, style 2 is injected and skipped, body 2, main 3, h1 4, span 5.
const SOURCE = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}">body{margin:0}h1{margin:0;height:40px;font-size:10px}span{display:inline-block;width:60px;height:20px}</style></head><body><main style="padding:20px"><h1>Hi <span>there</span></h1></main></body></html>`

const TREE: ElementTree = {
  ref: HERO.ref,
  hash: HASH,
  elements: [
    { index: 3, parent: null, tag: 'main', name: 'main', textOnly: false },
    { index: 4, parent: 3, tag: 'h1', name: 'h1', textOnly: false },
    { index: 5, parent: 4, tag: 'span', name: 'there', textOnly: true },
  ],
}

let layer: HTMLDivElement | undefined

afterEach(() => {
  layer?.remove()
  layer = undefined
})

/** A canvas layer at `zoom` holding one live frame, resolved once its page has loaded. */
async function mount(zoom: number, source = SOURCE): Promise<HTMLDivElement> {
  layer = document.createElement('div')
  layer.style.cssText = `position:absolute;left:0;top:0;transform-origin:0 0;transform:scale(${zoom})`
  const frame = document.createElement('div')
  frame.dataset.frame = HERO.ref
  frame.style.cssText = `position:absolute;left:${HERO.box.x}px;top:${HERO.box.y}px;width:${HERO.box.width}px;height:${HERO.box.height}px`
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'display:block;width:100%;height:100%;border:0'
  const loaded = new Promise((resolve) =>
    iframe.addEventListener('load', resolve, { once: true }),
  )
  iframe.srcdoc = source
  frame.append(iframe)
  layer.append(frame)
  document.body.append(layer)
  await loaded
  iframe.dataset.renderedAt = HERO.modifiedAt
  return layer
}

describe('pickElement', () => {
  it.each([0.35, 1])(
    'picks the deepest stated element at a board point at %s zoom',
    async (zoom) => {
      const container = await mount(zoom)

      // 20 px of padding, then the span past "Hi ".
      const key = pickElement(
        container,
        [HERO],
        { x: HERO.box.x + 20 + 30, y: HERO.box.y + 20 + 10 },
        () => TREE,
      )

      expect(key).toEqual({ frame: HERO.ref, index: 5, hash: HASH })
    },
  )

  it("answers null over the frame's body", async () => {
    const container = await mount(1)

    const key = pickElement(
      container,
      [HERO],
      { x: HERO.box.x + 300, y: HERO.box.y + 250 },
      () => TREE,
    )

    expect(key).toBeNull()
  })

  it('passes over an element the file does not state for its stated parent', async () => {
    const container = await mount(1)
    const appended = container
      .querySelector('iframe')
      ?.contentDocument?.querySelector('span')
    appended?.replaceWith(
      Object.assign(document.createElement('b'), {
        textContent: 'there',
      }),
    )
    const tree: ElementTree = {
      ...TREE,
      elements: TREE.elements.slice(0, 2),
    }

    const key = pickElement(
      container,
      [HERO],
      { x: HERO.box.x + 20 + 30, y: HERO.box.y + 20 + 10 },
      () => tree,
    )

    expect(key).toEqual({ frame: HERO.ref, index: 4, hash: HASH })
  })

  it('answers null for a frame the route never stamped', async () => {
    const container = await mount(
      1,
      '<!doctype html><body><main style="height:200px">x</main></body>',
    )

    const key = pickElement(
      container,
      [HERO],
      { x: HERO.box.x + 10, y: HERO.box.y + 10 },
      () => TREE,
    )

    expect(key).toBeNull()
  })
})
