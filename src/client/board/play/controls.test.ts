import { afterEach, describe, expect, it } from 'vitest'

import TUNER from '../../../../test/fixtures/frames/tuner-binder.html?raw'
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
})
