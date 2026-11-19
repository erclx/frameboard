import { afterEach, describe, expect, it } from 'vitest'

import { ask, bridgedFrame } from '@/test/frame-bridge'

import TUNER from '../../test/fixtures/frames/tuner-binder.html?raw'
import LINKS from '../../test/fixtures/frames/tuner-links.html?raw'
import { bindControls } from './controls'

let iframe: HTMLIFrameElement | undefined

afterEach(() => {
  iframe?.remove()
  iframe = undefined
})

/** A frame's document in its own iframe, so its elements come from another window, as on the canvas. */
async function frameOf(body: string): Promise<Document> {
  const made = document.createElement('iframe')
  iframe = made
  document.body.append(made)
  await new Promise((resolve) => {
    made.addEventListener('load', resolve, { once: true })
    made.srcdoc = body
  })
  const doc = made.contentDocument
  if (!doc) throw new Error('The frame has no document')
  return doc
}

function slide(doc: Document, id: string, value: string): void {
  const control = doc.getElementById(id) as HTMLInputElement
  control.value = value
  control.dispatchEvent(new Event('input', { bubbles: true }))
}

function photoStyle(doc: Document): CSSStyleDeclaration {
  return (doc.getElementById('photo') as HTMLElement).style
}

describe('bindControls', () => {
  it('sets a moved control on its target live', async () => {
    const doc = await frameOf(TUNER)
    bindControls(doc, () => {})

    slide(doc, 'brightness', '130')

    expect(photoStyle(doc).getPropertyValue('--brightness')).toBe('130%')
  })

  it('counts each moved control once', async () => {
    const doc = await frameOf(TUNER)
    const counts: number[] = []
    bindControls(doc, (moved) => counts.push(moved))

    slide(doc, 'brightness', '120')
    slide(doc, 'brightness', '130')
    slide(doc, 'contrast', '150')

    expect(counts).toEqual([1, 1, 2])
  })

  it('leaves a control whose target is gone untouched and uncounted', async () => {
    const doc = await frameOf(TUNER)
    const counts: number[] = []
    const binder = bindControls(doc, (moved) => counts.push(moved))

    slide(doc, 'dead', '9')

    expect(counts).toEqual([])
    expect(binder.edits()).toEqual([])
  })

  it('builds one styles change for the target and a value per control', async () => {
    const doc = await frameOf(TUNER)
    const binder = bindControls(doc, () => {})

    slide(doc, 'brightness', '130')
    slide(doc, 'grayscale', '60')

    expect(binder.edits()).toEqual([
      { index: 5, change: { kind: 'attribute', name: 'value', value: '130' } },
      { index: 7, change: { kind: 'attribute', name: 'value', value: '60' } },
      {
        index: 4,
        change: {
          kind: 'styles',
          declarations: [
            { property: '--brightness', value: '130%' },
            { property: '--grayscale', value: '60%' },
          ],
        },
      },
    ])
  })

  it('puts the file values back on reset', async () => {
    const doc = await frameOf(TUNER)
    const binder = bindControls(doc, () => {})
    slide(doc, 'brightness', '130')
    slide(doc, 'grayscale', '60')

    binder.reset()

    expect(photoStyle(doc).getPropertyValue('--brightness')).toBe('')
    expect(photoStyle(doc).getPropertyValue('--grayscale')).toBe('0%')
    expect((doc.getElementById('brightness') as HTMLInputElement).value).toBe(
      '100',
    )
    expect(binder.edits()).toEqual([])
  })

  it('keeps settled values through a later reset', async () => {
    const doc = await frameOf(TUNER)
    const binder = bindControls(doc, () => {})
    slide(doc, 'brightness', '130')

    binder.settle()
    binder.reset()

    expect(photoStyle(doc).getPropertyValue('--brightness')).toBe('130%')
    expect((doc.getElementById('brightness') as HTMLInputElement).value).toBe(
      '130',
    )
  })

  it('stops tuning once detached', async () => {
    const doc = await frameOf(TUNER)
    const binder = bindControls(doc, () => {})

    binder.detach()
    slide(doc, 'brightness', '130')

    expect(photoStyle(doc).getPropertyValue('--brightness')).toBe('')
  })

  it('keeps the value of the control moved last when two set one property', async () => {
    const doc = await frameOf(
      '<img id="photo"><input id="a" type="range" data-binds="#photo --blur" data-unit="px"><input id="b" type="range" data-binds="#photo --blur" data-unit="px">',
    )
    const binder = bindControls(doc, () => {})

    slide(doc, 'a', '10')
    slide(doc, 'b', '20')
    slide(doc, 'a', '30')

    expect(photoStyle(doc).getPropertyValue('--blur')).toBe('30px')
    expect(binder.edits().at(-1)).toEqual({
      index: 3,
      change: {
        kind: 'styles',
        declarations: [{ property: '--blur', value: '30px' }],
      },
    })
  })

  it('puts a moved field back once it is emptied, so a later settle leaves nothing inline', async () => {
    const doc = await frameOf(
      '<img id="photo"><input id="size" type="number" value="4" data-binds="#photo --blur" data-unit="px">',
    )
    const counts: number[] = []
    const binder = bindControls(doc, (moved) => counts.push(moved))

    slide(doc, 'size', '9')
    slide(doc, 'size', '')
    binder.settle()

    expect(photoStyle(doc).getPropertyValue('--blur')).toBe('')
    expect(counts).toEqual([1, 0, 0])
  })

  it('leaves an emptied number field out of the page and the keep', async () => {
    const doc = await frameOf(
      '<img id="photo"><input id="size" type="number" value="4" data-binds="#photo --blur" data-unit="px">',
    )
    const binder = bindControls(doc, () => {})

    slide(doc, 'size', '')

    expect(photoStyle(doc).getPropertyValue('--blur')).toBe('')
    expect(binder.edits()).toEqual([])
  })
})

