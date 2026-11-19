import { afterEach, describe, expect, it } from 'vitest'

import { BRIDGE } from '@/test/frame-bridge'

import TUNER from '../../../../test/fixtures/frames/tuner-binder.html?raw'
import { controlsStore, followEnteredControls, resetControls } from './controls'
import { enterFrame, leaveFrame } from './entered'

function slide(doc: Document, id: string, value: string): void {
  const control = doc.getElementById(id) as HTMLInputElement
  control.value = value
  control.dispatchEvent(new Event('input', { bubbles: true }))
}

function photoStyle(doc: Document): CSSStyleDeclaration {
  return (doc.getElementById('photo') as HTMLElement).style
}

describe('followEnteredControls', () => {
  const REF = 'studio/home/tuner'
  let stop: (() => void) | undefined
  let root: HTMLDivElement | undefined

  afterEach(() => {
    stop?.()
    stop = undefined
    leaveFrame()
    root?.remove()
    root = undefined
  })

  /** Mounts the frame's root and live iframe of the tuner, as the canvas draws one. */
  async function mountTuner(): Promise<Document> {
    root = document.createElement('div')
    root.dataset.frame = REF
    const made = document.createElement('iframe')
    root.append(made)
    document.body.append(root)
    await new Promise((resolve) => {
      made.addEventListener('load', resolve, { once: true })
      made.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${'c'.repeat(64)}"></style>${BRIDGE}</head><body>${TUNER}</body></html>`
    })
    const doc = made.contentDocument
    if (!doc) throw new Error('The frame has no document')
    return doc
  }

  /** Moves the brightness until the frame's binding counts it, since the frame binds once its bridge answers. */
  async function slideBound(doc: Document): Promise<void> {
    await expect
      .poll(() => {
        slide(doc, 'brightness', '130')
        return controlsStore.getState().moved
      })
      .toBe(1)
  }

  it('binds a frame entered before its iframe mounted', async () => {
    stop = followEnteredControls()
    enterFrame(REF)

    const doc = await mountTuner()
    await slideBound(doc)

    expect(controlsStore.getState()).toEqual({ ref: REF, moved: 1 })
  })

  it('puts the moved values back when the frame is left', async () => {
    stop = followEnteredControls()
    const doc = await mountTuner()
    enterFrame(REF)
    await slideBound(doc)

    leaveFrame()

    expect(controlsStore.getState()).toEqual({ ref: null, moved: 0 })
    await expect
      .poll(() => photoStyle(doc).getPropertyValue('--brightness'))
      .toBe('')
  })

  it('resets the moved values on the Reset press', async () => {
    stop = followEnteredControls()
    const doc = await mountTuner()
    enterFrame(REF)
    await slideBound(doc)

    resetControls()

    await expect.poll(() => controlsStore.getState().moved).toBe(0)
    expect(photoStyle(doc).getPropertyValue('--brightness')).toBe('')
  })
})
