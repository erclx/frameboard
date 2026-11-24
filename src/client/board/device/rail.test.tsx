import '../../styles.css'

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { frameOf } from '@/test/board'
import { bridgeIn } from '@/test/frame-bridge'

import { Frame } from '../frame'

describe('the rail beside a device', () => {
  it('stands past a scroll tablet’s volume buttons', async () => {
    const tablet = frameOf('a', {
      box: { x: 0, y: 0, width: 834, height: 400 },
      showDevice: true,
      device: 'tablet',
      scroll: true,
    })
    const { container } = render(<Frame frame={tablet} live version={0} />)
    const iframe = container.querySelector('iframe')
    if (!iframe) throw new Error('No iframe drawn.')
    await new Promise((resolve) =>
      iframe.addEventListener('load', resolve, { once: true }),
    )
    await bridgeIn(iframe)
    iframe.contentDocument?.body.insertAdjacentHTML(
      'beforeend',
      '<div style="height:2000px"></div>',
    )

    await expect
      .poll(() => container.querySelector('[data-rail]'))
      .not.toBeNull()
    const rail = container.querySelector('[data-rail]')
    const volume = container.querySelector('[data-bezel-button="right"]')

    expect(rail?.getBoundingClientRect().left).toBeCloseTo(
      (volume?.getBoundingClientRect().right ?? 0) + 8,
    )
  })
})
