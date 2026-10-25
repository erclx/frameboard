import '../styles.css'

import { act, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Profiler } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { setCharacterKeys } from '@/client/actions/character-keys'
import { liveStore } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import type { FrameRecord, PageRecord } from '@/shared/records/list'

import { Canvas } from './canvas'
import { modeStore } from './mode'
import { closeNote, notesUi } from './notes/tool'
import { endPreview, setPreview } from './preview/store'
import { canvasView } from './view'
import { PAN_EASE_MS } from './wheel'

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
    hugWidth: false,
    hugHeight: false,
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

function renderCanvas(
  content: PageRecord,
  onCommit = () => {},
  calls?: ReturnType<typeof createStructure>,
) {
  return render(
    <div style={{ width: 800, height: 600 }}>
      <Profiler id="canvas" onRender={onCommit}>
        <Canvas page={content} reloads={{}} calls={calls} />
      </Profiler>
    </div>,
  )
}

function layerOf(container: HTMLElement): HTMLElement {
  const layer = container.querySelector<HTMLElement>('[data-layer]')
  if (!layer) throw new Error('no canvas layer')
  return layer
}

/** Whether `read` returns the same count before and after a few frames. */
async function holdsAcrossFrames(read: () => number): Promise<boolean> {
  const at = read()
  for (let frame = 0; frame < 5; frame++) {
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
  return read() === at
}

/** The layer's translate and scale, read back off its transform. */
function viewOf(container: HTMLElement) {
  const match = /translate\((.+)px, (.+)px\) scale\((.+)\)/.exec(
    layerOf(container).style.transform,
  )
  if (!match) throw new Error('no layer transform')
  return { x: Number(match[1]), y: Number(match[2]), k: Number(match[3]) }
}

function wheel(container: HTMLElement, init: WheelEventInit) {
  const hit = container.querySelector('[data-hit-layer]')
  hit?.dispatchEvent(
    new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init }),
  )
}

/**
 * A pinch of `deltaY` in all, sent as the small ctrlKey wheels a trackpad
 * sends, which follow the zoom curve rather than stepping a notch each.
 */
function pinch(container: HTMLElement, deltaY: number, at: WheelEventInit) {
  const parts = Math.ceil(Math.abs(deltaY) / 25)
  for (let sent = 0; sent < parts; sent++) {
    wheel(container, { ...at, deltaY: deltaY / parts, ctrlKey: true })
  }
}

/** A press on the hit layer, one move, and a release, as a mouse sends them. */
function drag(
  container: HTMLElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  init: MouseEventInit = {},
) {
  const hit = container.querySelector('[data-hit-layer]')
  const event = (type: string, at: { x: number; y: number }) =>
    new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: at.x,
      clientY: at.y,
      ...init,
    })
  hit?.dispatchEvent(event('mousedown', from))
  window.dispatchEvent(event('mousemove', to))
  window.dispatchEvent(event('mouseup', to))
}

