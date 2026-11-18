import '../../styles.css'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/client/components/ui/tooltip'
import type { FrameRecord, SectionRecord } from '@/shared/records/list'
import { frameOf } from '@/test/board'

import type { Box } from '../geometry/box'
import { modeStore } from '../mode'
import { enteredStore, leaveFrame } from '../play/entered'
import { clear, selectionStore } from '../selection'
import { attachCanvas } from '../view'
import { LayersList } from './layers-list'

const HERO = frameOf('hero', {
  box: { x: 2000, y: 0, width: 390, height: 844 },
})
const ABOUT = frameOf('about')

/** A canvas showing the top left 800 by 600, recording each box it centers. */
function attachView() {
  const centered: Box[] = []
  const detach = attachCanvas(
    {
      zoomBy: () => {},
      zoomTo: () => {},
      fit: () => {},
      fitTo: () => {},
      panBy: () => {},
      centerOn: (box) => centered.push(box),
      visible: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    },
    'studio/home',
  )
  return { centered, detach }
}

function renderList() {
  render(
    <TooltipProvider>
      <LayersList frames={[ABOUT, HERO]} />
    </TooltipProvider>,
  )
}

describe('a layers row in Play', () => {
  let detach = () => {}

  beforeEach(() => {
    modeStore.setState({ mode: 'play' })
  })

  afterEach(() => {
    detach()
    leaveFrame()
    clear(selectionStore)
    modeStore.setState({ mode: 'edit', tool: 'move' })
  })

  it('enters its frame', async () => {
    detach = attachView().detach
    renderList()

    await userEvent.click(screen.getByRole('button', { name: 'Select hero' }))

    expect(enteredStore.getState().ref).toBe(HERO.ref)
  })

  it('brings its frame into view', async () => {
    const view = attachView()
    detach = view.detach
    renderList()

    await userEvent.click(screen.getByRole('button', { name: 'Select hero' }))

    expect(view.centered).toEqual([HERO.box])
  })

  it('writes no selection', async () => {
    detach = attachView().detach
    renderList()

    await userEvent.click(screen.getByRole('button', { name: 'Select hero' }))

    expect(selectionStore.getState().frames).toEqual([])
  })
})

describe('a layers row picked with a modifier key', () => {
  const [A, B, C, D, E] = ['a', 'b', 'c', 'd', 'e'].map((name) => frameOf(name))
  /** Bottom of the stack first, as the server sends them, so Layers lists a to e. */
  const FRAMES = [E, D, C, B, A].flatMap((frame) => (frame ? [frame] : []))
  const section = (name: string, frames: string[]): SectionRecord => ({
    name,
    box: { x: 0, y: 0, width: 100, height: 100 },
    order: 0,
    frames,
  })
  let detach = () => {}

  afterEach(() => {
    detach()
    clear(selectionStore)
  })

  function renderRows(
    frames: readonly FrameRecord[] = FRAMES,
    sections: readonly SectionRecord[] = [],
  ) {
    detach = attachView().detach
    render(
      <TooltipProvider>
        <LayersList frames={frames} sections={sections} />
      </TooltipProvider>,
    )
  }

  const row = (name: string) =>
    screen.getByRole('button', { name: `Select ${name}` })
  const selected = () => [...selectionStore.getState().frames].sort()
  const refs = (...names: string[]) =>
    names.map((name) => `studio/home/${name}`)

  async function clickWith(key: string, name: string) {
    const user = userEvent.setup()
    await user.keyboard(`{${key}>}`)
    await user.click(row(name))
    await user.keyboard(`{/${key}}`)
  }

  it('selects every row from the anchor forward to a Shift-clicked row', async () => {
    renderRows()
    await userEvent.click(row('b'))

    await clickWith('Shift', 'd')

    expect(selected()).toEqual(refs('b', 'c', 'd'))
  })

  it('selects every row from the anchor back to a Shift-clicked row', async () => {
    renderRows()
    await userEvent.click(row('d'))

    await clickWith('Shift', 'a')

    expect(selected()).toEqual(refs('a', 'b', 'c', 'd'))
  })

  it('spans from the same anchor on a second Shift-click', async () => {
    renderRows()
    await userEvent.click(row('c'))
    await clickWith('Shift', 'e')

    await clickWith('Shift', 'a')

    expect(selected()).toEqual(refs('a', 'b', 'c'))
  })

  it('spans across a section into the rows below it', async () => {
    renderRows(FRAMES, [section('Top', ['a', 'b'])])
    await userEvent.click(row('a'))

    await clickWith('Shift', 'd')

    expect(selected()).toEqual(refs('a', 'b', 'c', 'd'))
  })

  it('leaves out a collapsed section and a hidden frame', async () => {
    const hidden = FRAMES.map((frame) =>
      frame.name === 'd' ? { ...frame, hidden: true } : frame,
    )
    // Bottom first, so Layers lists Top then Mid.
    renderRows(hidden, [section('Mid', ['c']), section('Top', ['a', 'b'])])
    await userEvent.click(
      screen.getByRole('button', { name: 'Hide the frames of Mid' }),
    )
    await userEvent.click(row('b'))

    await clickWith('Shift', 'e')

    expect(selected()).toEqual(refs('b', 'e'))
  })

  it('selects a Shift-clicked row alone with nothing selected', async () => {
    renderRows()

    await clickWith('Shift', 'c')

    expect(selected()).toEqual(refs('c'))
  })

  it.each(['Control', 'Meta'])(
    'adds one row and takes it out again on %s-click',
    async (key) => {
      renderRows()
      await userEvent.click(row('a'))

      await clickWith(key, 'c')
      const added = selected()
      await clickWith(key, 'a')

      expect(added).toEqual(refs('a', 'c'))
      expect(selected()).toEqual(refs('c'))
    },
  )
})
