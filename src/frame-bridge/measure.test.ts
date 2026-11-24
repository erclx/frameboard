import { afterEach, describe, expect, it, vi } from 'vitest'

import { ask, bridgedFrame } from '@/test/frame-bridge'

import BRAND from '../../test/fixtures/boards/basic/marketing/assets/brand.woff2?url'
import CLIP from '../../test/fixtures/boards/basic/marketing/assets/clip.webm?url'
import { readResize, resizeKindOf } from './measure'

const HASH = 'c'.repeat(64)

/** A 2 by 1 PNG, whose natural size no box in these tests shares. */
const WIDE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DA8J8BAAf/Af8Bf4mnAAAAAElFTkSuQmCC'

let iframe: HTMLIFrameElement | undefined
let host: HTMLDivElement | undefined

afterEach(() => {
  iframe?.remove()
  iframe = undefined
  host?.remove()
  host = undefined
})

/** A 400 × 300 frame showing `body`, its indices past the injected style and script: html 0, head 1, body 2. */
async function frameOf(body: string): Promise<HTMLIFrameElement> {
  iframe = await bridgedFrame(body, {
    hash: HASH,
    style: 'width:400px;height:300px;border:0',
    // Marked as injected, so it shifts no index.
    head: '<style data-frameboard>body{margin:0}</style>',
  })
  return iframe
}

/** The first element of `markup`, attached so its computed styles read as the page lays it out. */
function parse(markup: string): Element | null {
  host = document.createElement('div')
  host.innerHTML = markup
  document.body.append(host)
  return host.firstElementChild
}

const at = (left: number, top: number, extra = '') =>
  `<div style="position:absolute;left:${left}px;top:${top}px;width:100px;height:50px${extra}"></div>`

describe('resizeKindOf', () => {
  it.each([
    ['a placed rectangle', '<div data-name="Rectangle"></div>', 'box'],
    ['text', '<p>Text</p>', 'text'],
    ['a box holding only text', '<div>Hi</div>', 'text'],
    ['an image', '<img alt="">', 'media'],
    ['a video', '<video></video>', 'media'],
    ['a video holding its sources', '<video><source></video>', 'media'],
    ['a model', '<model-viewer></model-viewer>', 'media'],
    ['a box holding an element', '<div><span></span></div>', 'container'],
    ['text holding an inline element', '<p>Some <b>bold</b> words</p>', 'text'],
    ['a paragraph holding inline code', '<p><code>serve</code></p>', 'text'],
    [
      'a box holding words and a block element',
      '<div>Hi <p>there</p></div>',
      'container',
    ],
    [
      'a box holding a flex row',
      '<div><div style="display: flex"><span>a</span></div></div>',
      'container',
    ],
  ])('reads %s by what its corners write', (_name, markup, kind) => {
    expect(resizeKindOf(parse(markup))).toBe(kind)
  })

  it.each([
    ['a divider', '<hr>'],
    ['an empty paragraph', '<p></p>'],
  ])('reads %s as nothing its corners resize', (_name, markup) => {
    expect(resizeKindOf(parse(markup))).toBeNull()
  })

  it('reads the body as nothing its corners resize, though it holds elements', () => {
    const body = document.implementation.createHTMLDocument('').body
    body.append(document.createElement('div'))

    expect(resizeKindOf(body)).toBeNull()
  })
})

