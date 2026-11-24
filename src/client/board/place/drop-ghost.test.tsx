import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { tileDragStore } from './asset-drop'
import { DropGhost, PlaceGhost } from './drop-ghost'
import { carriedStore } from './tool'

afterEach(() => {
  act(() => {
    tileDragStore.setState({ at: null, ghost: null })
    carriedStore.setState({ carried: null, ghost: null })
  })
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

  it('shows the frame a carried element would make, its height hugging', () => {
    const { container } = render(<DropGhost />)

    act(() =>
      carriedStore.setState({
        ghost: {
          box: { x: 620, y: 80, width: 120, height: 40 },
          name: 'buy',
          hugsHeight: true,
        },
      }),
    )

    expect(screen.getByText('New frame · 120 × Hug')).toBeVisible()
    expect(screen.getByText('buy')).toBeVisible()
    expect(
      container.querySelector<HTMLElement>('[data-drop-ghost]')?.style,
    ).toMatchObject({ left: '620px', top: '80px' })
  })

  it('draws nothing while the tile is over a frame', () => {
    const { container } = render(<DropGhost />)

    act(() => tileDragStore.setState({ at: { x: 400, y: 300 }, ghost: null }))

    expect(container.querySelector('[data-drop-ghost]')).toBeNull()
  })
})

describe('PlaceGhost', () => {
  it('draws a dashed Text box at the pointer', () => {
    const { container } = render(
      <PlaceGhost spot={{ kind: 'text', x: 300, y: 200 }} />,
    )

    expect(screen.getByText('Text')).toBeVisible()
    expect(
      container.querySelector<HTMLElement>('[data-place-ghost]')?.style,
    ).toMatchObject({ left: '300px', top: '200px' })
  })

  it('draws a shape at the box it would land at', () => {
    const { container } = render(
      <PlaceGhost
        spot={{ kind: 'rectangle', x: 250, y: 150, width: 100, height: 100 }}
      />,
    )

    expect(
      container.querySelector<HTMLElement>('[data-place-ghost]')?.style,
    ).toMatchObject({
      left: '250px',
      top: '150px',
      width: '100px',
      height: '100px',
    })
  })
})
