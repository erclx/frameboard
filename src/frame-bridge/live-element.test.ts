import { afterEach, describe, expect, it } from 'vitest'

import { ask, BRIDGE, bridgedFrame } from '@/test/frame-bridge'

const HASH = 'c'.repeat(64)

let iframe: HTMLIFrameElement | undefined

afterEach(() => {
  iframe?.remove()
  iframe = undefined
})

/** A frame showing `body`, its indices past the injected style and script: html 0, head 1, body 2. */
async function frameOf(body: string): Promise<HTMLIFrameElement> {
  iframe = await bridgedFrame(body, { hash: HASH })
  return iframe
}

function heading(frame: HTMLIFrameElement): HTMLElement {
  const element = frame.contentDocument?.querySelector('h1')
  if (!element) throw new Error('The frame shows no heading')
  return element
}

describe('live-element', () => {
  it('reads each named element as the page computes it', async () => {
    const frame = await frameOf(
      '<h1 style="opacity:0.5;border-radius:4px;rotate:30deg">Title</h1><div data-step="2" data-step-duration="900" data-step-delay="250" data-step-play></div>',
    )

    const asked = await ask(frame, 'live-element', {
      hash: HASH,
      indexes: [3, 4],
    })

    expect(asked.reply).toMatchObject({
      value: [
        {
          opacity: 0.5,
          radius: 4,
          text: 'Title',
          textOnly: true,
          rotation: { degrees: 30 },
          inline: { color: false, border: false },
        },
        {
          holdsText: false,
          step: {
            step: '2',
            effect: null,
            duration: '900',
            delay: '250',
            play: '',
          },
        },
      ],
    })
  })

  it('reads an empty paragraph as text, as a placed Text opens', async () => {
    const frame = await frameOf('<p data-name="Text"> </p>')

    const asked = await ask(frame, 'live-element', {
      hash: HASH,
      indexes: [3],
    })

    expect(asked.reply).toMatchObject({
      value: [{ holdsText: true, textOnly: true }],
    })
  })

  it('reads an empty div or span as a box', async () => {
    const frame = await frameOf('<div></div><span></span>')

    const asked = await ask(frame, 'live-element', {
      hash: HASH,
      indexes: [3, 4],
    })

    expect(asked.reply).toMatchObject({
      value: [
        { holdsText: false, textOnly: false },
        { holdsText: false, textOnly: false },
      ],
    })
  })

  it('reads a paragraph holding only an element as no text-only', async () => {
    const frame = await frameOf('<p><br></p>')

    const asked = await ask(frame, 'live-element', {
      hash: HASH,
      indexes: [3],
    })

    expect(asked.reply).toMatchObject({
      value: [{ holdsText: false, textOnly: false }],
    })
  })

  it('answers null for bytes the page no longer shows', async () => {
    const frame = await frameOf('<h1>Title</h1>')

    const asked = await ask(frame, 'live-element', {
      hash: 'e'.repeat(64),
      indexes: [3],
    })

    expect(asked.reply).toEqual({ value: null })
  })

  it('answers null when the page holds no element at an index', async () => {
    const frame = await frameOf('<h1>Title</h1>')

    const asked = await ask(frame, 'live-element', {
      hash: HASH,
      indexes: [3, 9],
    })

    expect(asked.reply).toEqual({ value: null })
  })
})