describe('the control ops', () => {
  async function tuner(): Promise<Document> {
    iframe = await bridgedFrame(TUNER)
    const doc = iframe.contentDocument
    if (!doc) throw new Error('The frame has no document')
    return doc
  }

  function frame(): HTMLIFrameElement {
    if (!iframe) throw new Error('No frame open')
    return iframe
  }

  it('pushes how many controls a move leaves moved', async () => {
    const doc = await tuner()
    const { reply, pushes } = await ask(frame(), 'controls', {})

    slide(doc, 'brightness', '130')
    slide(doc, 'contrast', '150')

    expect(reply).toEqual({ value: true })
    await expect.poll(() => pushes).toEqual([1, 2])
  })

  it('answers the keep batch with the hash it was read at', async () => {
    const doc = await tuner()
    const { id } = await ask(frame(), 'controls', {})
    slide(doc, 'brightness', '130')

    const { reply } = await ask(frame(), 'controls-edits', { controls: id })

    expect(reply).toMatchObject({
      value: {
        hash: 'c'.repeat(64),
        edits: expect.arrayContaining([
          expect.objectContaining({
            change: { kind: 'attribute', name: 'value', value: '130' },
          }),
        ]),
      },
    })
  })

  it('answers no batch with nothing moved', async () => {
    await tuner()
    const { id } = await ask(frame(), 'controls', {})

    const { reply } = await ask(frame(), 'controls-edits', { controls: id })

    expect(reply).toEqual({ value: null })
  })

  it("resets the moved controls on the board's word", async () => {
    const doc = await tuner()
    const { id } = await ask(frame(), 'controls', {})
    slide(doc, 'brightness', '130')

    const { reply } = await ask(frame(), 'controls-act', {
      controls: id,
      act: 'reset',
    })

    expect(reply).toEqual({ value: true })
    expect(photoStyle(doc).getPropertyValue('--brightness')).toBe('')
  })

  it('keeps settled values through the close', async () => {
    const doc = await tuner()
    const { id, close } = await ask(frame(), 'controls', {})
    slide(doc, 'brightness', '130')
    await ask(frame(), 'controls-act', { controls: id, act: 'settle' })

    close()
    await ask(frame(), 'live-body', {})

    expect(photoStyle(doc).getPropertyValue('--brightness')).toBe('130%')
  })

  it('puts every moved value back once closed, and tunes nothing after', async () => {
    const doc = await tuner()
    const { close } = await ask(frame(), 'controls', {})
    slide(doc, 'brightness', '130')

    close()
    await ask(frame(), 'live-body', {})
    slide(doc, 'contrast', '150')

    expect([
      photoStyle(doc).getPropertyValue('--brightness'),
      photoStyle(doc).getPropertyValue('--contrast'),
    ]).toEqual(['', ''])
  })

  it('refuses an act on a subscription it never bound', async () => {
    await tuner()

    const { reply } = await ask(frame(), 'controls-act', {
      controls: 'gone',
      act: 'settle',
    })

    expect(reply).toEqual({ value: false })
  })
})

describe('bindings', () => {
  it('measures each control with its target, tagging one that matches nothing', async () => {
    iframe = await bridgedFrame(LINKS, {
      style: 'display:block;border:0;width:600px;height:300px',
    })

    const { reply } = await ask(iframe, 'bindings', {})

    expect(reply).toEqual({
      value: [
        expect.objectContaining({
          key: 0,
          target: expect.objectContaining({ x: 0, y: 0, height: 120 }),
          label: '#photo --brightness',
        }),
        expect.objectContaining({ key: 1, label: '#photo --contrast' }),
        expect.objectContaining({
          key: 2,
          target: null,
          label: '#hero-image, no match',
        }),
      ],
    })
  })

  it('pushes the boxes again once the page scrolls', async () => {
    iframe = await bridgedFrame(`${LINKS}<div style="height:2000px"></div>`, {
      style: 'display:block;border:0;width:600px;height:300px',
    })
    const view = iframe.contentWindow
    if (!view) throw new Error('The frame has no window')
    const { pushes } = await ask(iframe, 'bindings', {})

    view.scrollTo({ top: 50 })

    await expect.poll(() => pushes.at(-1)?.[0]?.target?.y).toBe(-50)
  })
})
