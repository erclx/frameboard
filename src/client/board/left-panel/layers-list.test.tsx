import '../../styles.css'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/client/components/ui/tooltip'
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
