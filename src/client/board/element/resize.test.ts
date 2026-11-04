import { afterEach, describe, expect, it, vi } from 'vitest'

import CLIP from '../../../../test/fixtures/boards/basic/marketing/assets/clip.webm?url'
import {
  cornerSize,
  dragSize,
  placedOffsets,
  resizeDeclarations,
  resizeKindOf,
  shownResize,
  startElementResize,
} from './resize'

const BOX = { x: 100, y: 100, width: 200, height: 100 }

describe('cornerSize', () => {
  it('grows from the south-east corner by the drag', () => {
    expect(cornerSize(BOX, 'se', 40, 20, false)).toEqual({
      width: 240,
      height: 120,
    })
  })

  it('grows from the north-west corner as the drag moves away from it', () => {
    expect(cornerSize(BOX, 'nw', -40, -20, false)).toEqual({
      width: 240,
      height: 120,
    })
  })

  it('clamps at 1 px past the opposite corner rather than flipping', () => {
    expect(cornerSize(BOX, 'se', -500, -500, false)).toEqual({
      width: 1,
      height: 1,
    })
  })

  it('keeps the starting ratio by the side that moved further', () => {
    expect(cornerSize(BOX, 'se', 100, 10, true)).toEqual({
      width: 300,
      height: 150,
    })
  })

  it('drops the ratio for a shape drawn with a side at 0 px', () => {
    expect(
      cornerSize({ x: 0, y: 0, width: 200, height: 0 }, 'se', 20, 30, true),
    ).toEqual({ width: 220, height: 30 })
  })

  it('keeps the ratio at no less than 1 px a side', () => {
    expect(cornerSize(BOX, 'se', -500, -500, true)).toEqual({
      width: 2,
      height: 1,
    })
  })

  it('keeps a ratio given apart from the box it starts from', () => {
    expect(
      cornerSize(BOX, 'se', 100, 10, true, { width: 4, height: 3 }),
    ).toEqual({ width: 300, height: 225 })
  })
})

describe('dragSize', () => {
  it('moves only the width of text, whatever the vertical drag and Shift', () => {
    const text = {
      kind: 'text',
      natural: null,
      hugsHeight: true,
      inset: { width: 0, height: 0 },
    } as const

    expect(dragSize(text, BOX, 'se', 40, 90, true)).toEqual({
      width: 240,
      height: 100,
    })
  })

  it('keeps a box to the ratio it starts from under Shift', () => {
    const box = {
      kind: 'box',
      natural: null,
      hugsHeight: false,
      inset: { width: 0, height: 0 },
    } as const

    expect(dragSize(box, BOX, 'se', 100, 10, true)).toEqual({
      width: 300,
      height: 150,
    })
  })

  it('keeps media to its natural ratio under Shift', () => {
    const media = {
      kind: 'media',
      natural: { width: 1, height: 1 },
      hugsHeight: false,
      inset: { width: 0, height: 0 },
    } as const

    expect(dragSize(media, BOX, 'se', 100, 10, true)).toEqual({
      width: 300,
      height: 300,
    })
  })

  it('keeps media with no natural size yet to the ratio of its box', () => {
    const media = {
      kind: 'media',
      natural: null,
      hugsHeight: false,
      inset: { width: 0, height: 0 },
    } as const

    expect(dragSize(media, BOX, 'se', 100, 10, true)).toEqual({
      width: 300,
      height: 150,
    })
  })

  it('writes both sides of media freely without Shift', () => {
    const media = {
      kind: 'media',
      natural: { width: 1, height: 1 },
      hugsHeight: false,
      inset: { width: 0, height: 0 },
    } as const

    expect(dragSize(media, BOX, 'se', 40, 20, false)).toEqual({
      width: 240,
      height: 120,
    })
  })
})

describe('resizeKindOf', () => {
  const parse = (markup: string) => {
    const host = document.createElement('div')
    host.innerHTML = markup
    return host.firstElementChild
  }

  it.each([
    ['a placed rectangle', '<div data-name="Rectangle"></div>', 'box'],
    ['text', '<p>Text</p>', 'text'],
    ['a box holding only text', '<div>Hi</div>', 'text'],
    ['an image', '<img alt="">', 'media'],
    ['a video', '<video></video>', 'media'],
    ['a video holding its sources', '<video><source></video>', 'media'],
  ])('reads %s by what its corners write', (_name, markup, kind) => {
    expect(resizeKindOf(parse(markup))).toBe(kind)
  })

  it.each([
    ['a divider', '<hr>'],
    ['a box holding an element', '<div><span></span></div>'],
    ['text holding an inline element', '<p>Some <b>bold</b> words</p>'],
    ['an empty paragraph', '<p></p>'],
  ])('reads %s as nothing its corners resize', (_name, markup) => {
    expect(resizeKindOf(parse(markup))).toBeNull()
  })
})

