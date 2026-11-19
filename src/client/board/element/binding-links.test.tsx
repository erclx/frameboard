import '../../styles.css'

import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { frameOf } from '@/test/board'
import { ask, bridgeIn } from '@/test/frame-bridge'

import TUNER from '../../../../test/fixtures/frames/tuner-links.html?raw'
import { modeStore } from '../mode'
import { clear, select, selectionStore } from '../selection'
import { BindingLinks } from './binding-links'

const HERO = frameOf('hero', {
  box: { x: 100, y: 50, width: 600, height: 300 },
})

let layer: HTMLDivElement | undefined

afterEach(() => {
  act(() => clear(selectionStore))
  act(() => modeStore.setState({ mode: 'edit' }))
  layer?.remove()
  layer = undefined
})

/** Mounts the hero frame's live, bridged iframe of `source`, as the canvas draws one. */
async function mountFrame(source: string): Promise<HTMLDivElement> {
  layer = document.createElement('div')
  const frame = document.createElement('div')
  frame.dataset.frame = HERO.ref
  frame.style.cssText = `position:absolute;width:${HERO.box.width}px;height:${HERO.box.height}px`
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'display:block;width:100%;height:100%;border:0'
  const loaded = new Promise((resolve) =>
    iframe.addEventListener('load', resolve, { once: true }),
  )
  iframe.srcdoc = source
  frame.append(iframe)
  layer.append(frame)
  document.body.append(layer)
  await loaded
  await bridgeIn(iframe)
  return layer
}

describe('BindingLinks', () => {
  it('tags each control of a selected frame with what it binds', async () => {
    const mounted = await mountFrame(TUNER)
    act(() => select(selectionStore, 'studio/home', [HERO.ref]))

    render(<BindingLinks frames={[HERO]} container={mounted} />)

    expect(await screen.findByText('#photo --brightness')).toBeVisible()
    expect(screen.getByText('#photo --contrast')).toBeVisible()
  })

  it('tags a control whose target is gone as matching nothing, with no link', async () => {
    const mounted = await mountFrame(TUNER)
    act(() => select(selectionStore, 'studio/home', [HERO.ref]))

    const { container } = render(
      <BindingLinks frames={[HERO]} container={mounted} />,
    )

    expect(await screen.findByText('#hero-image, no match')).toBeVisible()
    expect(container.querySelectorAll('[data-binding-link]')).toHaveLength(3)
    const links = [...container.querySelectorAll('[data-binding-link]')].map(
      (row) => row.children.length,
    )
    expect(links).toEqual([2, 2, 1])
  })

  it('draws nothing for a frame that is not selected', async () => {
    const mounted = await mountFrame(TUNER)

    const { container } = render(
      <BindingLinks frames={[HERO]} container={mounted} />,
    )

    expect(container.querySelector('[data-binding-link]')).toBeNull()
  })

  it("tags a control in a phone frame's page, 54 below where the bare frame tags it", async () => {
    const mounted = await mountFrame(TUNER)
    act(() => select(selectionStore, 'studio/home', [HERO.ref]))
    const tagTop = (container: HTMLElement) =>
      parseFloat(
        /calc\(([\d.]+)px/.exec(
          container.querySelector<HTMLElement>('[data-binding-link] > span')
            ?.style.top ?? '',
        )?.[1] ?? '',
      )
    const bare = render(<BindingLinks frames={[HERO]} container={mounted} />)
    await waitFor(() => expect(tagTop(bare.container)).not.toBeNaN())
    const plain = tagTop(bare.container)
    bare.unmount()

    const phone = render(
      <BindingLinks
        frames={[{ ...HERO, showDevice: true, device: 'phone' }]}
        container={mounted}
      />,
    )

    await waitFor(() => expect(tagTop(phone.container)).toBe(plain + 54))
  })

  it('moves a link when its target moves in a page the board kept', async () => {
    const mounted = await mountFrame(TUNER)
    act(() => select(selectionStore, 'studio/home', [HERO.ref]))
    const { container } = render(
      <BindingLinks frames={[HERO]} container={mounted} />,
    )
    const link = () =>
      container.querySelector<HTMLElement>('[data-binding-link] > span')
    await waitFor(() => expect(link()).not.toBeNull())
    const before = parseFloat(link()?.style.left ?? '')
    const iframe = mounted.querySelector('iframe')
    const photo = iframe?.contentDocument?.getElementById('photo')
    if (!iframe || !photo) throw new Error('The frame draws no photo')

    // A transform resizes nothing, so only the restamp makes the overlay measure.
    photo.style.transform = 'translateX(-40px)'
    await ask(iframe, 'restamp', { hash: 'd'.repeat(64) })

    const right = Math.round(photo.getBoundingClientRect().right)
    expect(right).not.toBe(before - HERO.box.x)
    await waitFor(() =>
      expect(parseFloat(link()?.style.left ?? '')).toBe(HERO.box.x + right),
    )
  })

  it('draws nothing for a restamped page holding no root', async () => {
    const mounted = await mountFrame(TUNER)
    act(() => select(selectionStore, 'studio/home', [HERO.ref]))
    const { container } = render(
      <BindingLinks frames={[HERO]} container={mounted} />,
    )
    await screen.findByText('#photo --brightness')
    const iframe = mounted.querySelector('iframe')
    if (!iframe) throw new Error('The frame draws no iframe')

    iframe.contentDocument?.documentElement.remove()
    await ask(iframe, 'restamp', { hash: 'd'.repeat(64) })

    await waitFor(() =>
      expect(container.querySelector('[data-binding-link]')).toBeNull(),
    )
  })

  it('draws nothing in Play', async () => {
    const mounted = await mountFrame(TUNER)
    act(() => select(selectionStore, 'studio/home', [HERO.ref]))
    act(() => modeStore.setState({ mode: 'play' }))

    const { container } = render(
      <BindingLinks frames={[HERO]} container={mounted} />,
    )

    expect(container.querySelector('[data-binding-link]')).toBeNull()
  })
})