describe('readResize', () => {
  const read = (markup: string) => {
    const element = parse(markup)
    return element ? readResize(element) : null
  }

  it.each([
    ['an upright shape', '<div style="width: 40px; height: 40px"></div>'],
    [
      'a shape whose rotate states 0deg',
      '<div style="width: 40px; height: 40px; rotate: 0deg"></div>',
    ],
    [
      'a shape a flat transform turns',
      '<div style="width: 40px; height: 40px; transform: rotate(30deg)"></div>',
    ],
  ])('reads %s as one a corner resizes', (_name, markup) => {
    expect(read(markup)?.kind).toBe('box')
  })

  it.each([
    [
      'a shape its rotate turns',
      '<div style="width: 40px; height: 40px; rotate: 30deg"></div>',
    ],
    ['text its rotate turns', '<p style="rotate: 30deg">Turned</p>'],
    ['inline text, which a width does not size', '<span>Inline</span>'],
    [
      'an inline container, which a width does not size',
      '<span><b>bold</b> words</span>',
    ],
    [
      'a container its rotate turns',
      '<div style="rotate: 30deg"><span>a</span></div>',
    ],
    [
      'a shape its transform tilts in 3D',
      '<div style="width: 40px; height: 40px; transform: perspective(800px) rotateX(20deg)"></div>',
    ],
  ])('refuses %s', (_name, markup) => {
    expect(read(markup)).toBeNull()
  })

  it('reads text with no stated height as hugging it', () => {
    expect(read('<p style="width: 240px">Words</p>')).toMatchObject({
      kind: 'text',
      hugsHeight: true,
      inset: { width: 0, height: 0 },
    })
  })

  it('reads text with a stated height as not hugging it', () => {
    expect(read('<p style="height: 80px">Words</p>')).toMatchObject({
      kind: 'text',
      hugsHeight: false,
    })
  })

  it('reads an image with no size in the file at its natural size', async () => {
    const image = parse(`<img alt="" src="${WIDE_PNG}">`)

    await vi.waitFor(() =>
      expect(image && readResize(image)?.natural).toEqual({
        width: 2,
        height: 1,
      }),
    )
  })

  it('reads a decoded video at the size it decodes to', async () => {
    const video = parse(
      `<video muted preload="auto" src="${new URL(CLIP, location.href).href}"></video>`,
    )

    await vi.waitFor(() =>
      expect(video && readResize(video)?.natural).toEqual({
        width: 160,
        height: 90,
      }),
    )
  })

  it('reads an image that has not decoded as having no natural size', () => {
    expect(read('<img alt="">')).toMatchObject({
      kind: 'media',
      natural: null,
    })
  })

  it('reads the padding and border a content box width leaves out', () => {
    expect(
      read('<p style="padding: 12px 24px; border: 2px solid">Tag</p>')?.inset,
    ).toEqual({ width: 52, height: 28 })
  })

  it('reads no inset on a border box, whose width holds its padding', () => {
    expect(
      read('<p style="box-sizing: border-box; padding: 12px 24px">Tag</p>')
        ?.inset,
    ).toEqual({ width: 0, height: 0 })
  })

  it('reads a container as one whose drag writes what it changed', () => {
    expect(
      read(
        '<div style="display: flex; gap: 8px"><span>a</span><span>b</span></div>',
      ),
    ).toMatchObject({
      kind: 'container',
      sizing: { layout: { parent: 'block' }, fills: false },
    })
  })

  it('reads a container growing along its row parent as filling it', () => {
    const row = parse(
      '<div style="display: flex; width: 400px"><div style="flex: 1 1 0"><p>a</p></div><span>b</span></div>',
    )
    const child = row?.firstElementChild

    expect(child && readResize(child)).toMatchObject({
      kind: 'container',
      sizing: { layout: { parent: 'horizontal' }, fills: true },
    })
  })
})

describe('measure', () => {
  it('measures each member with its box, offsets, and margins', async () => {
    const frame = await frameOf(
      `${at(10, 20)}<p style="margin:8px 0 0 4px">Words</p>`,
    )

    const asked = await ask(frame, 'measure', { hash: HASH, indexes: [3, 4] })
    asked.close()

    expect(asked.reply).toMatchObject({
      value: [
        {
          index: 3,
          box: { x: 10, y: 20, width: 100, height: 50 },
          placed: { left: 10, top: 20 },
          nested: false,
          read: { kind: 'box' },
        },
        {
          index: 4,
          placed: null,
          margin: { top: 8, right: 0, bottom: 0, left: 4 },
          read: { kind: 'text' },
        },
      ],
    })
  })

  it('marks a member another measured one holds as nested', async () => {
    const frame = await frameOf(
      '<div style="position:absolute;left:0;top:0;width:200px;height:200px"><div style="position:absolute;left:10px;top:10px;width:20px;height:20px"></div></div>',
    )

    const asked = await ask(frame, 'measure', { hash: HASH, indexes: [3, 4] })
    asked.close()

    expect(asked.reply).toMatchObject({
      value: [
        { placed: { left: 0, top: 0 }, nested: false },
        { placed: { left: 10, top: 10 }, nested: true },
      ],
    })
  })

  it('pushes again once a member changes size', async () => {
    const frame = await frameOf(at(10, 20))
    const asked = await ask(frame, 'measure', { hash: HASH, indexes: [3] })

    frame.contentDocument
      ?.querySelector<HTMLElement>('body > div')
      ?.style.setProperty('width', '140px')

    await expect.poll(() => asked.pushes.at(-1)?.[0]?.box.width).toBe(140)
    asked.close()
  })

  it("pushes a group again once a member's offsets change, which no resize sees", async () => {
    const frame = await frameOf(`${at(10, 20)}${at(200, 20)}`)
    const asked = await ask(frame, 'measure', {
      hash: HASH,
      indexes: [3, 4],
    })

    frame.contentDocument
      ?.querySelector<HTMLElement>('body > div')
      ?.style.setProperty('left', '40px')

    await expect.poll(() => asked.pushes.at(-1)?.[0]?.box.x).toBe(40)
    asked.close()
  })

  it('answers null for keys read from other bytes', async () => {
    const frame = await frameOf(at(10, 20))

    const asked = await ask(frame, 'measure', {
      hash: 'e'.repeat(64),
      indexes: [3],
    })

    expect(asked.reply).toEqual({ value: null })
  })

  it('answers null when the page holds no element at an index', async () => {
    const frame = await frameOf(at(10, 20))

    const asked = await ask(frame, 'measure', { hash: HASH, indexes: [3, 9] })

    expect(asked.reply).toEqual({ value: null })
  })
})

