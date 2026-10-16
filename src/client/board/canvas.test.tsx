import '../styles.css'

import { render } from '@testing-library/react'
import { Profiler } from 'react'
import { describe, expect, it } from 'vitest'

import type { FrameRecord, PageRecord } from '@/shared/records/list'

import { Canvas } from './canvas'

function frame(
  name: string,
  box: FrameRecord['box'],
  extra: Partial<FrameRecord> = {},
): FrameRecord {
  return {
    ref: `studio/home/${name}`,
    project: 'studio',
    page: 'home',
    name,
    path: `/board/studio/home/${name}.html`,
    box,
    order: 0,
    hidden: false,
    locked: false,
    placed: true,
    modifiedAt: '2026-10-15T00:00:00.000Z',
    ...extra,
  }
}

function page(
  ref: string,
  frames: FrameRecord[],
  extra: Partial<PageRecord> = {},
): PageRecord {
  return {
    ref,
    project: 'studio',
    name: ref.split('/')[1] ?? '',
    path: `/board/${ref}`,
    index: 0,
    layoutError: null,
    frames,
    ...extra,
  }
}

function renderCanvas(content: PageRecord, onCommit = () => {}) {
  return render(
    <div style={{ width: 800, height: 600 }}>
      <Profiler id="canvas" onRender={onCommit}>
        <Canvas page={content} reloads={{}} />
      </Profiler>
    </div>,
  )
}

function layerOf(container: HTMLElement): HTMLElement {
  const layer = container.querySelector<HTMLElement>('[data-layer]')
  if (!layer) throw new Error('no canvas layer')
  return layer
}

function wheel(container: HTMLElement, init: WheelEventInit) {
  const hit = container.querySelector('[data-hit-layer]')
  hit?.dispatchEvent(
    new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init }),
  )
}

describe('Canvas', () => {
  it('fits every frame into the viewport on a first visit', () => {
    const { container } = renderCanvas(
      page('studio/fit', [
        frame('wide', { x: 0, y: 0, width: 1344, height: 400 }),
      ]),
    )

    // 800 wide less 64 of padding each side, over 1344, is a scale of 0.5.
    expect(layerOf(container).style.transform).toBe(
      'translate(64px, 200px) scale(0.5)',
    )
  })

  it('pans the layer on a wheel without a React commit', () => {
    let commits = 0
    const { container } = renderCanvas(
      page('studio/pan', [frame('a', { x: 0, y: 0, width: 200, height: 200 })]),
      () => (commits += 1),
    )
    const before = commits

    wheel(container, { deltaX: 30, deltaY: 50 })

    expect(layerOf(container).style.transform).toBe(
      'translate(270px, 150px) scale(1)',
    )
    expect(commits).toBe(before)
  })

  it('zooms on a wheel with ctrlKey, as a pinch sends it', () => {
    const { container } = renderCanvas(
      page('studio/pinch', [
        frame('a', { x: 0, y: 0, width: 200, height: 200 }),
      ]),
    )

    wheel(container, { deltaY: -100, ctrlKey: true })

    expect(layerOf(container).style.transform).toMatch(/scale\(2\)$/)
  })

  it('keeps live pages near the view and placeholders far from it', () => {
    const { container } = renderCanvas(
      page('studio/cull', [
        frame('near', { x: 0, y: 0, width: 400, height: 400 }),
        frame(
          'far',
          { x: 20000, y: 0, width: 400, height: 400 },
          { placed: true },
        ),
      ]),
    )
    // The two frames fit only far zoomed out, so zoom in on the near one.
    const near = container
      .querySelector('[data-frame="studio/home/near"]')
      ?.getBoundingClientRect()
    wheel(container, {
      deltaY: -1000,
      ctrlKey: true,
      clientX: (near?.x ?? 0) + (near?.width ?? 0) / 2,
      clientY: (near?.y ?? 0) + (near?.height ?? 0) / 2,
    })

    return expect
      .poll(() =>
        container.querySelector('[data-frame="studio/home/far"] iframe'),
      )
      .toBeNull()
      .then(() => {
        expect(
          container.querySelector('[data-frame="studio/home/near"] iframe'),
        ).not.toBeNull()
      })
  })

  it('leaves a hidden frame undrawn', () => {
    const { container } = renderCanvas(
      page('studio/hidden', [
        frame('shown', { x: 0, y: 0, width: 200, height: 200 }),
        frame(
          'gone',
          { x: 300, y: 0, width: 200, height: 200 },
          { hidden: true },
        ),
      ]),
    )

    expect(
      container.querySelector('[data-frame="studio/home/gone"]'),
    ).toBeNull()
  })

  it('shows a layout error in place of the frames', () => {
    const { container, getByRole } = renderCanvas(
      page(
        'studio/broken',
        [frame('a', { x: 0, y: 0, width: 200, height: 200 })],
        {
          layoutError: {
            path: '/board/studio/broken/layout.json',
            message: 'Unexpected token',
          },
        },
      ),
    )

    expect(getByRole('alert')).toHaveTextContent('Unexpected token')
    expect(container.querySelector('[data-frame]')).toBeNull()
  })

  it('brings a focused frame into view and reports it', () => {
    let focused = 0
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <Canvas
          page={page('studio/focus', [
            frame('a', { x: 0, y: 0, width: 200, height: 200 }),
            frame('b', { x: 5000, y: 0, width: 200, height: 200 }),
          ])}
          reloads={{}}
          focus="studio/home/b"
          onFocused={() => (focused += 1)}
        />
      </div>,
    )

    expect(focused).toBe(1)
    // Fitting b alone: centered at full size, 300 in from the left, 200 down.
    return expect
      .poll(() => layerOf(container).style.transform)
      .toBe('translate(-4700px, 200px) scale(1)')
  })

  it('waits for a focused frame that has not reached the page yet', () => {
    let focused = 0
    const { rerender } = render(
      <Canvas
        page={page('studio/later', [
          frame('a', { x: 0, y: 0, width: 200, height: 200 }),
        ])}
        reloads={{}}
        focus="studio/home/new"
        onFocused={() => (focused += 1)}
      />,
    )
    expect(focused).toBe(0)

    rerender(
      <Canvas
        page={page('studio/later', [
          frame('a', { x: 0, y: 0, width: 200, height: 200 }),
          frame('new', { x: 400, y: 0, width: 200, height: 200 }),
        ])}
        reloads={{}}
        focus="studio/home/new"
        onFocused={() => (focused += 1)}
      />,
    )

    expect(focused).toBe(1)
  })

  it('keeps a page view after leaving the page and coming back', () => {
    const content = page('studio/memory', [
      frame('a', { x: 0, y: 0, width: 200, height: 200 }),
    ])
    const first = renderCanvas(content)
    wheel(first.container, { deltaX: 100, deltaY: 0 })
    const moved = layerOf(first.container).style.transform
    first.unmount()

    const second = renderCanvas(content)

    return expect
      .poll(() => layerOf(second.container).style.transform)
      .toBe(moved)
  })
})
