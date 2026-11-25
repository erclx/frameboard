import '../../../styles.css'

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import { flipFrame, themeStore } from '@/client/theme/store'
import type { ModelStage } from '@/shared/frame-bridge/model'
import { LOOK_MARKER, RENDERED_HASH } from '@/shared/theme'
import { BRIDGE } from '@/test/frame-bridge'

import { request } from '../../bridge/channel'
import { modeStore } from '../../mode'
import { clear, selectElement, selectionStore } from '../../selection'
import { heldOutline, holdOutline } from '../held'
import type { PlacedMove } from '../resize'
import { stopTurn, turnStore } from '../turn'
import { ModelHandles } from './handles'
import { handlesStore } from './store'

const FRAME = 'studio/home/hero'
const HASH = 'c'.repeat(64)
/** The viewer after html, head, its script, and body, the injected style and script skipped. */
const VIEWER = { frame: FRAME, index: 4, hash: HASH }
const BOX = { x: 100, y: 120, width: 200, height: 200 }
const PLACED = { left: 100, top: 120 }
const SCRIPT =
  '<script type="module" src="/src/test/model-viewer-stub.js"></script>'

let root: HTMLElement | null = null
/** One pointer across a test, so a release ends the press an earlier call began. */
let user = userEvent.setup()

beforeEach(() => {
  user = userEvent.setup()
  liveStore.setState({ canWrite: true })
  modeStore.setState({ mode: 'edit', tool: 'move', spacePan: false })
})

afterEach(() => {
  act(() => stopTurn())
  act(() => holdOutline(null))
  act(() => clear(selectionStore))
  act(() => handlesStore.setState({ mode: 'move', links: {} }))
  act(() => themeStore.setState({ flipped: new Set() }))
  liveStore.setState({ canWrite: false })
  root?.remove()
  root = null
})

/** The canvas layers around one live frame holding a drawn viewer. */
async function mountCanvas(attributes: string) {
  root = document.createElement('div')
  root.dataset.canvas = ''
  root.style.cssText = 'position:absolute;inset:0'
  const layer = document.createElement('div')
  const notes = document.createElement('div')
  notes.dataset.notesLayer = ''
  notes.style.cssText =
    'position:absolute;top:0;left:0;pointer-events:none;z-index:1'
  const frame = document.createElement('div')
  frame.dataset.frame = FRAME
  const iframe = document.createElement('iframe')
  frame.append(iframe)
  layer.append(frame)
  root.append(layer, notes)
  document.body.append(root)
  await new Promise<void>((resolve) => {
    iframe.addEventListener('load', () => resolve(), { once: true })
    iframe.srcdoc = `<!doctype html><html><head><style ${LOOK_MARKER} ${RENDERED_HASH}="${HASH}"></style>${BRIDGE}${SCRIPT}</head><body><model-viewer src="a.glb" style="display:block;width:200px;height:120px" ${attributes}></model-viewer></body></html>`
  })
  // Its reply follows the hash the bridge announced as it started.
  await request(iframe, 'element-box', { index: 0, hash: '' })
  const viewer = iframe.contentDocument?.querySelector('model-viewer')
  if (!viewer) throw new Error('the frame holds no viewer')
  return { layer, viewer }
}

interface Options {
  attributes?: string
  placed?: typeof PLACED | null
  locked?: boolean
  box?: typeof BOX
  written?: boolean
}

/** Draws the handles over a selected viewer, answering each write as `written`. */
async function selected({
  attributes = '',
  placed = PLACED,
  locked = false,
  box = BOX,
  written = true,
}: Options = {}) {
  const { layer, viewer } = await mountCanvas(attributes)
  const writes: ModelStage[][] = []
  const previews: { left: number; top: number }[] = []
  const commits: { left: number; top: number }[] = []
  let cancels = 0
  const move: PlacedMove = {
    preview: (offsets) => previews.push(offsets),
    commit: (offsets) => {
      commits.push(offsets)
      return Promise.resolve(written)
    },
    cancel: () => {
      cancels += 1
    },
  }
  act(() => selectElement(selectionStore, 'studio/home', VIEWER))
  const shown = (
    <ModelHandles
      element={VIEWER}
      box={box}
      placed={placed}
      read={null}
      locked={locked}
      container={layer}
      writes={{
        staged: (_page, _key, changes) => {
          writes.push([...changes])
          return Promise.resolve(written)
        },
        placed: () => move,
      }}
    />
  )
  const { unmount } = render(shown)
  return { viewer, writes, previews, commits, cancels: () => cancels, unmount }
}

