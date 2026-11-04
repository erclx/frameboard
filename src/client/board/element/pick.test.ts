import { afterEach, describe, expect, it } from 'vitest'

import type { ElementTree } from '@/shared/records/elements'
import { frameOf } from '@/test/board'

import { elementsIn, onBareFrame, pickElement, pickElementRead } from './pick'

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
    {
      index: 3,
      parent: null,
      tag: 'main',
      name: 'main',
      textOnly: false,
      layout: 'block',
      round: false,
      placed: false,
    },
    {
      index: 4,
      parent: 3,
      tag: 'h1',
      name: 'h1',
      textOnly: false,
      layout: 'block',
      round: false,
      placed: false,
    },
    {
      index: 5,
      parent: 4,
      tag: 'span',
      name: 'there',
      textOnly: true,
      layout: 'block',
      round: false,
      placed: false,
    },
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

  it("answers null while the frame's tree is not held", async () => {
    const container = await mount(1)

    const key = pickElement(
      container,
      [HERO],
      { x: HERO.box.x + 20 + 30, y: HERO.box.y + 20 + 10 },
      () => null,
    )

    expect(key).toBeNull()
  })
})

describe('pickElementRead', () => {
  it('waits for the tree and passes over an element a script inserted ahead of the rest', async () => {
    const container = await mount(1)
    const frameDocument = container.querySelector('iframe')?.contentDocument
    const main = frameDocument?.querySelector('main')
    main?.prepend(frameDocument?.createElement('p') ?? '')

    const key = await pickElementRead(
      container,
      [HERO],
      { x: HERO.box.x + 20 + 30, y: HERO.box.y + 20 + 10 },
      async () => TREE,
    )

    expect(key).toEqual({ frame: HERO.ref, index: 3, hash: HASH })
  })

  it('answers null when the server refuses the tree', async () => {
    const container = await mount(1)

    const key = await pickElementRead(
      container,
      [HERO],
      { x: HERO.box.x + 20 + 30, y: HERO.box.y + 20 + 10 },
      async () => null,
    )

    expect(key).toBeNull()
  })
})

describe('elementsIn', () => {
  // Past the skipped style: html 0, head 1, body 2, then two boxes, the first holding a third.
  const BOXES = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}">body{margin:0}div{position:absolute;left:0;width:50px;height:50px}</style></head><body><div style="top:0"><span>a</span></div><div style="top:100px"></div></body></html>`
  const row = (index: number, parent: number | null, tag: string) => ({
    index,
    parent,
    tag,
    name: tag,
    textOnly: false,
    layout: 'block' as const,
    round: false,
    placed: false,
  })
  const BOXES_TREE: ElementTree = {
    ref: HERO.ref,
    hash: HASH,
    elements: [row(3, null, 'div'), row(4, 3, 'span'), row(5, null, 'div')],
  }
  const indexes = (rect: {
    x: number
    y: number
    width: number
    height: number
  }) =>
    elementsIn(layer as HTMLDivElement, HERO, rect, BOXES_TREE).map(
      ({ key }) => key.index,
    )

  it('answers each touched element once, leaving what one holds to it', async () => {
    await mount(1, BOXES)

    expect(indexes({ x: 100, y: 50, width: 60, height: 150 })).toEqual([3, 5])
  })

  it('answers only what the rectangle reaches, with its box on the canvas', async () => {
    const container = await mount(1, BOXES)

    expect(
      elementsIn(
        container,
        HERO,
        { x: 110, y: 160, width: 5, height: 5 },
        BOXES_TREE,
      ),
    ).toEqual([
      {
        key: { frame: HERO.ref, index: 5, hash: HASH },
        box: { x: 100, y: 150, width: 50, height: 50 },
      },
    ])
  })

  it('answers nothing while the frame shows other bytes', async () => {
    const container = await mount(1, BOXES)

    expect(
      elementsIn(
        container,
        HERO,
        { x: 100, y: 50, width: 60, height: 150 },
        { ...BOXES_TREE, hash: 'd'.repeat(64) },
      ),
    ).toEqual([])
  })

  it('reads a point on the body as bare and one on an element as not', async () => {
    const container = await mount(1, BOXES)

    expect(onBareFrame(container, [HERO], { x: 300, y: 200 }, BOXES_TREE)).toBe(
      true,
    )
    expect(onBareFrame(container, [HERO], { x: 110, y: 60 }, BOXES_TREE)).toBe(
      false,
    )
  })

  it('reads a frame with nothing in it as not bare, so a drag still moves it', async () => {
    const container = await mount(1, BOXES)

    expect(
      onBareFrame(
        container,
        [HERO],
        { x: 300, y: 200 },
        { ...BOXES_TREE, elements: [] },
      ),
    ).toBe(false)
  })
})
