import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { Toaster } from '@/client/components/ui/toast'
import { liveStore } from '@/client/live/store'

import { attachCanvas, type CanvasControls } from '../view'
import { receiveShow, SHOW_OFFER, startBusyWatch } from './show'
import { ShowOfferBody } from './show-toast'

const SHOP_HERO = 'shop/home/hero'

const controls: CanvasControls = {
  zoomBy: () => {},
  zoomTo: () => {},
  fit: () => {},
  fitTo: () => {},
  panBy: () => {},
  centerOn: () => {},
}

const cleanups: (() => void)[] = []

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.()
  history.replaceState(null, '', '/')
  liveStore.setState({ focus: null })
})

/** The stack with the offer body, on the home view so any show is a project change. */
function renderStack() {
  render(<Toaster bodies={{ [SHOW_OFFER]: ShowOfferBody }} />)
}

describe('the show offer', () => {
  it('offers rather than jumps when a press began before the first show', async () => {
    startBusyWatch()
    history.replaceState(null, '', '/p/studio/home')
    document.dispatchEvent(new Event('pointerdown'))
    cleanups.push(() => document.dispatchEvent(new Event('pointerup')))
    renderStack()

    act(() => receiveShow('studio/pricing/plans'))

    expect(await screen.findByText('An agent showed plans')).toBeTruthy()
    expect(location.pathname).toBe('/p/studio/home')
  })

  it('names the frame and its project beside Go', async () => {
    renderStack()

    act(() => receiveShow(SHOP_HERO))

    expect(await screen.findByText('An agent showed hero')).toBeTruthy()
    expect(screen.getByText('home in shop')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy()
  })

  it('jumps to the frame and closes on Go', async () => {
    renderStack()
    act(() => receiveShow(SHOP_HERO))

    await userEvent.click(await screen.findByRole('button', { name: 'Go' }))

    expect(location.pathname).toBe('/p/shop/home')
    expect(liveStore.getState().focus).toBe(SHOP_HERO)
    await waitFor(() =>
      expect(screen.queryByText('An agent showed hero')).toBeNull(),
    )
  })

  it('closes when the developer opens the offered page unaided', async () => {
    renderStack()
    act(() => receiveShow(SHOP_HERO))
    await screen.findByText('An agent showed hero')

    act(() => {
      cleanups.push(attachCanvas(controls, 'shop/home'))
    })

    await waitFor(() =>
      expect(screen.queryByText('An agent showed hero')).toBeNull(),
    )
  })

  it('stays when the developer opens another page', async () => {
    renderStack()
    act(() => receiveShow(SHOP_HERO))
    await screen.findByText('An agent showed hero')

    act(() => {
      cleanups.push(attachCanvas(controls, 'shop/cart'))
    })

    expect(screen.getByText('An agent showed hero')).toBeTruthy()
  })
})
