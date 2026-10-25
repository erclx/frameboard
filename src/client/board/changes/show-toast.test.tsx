import '../../styles.css'

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
  visible: () => ({ x: 0, y: 0, width: 800, height: 600 }),
}

const cleanups: (() => void)[] = []

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.()
  history.replaceState(null, '', '/')
  liveStore.setState({ focus: null })
})

type Rgba = [number, number, number, number]

/** A computed color, being `rgb()`, `rgba()`, or the `color(srgb …)` a `color-mix` computes to. */
function parse(color: string): Rgba {
  const srgb =
    /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(color)
  if (srgb) {
    const [r, g, b] = [srgb[1], srgb[2], srgb[3]].map((part) => Number(part))
    return [r * 255, g * 255, b * 255, Number(srgb[4] ?? 1)] as Rgba
  }
  const rgb = /^rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)$/.exec(
    color,
  )
  if (!rgb) throw new Error(`unread color ${color}`)
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4] ?? 1)]
}

function over(top: Rgba, under: Rgba): Rgba {
  const a = top[3]
  return [0, 1, 2].map(
    (at) => top[at]! * a + under[at]! * (1 - a),
  ) as unknown as Rgba
}

function luminance([r, g, b]: Rgba): number {
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** An element's text against its background, each translucent layer laid over the ones beneath it. */
function contrastOnPage(element: HTMLElement): number {
  const layers: Rgba[] = []
  for (let at: HTMLElement | null = element; at; at = at.parentElement) {
    const fill = parse(getComputedStyle(at).backgroundColor)
    if (fill[3] > 0) layers.push(fill)
    if (fill[3] === 1) break
  }
  const ground = layers
    .reverse()
    .reduce<Rgba>(
      (under, top) => [...over(top, under), 1] as Rgba,
      [255, 255, 255, 1],
    )
  const text = over(parse(getComputedStyle(element).color), ground)
  const [light, dark] = [luminance(text), luminance(ground)].sort(
    (a, b) => b - a,
  )
  return (light! + 0.05) / (dark! + 0.05)
}

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

  it('draws Go at 4.5:1 or better on its tint', async () => {
    renderStack()

    act(() => receiveShow(SHOP_HERO))

    const go = await screen.findByRole('button', { name: 'Go' })
    expect(contrastOnPage(go)).toBeGreaterThanOrEqual(4.5)
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