describe('overflow', () => {
  const ghosts = async (body: string) => {
    const asked = await ask(await frameOf(body), 'overflow', {})
    asked.close()
    return 'value' in asked.reply ? asked.reply.value?.ghosts : undefined
  }

  it('lists an element partly past the edge and one wholly past it, and not one inside', async () => {
    expect(await ghosts(`${at(20, 20)}${at(350, 20)}${at(500, 400)}`)).toEqual([
      {
        index: 4,
        box: { x: 350, y: 20, width: 100, height: 50 },
        placed: { left: 350, top: 20 },
      },
      {
        index: 5,
        box: { x: 500, y: 400, width: 100, height: 50 },
        placed: { left: 500, top: 400 },
      },
    ])
  })

  it('lists one past the left or top edge too', async () => {
    expect(await ghosts(at(-30, 20))).toMatchObject([
      { index: 3, box: { x: -30, y: 20, width: 100, height: 50 } },
    ])
  })

  it('lists nothing for a fixed element, which the viewport check reports', async () => {
    expect(
      await ghosts(
        '<div style="position:fixed;left:350px;top:20px;width:100px;height:50px"></div>',
      ),
    ).toEqual([])
  })

  it('lists nothing an ancestor crops inside the frame', async () => {
    expect(
      await ghosts(
        `<div style="position:relative;width:200px;height:200px;overflow:hidden">${at(350, 20)}</div>`,
      ),
    ).toEqual([])
  })

  it('lists the element past the edge and none of its children, which travel with it', async () => {
    const listed = await ghosts(
      '<div style="position:absolute;left:350px;top:20px;width:100px;height:50px"><span>child</span></div>',
    )

    expect(listed?.map(({ index }) => index)).toEqual([3])
  })

  it('takes a pixel of slack, so a subpixel edge reads as inside', async () => {
    expect(await ghosts(at(300.5, 20))).toEqual([])
  })

  it('pushes again once a style moves an element past the edge', async () => {
    const frame = await frameOf(at(20, 20))
    const asked = await ask(frame, 'overflow', {})

    frame.contentDocument
      ?.querySelector<HTMLElement>('body > div')
      ?.style.setProperty('left', '350px')

    await expect
      .poll(() => asked.pushes.at(-1))
      .toMatchObject({ hash: HASH, ghosts: [{ index: 3 }] })
    asked.close()
  })

  it('pushes again once a face loads, which lays text out at another size', async () => {
    const frame = await frameOf(
      '<div style="position:absolute;left:350px;top:20px;width:100px;font:40px/normal Late, monospace">Wide</div>',
    )
    const asked = await ask(frame, 'overflow', {})
    const before =
      'value' in asked.reply ? asked.reply.value?.ghosts[0]?.box.height : null
    const { contentWindow, contentDocument } = frame
    if (!contentWindow || !contentDocument) throw new Error('no page')
    const { FontFace } = contentWindow as Window & typeof globalThis
    const face = new FontFace('Late', `url(${BRAND})`, {
      ascentOverride: '300%',
    })

    contentDocument.fonts.add(face)
    await face.load()

    await expect
      .poll(() => asked.pushes.at(-1)?.ghosts[0]?.box.height)
      .toBeGreaterThan((before ?? 0) * 2)
    asked.close()
  })

  it('pushes again once an image loads and runs past the edge', async () => {
    const frame = await frameOf(
      '<img style="position:absolute;left:350px;top:20px" alt="">',
    )
    const asked = await ask(frame, 'overflow', {})
    const image = frame.contentDocument?.querySelector('img')

    image?.setAttribute(
      'src',
      'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"/>',
    )

    await expect
      .poll(() => asked.pushes.at(-1)?.ghosts)
      .toMatchObject([{ index: 3, box: { width: 100, height: 50 } }])
    asked.close()
  })
})

describe('pins', () => {
  it("answers each element's right edge and top, leaving out an index the page holds nothing at", async () => {
    const frame = await frameOf(at(20, 30))

    const asked = await ask(frame, 'pins', { indexes: [3, 9] })
    asked.close()

    expect(asked.reply).toEqual({ value: [{ index: 3, right: 120, top: 30 }] })
  })

  it('pushes again once the element moves', async () => {
    const frame = await frameOf(at(20, 30))
    const asked = await ask(frame, 'pins', { indexes: [3] })

    frame.contentDocument
      ?.querySelector<HTMLElement>('body > div')
      ?.style.setProperty('width', '60px')

    // The observer's first callback may push the old corner ahead of the move.
    await expect
      .poll(() => asked.pushes.at(-1))
      .toEqual([{ index: 3, right: 80, top: 30 }])
    asked.close()
  })
})

describe('element-boxes', () => {
  it('answers the box of each element that draws anything', async () => {
    const frame = await frameOf(`${at(10, 20)}<div></div>`)

    const asked = await ask(frame, 'element-boxes', {
      hash: HASH,
      indexes: [3, 4],
    })

    expect(asked.reply).toEqual({
      value: [{ index: 3, box: { x: 10, y: 20, width: 100, height: 50 } }],
    })
  })
})
