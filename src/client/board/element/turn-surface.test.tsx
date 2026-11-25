import '../../styles.css'

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ModelStage } from '@/shared/frame-bridge/model'
import { LOOK_MARKER, RENDERED_HASH } from '@/shared/theme'
import { BRIDGE } from '@/test/frame-bridge'

import { request } from '../bridge/channel'
import { clear, selectElement, selectionStore } from '../selection'
import { stopTurn, turnStore } from './turn'
import { TurnSurface } from './turn-surface'

const FRAME = 'studio/home/hero'
const HASH = 'c'.repeat(64)
/** The viewer after html, head, and body, the injected style and script skipped. */
const VIEWER = { frame: FRAME, index: 3, hash: HASH }
const FRAME_BOX = { x: 0, y: 0, width: 400, height: 300 }
const BOX = { x: 100, y: 40, width: 200, height: 200 }

let root: HTMLElement | null = null

afterEach(() => {
  act(() => stopTurn())
  act(() => clear(selectionStore))
  root?.remove()
  root = null
})

/** The canvas layers around one live frame holding a viewer no script drew. */
async function mountCanvas(): Promise<{
  layer: HTMLElement
  viewer: Element
}> {
  root = document.createElement('div')
  root.style.cssText = 'position:absolute;inset:0'
  const layer = document.createElement('div')
  const notes = document.createElement('div')
  notes.dataset.notesLayer = ''
  const frame = document.createElement('div')
  frame.dataset.frame = FRAME
  const iframe = document.createElement('iframe')
  frame.append(iframe)
  layer.append(frame)
  root.append(layer, notes)
  document.body.append(root)
  await new Promise<void>((resolve) => {
    iframe.addEventListener('load', () => resolve(), { once: true })
    iframe.srcdoc = `<!doctype html><html><head><style ${LOOK_MARKER} ${RENDERED_HASH}="${HASH}"></style>${BRIDGE}</head><body><model-viewer src="a.glb"></model-viewer></body></html>`
  })
  // Its reply follows the hash the bridge announced as it started.
  await request(iframe, 'element-box', { index: 0, hash: '' })
  const viewer = iframe.contentDocument?.querySelector('model-viewer')
  if (!viewer) throw new Error('the frame holds no viewer')
  return { layer, viewer }
}

/** Renders the surface over the viewer in turn mode, answering each write as `written`. */
async function turning(written = true) {
  const { layer, viewer } = await mountCanvas()
  const writes: ModelStage[][] = []
  act(() => selectElement(selectionStore, 'studio/home', VIEWER))
  act(() => turnStore.setState({ turning: { frame: FRAME, index: 3 } }))
  render(
    <TurnSurface
      element={VIEWER}
      box={BOX}
      frame={FRAME_BOX}
      container={layer}
      write={(_page, _key, changes) => {
        writes.push([...changes])
        return Promise.resolve(written)
      }}
    />,
  )
  const surface = await waitFor(() => {
    const found = document.querySelector<HTMLElement>('[data-turn-surface]')
    if (!found) throw new Error('the surface is not drawn')
    return found
  })
  return { viewer, writes, surface }
}

const PRESS = { clientX: 200, clientY: 140 }
const DRAGGED = { clientX: 250, clientY: 140 }

describe('TurnSurface', () => {
  it('draws nothing outside turn mode', async () => {
    const { layer } = await mountCanvas()
    act(() => selectElement(selectionStore, 'studio/home', VIEWER))

    render(
      <TurnSurface
        element={VIEWER}
        box={BOX}
        frame={FRAME_BOX}
        container={layer}
      />,
    )

    expect(document.querySelector('[data-turn-surface]')).toBeNull()
  })

  it('says it is turning and how to leave', async () => {
    await turning()

    expect(screen.getByRole('status')).toHaveTextContent(
      'Turning, Esc to leave',
    )
  })

  it('turns the live model with the drag, writing nothing until release', async () => {
    const { viewer, writes, surface } = await turning()

    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: surface, coords: PRESS },
      { target: surface, coords: DRAGGED },
    ])

    await waitFor(() =>
      expect(viewer.getAttribute('camera-orbit')).toBe('-25deg 75deg auto'),
    )
    expect(writes).toEqual([])
  })

  it('writes the angle and its reach as one write on release', async () => {
    const { writes, surface } = await turning()

    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: surface, coords: PRESS },
      { target: surface, coords: DRAGGED },
      { keys: '[/MouseLeft]', target: surface, coords: DRAGGED },
    ])

    expect(writes).toEqual([
      [
        { name: 'camera-orbit', value: '-25deg 75deg auto' },
        { name: 'max-camera-orbit', value: 'auto auto auto' },
      ],
    ])
  })

  it('writes nothing for a press released where it landed', async () => {
    const { writes, surface } = await turning()

    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: surface, coords: PRESS },
      { keys: '[/MouseLeft]', target: surface, coords: PRESS },
    ])

    expect(writes).toEqual([])
  })

  it('puts the angle back and writes nothing on Escape mid-drag', async () => {
    const { viewer, writes, surface } = await turning()
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: surface, coords: PRESS },
      { target: surface, coords: DRAGGED },
    ])
    await waitFor(() => expect(viewer.hasAttribute('camera-orbit')).toBe(true))

    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(viewer.hasAttribute('camera-orbit')).toBe(false))
    expect(writes).toEqual([])
    expect(turnStore.getState().turning).toBeNull()
  })

  it('puts the angle back when the write is refused', async () => {
    const { viewer, surface } = await turning(false)

    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: surface, coords: PRESS },
      { target: surface, coords: DRAGGED },
      { keys: '[/MouseLeft]', target: surface, coords: DRAGGED },
    ])

    await waitFor(() => expect(viewer.hasAttribute('camera-orbit')).toBe(false))
  })

  it('leaves turn mode on Escape, keeping the key from the board', async () => {
    await turning()
    const heard = vi.fn()
    window.addEventListener('keydown', heard)

    await userEvent.keyboard('{Escape}')
    window.removeEventListener('keydown', heard)

    expect(turnStore.getState().turning).toBeNull()
    expect(heard).not.toHaveBeenCalled()
  })

  it('leaves turn mode on a press outside the model', async () => {
    await turning()

    await userEvent.pointer({ keys: '[MouseLeft]', target: document.body })

    expect(turnStore.getState().turning).toBeNull()
  })
})
