import '../../styles.css'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/client/components/ui/tooltip'
import { liveStore, receiveBoard } from '@/client/live/store'
import { boardOf, frameOf, pageOf } from '@/test/board'
import { BRIDGE } from '@/test/frame-bridge'

import { trees } from '../element/tree'
import { modeStore } from '../mode'
import {
  clear,
  select,
  selectElement,
  selectElements,
  selectionStore,
} from '../selection'
import { stopFrameRename } from '../structure/actions'
import { presetStore } from '../structure/tool'
import { InspectorPanel } from './panel'
import { inspectorTabStore } from './tab-store'

const PAGE = 'studio/home'
const SWATCHES = frameOf('swatches', {
  name: 'Color swatches',
  box: { x: 460, y: 116, width: 640, height: 188 },
})
const SUNSET = frameOf('sunset', {
  box: { x: 460, y: 280, width: 640, height: 180 },
})

function renderPanel(open?: string) {
  return render(
    <TooltipProvider>
      <InspectorPanel open={open} />
    </TooltipProvider>,
  )
}

describe('Export tab', () => {
  beforeEach(() => {
    receiveBoard(liveStore, boardOf(pageOf([SWATCHES, SUNSET])))
    liveStore.setState({ canWrite: true })
  })

  afterEach(() => {
    act(() => {
      clear(selectionStore)
      // A tree is held per reload of its frame, so one test's stub would name the next test's elements.
      trees.store.setState({ byRef: {} })
      modeStore.setState({ tool: 'move', mode: 'edit' })
      presetStore.setState({ preset: 'desktop' })
      inspectorTabStore.setState({ tab: 'design' })
      stopFrameRename()
    })
  })

  beforeEach(() => {
    inspectorTabStore.setState({ tab: 'export' })
  })

  it('draws for one selected frame', () => {
    act(() => select(selectionStore, PAGE, [SWATCHES.ref]))

    renderPanel()

    expect(screen.getByRole('region', { name: 'Export' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Export 2 files' })).toBeEnabled()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(
      SWATCHES.name,
    )
  })

  it('draws no section for several frames', () => {
    act(() => select(selectionStore, PAGE, [SWATCHES.ref, SUNSET.ref]))

    renderPanel()

    expect(screen.queryByRole('region', { name: 'Export' })).toBeNull()
  })

  describe('on an element', () => {
    const HASH = 'd'.repeat(64)
    let layer: HTMLElement | undefined

    /** Mounts the swatches frame's live iframe, whose `h1` sits at index 3 and `p` at 4. */
    async function mountSwatches(): Promise<void> {
      layer = document.createElement('div')
      const frame = document.createElement('div')
      frame.dataset.frame = SWATCHES.ref
      const iframe = document.createElement('iframe')
      const loaded = new Promise((resolve) =>
        iframe.addEventListener('load', resolve, { once: true }),
      )
      iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}"></style>${BRIDGE}</head><body><h1>Swatches</h1><p>Six colors</p></body></html>`
      frame.append(iframe)
      layer.append(frame)
      document.body.append(layer)
      await loaded
    }

    const row = (index: number, tag: string, name: string) => ({
      index,
      parent: null,
      tag,
      name,
      textOnly: true,
      layout: 'block',
      round: false,
      placed: false,
    })

    beforeEach(() => {
      vi.stubGlobal('fetch', async (input: RequestInfo | URL) =>
        String(input).includes('/elements')
          ? Response.json({
              ok: true,
              data: {
                ref: SWATCHES.ref,
                hash: HASH,
                elements: [row(3, 'h1', 'Swatches'), row(4, 'p', 'Six colors')],
              },
            })
          : Response.json({ ok: false, error: { message: 'Not stubbed.' } }),
      )
    })

    afterEach(() => {
      vi.unstubAllGlobals()
      layer?.remove()
      layer = undefined
    })

    it('draws for one selected element, named for its frame and Layers row', async () => {
      await mountSwatches()
      act(() =>
        selectElement(selectionStore, PAGE, {
          frame: SWATCHES.ref,
          index: 3,
          hash: HASH,
        }),
      )

      renderPanel()

      expect(
        await screen.findByRole('region', { name: 'Export' }),
      ).toBeVisible()
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(
          'Color swatches-swatches',
        ),
      )
    })

    it('names its frame in one row that goes up to the frame', async () => {
      await mountSwatches()
      act(() =>
        selectElement(selectionStore, PAGE, {
          frame: SWATCHES.ref,
          index: 3,
          hash: HASH,
        }),
      )
      renderPanel()
      const crumb = await screen.findByRole('region', { name: 'Frame' })
      await waitFor(() => expect(crumb).toHaveTextContent('Swatches'))

      await userEvent.click(
        within(crumb).getByRole('button', { name: SWATCHES.name }),
      )

      expect(selectionStore.getState()).toMatchObject({
        frames: [SWATCHES.ref],
        element: null,
      })
    })

    it('draws the element’s step on Slides', async () => {
      await mountSwatches()
      act(() =>
        selectElement(selectionStore, PAGE, {
          frame: SWATCHES.ref,
          index: 3,
          hash: HASH,
        }),
      )
      inspectorTabStore.setState({ tab: 'slides' })

      renderPanel()

      expect(
        await screen.findByRole('textbox', { name: 'Appears on step' }),
      ).toBeVisible()
      expect(screen.getByRole('region', { name: 'This slide' })).toBeVisible()
    })

    it('draws no section for several selected elements', async () => {
      await mountSwatches()
      act(() =>
        selectElements(selectionStore, PAGE, [
          { frame: SWATCHES.ref, index: 3, hash: HASH },
          { frame: SWATCHES.ref, index: 4, hash: HASH },
        ]),
      )

      renderPanel()

      expect(
        await screen.findByText('Select one frame or element to export it.'),
      ).toBeVisible()
      expect(screen.queryByRole('region', { name: 'Export' })).toBeNull()
    })
  })

  it('draws no section under the Frame tool', () => {
    act(() => select(selectionStore, PAGE, [SWATCHES.ref]))
    modeStore.setState({ tool: 'frame', mode: 'edit' })

    renderPanel()

    expect(screen.queryByRole('region', { name: 'Export' })).toBeNull()
  })

  it('stays live in a tab that may not write, since it writes nothing', () => {
    liveStore.setState({ canWrite: false })
    act(() => select(selectionStore, PAGE, [SWATCHES.ref]))

    renderPanel()

    expect(screen.getByRole('button', { name: 'Export 2 files' })).toBeEnabled()
  })
})
