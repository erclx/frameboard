import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { registerActions } from '@/client/actions/registry'
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

  it('names one frame and its place in canvas order, whatever the stacking', () => {
    const before = frameOf('before', {
      box: { x: 0, y: 0, width: 300, height: 200 },
    })
    const after = frameOf('after', {
      box: { x: 400, y: 0, width: 300, height: 200 },
    })
    act(() => select(selectionStore, PAGE, [before.ref]))

    const { container } = render(<SelectionOverlay frames={[before, after]} />)

    expect(container.querySelector('[data-chip]')).toHaveTextContent(
      /^before · 1 of 2$/,
    )
  })

  it('leaves a hidden frame out of the count and keeps the row it holds', () => {
    const hidden = frameOf('hidden', {
      box: { x: 0, y: 0, width: 300, height: 1000 },
      hidden: true,
    })
    const right = frameOf('right', {
      box: { x: 800, y: 300, width: 300, height: 200 },
    })
    const left = frameOf('left', {
      box: { x: 400, y: 460, width: 300, height: 200 },
    })
    act(() => select(selectionStore, PAGE, [left.ref]))

    const { container } = render(
      <SelectionOverlay frames={[hidden, left, right]} />,
    )

    expect(container.querySelector('[data-chip]')).toHaveTextContent(
      /^left · 1 of 2$/,
    )
  })

  it('outlines no hidden frame the selection still holds', () => {
    const hidden = frameOf('hidden', { hidden: true })
    act(() => select(selectionStore, PAGE, [LEFT.ref, hidden.ref]))

    const { container } = render(<SelectionOverlay frames={[LEFT, hidden]} />)

    expect(container.querySelector('[data-chip]')).toHaveTextContent(
      /^left · 1 of 1$/,
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

  it('stands the chip past the body of a selected frame in a device', () => {
    const phone = frameOf('phone', {
      box: { x: 100, y: 100, width: 390, height: 844 },
      device: 'phone',
    })
    act(() => select(selectionStore, PAGE, [phone.ref]))

    const { container } = render(<SelectionOverlay frames={[phone]} />)

    const selection = container.querySelector('[data-selection]')
    const chip = container.querySelector('[data-chip]')
    const bottom = selection?.getBoundingClientRect().bottom ?? 0
    expect(chip?.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      bottom + 16,
    )
  })

  it('stands the chip past the pose buttons under a selected foldable', () => {
    const inbox = frameOf('inbox', {
      box: { x: 100, y: 100, width: 890, height: 626 },
      device: 'foldable',
      pose: 'open',
    })
    act(() => select(selectionStore, PAGE, [inbox.ref]))

    const { container } = render(<SelectionOverlay frames={[inbox]} />)

    const selection = container.querySelector('[data-selection]')
    const chip = container.querySelector('[data-chip]')
    const bottom = selection?.getBoundingClientRect().bottom ?? 0
    expect(chip?.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      bottom + 20 + 40,
    )
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

  it('draws several frames a dashed group line set apart, each frame solid', () => {
    act(() => select(selectionStore, PAGE, [LEFT.ref, RIGHT.ref]))

    const { container } = render(<SelectionOverlay frames={[LEFT, RIGHT]} />)

    const group = container.querySelector<HTMLElement>('[data-selection]')
    expect(group?.style.outline).toContain('dashed')
    expect(group?.style.outlineOffset).toContain('6px')
    for (const outline of container.querySelectorAll<HTMLElement>(
      '[data-outline]',
    )) {
      expect(outline.style.outline).toContain('solid')
    }
  })

  it('keeps one selected frame a solid outline on its bounds', () => {
    act(() => select(selectionStore, PAGE, [LEFT.ref]))

    const { container } = render(<SelectionOverlay frames={[LEFT, RIGHT]} />)

    const selection = container.querySelector<HTMLElement>('[data-selection]')
    expect(selection?.style.outline).toContain('solid')
    expect(selection?.style.outlineOffset).toBe('')
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
        /^left · 1 of 2$/,
      )
    })
  })
})
