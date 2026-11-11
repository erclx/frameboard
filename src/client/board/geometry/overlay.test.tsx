import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { registerActions } from '@/client/actions/registry'
import type { SectionRecord } from '@/shared/records/list'
import { frameOf } from '@/test/board'
import { contrastOnPage } from '@/test/contrast'
import { ringFocused } from '@/test/focus-ring'

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
    document.documentElement.classList.remove('dark')
  })

  it('draws no selection while nothing is selected', () => {
    const { container } = render(<SelectionOverlay frames={[LEFT, RIGHT]} />)

    expect(container.querySelector('[data-selection]')).toBeNull()
  })

  it('outlines one frame with four handles', () => {
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
  })

  // The page sends LEFT then RIGHT, bottom first, so Layers lists RIGHT first.
  it('names one frame and its place in Layers order', () => {
    act(() => select(selectionStore, PAGE, [LEFT.ref]))

    const { container } = render(<SelectionOverlay frames={[LEFT, RIGHT]} />)

    expect(container.querySelector('[data-chip]')).toHaveTextContent(
      /^left · 2 of 2$/,
    )
  })

  it('counts through sections top first, then the frames in none', () => {
    const section: SectionRecord = {
      name: 'flow',
      box: { x: 0, y: 0, width: 1000, height: 400 },
      order: 0,
      frames: [LEFT.name],
    }
    act(() => select(selectionStore, PAGE, [LEFT.ref]))

    const { container } = render(
      <SelectionOverlay frames={[LEFT, RIGHT]} sections={[section]} />,
    )

    expect(container.querySelector('[data-chip]')).toHaveTextContent(
      /^left · 1 of 2$/,
    )
  })

  it.each(['light', 'dark'])(
    'reads the chip at 4.5:1 or better in %s',
    (theme) => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
      act(() => select(selectionStore, PAGE, [LEFT.ref]))

      const { container } = render(<SelectionOverlay frames={[LEFT, RIGHT]} />)

      const chip = container.querySelector('[data-chip]')
      if (!chip) throw new Error('no chip')
      expect(contrastOnPage(chip)).toBeGreaterThanOrEqual(4.5)
    },
  )

  describe('the chip controls', () => {
    let unregister = () => {}

    afterEach(() => {
      unregister()
    })

    it('names each control with its key', () => {
      unregister = registerActions([
        {
          id: 'frame.next',
          label: 'Next frame',
          group: 'view',
          palette: false,
          keys: ['Tab'],
          run: () => {},
        },
      ])
      act(() => select(selectionStore, PAGE, [LEFT.ref]))

      render(<SelectionOverlay frames={[LEFT, RIGHT]} />)

      expect(
        screen.getByRole('button', { name: 'Next frame' }),
      ).toHaveAttribute('aria-keyshortcuts', 'Tab')
      expect(
        screen.getByRole('button', { name: 'Previous frame' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Zoom to selection' }),
      ).toBeInTheDocument()
    })

    it.each([
      ['Previous frame', 'light'],
      ['Next frame', 'light'],
      ['Zoom to selection', 'light'],
      ['Previous frame', 'dark'],
      ['Next frame', 'dark'],
      ['Zoom to selection', 'dark'],
    ])(
      'rings a focused %s control at 3:1 or better on the chip in %s',
      async (name, theme) => {
        document.documentElement.classList.toggle('dark', theme === 'dark')
        act(() => select(selectionStore, PAGE, [LEFT.ref]))
        render(<SelectionOverlay frames={[LEFT, RIGHT]} />)

        const ring = await ringFocused(screen.getByRole('button', { name }))

        expect(ring).toBeGreaterThanOrEqual(3)
      },
    )

    it('draws no step controls on a page of one frame', () => {
      act(() => select(selectionStore, PAGE, [LEFT.ref]))

      render(<SelectionOverlay frames={[LEFT]} />)

      expect(screen.queryByRole('button', { name: 'Next frame' })).toBeNull()
      expect(
        screen.getByRole('button', { name: 'Zoom to selection' }),
      ).toBeInTheDocument()
    })

    it.each([
      ['Previous frame', 'frame.previous'],
      ['Next frame', 'frame.next'],
      ['Zoom to selection', 'view.zoomToSelection'],
    ])('runs %s through its action', (name, id) => {
      const ran: string[] = []
      unregister = registerActions([
        {
          id,
          label: name,
          group: 'view',
          palette: false,
          run: () => ran.push(id),
        },
      ])
      act(() => select(selectionStore, PAGE, [LEFT.ref]))
      render(<SelectionOverlay frames={[LEFT, RIGHT]} />)

      // The chip takes no pointer, so the gestures click a control this way.
      screen.getByRole('button', { name }).click()

      expect(ran).toEqual([id])
    })
  })

  it('draws the parent of a selected element dashed, with no handles or chip', () => {
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
    expect(container.querySelector('[data-chip]')).toHaveTextContent(
      /^2 frames$/,
    )
  })

  it('leaves out a selected frame the page no longer shows', () => {
    act(() => select(selectionStore, PAGE, [LEFT.ref, RIGHT.ref]))

    const { container } = render(<SelectionOverlay frames={[LEFT]} />)

    expect(container.querySelector('[data-chip]')).toHaveTextContent(
      /^left · 1 of 1$/,
    )
  })

  describe('on a previewed frame', () => {
    afterEach(() => {
      act(() => endPreview([LEFT.ref]))
    })

    it('outlines the previewed width and names the frame alone', () => {
      act(() => select(selectionStore, PAGE, [LEFT.ref]))
      act(() => setPreview([LEFT.ref], 390))

      const { container } = render(<SelectionOverlay frames={[LEFT, RIGHT]} />)

      expect(
        container.querySelector<HTMLElement>('[data-selection]')?.style.width,
      ).toBe('390px')
      expect(container.querySelector('[data-chip]')).toHaveTextContent(
        /^left · 2 of 2$/,
      )
    })
  })
})
