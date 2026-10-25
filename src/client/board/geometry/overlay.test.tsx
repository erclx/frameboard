import '../../styles.css'

import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { frameOf } from '@/test/board'

import { endPreview, setPreview } from '../preview/store'
import { clear, select, selectElement, selectionStore } from '../selection'
import { drawRest } from './draw'
import { SelectionOverlay } from './overlay'

const PAGE = 'studio/home'
const LEFT = frameOf('left', {
  box: { x: 100, y: 100, width: 640, height: 188 },
})
const RIGHT = frameOf('right', {
  box: { x: 100, y: 400, width: 640, height: 180 },
})

describe('SelectionOverlay', () => {
  afterEach(() => {
    act(() => clear(selectionStore))
  })

  it('draws no selection while nothing is selected', () => {
    const { container } = render(<SelectionOverlay frames={[LEFT, RIGHT]} />)

    expect(container.querySelector('[data-selection]')).toBeNull()
  })

  it('outlines one frame with four handles and its size', () => {
    act(() => select(selectionStore, PAGE, [LEFT.ref]))

    const { container } = render(<SelectionOverlay frames={[LEFT, RIGHT]} />)

    const selection = container.querySelector<HTMLElement>('[data-selection]')
    expect(selection?.style).toMatchObject({
      left: '100px',
      top: '100px',
      width: '640px',
      height: '188px',
    })
    expect(container.querySelectorAll('[data-handle]')).toHaveLength(4)
    expect(container.querySelector('[data-chip]')).toHaveTextContent(
      '640 × 188',
    )
  })

  it('draws the parent of a selected element dashed, with no handles or size', () => {
    act(() =>
      selectElement(selectionStore, PAGE, {
        frame: LEFT.ref,
        index: 4,
        hash: 'a'.repeat(64),
      }),
    )

    const { container } = render(<SelectionOverlay frames={[LEFT, RIGHT]} />)

    expect(
      container.querySelector<HTMLElement>('[data-selection]')?.style.outline,
    ).toContain('dashed')
    expect(container.querySelector('[data-handles]')).not.toBeVisible()
    expect(container.querySelector('[data-chip]')).not.toBeVisible()
  })

  it('keeps the handles hidden on a selected element once a drag of its frame ends', () => {
    act(() =>
      selectElement(selectionStore, PAGE, {
        frame: LEFT.ref,
        index: 4,
        hash: 'a'.repeat(64),
      }),
    )
    const { container } = render(<SelectionOverlay frames={[LEFT, RIGHT]} />)
    const overlay = container.querySelector<HTMLElement>('[data-overlay]')

    if (overlay) drawRest(overlay)

    expect(container.querySelector('[data-handles]')).not.toBeVisible()
    expect(container.querySelector('[data-chip]')).not.toBeVisible()
  })

  it('bounds several frames, outlines each, and counts them', () => {
    act(() => select(selectionStore, PAGE, [LEFT.ref, RIGHT.ref]))

    const { container } = render(<SelectionOverlay frames={[LEFT, RIGHT]} />)

    expect(
      container.querySelector<HTMLElement>('[data-selection]')?.style.height,
    ).toBe('480px')
    expect(container.querySelectorAll('[data-outline]')).toHaveLength(2)
    expect(container.querySelector('[data-chip]')).toHaveTextContent('2 frames')
  })

  it('leaves out a selected frame the page no longer shows', () => {
    act(() => select(selectionStore, PAGE, [LEFT.ref, RIGHT.ref]))

    const { container } = render(<SelectionOverlay frames={[LEFT]} />)

    expect(container.querySelector('[data-chip]')).toHaveTextContent(
      '640 × 188',
    )
  })

  describe('on a previewed frame', () => {
    afterEach(() => {
      act(() => endPreview([LEFT.ref]))
    })

    it('outlines the previewed width and names the stored size', () => {
      act(() => select(selectionStore, PAGE, [LEFT.ref]))
      act(() => setPreview([LEFT.ref], 390))

      const { container } = render(<SelectionOverlay frames={[LEFT, RIGHT]} />)

      expect(
        container.querySelector<HTMLElement>('[data-selection]')?.style.width,
      ).toBe('390px')
      expect(container.querySelector('[data-chip]')).toHaveTextContent(
        '640 × 188',
      )
    })
  })
})