describe('Canvas', () => {
  afterEach(() => {
    modeStore.setState({ mode: 'edit', tool: 'move' })
    setCharacterKeys(true)
    liveStore.setState({ canWrite: false })
  })

  it('covers the frames with the hit layer in Edit', () => {
    const { container } = renderCanvas(
      page('studio/edit', [
        frame('a', { x: 0, y: 0, width: 200, height: 200 }),
      ]),
    )

    expect(container.querySelector('[data-hit-layer]')).not.toBeNull()
  })

  it('lifts the hit layer in Play, so a click reaches the frame', () => {
    modeStore.setState({ mode: 'play' })

    const { container } = renderCanvas(
      page('studio/play', [
        frame('a', { x: 0, y: 0, width: 200, height: 200 }),
      ]),
    )

    expect(container.querySelector('[data-hit-layer]')).toBeNull()
  })

  it('travels back to the fitted view when the controller fits', async () => {
    const { container } = renderCanvas(
      page('studio/refit', [
        frame('wide', { x: 0, y: 0, width: 1344, height: 400 }),
      ]),
    )
    wheel(container, { deltaX: 300, deltaY: 300 })

    canvasView.fit()

    await expect
      .poll(() => layerOf(container).style.transform)
      .toBe('translate(64px, 200px) scale(0.5)')
  })

  it('reports its zoom to the controller', () => {
    const { container } = renderCanvas(
      page('studio/report', [
        frame('a', { x: 0, y: 0, width: 200, height: 200 }),
      ]),
    )

    wheel(container, { deltaY: -100, ctrlKey: true })

    expect(canvasView.zoom()).toBeCloseTo(1.2)
  })

  describe('zooming on the wheel', () => {
    const square = (name: string) =>
      page(`studio/${name}`, [
        frame('a', { x: 0, y: 0, width: 200, height: 200 }),
      ])

    it.each([100, 300])('steps one notch for a mouse notch of %i', (deltaY) => {
      const { container } = renderCanvas(square(`notch-${deltaY}`))

      wheel(container, { deltaY: -deltaY, ctrlKey: true })

      expect(canvasView.zoom()).toBeCloseTo(1.2)
    })

    it('steps one notch out for a line-mode notch', () => {
      const { container } = renderCanvas(square('line'))

      wheel(container, {
        deltaY: 3,
        deltaMode: WheelEvent.DOM_DELTA_LINE,
        ctrlKey: true,
      })

      expect(canvasView.zoom()).toBeCloseTo(1 / 1.2)
    })

    it('follows the curve for a pinch of small deltas', () => {
      const { container } = renderCanvas(square('curve'))

      wheel(container, { deltaY: -3, ctrlKey: true })

      expect(canvasView.zoom()).toBeCloseTo(2 ** 0.03)
    })
  })

  describe('panning on the wheel', () => {
    afterEach(() => {
      vi.useRealTimers()
      vi.restoreAllMocks()
    })

    const square = (name: string) =>
      page(`studio/${name}`, [
        frame('a', { x: 0, y: 0, width: 200, height: 200 }),
      ])

    const reduceMotion = () => {
      const real = window.matchMedia.bind(window)
      vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
        query.includes('prefers-reduced-motion')
          ? ({ matches: true } as MediaQueryList)
          : real(query),
      )
    }

    // The glide's own clock, stepped by hand, so a case proving the view
    // stopped reads it past the glide's end rather than waiting it out.
    const fakeFrames = () =>
      vi.useFakeTimers({
        toFake: [
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'performance',
        ],
      })

    it('leaves the view in place on the event a notch arrives in', () => {
      const { container } = renderCanvas(square('ease-start'))

      wheel(container, { deltaY: 100 })

      expect(layerOf(container).style.transform).toBe(
        'translate(300px, 200px) scale(1)',
      )
    })

    it('eases a notch to its full distance', async () => {
      const { container } = renderCanvas(square('ease-full'))

      wheel(container, { deltaY: 100 })

      await expect.poll(() => viewOf(container).y).toBeCloseTo(100)
    })

    it('eases a line-mode notch 16 pixels a line', async () => {
      const { container } = renderCanvas(square('ease-line'))

      wheel(container, { deltaY: 3, deltaMode: WheelEvent.DOM_DELTA_LINE })

      await expect.poll(() => viewOf(container).y).toBeCloseTo(152)
    })

    it('eases a horizontal notch, as Shift with a wheel sends it', async () => {
      const { container } = renderCanvas(square('ease-across'))

      wheel(container, { deltaX: 100, shiftKey: true })

      await expect.poll(() => viewOf(container).x).toBeCloseTo(200)
    })

    it('pans a trackpad delta in the same event', () => {
      const { container } = renderCanvas(square('ease-trackpad'))

      wheel(container, { deltaX: 30, deltaY: 40 })

      expect(layerOf(container).style.transform).toBe(
        'translate(270px, 160px) scale(1)',
      )
    })

    it('adds a notch arriving mid-ease to the distance left', async () => {
      const { container } = renderCanvas(square('ease-sum'))
      wheel(container, { deltaY: 100 })
      await expect.poll(() => viewOf(container).y).toBeLessThan(200)

      wheel(container, { deltaY: 100 })

      await expect.poll(() => viewOf(container).y).toBeCloseTo(0)
    })

    it('lands a notch in one step under reduced motion', () => {
      reduceMotion()
      const { container } = renderCanvas(square('ease-reduced'))

      wheel(container, { deltaY: 100 })

      expect(layerOf(container).style.transform).toBe(
        'translate(300px, 100px) scale(1)',
      )
    })

    it('stops easing once a fit lands mid-ease', () => {
      const { container } = renderCanvas(square('ease-fit'))
      fakeFrames()
      wheel(container, { deltaY: 100 })
      vi.advanceTimersByTime(PAN_EASE_MS / 3)
      reduceMotion()

      canvasView.fit()
      const fitted = layerOf(container).style.transform
      vi.advanceTimersByTime(PAN_EASE_MS)

      expect(layerOf(container).style.transform).toBe(fitted)
    })

    it('stops easing once the canvas is pressed', () => {
      const { container } = renderCanvas(square('ease-press'))
      fakeFrames()
      wheel(container, { deltaY: 100 })
      vi.advanceTimersByTime(PAN_EASE_MS / 3)

      container
        .querySelector('[data-hit-layer]')
        ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      const pressed = viewOf(container)
      vi.advanceTimersByTime(PAN_EASE_MS)

      expect([pressed.y < 200, viewOf(container)]).toEqual([true, pressed])
    })
  })

  describe('panning with Space held', () => {
    afterEach(() => {
      window.dispatchEvent(
        new KeyboardEvent('keyup', { code: 'Space', key: ' ' }),
      )
    })

    const pressSpace = (target: EventTarget = document.body) =>
      target.dispatchEvent(
        new KeyboardEvent('keydown', {
          code: 'Space',
          key: ' ',
          bubbles: true,
          cancelable: true,
        }),
      )

    it('pans a primary drag under the Move tool', () => {
      const { container } = renderCanvas(
        page('studio/space', [
          frame('a', { x: 0, y: 0, width: 200, height: 200 }),
        ]),
      )
      const before = layerOf(container).style.transform

      pressSpace()
      drag(container, { x: 400, y: 300 }, { x: 450, y: 340 })

      expect([
        modeStore.getState().spacePan,
        layerOf(container).style.transform !== before,
      ]).toEqual([true, true])
    })

    it('leaves Space to a focused button', () => {
      renderCanvas(page('studio/space', []))
      const button = document.createElement('button')
      document.body.append(button)

      pressSpace(button)

      expect(modeStore.getState().spacePan).toBe(false)
      button.remove()
    })

    it('lets go of the pan when the window loses focus', () => {
      renderCanvas(page('studio/space', []))
      pressSpace()

      window.dispatchEvent(new Event('blur'))

      expect(modeStore.getState().spacePan).toBe(false)
    })
  })

  it('tells an empty page how to add its first frame', () => {
    const { getByRole } = renderCanvas(page('studio/empty', []))

    expect(getByRole('status')).toHaveTextContent('This page has no frames')
  })

  it("names the Frame tool's key on an empty page while it is live", () => {
    const { getByRole } = renderCanvas(page('studio/empty', []))

    expect(getByRole('status')).toHaveTextContent('Pick the Frame tool F and')
  })

  it("drops the Frame tool's key on an empty page while it is off", () => {
    setCharacterKeys(false)

    const { getByRole } = renderCanvas(page('studio/empty', []))

    expect(getByRole('status')).toHaveTextContent('Pick the Frame tool and')
  })

  describe('a page whose frames are all hidden', () => {
    const hiddenPage = () =>
      page('studio/home', [
        frame(
          'profile',
          { x: 0, y: 0, width: 390, height: 844 },
          { hidden: true },
        ),
        frame(
          'billing',
          { x: 400, y: 0, width: 390, height: 844 },
          { hidden: true },
        ),
      ])

    it('counts the hidden frames and shows them on a press', async () => {
      liveStore.setState({ canWrite: true })
      const sent: unknown[] = []
      const calls = createStructure(async (_path, init) => {
        sent.push(JSON.parse(String(init?.body)))
        return Response.json({ ok: true, data: [] })
      })
      const { getByRole } = renderCanvas(hiddenPage(), () => {}, calls)

      expect(getByRole('status')).toHaveTextContent(
        'Every frame on this page is hidden',
      )
      await userEvent.click(getByRole('button', { name: 'Show 2 frames' }))

      expect(sent).toEqual([
        {
          refs: ['studio/home/profile', 'studio/home/billing'],
          flag: 'hidden',
          on: false,
        },
      ])
    })

    it('offers no Show button to a tab that cannot write', () => {
      const { getByRole, queryByRole } = renderCanvas(hiddenPage())

      expect(getByRole('status')).toHaveTextContent(
        '2 hidden frames stay listed under Layers.',
      )
      expect(queryByRole('button', { name: 'Show 2 frames' })).toBeNull()
    })

    it('agrees the verb with one hidden frame', () => {
      const { getByRole } = renderCanvas(
        page('studio/home', [
          frame(
            'profile',
            { x: 0, y: 0, width: 390, height: 844 },
            { hidden: true },
          ),
        ]),
      )

      expect(getByRole('status')).toHaveTextContent(
        '1 hidden frame stays listed under Layers.',
      )
    })
  })

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

  it('pans the layer on a wheel without a React commit', async () => {
    let commits = 0
    const { container } = renderCanvas(
      page('studio/pan', [frame('a', { x: 0, y: 0, width: 200, height: 200 })]),
      () => (commits += 1),
    )
    // The first mount commits for a few frames after it renders.
    await expect.poll(() => holdsAcrossFrames(() => commits)).toBe(true)
    const before = commits

    wheel(container, { deltaX: 30, deltaY: 50 })

    // Read mid-glide, ahead of the settle that commits once the view rests.
    await expect.poll(() => viewOf(container).y).toBeLessThan(200)
    expect([viewOf(container).x, commits]).toEqual([270, before])
  })

  it('pans the layer on a primary drag under the Hand tool', () => {
    modeStore.setState({ tool: 'hand' })
    const { container } = renderCanvas(
      page('studio/hand', [
        frame('a', { x: 0, y: 0, width: 200, height: 200 }),
      ]),
    )

    drag(container, { x: 400, y: 300 }, { x: 430, y: 350 })

    expect(layerOf(container).style.transform).toBe(
      'translate(330px, 250px) scale(1)',
    )
  })

  it('pans the layer on a middle-button drag under the Move tool', () => {
    const { container } = renderCanvas(
      page('studio/middle', [
        frame('a', { x: 0, y: 0, width: 200, height: 200 }),
      ]),
    )

    drag(container, { x: 400, y: 300 }, { x: 430, y: 350 }, { button: 1 })

    expect(layerOf(container).style.transform).toBe(
      'translate(330px, 250px) scale(1)',
    )
  })

  it('leaves the view in place on a primary drag over empty canvas in Move', () => {
    const { container } = renderCanvas(
      page('studio/marquee', [
        frame('a', { x: 0, y: 0, width: 200, height: 200 }),
      ]),
    )

    drag(container, { x: 780, y: 580 }, { x: 700, y: 500 })

    expect(layerOf(container).style.transform).toBe(
      'translate(300px, 200px) scale(1)',
    )
  })

  it('zooms the layer on a wheel with ctrlKey, as a pinch sends it', () => {
    const { container } = renderCanvas(
      page('studio/pinch', [
        frame('a', { x: 0, y: 0, width: 200, height: 200 }),
      ]),
    )

    wheel(container, { deltaY: -100, ctrlKey: true })

    expect(layerOf(container).style.transform).toMatch(/scale\(1\.2\)$/)
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
    // The two frames fit only far zoomed out, so pinch in on the near one.
    const near = container
      .querySelector('[data-frame="studio/home/near"]')
      ?.getBoundingClientRect()
    pinch(container, -1000, {
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
    wheel(first.container, { deltaX: 40, deltaY: 0 })
    const moved = layerOf(first.container).style.transform
    first.unmount()

    const second = renderCanvas(content)

    return expect
      .poll(() => layerOf(second.container).style.transform)
      .toBe(moved)
  })

  it('centers a box at the current zoom when the controller centers on it', async () => {
    const { container } = renderCanvas(
      page('studio/center', [
        frame('a', { x: 0, y: 0, width: 200, height: 200 }),
      ]),
    )
    canvasView.zoomTo(0.5)

    canvasView.centerOn({ x: 5000, y: 0, width: 200, height: 200 })

    // 400 less 5100 at half scale across, 300 less 100 at half scale down.
    await expect
      .poll(() => layerOf(container).style.transform)
      .toBe('translate(-2150px, 250px) scale(0.5)')
  })

  it('fits a box larger than the viewport rather than centering it', async () => {
    const { container } = renderCanvas(
      page('studio/center-big', [
        frame('a', { x: 0, y: 0, width: 200, height: 200 }),
      ]),
    )

    canvasView.centerOn({ x: 0, y: 0, width: 1344, height: 400 })

    await expect
      .poll(() => layerOf(container).style.transform)
      .toBe('translate(64px, 200px) scale(0.5)')
  })
})

describe('Canvas on a previewed frame', () => {
  const WIDE = frame('wide', { x: 0, y: 0, width: 400, height: 300 })

  afterEach(() => {
    act(() => {
      endPreview([WIDE.ref])
      closeNote()
      modeStore.setState({ mode: 'edit', tool: 'move' })
    })
  })

  it('pins a note through the width the frame is previewed at', async () => {
    const { container } = renderCanvas(page('studio/home', [WIDE]))
    act(() => setPreview([WIDE.ref], 1200))
    act(() => modeStore.setState({ tool: 'note' }))
    const drawn = container
      .querySelector(`[data-frame="${WIDE.ref}"]`)
      ?.getBoundingClientRect()
    if (!drawn) throw new Error('no drawn frame')
    const hit = container.querySelector<HTMLElement>('[data-hit-layer]')
    if (!hit) throw new Error('no hit layer')

    await userEvent.pointer({
      target: hit,
      keys: '[MouseLeft]',
      coords: {
        clientX: drawn.left + drawn.width * 0.9,
        clientY: drawn.top + drawn.height / 2,
      },
    })

    const open = notesUi.getState().open
    expect(open?.kind === 'new' ? open.pick.frame.ref : null).toBe(WIDE.ref)
  })
})

describe('onHandMove', () => {
  const stops: (() => void)[] = []
  afterEach(() => {
    for (const stop of stops.splice(0)) stop()
  })

  function countHandMoves() {
    const moves = { count: 0 }
    stops.push(canvasView.onHandMove(() => (moves.count += 1)))
    return moves
  }

  it('hears nothing of a travel the controller makes', async () => {
    const { container } = renderCanvas(
      page('studio/quiet', [
        frame('a', { x: 0, y: 0, width: 200, height: 200 }),
      ]),
    )
    const moves = countHandMoves()

    canvasView.centerOn({ x: 5000, y: 0, width: 200, height: 200 })

    await expect
      .poll(() => layerOf(container).style.transform)
      .toBe('translate(-4700px, 200px) scale(1)')
    expect(moves.count).toBe(0)
  })

  it('hears nothing of a travel to a focused frame', async () => {
    const moves = countHandMoves()

    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <Canvas
          page={page('studio/quiet-focus', [
            frame('a', { x: 0, y: 0, width: 200, height: 200 }),
            frame('b', { x: 5000, y: 0, width: 200, height: 200 }),
          ])}
          reloads={{}}
          focus="studio/home/b"
        />
      </div>,
    )

    await expect
      .poll(() => layerOf(container).style.transform)
      .toBe('translate(-4700px, 200px) scale(1)')
    expect(moves.count).toBe(0)
  })

  it('hears a wheel pan', async () => {
    const { container } = renderCanvas(
      page('studio/hand-wheel', [
        frame('a', { x: 0, y: 0, width: 200, height: 200 }),
      ]),
    )
    const moves = countHandMoves()

    wheel(container, { deltaX: 0, deltaY: 50 })

    await expect.poll(() => moves.count).toBeGreaterThan(0)
  })

  it('hears a pan from the arrow keys', () => {
    renderCanvas(
      page('studio/hand-keys', [
        frame('a', { x: 0, y: 0, width: 200, height: 200 }),
      ]),
    )
    const moves = countHandMoves()

    canvasView.panBy(40, 0)

    expect(moves.count).toBeGreaterThan(0)
  })

  it('hears a press on the canvas', () => {
    const { container } = renderCanvas(
      page('studio/hand-press', [
        frame('a', { x: 0, y: 0, width: 200, height: 200 }),
      ]),
    )
    const moves = countHandMoves()

    container
      .querySelector('[data-hit-layer]')
      ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))

    expect(moves.count).toBe(1)
  })
})
