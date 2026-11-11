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

function finding(width?: number): Finding {
  return {
    rule: 'clipped',
    severity: 'error',
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
      '/frames/studio/home/hero.html?theme=light&v=3',
      '/frames/studio/home/hero.html?theme=light&v=3',
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