describe('resizeDeclarations', () => {
  const SIZE = { width: 240, height: 90 }
  const NO_INSET = { width: 0, height: 0 }

  it('writes the width alone for text, so its height keeps hugging', () => {
    expect(resizeDeclarations({ kind: 'text', inset: NO_INSET }, SIZE)).toEqual(
      [{ property: 'width', value: '240px' }],
    )
  })

  it.each(['box', 'media'] as const)('writes both sides of %s', (kind) => {
    expect(resizeDeclarations({ kind, inset: NO_INSET }, SIZE)).toEqual([
      { property: 'width', value: '240px' },
      { property: 'height', value: '90px' },
    ])
  })

  it('takes a content box padding and border off what it writes', () => {
    const inset = { width: 52, height: 28 }

    expect(resizeDeclarations({ kind: 'box', inset }, SIZE)).toEqual([
      { property: 'width', value: '188px' },
      { property: 'height', value: '62px' },
    ])
  })

  it('writes no less than 0 px when the drag is narrower than the padding', () => {
    const inset = { width: 52, height: 28 }

    expect(
      resizeDeclarations({ kind: 'text', inset }, { width: 10, height: 10 }),
    ).toEqual([{ property: 'width', value: '0px' }])
  })
})

describe('a live element', () => {
  const HASH = 'd'.repeat(64)
  const KEY = { frame: 'studio/home/hero', index: 3, hash: HASH }
  /** A 2 by 1 PNG, whose natural size no box in these tests shares. */
  const WIDE_PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DA8J8BAAf/Af8Bf4mnAAAAAElFTkSuQmCC'
  let container: HTMLDivElement | undefined

  // Indices past the skipped injected style: html 0, head 1, body 2, then the body's children.
  async function mount(body: string): Promise<HTMLDivElement> {
    container = document.createElement('div')
    const frame = document.createElement('div')
    frame.dataset.frame = KEY.frame
    const iframe = document.createElement('iframe')
    const loaded = new Promise((resolve) =>
      iframe.addEventListener('load', resolve, { once: true }),
    )
    iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}"></style></head><body>${body}</body></html>`
    frame.append(iframe)
    container.append(frame)
    document.body.append(container)
    await loaded
    return container
  }

  afterEach(() => {
    container?.remove()
    container = undefined
  })

  describe('shownResize', () => {
    it('reads an upright shape as one a corner resizes', async () => {
      const shown = await mount('<div style="width: 40px; height: 40px"></div>')

      expect(shownResize(shown, KEY)?.kind).toBe('box')
    })

    it('reads a shape whose rotate states 0deg as upright', async () => {
      const shown = await mount(
        '<div style="width: 40px; height: 40px; rotate: 0deg"></div>',
      )

      expect(shownResize(shown, KEY)?.kind).toBe('box')
    })

    it('refuses a shape its rotate turns', async () => {
      const shown = await mount(
        '<div style="width: 40px; height: 40px; rotate: 30deg"></div>',
      )

      expect(shownResize(shown, KEY)).toBeNull()
    })

    it('refuses text its rotate turns', async () => {
      const shown = await mount('<p style="rotate: 30deg">Turned</p>')

      expect(shownResize(shown, KEY)).toBeNull()
    })

    it('refuses inline text, which a width does not size', async () => {
      const shown = await mount('<span>Inline</span>')

      expect(shownResize(shown, KEY)).toBeNull()
    })

    it('reads text with no stated height as hugging it', async () => {
      const shown = await mount('<p style="width: 240px">Words</p>')

      expect(shownResize(shown, KEY)).toMatchObject({
        kind: 'text',
        hugsHeight: true,
        inset: { width: 0, height: 0 },
      })
    })

    it('reads text with a stated height as not hugging it', async () => {
      const shown = await mount('<p style="height: 80px">Words</p>')

      expect(shownResize(shown, KEY)).toMatchObject({
        kind: 'text',
        hugsHeight: false,
        inset: { width: 0, height: 0 },
      })
    })

    it('reads an image with no size in the file at its natural size', async () => {
      const shown = await mount(`<img alt="" src="${WIDE_PNG}">`)

      await vi.waitFor(() =>
        expect(shownResize(shown, KEY)?.natural).toEqual({
          width: 2,
          height: 1,
        }),
      )
    })

    it('reads a decoded video at the size it decodes to', async () => {
      const shown = await mount(
        `<video muted preload="auto" src="${new URL(CLIP, location.href).href}"></video>`,
      )

      await vi.waitFor(() =>
        expect(shownResize(shown, KEY)?.natural).toEqual({
          width: 160,
          height: 90,
        }),
      )
    })

    it('reads the padding and border a content box width leaves out', async () => {
      const shown = await mount(
        '<p style="padding: 12px 24px; border: 2px solid">Tag</p>',
      )

      expect(shownResize(shown, KEY)?.inset).toEqual({ width: 52, height: 28 })
    })

    it('reads no inset on a border box, whose width holds its padding', async () => {
      const shown = await mount(
        '<p style="box-sizing: border-box; padding: 12px 24px">Tag</p>',
      )

      expect(shownResize(shown, KEY)?.inset).toEqual({ width: 0, height: 0 })
    })

    it('reads an image that has not decoded as having no natural size', async () => {
      const shown = await mount('<img alt="">')

      expect(shownResize(shown, KEY)).toMatchObject({
        kind: 'media',
        natural: null,
      })
    })

    it('reads nothing from a frame showing other bytes', async () => {
      const shown = await mount('<p>Words</p>')

      expect(shownResize(shown, { ...KEY, hash: 'f'.repeat(64) })).toBeNull()
    })
  })

  describe('startElementResize', () => {
    const paragraph = (shown: HTMLElement) => {
      const element = shown
        .querySelector('iframe')
        ?.contentDocument?.querySelector('p')
      if (!element) throw new Error('No paragraph mounted')
      return element
    }

    it('previews only the width of text, whose height keeps hugging', async () => {
      const shown = await mount('<p>Words</p>')
      const resize = startElementResize('studio/home', KEY, {
        kind: 'text',
        inset: { width: 0, height: 0 },
      })

      resize?.preview({ width: 240, height: 90 })

      expect(paragraph(shown).style.width).toBe('240px')
      expect(paragraph(shown).style.height).toBe('')
    })

    it('puts the width a preview replaced back on a cancel', async () => {
      const shown = await mount('<p style="width: fit-content">Words</p>')
      const resize = startElementResize('studio/home', KEY, {
        kind: 'text',
        inset: { width: 0, height: 0 },
      })

      resize?.preview({ width: 240, height: 90 })
      resize?.cancel()

      expect(paragraph(shown).style.width).toBe('fit-content')
    })
  })
})

