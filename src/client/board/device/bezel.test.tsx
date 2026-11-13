import '../../styles.css'

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Device } from '@/shared/frame-device'

import { Bezel } from './bezel'

function Framed({
  device,
  width,
  height,
  zoom = 1,
}: {
  device: Device
  width: number
  height: number
  zoom?: number
}) {
  return (
    <div
      className="absolute top-0 left-0 origin-top-left"
      style={{ transform: `scale(${zoom})` }}
    >
      <div className="absolute" style={{ left: 100, top: 100, width, height }}>
        <Bezel device={device} />
      </div>
    </div>
  )
}

function bezelOf(container: HTMLElement): HTMLElement {
  const bezel = container.querySelector<HTMLElement>('[data-bezel]')
  if (!bezel) throw new Error('No bezel drawn.')
  return bezel
}

/** The spread of the first shadow, the body's width past the screen. */
function borderOf(bezel: HTMLElement): number {
  const spread = /0px 0px 0px (\d+)px/.exec(getComputedStyle(bezel).boxShadow)
  return Number(spread?.[1])
}

describe('Bezel', () => {
  it.each([
    [390, 844],
    [402, 874],
    [1440, 900],
  ])(
    'draws a phone at %ix%i with a 16 border and a 62 screen radius',
    (width, height) => {
      const { container } = render(
        <Framed device="phone" width={width} height={height} />,
      )

      const bezel = bezelOf(container)

      expect(borderOf(bezel)).toBe(16)
      expect(getComputedStyle(bezel).borderTopLeftRadius).toBe('62px')
    },
  )

  it('draws a phone body whose outer radius is 78', () => {
    const { container } = render(
      <Framed device="phone" width={390} height={844} />,
    )

    const bezel = bezelOf(container)
    const radius = Number.parseFloat(
      getComputedStyle(bezel).borderTopLeftRadius,
    )

    expect(radius + borderOf(bezel)).toBe(78)
  })

  it('draws a tablet with a 44 border and no island', () => {
    const { container } = render(
      <Framed device="tablet" width={834} height={1194} />,
    )

    const bezel = bezelOf(container)

    expect(borderOf(bezel)).toBe(44)
    expect(container.querySelector('[data-bezel-island]')).toBeNull()
  })

  it.each([0.3, 3])('scales the island with the canvas at %f zoom', (zoom) => {
    const { container } = render(
      <Framed device="phone" width={390} height={844} zoom={zoom} />,
    )

    const island = container.querySelector('[data-bezel-island]')

    expect(island?.getBoundingClientRect().width).toBeCloseTo(81 * zoom)
  })

  it('takes no pointer events, so a click reaches the frame under it', () => {
    const { container } = render(
      <Framed device="phone" width={390} height={844} />,
    )

    expect(getComputedStyle(bezelOf(container)).pointerEvents).toBe('none')
  })
})
