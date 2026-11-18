import '../../styles.css'

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Device, Pose } from '@/shared/frame-device'

import { Bezel } from './bezel'

function Framed({
  device,
  width,
  height,
  zoom = 1,
  pose,
}: {
  device: Device
  width: number
  height: number
  zoom?: number
  pose?: Pose
}) {
  return (
    <div
      className="absolute top-0 left-0 origin-top-left"
      style={{ transform: `scale(${zoom})` }}
    >
      <div className="absolute" style={{ left: 100, top: 100, width, height }}>
        <Bezel device={device} width={width} height={height} pose={pose} />
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

  describe('laptop', () => {
    function partsOf(container: HTMLElement) {
      const rect = (selector: string) =>
        container.querySelector(selector)?.getBoundingClientRect()
      return {
        chin: rect('[data-bezel-chin]'),
        base: rect('[data-bezel-base]'),
      }
    }

    it('draws a 20 lid with no island and no home bar', () => {
      const { container } = render(
        <Framed device="laptop" width={1440} height={900} />,
      )

      expect(borderOf(bezelOf(container))).toBe(20)
      expect(container.querySelector('[data-bezel-island]')).toBeNull()
      expect(container.querySelector('[data-bezel-home]')).toBeNull()
    })

    it('rounds the screen on its top corners alone', () => {
      const { container } = render(
        <Framed device="laptop" width={1440} height={900} />,
      )

      const style = getComputedStyle(bezelOf(container))

      expect(style.borderTopLeftRadius).toBe('10px')
      expect(style.borderBottomLeftRadius).toBe('0px')
    })

    it('hangs a 28 chin as wide as the lid under the screen', () => {
      const { container } = render(
        <Framed device="laptop" width={1440} height={900} />,
      )

      const { chin } = partsOf(container)

      expect(chin?.top).toBeCloseTo(100 + 900)
      expect(chin?.height).toBeCloseTo(28)
      expect(chin?.left).toBeCloseTo(100 - 20 - 1)
      expect(chin?.width).toBeCloseTo(1440 + 40 + 2)
    })

    it('sets a 14 base under the chin, reaching 89 past the lid each side', () => {
      const { container } = render(
        <Framed device="laptop" width={1440} height={900} />,
      )

      const { base } = partsOf(container)

      expect(base?.top).toBeCloseTo(100 + 900 + 28)
      expect(base?.height).toBeCloseTo(14)
      expect(base?.left).toBeCloseTo(100 - 20 - 89)
      expect(base?.width).toBeCloseTo(1440 + 40 + 2 * 89)
    })

    it('scales the base with the canvas', () => {
      const { container } = render(
        <Framed device="laptop" width={1440} height={900} zoom={0.5} />,
      )

      expect(partsOf(container).base?.width).toBeCloseTo(
        (1440 + 40 + 2 * 89) / 2,
      )
    })
  })

  describe('foldable', () => {
    const rectOf = (container: HTMLElement, selector: string) =>
      container.querySelector(selector)?.getBoundingClientRect()

    it('draws a 20 border and a 48 screen radius', () => {
      const { container } = render(
        <Framed device="foldable" width={466} height={678} pose="closed" />,
      )

      const bezel = bezelOf(container)

      expect(borderOf(bezel)).toBe(20)
      expect(getComputedStyle(bezel).borderTopLeftRadius).toBe('48px')
    })

    it('centers the island on the cover screen, with no fold', () => {
      const { container } = render(
        <Framed device="foldable" width={466} height={678} pose="closed" />,
      )

      const island = rectOf(container, '[data-bezel-island]')

      expect((island?.left ?? 0) + (island?.width ?? 0) / 2).toBeCloseTo(
        100 + 233,
      )
      expect(container.querySelector('[data-bezel-fold]')).toBeNull()
    })

    it.each(['half', 'open'] as const)(
      'sets the island on the right half of the %s screen',
      (pose) => {
        const { container } = render(
          <Framed device="foldable" width={890} height={626} pose={pose} />,
        )

        const island = rectOf(container, '[data-bezel-island]')

        expect((island?.left ?? 0) + (island?.width ?? 0) / 2).toBeCloseTo(
          100 + 667.5,
        )
      },
    )

    it('draws the open crease down the middle, inside the screen', () => {
      const { container } = render(
        <Framed device="foldable" width={890} height={626} pose="open" />,
      )

      const fold = rectOf(container, '[data-bezel-fold]')

      expect((fold?.left ?? 0) + (fold?.width ?? 0) / 2).toBeCloseTo(100 + 445)
      expect(fold?.top).toBeCloseTo(100)
      expect(fold?.height).toBeCloseTo(626)
    })

    it('shades the half open fold wider, over the body above and below', () => {
      const { container } = render(
        <Framed device="foldable" width={890} height={626} pose="half" />,
      )

      const fold = rectOf(container, '[data-bezel-fold]')

      expect(fold?.width).toBeCloseTo(150)
      expect(fold?.top).toBeCloseTo(100 - 20)
      expect(fold?.height).toBeCloseTo(626 + 40)
    })
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