describe('placedOffsets', () => {
  const HASH = 'e'.repeat(64)
  const KEY = { frame: 'studio/home/hero', index: 3, hash: HASH }
  let container: HTMLDivElement | undefined

  // Indices past the skipped injected style: html 0, head 1, body 2, then the body's children.
  async function mountElement(style: string): Promise<HTMLDivElement> {
    container = document.createElement('div')
    const frame = document.createElement('div')
    frame.dataset.frame = KEY.frame
    const iframe = document.createElement('iframe')
    const loaded = new Promise((resolve) =>
      iframe.addEventListener('load', resolve, { once: true }),
    )
    iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}"></style></head><body><div style="${style}"></div></body></html>`
    frame.append(iframe)
    container.append(frame)
    document.body.append(container)
    await loaded
    return container
  }

  afterEach(() => {
    container?.remove()
    container = undefined
  })

  it('reads the offsets a placed element holds', async () => {
    const shown = await mountElement(
      'position: absolute; left: 12px; top: 34px',
    )

    expect(placedOffsets(shown, KEY)).toEqual({ left: 12, top: 34 })
  })

  it('reads an element in the flow as unplaced', async () => {
    const shown = await mountElement('position: relative; left: 12px')

    expect(placedOffsets(shown, KEY)).toBeNull()
  })

  it('reads nothing from a frame showing other bytes', async () => {
    const shown = await mountElement('position: absolute; left: 0; top: 0')

    expect(placedOffsets(shown, { ...KEY, hash: 'f'.repeat(64) })).toBeNull()
  })
})
