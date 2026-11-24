import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { flipFrame, themeStore } from '@/client/theme/store'
import type { Finding } from '@/shared/records/check'
import { frameOf } from '@/test/board'

import { LinkedBoxes } from './linked-box'

const HERO = frameOf('hero', {
  box: { x: 100, y: 40, width: 1440, height: 900 },
  widths: [
    { width: 834, height: 1194 },
    { width: 390, height: 844 },
  ],
})

function finding(
  width?: number,
  severity: Finding['severity'] = 'error',
): Finding {
  return {
    rule: 'clipped',
    severity,
    frame: HERO.ref,
    path: 'studio/home/hero.html',
    message: 'cut off',
    location: null,
    ...(width === undefined ? {} : { width }),
  }
}

function boxes(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>('[data-linked-width]')]
}

describe('LinkedBoxes', () => {
  afterEach(() => {
    act(() =>
      themeStore.setState({
        choice: 'system',
        system: 'light',
        flipped: new Set(),
      }),
    )
  })

  it('draws each width in a row past the frame, labelled by its width', () => {
    const { container } = render(
      <LinkedBoxes frame={HERO} live={false} version={0} />,
    )

    expect(
      boxes(container).map((box) => [
        box.textContent,
        box.style.left,
        box.style.top,
        box.style.width,
        box.style.height,
      ]),
    ).toEqual([
      ['834', '1620px', '40px', '834px', '1194px'],
      ['390', '2534px', '40px', '390px', '844px'],
    ])
  })

  describe('with the device on', () => {
    const PHONE = frameOf('hero', {
      box: { x: 100, y: 40, width: 390, height: 844 },
      widths: [
        { width: 834, height: 1194 },
        { width: 1440, height: 900 },
        { width: 320, height: 568 },
        { width: 300, height: 500 },
      ],
      device: 'phone',
      showDevice: true,
    })

    it('draws each width in the device it names, and one under 320 bare', () => {
      const { container } = render(
        <LinkedBoxes frame={PHONE} live={false} version={0} />,
      )

      expect(
        boxes(container).map((box) => [
          box.dataset.linkedWidth,
          box.querySelector<HTMLElement>('[data-bezel]')?.dataset.bezel,
        ]),
      ).toEqual([
        ['834', 'tablet'],
        ['1440', 'laptop'],
        ['320', 'phone'],
        ['300', undefined],
      ])
    })

    it('keeps each body clear of the last', () => {
      const { container } = render(
        <LinkedBoxes frame={PHONE} live={false} version={0} />,
      )

      const [tablet, laptop, phone] = boxes(container)
      const volume = tablet?.querySelector('[data-bezel-button="right"]')
      const base = laptop?.querySelector('[data-bezel-base]')
      const side = phone?.querySelector('[data-bezel-button="left"]')
      const rect = (element?: Element | null) =>
        element?.getBoundingClientRect()

      expect(rect(base)?.left).toBeCloseTo((rect(volume)?.right ?? 0) + 80)
      expect(rect(side)?.left).toBeCloseTo((rect(base)?.right ?? 0) + 80)
    })

    it("starts a linked phone's page under its status bar", () => {
      const { container } = render(
        <LinkedBoxes frame={PHONE} live version={0} />,
      )

      const [tablet, , phone] = boxes(container).map((box) => {
        const page = box.querySelector('iframe')?.getBoundingClientRect()
        const { top, height } = box.getBoundingClientRect()
        return { top: (page?.top ?? 0) - top, height, page: page?.height }
      })

      expect(tablet).toEqual({ top: 0, height: 1194, page: 1194 })
      expect(phone).toEqual({ top: 54, height: 568, page: 514 })
    })

    it("labels a width above its body, as a frame's own label stands", () => {
      const { container } = render(
        <LinkedBoxes frame={PHONE} live={false} version={0} />,
      )

      const [tablet] = boxes(container)
      const label = tablet?.firstElementChild?.getBoundingClientRect()
      const box = tablet?.getBoundingClientRect()

      expect(label?.bottom).toBeCloseTo((box?.top ?? 0) - 32)
      expect(label?.left).toBeCloseTo((box?.left ?? 0) - 32)
    })

    it('draws every width bare with the device off', () => {
      const { container } = render(
        <LinkedBoxes
          frame={{ ...PHONE, device: undefined, showDevice: undefined }}
          live={false}
          version={0}
        />,
      )

      expect(container.querySelector('[data-bezel]')).toBeNull()
      expect(boxes(container)[0]?.style.left).toBe('570px')
    })
  })

  describe('the pill’s form', () => {
    const CLEAR = 'rgba(0, 0, 0, 0)'
    const pillOf = (findings: Finding[]) => {
      render(
        <LinkedBoxes
          frame={HERO}
          live={false}
          version={0}
          findings={findings}
        />,
      )
      const pill = screen.getByRole('img', { name: /check findings? at 390/ })
      return { pill, style: getComputedStyle(pill) }
    }

    it('draws warnings alone as a dot and a count with no fill', () => {
      const { pill, style } = pillOf([
        finding(390, 'warning'),
        finding(390, 'warning'),
      ])

      expect(pill).toHaveTextContent('2')
      expect(pill.querySelector('[data-findings-quiet]')).toBeVisible()
      expect(style.backgroundColor).toBe(CLEAR)
      expect(style.boxShadow).toBe('none')
    })

    it('keeps the filled pill for an error alone', () => {
      const { pill, style } = pillOf([finding(390)])

      expect(pill.querySelector('svg')).toBeVisible()
      expect(style.backgroundColor).not.toBe(CLEAR)
    })

    it('keeps the filled pill for one error among warnings and counts every finding', () => {
      const { pill, style } = pillOf([finding(390, 'warning'), finding(390)])

      expect(pill).toHaveTextContent('2')
      expect(style.backgroundColor).not.toBe(CLEAR)
    })
  })

  it('counts the findings read at its own width alone', () => {
    render(
      <LinkedBoxes
        frame={HERO}
        live={false}
        version={0}
        findings={[finding(), finding(390), finding(390)]}
      />,
    )

    expect(
      screen.getByRole('img', { name: '2 check findings at 390' }),
    ).toBeTruthy()
    expect(screen.queryByRole('img', { name: /at 834/ })).toBeNull()
  })

  it('serves the page at its frame reload version and theme', () => {
    const { container } = render(<LinkedBoxes frame={HERO} live version={3} />)

    expect(
      boxes(container).map((box) =>
        box.querySelector('iframe')?.getAttribute('src'),
      ),
    ).toEqual([
      `${location.origin}/frames/studio/home/hero.html?theme=light&v=3`,
      `${location.origin}/frames/studio/home/hero.html?theme=light&v=3`,
    ])
  })

  it('flips with its frame', () => {
    const { container } = render(<LinkedBoxes frame={HERO} live version={0} />)

    act(() => flipFrame(HERO.ref))

    expect(
      boxes(container).map(
        (box) => box.querySelector('iframe')?.style.colorScheme,
      ),
    ).toEqual(['dark', 'dark'])
  })

  it('draws nothing for a hidden frame', () => {
    const { container } = render(
      <LinkedBoxes frame={{ ...HERO, hidden: true }} live version={0} />,
    )

    expect(boxes(container)).toEqual([])
  })
})
