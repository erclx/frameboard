import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { tileDragStore } from './asset-drop'
import { DropGhost } from './drop-ghost'

afterEach(() => {
  act(() => tileDragStore.setState({ at: null, ghost: null }))
})

describe('DropGhost', () => {
  it('shows the new frame size and name at the box a drop would make', () => {
    const { container } = render(<DropGhost />)

    act(() =>
      tileDragStore.setState({
        at: { x: 400, y: 300 },
        ghost: {
          box: { x: 80, y: 120, width: 640, height: 360 },
          name: 'showcase',
          hugsHeight: false,
        },
      }),
    )

    expect(screen.getByText('New frame · 640 × 360')).toBeVisible()
    expect(screen.getByText('showcase')).toBeVisible()
    expect(
      container.querySelector<HTMLElement>('[data-drop-ghost]')?.style,
    ).toMatchObject({
      left: '80px',
      top: '120px',
      width: '640px',
      height: '360px',
    })
  })

  it('names an audio frame height as hugging', () => {
    render(<DropGhost />)

    act(() =>
      tileDragStore.setState({
        at: { x: 400, y: 300 },
        ghost: {
          box: { x: 250, y: 273, width: 300, height: 54 },
          name: 'voice',
          hugsHeight: true,
        },
      }),
    )

    expect(screen.getByText('New frame · 300 × Hug')).toBeVisible()
  })

  it('draws nothing while the tile is over a frame', () => {
    const { container } = render(<DropGhost />)

    act(() => tileDragStore.setState({ at: { x: 400, y: 300 }, ghost: null }))

    expect(container.querySelector('[data-drop-ghost]')).toBeNull()
  })
})
