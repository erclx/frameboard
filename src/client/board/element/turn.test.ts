import { afterEach, describe, expect, it } from 'vitest'

import { LOOK_MARKER, RENDERED_HASH } from '@/shared/theme'
import { BRIDGE } from '@/test/frame-bridge'

import { request } from '../bridge/channel'
import { modeStore } from '../mode'
import { clear, selectElement, selectionStore } from '../selection'
import { stopTurn, turnedBy, turnInPlace, turnStore } from './turn'

const FRAME = 'studio/home/hero'
const HASH = 'c'.repeat(64)
/** The element after html, head, and body, the injected style and script skipped. */
const KEY = { frame: FRAME, index: 3, hash: HASH }

let root: HTMLElement | null = null

afterEach(() => {
  root?.remove()
  root = null
  stopTurn()
  clear(selectionStore)
  modeStore.setState({ mode: 'edit' })
})

/** A frame box holding a live page of `body`, as the canvas draws one. */
async function mountFrame(body: string): Promise<HTMLElement> {
  root = document.createElement('div')
  const box = document.createElement('div')
  box.dataset.frame = FRAME
  const iframe = document.createElement('iframe')
  box.append(iframe)
  root.append(box)
  document.body.append(root)
  await new Promise<void>((resolve) => {
    iframe.addEventListener('load', () => resolve(), { once: true })
    iframe.srcdoc = `<!doctype html><html><head><style ${LOOK_MARKER} ${RENDERED_HASH}="${HASH}"></style>${BRIDGE}</head><body>${body}</body></html>`
  })
  // Its reply follows the hash the bridge announced as it started.
  await request(iframe, 'element-box', { index: 0, hash: '' })
  return root
}

describe('turnInPlace', () => {
  it('enters turn mode for a model viewer', async () => {
    const container = await mountFrame(
      '<model-viewer src="a.glb"></model-viewer>',
    )

    const entered = await turnInPlace(container, KEY)

    expect(entered).toBe(true)
    expect(turnStore.getState().turning).toEqual({ frame: FRAME, index: 3 })
  })

  it('stays in turn mode as a write moves the selection to its new hash', async () => {
    const container = await mountFrame(
      '<model-viewer src="a.glb"></model-viewer>',
    )
    selectElement(selectionStore, 'studio/home', KEY)
    await turnInPlace(container, KEY)

    selectElement(selectionStore, 'studio/home', {
      ...KEY,
      hash: 'd'.repeat(64),
    })

    expect(turnStore.getState().turning).toEqual({ frame: FRAME, index: 3 })
  })

  it('leaves turn mode once the selection names another element', async () => {
    const container = await mountFrame(
      '<model-viewer src="a.glb"></model-viewer>',
    )
    selectElement(selectionStore, 'studio/home', KEY)
    await turnInPlace(container, KEY)

    selectElement(selectionStore, 'studio/home', { ...KEY, index: 2 })

    expect(turnStore.getState().turning).toBeNull()
  })

  it('leaves turn mode once the board leaves Edit', async () => {
    const container = await mountFrame(
      '<model-viewer src="a.glb"></model-viewer>',
    )
    selectElement(selectionStore, 'studio/home', KEY)
    await turnInPlace(container, KEY)

    modeStore.setState({ mode: 'play' })

    expect(turnStore.getState().turning).toBeNull()
  })

  it('stays out of turn mode for any other element', async () => {
    const container = await mountFrame('<p>Words</p>')

    const entered = await turnInPlace(container, KEY)

    expect(entered).toBe(false)
    expect(turnStore.getState().turning).toBeNull()
  })

  it('stays out of turn mode for a frame showing other bytes', async () => {
    const container = await mountFrame(
      '<model-viewer src="a.glb"></model-viewer>',
    )

    const entered = await turnInPlace(container, {
      ...KEY,
      hash: 'd'.repeat(64),
    })

    expect(entered).toBe(false)
  })
})

describe('turnedBy', () => {
  it('nudges the model toward the pointer for a short drag', () => {
    expect(turnedBy({ theta: 0, phi: 75 }, { dx: 51, dy: -20 })).toEqual({
      theta: -26,
      phi: 85,
    })
  })

  it('wraps a turn past the back of the model', () => {
    expect(turnedBy({ theta: -170, phi: 75 }, { dx: 40, dy: 0 })).toEqual({
      theta: 170,
      phi: 75,
    })
  })

  it('stops at the top and the bottom of the model', () => {
    expect(turnedBy({ theta: 0, phi: 75 }, { dx: 0, dy: 400 }).phi).toBe(0)
    expect(turnedBy({ theta: 0, phi: 75 }, { dx: 0, dy: -400 }).phi).toBe(180)
  })
})