describe('live-element transform', () => {
  async function transformAt(body: string, index: number) {
    const frame = await frameOf(body)
    const asked = await ask(frame, 'live-element', {
      hash: HASH,
      indexes: [index],
    })
    if (!('value' in asked.reply)) throw new Error(asked.reply.error)
    return asked.reply.value?.[0]?.rotation.transform
  }

  it("reads the element's own transform as its style states it", async () => {
    expect(
      await transformAt(
        '<h1 style="transform: perspective(800px) rotateX(20deg)">T</h1>',
        3,
      ),
    ).toEqual({
      own: 'perspective(800px) rotateX(20deg)',
      ruled: false,
      reanchors: false,
    })
  })

  it('reads a transform a rule gives as ruled', async () => {
    expect(
      await transformAt(
        '<style>h1 { transform: rotate(5deg) }</style><h1>T</h1>',
        4,
      ),
    ).toMatchObject({ own: '', ruled: true })
  })

  it('reads an absolute descendant anchored above it as one a transform re-anchors', async () => {
    expect(
      await transformAt(
        '<div><p><span style="position: absolute">a</span></p></div>',
        3,
      ),
    ).toMatchObject({ reanchors: true })
  })

  it('reads an absolute descendant anchored inside it as staying put', async () => {
    expect(
      await transformAt(
        '<div><p style="position: relative"><span style="position: absolute">a</span></p></div>',
        3,
      ),
    ).toMatchObject({ reanchors: false })
  })

  it('reads a fixed descendant as one a transform re-anchors, positioned or not', async () => {
    expect(
      await transformAt(
        '<div style="position: relative"><span style="position: fixed">a</span></div>',
        3,
      ),
    ).toMatchObject({ reanchors: true })
  })
})

describe('live-body', () => {
  it("answers the body's file index at the bytes the page shows", async () => {
    const frame = await frameOf('<h1>Title</h1>')

    const asked = await ask(frame, 'live-body', {})

    expect(asked.reply).toEqual({ value: { index: 2, hash: HASH } })
  })

  it('answers null for a page the route never stamped', async () => {
    iframe = document.createElement('iframe')
    const loaded = new Promise((resolve) =>
      iframe?.addEventListener('load', resolve, { once: true }),
    )
    iframe.srcdoc = `<!doctype html><html><head>${BRIDGE}</head><body></body></html>`
    document.body.append(iframe)
    await loaded

    const asked = await ask(iframe, 'live-body', {})

    expect(asked.reply).toEqual({ value: null })
  })
})

describe('preview-style', () => {
  it('previews a declaration over the page and puts the replaced one back', async () => {
    const frame = await frameOf('<h1 style="opacity: 0.5">Title</h1>')

    await ask(frame, 'preview-style', {
      index: 3,
      property: 'opacity',
      value: '0.2',
    })
    const previewed = heading(frame).getAttribute('style')
    await ask(frame, 'preview-style', {
      index: 3,
      property: 'opacity',
      value: null,
    })

    expect(previewed).toBe('opacity: 0.2 !important;')
    expect(heading(frame).getAttribute('style')).toBe('opacity: 0.5;')
  })

  it('takes a style it added away whole on the put-back', async () => {
    const frame = await frameOf('<h1>Title</h1>')

    await ask(frame, 'preview-style', {
      index: 3,
      property: 'width',
      value: '120px',
    })
    await ask(frame, 'preview-style', {
      index: 3,
      property: 'width',
      value: null,
    })

    expect(heading(frame).hasAttribute('style')).toBe(false)
  })

  it('puts a preview back after a restamp, which checks no hash', async () => {
    const frame = await frameOf('<h1>Title</h1>')
    await ask(frame, 'preview-style', {
      index: 3,
      property: 'width',
      value: '120px',
    })

    await ask(frame, 'restamp', { hash: 'd'.repeat(64) })
    await ask(frame, 'preview-style', {
      index: 3,
      property: 'width',
      value: null,
    })

    expect(heading(frame).hasAttribute('style')).toBe(false)
  })
})

describe('keep-previews', () => {
  it('keeps what a preview shows once it is written, so a later put-back leaves it', async () => {
    const frame = await frameOf('<h1>Title</h1>')
    await ask(frame, 'preview-style', {
      index: 3,
      property: 'width',
      value: '120px',
    })

    await ask(frame, 'keep-previews', {})
    await ask(frame, 'preview-style', {
      index: 3,
      property: 'width',
      value: null,
    })

    expect(heading(frame).style.width).toBe('120px')
  })
})
