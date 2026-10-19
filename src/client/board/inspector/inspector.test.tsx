import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { type Action, registerActions } from '@/client/actions/registry'
import { TooltipProvider } from '@/client/components/ui/tooltip'
import { liveStore, receiveBoard } from '@/client/live/store'
import { boardOf, frameOf, pageOf } from '@/test/board'

import type { Box } from '../geometry/box'
import { modeStore } from '../mode'
import { clear, select, selectionStore } from '../selection'
import { presetStore } from '../structure/tool'
import { FrameSection } from './frame-section'
import { InspectorPanel } from './panel'

const PAGE = 'studio/home'
const SWATCHES = frameOf('swatches', {
  name: 'Color swatches',
  box: { x: 460, y: 116, width: 640, height: 188 },
})
const SUNSET = frameOf('sunset', {
  box: { x: 460, y: 280, width: 640, height: 180 },
})

function renderPanel() {
  return render(
    <TooltipProvider>
      <InspectorPanel />
    </TooltipProvider>,
  )
}

function value(label: string): string {
  return (screen.getByRole('textbox', { name: label }) as HTMLInputElement)
    .value
}

describe('InspectorPanel', () => {
  beforeEach(() => {
    receiveBoard(liveStore, boardOf(pageOf([SWATCHES, SUNSET])))
    liveStore.setState({ canWrite: true })
  })

  afterEach(() => {
    act(() => {
      clear(selectionStore)
      modeStore.setState({ tool: 'move', mode: 'edit' })
      presetStore.setState({ preset: 'desktop' })
    })
  })

  describe('under the Frame tool', () => {
    beforeEach(() => {
      modeStore.setState({ tool: 'frame', mode: 'edit' })
    })

    it('lists the presets with desktop chosen', () => {
      renderPanel()

      expect(screen.getByRole('radio', { name: /Desktop/ })).toHaveAttribute(
        'aria-checked',
        'true',
      )
      expect(screen.getByRole('radio', { name: /Tablet/ })).toHaveTextContent(
        '834 × 1194',
      )
    })

    it('chooses the preset the next click places', async () => {
      renderPanel()

      await userEvent.click(screen.getByRole('radio', { name: /Phone/ }))

      expect(presetStore.getState().preset).toBe('phone')
      expect(screen.getByRole('radio', { name: /Phone/ })).toHaveAttribute(
        'aria-checked',
        'true',
      )
    })

    it('shows the presets over a selected frame', () => {
      act(() => select(selectionStore, PAGE, [SWATCHES.ref]))

      renderPanel()

      expect(screen.getAllByRole('radio')).toHaveLength(3)
      expect(screen.queryByRole('textbox', { name: 'Width' })).toBeNull()
    })
  })

  it('holds the hint while nothing is selected', () => {
    renderPanel()

    expect(
      screen.getByText('Select a frame to see its details.'),
    ).toBeInTheDocument()
  })

  it('shows one frame’s name and box', () => {
    act(() => select(selectionStore, PAGE, [SWATCHES.ref]))

    renderPanel()

    expect(screen.getByRole('heading', { name: 'Frame' })).toBeInTheDocument()
    expect(screen.getByText('Color swatches')).toBeInTheDocument()
    expect(['X position', 'Y position', 'Width', 'Height'].map(value)).toEqual([
      '460',
      '116',
      '640',
      '188',
    ])
    expect(screen.queryByRole('heading', { name: 'Arrange' })).toBeNull()
  })

  it('reads Mixed where several frames differ, and adds Arrange', () => {
    act(() => select(selectionStore, PAGE, [SWATCHES.ref, SUNSET.ref]))

    renderPanel()

    expect(
      screen.getByRole('heading', { name: '2 frames' }),
    ).toBeInTheDocument()
    expect(['X position', 'Y position', 'Width', 'Height'].map(value)).toEqual([
      '460',
      'Mixed',
      '640',
      'Mixed',
    ])
    expect(screen.getByRole('heading', { name: 'Arrange' })).toBeInTheDocument()
  })

  it('runs an Arrange button’s registered action', async () => {
    let runs = 0
    const alignLeft: Action = {
      id: 'arrange.alignLeft',
      label: 'Align left',
      group: 'arrange',
      keys: ['Alt+KeyA'],
      run: () => {
        runs += 1
      },
    }
    const unregister = registerActions([alignLeft])
    act(() => select(selectionStore, PAGE, [SWATCHES.ref, SUNSET.ref]))
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Align left' }))

    expect(runs).toBe(1)
    unregister()
  })

  it('disables the fields while the tab may not write', () => {
    liveStore.setState({ canWrite: false })
    act(() => select(selectionStore, PAGE, [SWATCHES.ref]))

    renderPanel()

    expect(screen.getByRole('textbox', { name: 'Width' })).toBeDisabled()
  })
})

describe('FrameSection', () => {
  function renderSection(frames = [SWATCHES]) {
    const writes: { boxes: Readonly<Record<string, Box>> }[] = []
    render(
      <FrameSection
        page={PAGE}
        frames={frames}
        write={async (_page, boxes) => {
          writes.push({ boxes })
          return true
        }}
      />,
    )
    return writes
  }

  beforeEach(() => {
    liveStore.setState({ canWrite: true })
  })

  it('writes the typed value on Enter', async () => {
    const writes = renderSection()

    await userEvent.type(
      screen.getByRole('textbox', { name: 'X position' }),
      '500{Enter}',
    )

    expect(writes).toEqual([
      { boxes: { [SWATCHES.ref]: { ...SWATCHES.box, x: 500 } } },
    ])
  })

  it('sets one value on every selected frame on blur', async () => {
    const writes = renderSection([SWATCHES, SUNSET])

    await userEvent.type(screen.getByRole('textbox', { name: 'Height' }), '200')
    await userEvent.tab()

    expect(writes).toEqual([
      {
        boxes: {
          [SWATCHES.ref]: { ...SWATCHES.box, height: 200 },
          [SUNSET.ref]: { ...SUNSET.box, height: 200 },
        },
      },
    ])
  })

  it('writes nothing for a value that is not a whole number', async () => {
    const writes = renderSection()

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Width' }),
      'wide{Enter}',
    )

    expect(writes).toEqual([])
    expect(value('Width')).toBe('640')
  })

  it('keeps a width at 1 px or more', async () => {
    const writes = renderSection()

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Width' }),
      '0{Enter}',
    )

    expect(writes[0]?.boxes[SWATCHES.ref]?.width).toBe(1)
  })
})
