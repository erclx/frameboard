import '../../styles.css'

import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { PresentBar } from './bar'

function barProps(
  overrides: Partial<ComponentProps<typeof PresentBar>> = {},
): ComponentProps<typeof PresentBar> {
  return {
    shown: true,
    covered: false,
    at: 2,
    count: 5,
    step: 0,
    steps: 0,
    name: 'inbox',
    fullscreen: false,
    onPrevious: () => {},
    onNext: () => {},
    onOverview: () => {},
    onPresenter: () => {},
    onFullscreen: () => {},
    onLeave: () => {},
    ...overrides,
  }
}

describe('PresentBar Rotate', () => {
  it('turns the shown slide on a press', async () => {
    const onRotate = vi.fn()
    render(<PresentBar {...barProps({ onRotate, rotateSlot: true })} />)

    await userEvent.click(screen.getByRole('button', { name: 'Rotate' }))

    expect(onRotate).toHaveBeenCalledOnce()
  })

  it('sits after the slide overview, ahead of the frame name', () => {
    render(<PresentBar {...barProps({ onRotate: () => {} })} />)

    const names = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent)

    expect(names.slice(0, 4)).toEqual([
      'Previous frame',
      'Next frame',
      'Slide overview',
      'Rotate',
    ])
  })

  it('holds Rotate’s width on a slide that does not turn, so the bar does not move', () => {
    const { container, rerender } = render(
      <PresentBar {...barProps({ onRotate: () => {}, rotateSlot: true })} />,
    )
    const turning = container.querySelector('[role="toolbar"]')
    const width = turning?.getBoundingClientRect().width

    rerender(<PresentBar {...barProps({ rotateSlot: true })} />)

    expect(screen.queryByRole('button', { name: 'Rotate' })).toBeNull()
    expect(turning?.getBoundingClientRect().width).toBeCloseTo(width ?? 0)
  })

  it('draws no Rotate and holds no room in a deck with no phone or tablet', () => {
    render(<PresentBar {...barProps()} />)

    expect(screen.queryByText('Rotate')).toBeNull()
  })

  it('writes nothing while off, and says why', async () => {
    const onRotate = vi.fn()
    render(
      <PresentBar
        {...barProps({ onRotate, rotateOff: 'Unlock inbox to turn it' })}
      />,
    )
    const rotate = screen.getByRole('button', { name: 'Rotate' })

    await userEvent.click(rotate)

    expect(onRotate).not.toHaveBeenCalled()
    expect(rotate).toHaveAttribute('title', 'Unlock inbox to turn it')
  })
})
