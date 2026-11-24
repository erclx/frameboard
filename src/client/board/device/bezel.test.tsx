import '../../styles.css'

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type {
  Device,
  Island,
  PageColors,
  Pose,
  Turn,
} from '@/shared/frame-device'
import type { Theme } from '@/shared/theme'

import { Bezel } from './bezel'

function Framed({
  device,
  width,
  height,
  zoom = 1,
  pose,
  island,
  turn,
  colors,
  theme,
}: {
  device: Device
  width: number
  height: number
  zoom?: number
  pose?: Pose
  island?: Island
  turn?: Turn
  colors?: PageColors
  theme?: Theme
}) {
  return (
    <div
      className="absolute top-0 left-0 origin-top-left"
      style={{ transform: `scale(${zoom})` }}
    >
      <div className="absolute" style={{ left: 100, top: 100, width, height }}>
        <Bezel
          device={device}
          width={width}
          height={height}
          pose={pose}
          island={island}
          turn={turn}
          colors={colors}
          theme={theme}
        />
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

  describe('phone', () => {
    const rectsOf = (container: HTMLElement, selector: string) =>
      [...container.querySelectorAll(selector)].map((element) =>
        element.getBoundingClientRect(),
      )

    it('hangs three buttons past the left of the body and one past the right', () => {
      const { container } = render(
        <Framed device="phone" width={466} height={678} />,
      )

      const left = rectsOf(container, '[data-bezel-button="left"]')
      const right = rectsOf(container, '[data-bezel-button="right"]')

      expect(left).toHaveLength(3)
      expect(right).toHaveLength(1)
      for (const button of left) {
        expect(button.right).toBeCloseTo(100 - 16)
        expect(button.width).toBeCloseTo(4)
      }
      expect(right[0]?.left).toBeCloseTo(100 + 466 + 16)
      expect(right[0]?.top).toBeCloseTo(100 - 16 + 222)
    })

    it("draws a 54 tall status bar over the screen in the page's fill and text color", () => {
      const { container } = render(
        <Framed
          device="phone"
          width={466}
          height={678}
          colors={{ fill: 'rgb(10, 20, 30)', ink: 'rgb(200, 210, 220)' }}
        />,
      )

      const status = container.querySelector<HTMLElement>('[data-bezel-status]')
      const rect = status?.getBoundingClientRect()
      const style = status ? getComputedStyle(status) : null

      expect(rect?.top).toBeCloseTo(100)
      expect(rect?.height).toBeCloseTo(54)
      expect(rect?.width).toBeCloseTo(466)
      expect(style?.backgroundColor).toBe('rgb(10, 20, 30)')
      expect(style?.color).toBe('rgb(200, 210, 220)')
      expect(container.querySelector('[data-bezel-time]')?.textContent).toBe(
        '9:41',
      )
    })

    it("sets the time and marks in the island's band, clear of the island", () => {
      const { container } = render(
        <Framed device="phone" width={320} height={568} island="wide" />,
      )

      const rect = (selector: string) =>
        container.querySelector(selector)?.getBoundingClientRect()
      const island = rect('[data-bezel-island]')
      const time = rect('[data-bezel-time]')
      const battery = rect('[data-bezel-battery]')
      const signal = rect('[data-bezel-signal]')

      expect((time?.top ?? 0) + (time?.height ?? 0) / 2).toBeCloseTo(
        100 + 29,
        0,
      )
      expect(time?.right).toBeLessThan(island?.left ?? 0)
      expect(signal?.left).toBeGreaterThan(island?.right ?? 0)
      expect(battery?.right).toBeLessThan(100 + 320)
    })

    it("paints its theme's own colors before the page reports any", () => {
      const { container } = render(
        <Framed device="phone" width={466} height={678} theme="dark" />,
      )

      const status = container.querySelector<HTMLElement>('[data-bezel-status]')

      expect(status ? getComputedStyle(status).colorScheme : '').toBe('dark')
    })

    it('draws the compact island when none is picked', () => {
      const { container } = render(
        <Framed device="phone" width={466} height={678} />,
      )

      const [island] = rectsOf(container, '[data-bezel-island]')

      expect(island?.width).toBeCloseTo(81)
      expect(container.querySelector('[data-bezel-timer]')).toBeNull()
    })

    it('draws the wide island centered with its timer when picked', () => {
      const { container } = render(
        <Framed device="phone" width={466} height={678} island="wide" />,
      )

      const [island] = rectsOf(container, '[data-bezel-island]')

      expect(island?.width).toBeCloseTo(126)
      expect((island?.left ?? 0) + (island?.width ?? 0) / 2).toBeCloseTo(
        100 + 233,
      )
      expect(
        container.querySelector('[data-bezel-timer]')?.textContent,
      ).toContain('0:42')
    })
  })

  describe('a turned phone', () => {
    const rectsOf = (container: HTMLElement, selector: string) =>
      [...container.querySelectorAll(selector)].map((element) =>
        element.getBoundingClientRect(),
      )
    const middle = (rect: DOMRect | undefined) => ({
      x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 0) / 2,
    })

    it('draws no status bar turned left or right', () => {
      const { container } = render(
        <Framed device="phone" width={844} height={390} turn="left" />,
      )

      expect(container.querySelector('[data-bezel-status]')).toBeNull()
    })

    it.each(['left', 'right'] as const)(
      "fills a 54 wide strip down each short side in the page's fill turned %s, the island inside one",
      (turn) => {
        const { container } = render(
          <Framed
            device="phone"
            width={844}
            height={390}
            turn={turn}
            colors={{ fill: 'rgb(10, 20, 30)', ink: 'rgb(200, 210, 220)' }}
          />,
        )

        const strips = [
          ...container.querySelectorAll<HTMLElement>('[data-bezel-strip]'),
        ]
        const [left, right] = strips.map((strip) =>
          strip.getBoundingClientRect(),
        )
        const [island] = rectsOf(container, '[data-bezel-island]')

        expect(strips.map((strip) => strip.dataset.bezelStrip)).toEqual([
          'left',
          'right',
        ])
        expect(left?.left).toBeCloseTo(100)
        expect(right?.right).toBeCloseTo(100 + 844)
        for (const rect of [left, right]) {
          expect(rect?.width).toBeCloseTo(54)
          expect(rect?.height).toBeCloseTo(390)
        }
        for (const strip of strips) {
          expect(getComputedStyle(strip).backgroundColor).toBe(
            'rgb(10, 20, 30)',
          )
        }
        const holder = turn === 'left' ? left : right
        expect(island?.left).toBeGreaterThanOrEqual(holder?.left ?? 0)
        expect(island?.right).toBeLessThanOrEqual(holder?.right ?? 0)
      },
    )

    it("paints the strips in its theme's own colors before the page reports any", () => {
      const { container } = render(
        <Framed
          device="phone"
          width={844}
          height={390}
          turn="left"
          theme="dark"
        />,
      )

      const strips = [
        ...container.querySelectorAll<HTMLElement>('[data-bezel-strip]'),
      ]

      expect(strips).toHaveLength(2)
      for (const strip of strips) {
        expect(getComputedStyle(strip).colorScheme).toBe('dark')
      }
    })

    it.each([
      ['an upright phone', 'phone', 'upright'],
      ['a turned tablet', 'tablet', 'left'],
      ['an upright foldable', 'foldable', 'upright'],
    ] as const)('draws no side strips on %s', (_label, device, turn) => {
      const { container } = render(
        <Framed device={device} width={844} height={390} turn={turn} />,
      )

      expect(container.querySelector('[data-bezel-strip]')).toBeNull()
    })

    it('stands the island on end on the left short side turned left', () => {
      const { container } = render(
        <Framed device="phone" width={844} height={390} turn="left" />,
      )

      const [island] = rectsOf(container, '[data-bezel-island]')

      expect(island?.width).toBeCloseTo(30)
      expect(island?.height).toBeCloseTo(81)
      expect(middle(island).x).toBeCloseTo(100 + 29)
      expect(middle(island).y).toBeCloseTo(100 + 195)
    })

    it('stands the island on end on the right short side turned right', () => {
      const { container } = render(
        <Framed device="phone" width={844} height={390} turn="right" />,
      )

      const [island] = rectsOf(container, '[data-bezel-island]')

      expect(island?.height).toBeCloseTo(81)
      expect(middle(island).x).toBeCloseTo(100 + 844 - 29)
    })

    it('lays the three left buttons along the bottom and the side button along the top turned left', () => {
      const { container } = render(
        <Framed device="phone" width={844} height={390} turn="left" />,
      )

      const bottom = rectsOf(container, '[data-bezel-button="bottom"]')
      const top = rectsOf(container, '[data-bezel-button="top"]')

      expect(bottom).toHaveLength(3)
      expect(top).toHaveLength(1)
      for (const button of bottom) {
        expect(button.top).toBeCloseTo(100 + 390 + 16)
        expect(button.height).toBeCloseTo(4)
      }
      expect(top[0]?.bottom).toBeCloseTo(100 - 16)
      expect(top[0]?.left).toBeCloseTo(100 - 16 + 222)
    })

    it('lays the three left buttons along the top from the right turned right', () => {
      const { container } = render(
        <Framed device="phone" width={844} height={390} turn="right" />,
      )

      const top = rectsOf(container, '[data-bezel-button="top"]')

      expect(top).toHaveLength(3)
      expect(top[0]?.right).toBeCloseTo(100 + 844 + 16 - 142)
    })

    it('draws no camera', () => {
      const { container } = render(
        <Framed device="phone" width={844} height={390} turn="left" />,
      )

      expect(container.querySelector('[data-bezel-camera]')).toBeNull()
    })
  })

  it('draws a tablet with a 32 border, a 50 body radius, and no island', () => {
    const { container } = render(
      <Framed device="tablet" width={834} height={1194} />,
    )

    const bezel = bezelOf(container)
    const radius = Number.parseFloat(
      getComputedStyle(bezel).borderTopLeftRadius,
    )

    expect(borderOf(bezel)).toBe(32)
    expect(radius + borderOf(bezel)).toBe(50)
    expect(container.querySelector('[data-bezel-island]')).toBeNull()
  })

  describe('tablet', () => {
    const rectsOf = (container: HTMLElement, selector: string) =>
      [...container.querySelectorAll(selector)].map((element) =>
        element.getBoundingClientRect(),
      )
    const middle = (rect: DOMRect | undefined) => ({
      x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 0) / 2,
    })

    it('centers one 12 camera in the top of the body', () => {
      const { container } = render(
        <Framed device="tablet" width={834} height={1194} />,
      )

      const cameras = rectsOf(container, '[data-bezel-camera]')

      expect(cameras).toHaveLength(1)
      expect(cameras[0]?.width).toBeCloseTo(12)
      expect(middle(cameras[0]).x).toBeCloseTo(100 + 417)
      expect(middle(cameras[0]).y).toBeCloseTo(100 - 16)
    })

    it('hangs a power button past the top and two volume buttons past the right', () => {
      const { container } = render(
        <Framed device="tablet" width={834} height={1194} />,
      )

      const power = rectsOf(container, '[data-bezel-button="top"]')
      const volume = rectsOf(container, '[data-bezel-button="right"]')

      expect(power).toHaveLength(1)
      expect(power[0]?.bottom).toBeCloseTo(100 - 32)
      expect(power[0]?.height).toBeCloseTo(6)
      expect(power[0]?.width).toBeCloseTo(80)
      expect(power[0]?.right).toBeCloseTo(100 + 834 - 60)
      expect(volume.map(({ left }) => left - (100 + 834 + 32))).toEqual([0, 0])
      expect(volume.map(({ top }) => top - 100)).toEqual([90, 165])
      expect(volume.map(({ height }) => height)).toEqual([64, 64])
    })

    it('turns left with its camera and power on the left and its volume along the top', () => {
      const { container } = render(
        <Framed device="tablet" width={1194} height={834} turn="left" />,
      )

      const [camera] = rectsOf(container, '[data-bezel-camera]')
      const power = rectsOf(container, '[data-bezel-button="left"]')
      const volume = rectsOf(container, '[data-bezel-button="top"]')

      expect(middle(camera).x).toBeCloseTo(100 - 16)
      expect(middle(camera).y).toBeCloseTo(100 + 417)
      expect(power).toHaveLength(1)
      expect(power[0]?.right).toBeCloseTo(100 - 32)
      expect(power[0]?.top).toBeCloseTo(100 + 60)
      expect(power[0]?.height).toBeCloseTo(80)
      expect(volume.map(({ bottom }) => bottom)).toEqual([100 - 32, 100 - 32])
      expect(volume.map(({ left }) => left - 100)).toEqual([90, 165])
    })

    it('turns right with its camera and power on the right and its volume along the bottom', () => {
      const { container } = render(
        <Framed device="tablet" width={1194} height={834} turn="right" />,
      )

      const [camera] = rectsOf(container, '[data-bezel-camera]')
      const power = rectsOf(container, '[data-bezel-button="right"]')
      const volume = rectsOf(container, '[data-bezel-button="bottom"]')

      expect(middle(camera).x).toBeCloseTo(100 + 1194 + 16)
      expect(middle(camera).y).toBeCloseTo(100 + 417)
      expect(power).toHaveLength(1)
      expect(power[0]?.left).toBeCloseTo(100 + 1194 + 32)
      expect(power[0]?.bottom).toBeCloseTo(100 + 834 - 60)
      expect(volume.map(({ top }) => top)).toEqual([
        100 + 834 + 32,
        100 + 834 + 32,
      ])
      expect(volume.map(({ right }) => 100 + 1194 - right)).toEqual([90, 165])
    })
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

    it.each([1024, 1920])(
      "centers one 10 camera in the lid's top edge at %i wide, with no button",
      (width) => {
        const { container } = render(
          <Framed device="laptop" width={width} height={900} />,
        )

        const cameras = [
          ...container.querySelectorAll('[data-bezel-camera]'),
        ].map((camera) => camera.getBoundingClientRect())

        expect(cameras).toHaveLength(1)
        expect(cameras[0]?.width).toBeCloseTo(10)
        expect(cameras[0]?.left).toBeCloseTo(100 + width / 2 - 5)
        expect(cameras[0]?.top).toBeCloseTo(100 - 15)
        expect(container.querySelector('[data-bezel-button]')).toBeNull()
      },
    )

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

  describe('a turned foldable', () => {
    const rectOf = (container: HTMLElement, selector: string) =>
      container.querySelector(selector)?.getBoundingClientRect()
    const centerOf = (rect: DOMRect | undefined) => ({
      x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 0) / 2,
    })

    it.each([
      ['closed', 'left', 678, 466],
      ['open', 'left', 626, 890],
      ['half', 'right', 626, 890],
    ] as const)(
      "fills a 54 wide strip down each side edge in the page's fill, %s turned %s, the island inside one",
      (pose, turn, width, height) => {
        const { container } = render(
          <Framed
            device="foldable"
            width={width}
            height={height}
            pose={pose}
            turn={turn}
            colors={{ fill: 'rgb(10, 20, 30)', ink: 'rgb(200, 210, 220)' }}
          />,
        )

        const strips = [
          ...container.querySelectorAll<HTMLElement>('[data-bezel-strip]'),
        ]
        const [left, right] = strips.map((strip) =>
          strip.getBoundingClientRect(),
        )
        const island = rectOf(container, '[data-bezel-island]')
        const holder = turn === 'left' ? left : right

        expect(strips.map((strip) => strip.dataset.bezelStrip)).toEqual([
          'left',
          'right',
        ])
        expect(left?.left).toBeCloseTo(100)
        expect(right?.right).toBeCloseTo(100 + width)
        expect(left?.width).toBeCloseTo(54)
        expect(right?.width).toBeCloseTo(54)
        expect(left?.height).toBeCloseTo(height)
        expect(
          getComputedStyle(strips[0] ?? document.body).backgroundColor,
        ).toBe('rgb(10, 20, 30)')
        expect(getComputedStyle(strips[0] ?? document.body).borderRadius).toBe(
          '48px 0px 0px 48px',
        )
        expect(island?.left).toBeGreaterThanOrEqual(holder?.left ?? 0)
        expect(island?.right).toBeLessThanOrEqual(holder?.right ?? 0)
      },
    )

    it('paints its fold over its strips, so the shade runs across them', () => {
      const { container } = render(
        <Framed
          device="foldable"
          width={626}
          height={890}
          pose="half"
          turn="left"
        />,
      )

      const strip = container.querySelector('[data-bezel-strip]')
      const fold = container.querySelector('[data-bezel-fold]')

      expect(strip).not.toBeNull()
      expect(fold && strip?.compareDocumentPosition(fold)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      )
    })

    it('stands the closed island on end at the middle of the left side, with no fold', () => {
      const { container } = render(
        <Framed
          device="foldable"
          width={678}
          height={466}
          pose="closed"
          turn="left"
        />,
      )

      const island = rectOf(container, '[data-bezel-island]')

      expect(island?.width).toBeCloseTo(30)
      expect(island?.height).toBeCloseTo(100)
      expect(centerOf(island).x).toBeCloseTo(100 + 14 + 15)
      expect(centerOf(island).y).toBeCloseTo(100 + 233)
      expect(container.querySelector('[data-bezel-fold]')).toBeNull()
      expect(container.querySelector('[data-bezel-status]')).toBeNull()
    })

    it('sets the open island a quarter down the left side turned left, the crease across the middle', () => {
      const { container } = render(
        <Framed
          device="foldable"
          width={626}
          height={890}
          pose="open"
          turn="left"
        />,
      )

      const island = rectOf(container, '[data-bezel-island]')
      const fold = rectOf(container, '[data-bezel-fold]')

      expect(centerOf(island).x).toBeCloseTo(100 + 29)
      expect(centerOf(island).y).toBeCloseTo(100 + 222.5)
      expect(fold?.left).toBeCloseTo(100)
      expect(fold?.width).toBeCloseTo(626)
      expect(fold?.height).toBeCloseTo(26)
      expect(centerOf(fold).y).toBeCloseTo(100 + 445)
    })

    it('sets the half island three quarters down the right side turned right, the shaded fold across the body', () => {
      const { container } = render(
        <Framed
          device="foldable"
          width={626}
          height={890}
          pose="half"
          turn="right"
        />,
      )

      const island = rectOf(container, '[data-bezel-island]')
      const fold = rectOf(container, '[data-bezel-fold]')

      expect(centerOf(island).x).toBeCloseTo(100 + 626 - 29)
      expect(centerOf(island).y).toBeCloseTo(100 + 667.5)
      expect(fold?.left).toBeCloseTo(100 - 20)
      expect(fold?.width).toBeCloseTo(626 + 40)
      expect(fold?.height).toBeCloseTo(150)
      expect(centerOf(fold).y).toBeCloseTo(100 + 445)
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