const gizmo = () => document.querySelector<HTMLElement>('[data-model-handles]')

/** The press target at one handle's tip, once the gizmo draws. */
function tipOf(axis: string): Promise<Element> {
  return waitFor(() => {
    const tip = document.querySelector(
      `[data-model-handle="${axis}"] [data-model-handle-tip]`,
    )
    if (!tip) throw new Error(`no ${axis} handle is drawn`)
    return tip
  })
}

const PRESS = { clientX: 400, clientY: 300 }
const by = (x: number, y: number) => ({
  clientX: PRESS.clientX + x,
  clientY: PRESS.clientY + y,
})

/** Presses a handle's tip and drags it, with no release. */
async function drag(axis: string, x: number, y: number) {
  const target = await tipOf(axis)
  await user.pointer([
    { keys: '[MouseLeft>]', target, coords: PRESS },
    { target, coords: by(x, y) },
  ])
  return () =>
    user.pointer([{ keys: '[/MouseLeft]', target, coords: by(x, y) }])
}

const choose = async (mode: string) =>
  user.click(await screen.findByRole('button', { name: mode }))

describe('ModelHandles', () => {
  describe('in Size', () => {
    it('previews every axis while linked, writing nothing until release', async () => {
      const { viewer, writes } = await selected()
      await choose('Size')

      const release = await drag('x', 50, 0)

      await waitFor(() => expect(viewer.getAttribute('scale')).toBe('2 2 2'))
      expect(writes).toEqual([])
      await release()
    })

    it('writes the size and the held camera as one write on release', async () => {
      const { writes } = await selected()
      await choose('Size')

      const release = await drag('x', 50, 0)
      await release()

      await waitFor(() => expect(writes).toHaveLength(1))
      expect(writes[0]?.map(({ name }) => name)).toEqual([
        'scale',
        'camera-orbit',
        'min-camera-orbit',
        'max-camera-orbit',
      ])
    })

    it('holds a drag past the center at the smallest size', async () => {
      const { viewer } = await selected()
      await choose('Size')

      const release = await drag('x', -120, 0)

      await waitFor(() =>
        expect(viewer.getAttribute('scale')).toBe('0.01 0.01 0.01'),
      )
      await release()
    })

    it('puts the live size back on Esc with nothing written', async () => {
      const { viewer, writes } = await selected()
      await choose('Size')
      const release = await drag('x', 50, 0)
      await waitFor(() => expect(viewer.getAttribute('scale')).toBe('2 2 2'))

      await user.keyboard('{Escape}')
      await release()

      await waitFor(() => expect(viewer.hasAttribute('scale')).toBe(false))
      expect(writes).toEqual([])
      expect(selectionStore.getState().element).toEqual(VIEWER)
    })

    it('puts the size and camera back when the write is refused', async () => {
      const { viewer, writes } = await selected({ written: false })
      await choose('Size')

      const release = await drag('x', 50, 0)
      await release()

      await waitFor(() => expect(writes).toHaveLength(1))
      await waitFor(() => expect(viewer.hasAttribute('scale')).toBe(false))
      expect(viewer.hasAttribute('camera-orbit')).toBe(false)
    })

    it('ends a drag with nothing written once the frame turns to its other theme', async () => {
      const { viewer, writes } = await selected()
      await choose('Size')
      const release = await drag('x', 50, 0)
      await waitFor(() => expect(viewer.getAttribute('scale')).toBe('2 2 2'))

      act(() => flipFrame(FRAME))
      await release()

      await waitFor(() => expect(viewer.hasAttribute('scale')).toBe(false))
      expect(writes).toEqual([])
    })
  })

  describe('in Turn', () => {
    it('turns the live model about its axis and writes it once', async () => {
      const { viewer, writes } = await selected()
      await choose('Turn')

      const release = await drag('y', 60, 0)
      await waitFor(() =>
        expect(viewer.getAttribute('orientation')).toBe('0deg 0deg 30deg'),
      )
      expect(writes).toEqual([])
      await release()

      await waitFor(() =>
        expect(writes).toEqual([
          [{ name: 'orientation', value: '0deg 0deg 30deg' }],
        ]),
      )
    })

    it('puts the turn back on Esc', async () => {
      const { viewer, writes } = await selected({
        attributes: 'orientation="0deg 10deg 0deg"',
      })
      await choose('Turn')
      const release = await drag('y', 60, 0)
      await waitFor(() =>
        expect(viewer.getAttribute('orientation')).toBe('0deg 10deg 30deg'),
      )

      await user.keyboard('{Escape}')
      await release()

      await waitFor(() =>
        expect(viewer.getAttribute('orientation')).toBe('0deg 10deg 0deg'),
      )
      expect(writes).toEqual([])
    })
  })

  describe('in Move', () => {
    it.each([
      ['x', { left: 140, top: 120 }],
      ['y', { left: 100, top: 90 }],
    ])('moves a placed model along %s alone', async (axis, to) => {
      const { previews, commits } = await selected()

      const release = await drag(axis, 40, -30)
      expect(previews.at(-1)).toEqual(to)
      expect(commits).toEqual([])
      await release()

      expect(commits).toEqual([to])
    })

    it('holds the outline at the drop until the page measures it', async () => {
      await selected()

      const release = await drag('x', 40, 0)
      await release()

      expect(heldOutline()?.box).toEqual({ ...BOX, x: 140 })
    })

    it('puts the place back on Esc', async () => {
      const { commits, cancels } = await selected()
      const release = await drag('x', 40, 0)

      await user.keyboard('{Escape}')
      await release()

      expect(cancels()).toBe(1)
      expect(commits).toEqual([])
    })

    it('moves the model in its scene along Z', async () => {
      const { viewer, writes } = await selected()

      const release = await drag('z', -29, 20)
      await waitFor(() =>
        expect(viewer.getAttribute('camera-target')).toMatch(
          /^auto auto -?[\d.]+m$/,
        ),
      )
      await release()

      await waitFor(() => expect(writes).toHaveLength(1))
      expect(writes[0]?.[0]?.name).toBe('camera-target')
    })

    it('keeps Z alone for a model in the flow', async () => {
      await selected({ placed: null })

      await tipOf('z')

      expect(document.querySelector('[data-model-handle="x"]')).toBeNull()
      expect(document.querySelector('[data-model-handle="y"]')).toBeNull()
    })
  })

  it('writes nothing for a press that never moves', async () => {
    const { writes, commits } = await selected()
    const target = await tipOf('x')

    await user.click(target)

    expect(commits).toEqual([])
    expect(writes).toEqual([])
  })

  it('names the mode it is in', async () => {
    await selected()

    await choose('Turn')

    expect(screen.getByRole('button', { name: 'Turn' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Move' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('reaches 24 pixels across at each tip', async () => {
    await selected()

    const { width, height } = (await tipOf('x')).getBoundingClientRect()

    expect(Math.min(width, height)).toBeGreaterThanOrEqual(24)
  })

  it('gives way to a drag on the canvas and comes back after it', async () => {
    await selected()
    await tipOf('x')

    await user.pointer([
      { keys: '[MouseLeft>]', target: root ?? document.body, coords: PRESS },
      { target: root ?? document.body, coords: by(20, 0) },
    ])
    expect(gizmo()).not.toBeVisible()
    await user.pointer([{ keys: '[/MouseLeft]' }])

    expect(gizmo()).toBeVisible()
  })

  describe('draws nothing', () => {
    it.each([
      ['in Play', () => modeStore.setState({ mode: 'play' })],
      ['under another tool', () => modeStore.setState({ tool: 'note' })],
      [
        'in a tab that may not write',
        () => liveStore.setState({ canWrite: false }),
      ],
      [
        'while the camera turns by drag',
        () => turnStore.setState({ turning: { frame: FRAME, index: 4 } }),
      ],
    ])('%s', async (_name, change) => {
      await selected()
      // Drawn first, so the null below is no early read.
      await tipOf('z')

      act(change)

      expect(gizmo()).toBeNull()
    })

    it.each([
      ['for a locked model', { locked: true }],
      [
        'for a model too small to hold it clear of its corner marks',
        { box: { ...BOX, width: 40, height: 40 } },
      ],
    ])('%s', async (_name, options) => {
      await selected(options)

      expect(gizmo()).toBeNull()
    })
  })
})
