import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { liveStore } from '@/client/live/store'
import type { Transition } from '@/shared/present-transition'
import type { FrameRecord } from '@/shared/records/list'
import { boardOf, frameOf, pageOf } from '@/test/board'
import { emulateReducedMotion } from '@/test/motion'

import { useBoardActions } from '../board-actions'
import { selectionStore } from '../selection'
import { fitScale } from './fit'
import { PresentOverlay } from './overlay'
import type { LoadTransitions } from './own-transitions'
import { presentStore, startPresenting, stepPresenting } from './store'

/** One row on the canvas, laid left to right in the order named, so reading order follows it. */
function framesOf(...names: string[]): FrameRecord[] {
  return names.map((name, at) =>
    frameOf(name, {
      box: { x: at * 500, y: 0, width: 390, height: 844 },
      hidden: name.startsWith('hidden'),
    }),
  )
}

/** `frames` with the one named `name` holding its own transition. */
function withTransition(
  frames: FrameRecord[],
  name: string,
  transition: Transition,
): FrameRecord[] {
  return frames.map((frame) =>
    frame.name === name ? { ...frame, transition } : frame,
  )
}

function Board({ loadTransitions }: { loadTransitions?: LoadTransitions }) {
  useBoardActions()
  return <PresentOverlay loadTransitions={loadTransitions} />
}

/** What the project holds of its own: the names its record lists, and the read that answers their keyframes. */
interface Own {
  names: string[]
  load: LoadTransitions
}

function present(
  frames: FrameRecord[],
  selected: string[] = [],
  transition?: Transition,
  own?: Own,
) {
  const page = { ...pageOf(frames), ...(transition ? { transition } : {}) }
  const board = boardOf(page)
  liveStore.setState({
    board: {
      ...board,
      projects: board.projects.map((project) => ({
        ...project,
        transitions: own?.names ?? [],
      })),
    },
  })
  selectionStore.setState({
    page: selected.length > 0 ? page.ref : null,
    frames: selected.map((name) => `studio/home/${name}`),
  })
  render(<Board loadTransitions={own?.load} />)
  act(() => startPresenting(page))
}

const shownFrame = () => screen.getByRole('dialog').querySelector('iframe')
const count = () =>
  screen.getByRole('toolbar', { name: 'Presenting' }).textContent

afterEach(() => {
  presentStore.setState({ page: null, frame: null, leaving: null })
  selectionStore.setState({ page: null, frames: [] })
  liveStore.setState({ board: null })
})

describe('the scale a frame presents at', () => {
  it('meets the sides with a wide frame', () => {
    expect(
      fitScale({ width: 1920, height: 1080 }, { width: 1280, height: 800 }),
    ).toBeCloseTo(1280 / 1920)
  })

  it('meets the top and bottom with a tall frame', () => {
    expect(
      fitScale({ width: 390, height: 844 }, { width: 1280, height: 800 }),
    ).toBeCloseTo(800 / 844)
  })

  it('stops at twice the size for a frame under half the room', () => {
    expect(
      fitScale({ width: 390, height: 264 }, { width: 1280, height: 800 }),
    ).toBe(2)
  })
})

describe('presenting a page', () => {
  it('opens on the first frame in reading order with nothing selected', () => {
    present(framesOf('first', 'second', 'third'))

    expect(shownFrame()?.title).toBe('first')
    expect(count()).toContain('1 / 3')
  })

  it('draws the frame scaled to fit the window', () => {
    present([
      frameOf('wide', { box: { x: 0, y: 0, width: 2560, height: 800 } }),
    ])

    const box = shownFrame()?.parentElement?.getBoundingClientRect()

    expect(box?.width).toBeCloseTo(window.innerWidth)
    expect(box?.left).toBeCloseTo(0)
  })

  it('draws a small frame at twice its size, centered', () => {
    present([frameOf('card', { box: { x: 0, y: 0, width: 390, height: 264 } })])

    const box = shownFrame()?.parentElement?.getBoundingClientRect()

    expect(box?.width).toBeCloseTo(780)
    expect(box?.left).toBeCloseTo((window.innerWidth - 780) / 2)
  })

  it('fits a frame in a device with its body inside the window', () => {
    present([
      frameOf('phone', {
        box: { x: 0, y: 0, width: 390, height: 844 },
        device: 'phone',
      }),
    ])

    const body = document.querySelector('[data-bezel]')?.getBoundingClientRect()
    const scale = Math.min(
      window.innerWidth / (390 + 32),
      window.innerHeight / (844 + 32),
    )
    const top = (body?.top ?? 0) - 16 * scale
    const bottom = (body?.bottom ?? 0) + 16 * scale

    expect(body?.height).toBeCloseTo(844 * scale)
    expect(top).toBeGreaterThanOrEqual(-0.5)
    expect(bottom).toBeLessThanOrEqual(window.innerHeight + 0.5)
  })

  it('steps by arrow in reading order, skipping hidden frames', async () => {
    present(framesOf('first', 'second', 'hidden', 'third'))

    await userEvent.keyboard('{ArrowRight}')
    expect(shownFrame()?.title).toBe('second')
    await userEvent.keyboard('{ArrowRight}')
    expect(shownFrame()?.title).toBe('third')
    await userEvent.keyboard('{ArrowLeft}')
    expect(shownFrame()?.title).toBe('second')
  })

  it('stays on the last frame on Next, the count reading n / n', async () => {
    present(framesOf('first', 'second'))

    await userEvent.keyboard('{ArrowRight}{ArrowRight}[Space]')

    expect(shownFrame()?.title).toBe('second')
    expect(count()).toContain('2 / 2')
  })

  it('starts from the selected frame', () => {
    present(framesOf('first', 'second', 'third'), ['second'])

    expect(shownFrame()?.title).toBe('second')
  })

  it('starts from a selected frame in the second row, Back reaching the first', async () => {
    present(
      [
        frameOf('below', { box: { x: 0, y: 1000, width: 390, height: 844 } }),
        frameOf('above', { box: { x: 0, y: 0, width: 390, height: 844 } }),
      ],
      ['below'],
    )
    expect(shownFrame()?.title).toBe('below')

    await userEvent.keyboard('{ArrowLeft}')

    expect(shownFrame()?.title).toBe('above')
  })

  it('starts from a selected hidden frame at the next shown one', () => {
    present(framesOf('first', 'hidden', 'third'), ['hidden'])

    expect(shownFrame()?.title).toBe('third')
  })

  it('keeps the frame shown when an agent hides it mid-presentation', () => {
    const frames = framesOf('first', 'second')
    present(frames)

    act(() =>
      liveStore.setState({
        board: boardOf(
          pageOf(
            frames.map((frame) =>
              frame.name === 'first' ? { ...frame, hidden: true } : frame,
            ),
          ),
        ),
      }),
    )

    expect(shownFrame()?.title).toBe('first')
  })

  it('leaves on Esc with the presented frame selected', async () => {
    present(framesOf('first', 'second'))

    await userEvent.keyboard('{ArrowRight}{Escape}')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(selectionStore.getState().frames).toEqual(['studio/home/second'])
  })

  it('presses a focused bar button with Space rather than stepping', async () => {
    present(framesOf('first', 'second'))
    screen.getByRole('button', { name: 'Leave presenting' }).focus()

    await userEvent.keyboard('[Space]')

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(selectionStore.getState().frames).toEqual(['studio/home/first'])
  })

  it('makes the board behind it inert, so Tab stays in the overlay', () => {
    const behind = document.createElement('div')
    behind.innerHTML = '<button type="button">Home</button>'
    document.body.append(behind)
    present(framesOf('first'))

    expect(behind.inert).toBe(true)

    act(() => presentStore.setState({ page: null, frame: null, leaving: null }))

    expect(behind.inert).toBe(false)
    behind.remove()
  })

  it('leaves from the bar', async () => {
    present(framesOf('first'))

    await userEvent.click(
      screen.getByRole('button', { name: 'Leave presenting' }),
    )

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('a transition between slides', () => {
  const titled = (name: string) =>
    screen.getByRole('dialog').querySelector(`iframe[title="${name}"]`)
  /** The animation the layer holding a frame plays, which draws its side of the transition. */
  const animationOf = (name: string) => {
    const layer = titled(name)?.closest('[data-present-layer]')
    return layer ? getComputedStyle(layer).animationName : null
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('draws the page transition with the leaving slide under the arriving one', () => {
    present(framesOf('first', 'second'), [], { name: 'fade', ms: 400 })

    act(() => stepPresenting(1))

    expect(animationOf('second')).toBe('fb-present-fade-enter')
    expect(animationOf('first')).toBe('fb-present-fade-leave')
  })

  it('takes the leaving slide away once the transition ends', () => {
    present(framesOf('first', 'second'), [], { name: 'fade', ms: 400 })
    act(() => stepPresenting(1))

    act(() => vi.advanceTimersByTime(400))

    expect(titled('first')).toBeNull()
    expect(titled('second')).not.toBeNull()
  })

  it('lets a frame override win over its page', () => {
    present(
      withTransition(framesOf('first', 'second'), 'second', {
        name: 'push',
        direction: 'up',
      }),
      [],
      { name: 'fade' },
    )

    act(() => stepPresenting(1))

    expect(animationOf('second')).toBe('fb-present-push-enter')
  })

  it('plays the leaving slide its own transition back on a step back', () => {
    present(
      withTransition(framesOf('first', 'second'), 'second', { name: 'zoom' }),
      ['second'],
    )

    act(() => stepPresenting(-1))

    expect(animationOf('first')).toBe('fb-present-zoom-enter')
  })

  it('cuts with no page transition, drawing one slide', () => {
    present(framesOf('first', 'second'))

    act(() => stepPresenting(1))

    expect(titled('first')).toBeNull()
  })

  it('turns the arriving slide into the leaving one on a press mid-transition', () => {
    present(framesOf('first', 'second', 'third'), [], { name: 'fade' })
    act(() => stepPresenting(1))

    act(() => stepPresenting(1))

    expect(titled('first')).toBeNull()
    expect(animationOf('second')).toBe('fb-present-fade-leave')
    expect(animationOf('third')).toBe('fb-present-fade-enter')
  })

  describe("of the project's own", () => {
    const WIPE = {
      name: 'wipe',
      css: '@keyframes fb-own-studio--wipe-enter { from { opacity: 0 } to { opacity: 1 } }\n@keyframes fb-own-studio--wipe-leave { to { opacity: 0 } }',
    }
    const arrived: Own = {
      names: ['wipe'],
      load: async () => ({ transitions: [WIPE] }),
    }
    /** Lets the read the overlay started answer. */
    const settle = () => act(async () => {})
    const playing = (name: string) =>
      titled(name)?.closest('[data-present-layer]')?.getAnimations().length

    it('plays its renamed keyframes on both layers', async () => {
      present(framesOf('first', 'second'), [], { name: 'wipe' }, arrived)
      await settle()

      act(() => stepPresenting(1))

      expect(animationOf('second')).toBe('fb-own-studio--wipe-enter')
      expect(animationOf('first')).toBe('fb-own-studio--wipe-leave')
      expect(playing('second')).toBe(1)
      expect(playing('first')).toBe(1)
    })

    it('holds the leaving slide still for one with no leave keyframes', async () => {
      present(
        framesOf('first', 'second'),
        [],
        { name: 'wipe' },
        {
          names: ['wipe'],
          load: async () => ({
            transitions: [
              {
                name: 'wipe',
                css: '@keyframes fb-own-studio--wipe-enter { from { opacity: 0 } }',
              },
            ],
          }),
        },
      )
      await settle()

      act(() => stepPresenting(1))

      expect(playing('second')).toBe(1)
      expect(playing('first')).toBe(0)
    })

    it('takes the leaving slide away once it ends', async () => {
      present(
        framesOf('first', 'second'),
        [],
        { name: 'wipe', ms: 400 },
        arrived,
      )
      await settle()
      act(() => stepPresenting(1))

      act(() => vi.advanceTimersByTime(400))

      expect(titled('first')).toBeNull()
    })

    it('cuts on a step taken before its keyframes arrive', () => {
      present(
        framesOf('first', 'second'),
        [],
        { name: 'wipe' },
        {
          names: ['wipe'],
          load: () => new Promise(() => {}),
        },
      )

      act(() => stepPresenting(1))

      expect(titled('first')).toBeNull()
      expect(animationOf('second')).toBe('none')
    })

    it('cuts when the read is refused', async () => {
      present(
        framesOf('first', 'second'),
        [],
        { name: 'wipe' },
        {
          names: ['wipe'],
          load: async () => null,
        },
      )
      await settle()

      act(() => stepPresenting(1))

      expect(titled('first')).toBeNull()
    })

    it('cuts under reduced motion', async () => {
      await emulateReducedMotion(true)
      present(framesOf('first', 'second'), [], { name: 'wipe' }, arrived)
      await settle()

      act(() => stepPresenting(1))

      expect(titled('first')).toBeNull()
      expect(animationOf('second')).toBe('none')
      await emulateReducedMotion(false)
    })
  })

  describe('under reduced motion', () => {
    beforeEach(async () => {
      await emulateReducedMotion(true)
    })

    afterEach(async () => {
      await emulateReducedMotion(false)
    })

    it('cuts, drawing one slide', () => {
      present(framesOf('first', 'second'), [], { name: 'slide' })

      act(() => stepPresenting(1))

      expect(titled('first')).toBeNull()
      expect(animationOf('second')).toBe('none')
    })
  })
})

/** The loaded document of the presented frame named `name`, once it is the frame's own. */
async function documentOf(name: string): Promise<Document> {
  return vi.waitFor(() => {
    const doc = screen
      .getByRole('dialog')
      .querySelector<HTMLIFrameElement>(
        `iframe[title="${name}"]`,
      )?.contentDocument
    if (!doc || doc.URL === 'about:blank' || doc.readyState !== 'complete') {
      throw new Error(`${name} is still loading`)
    }
    return doc
  })
}

describe('a press back during a transition', () => {
  it('keeps the document of the slide it returns to', async () => {
    present(framesOf('first', 'second'), [], { name: 'fade' })
    const doc = await documentOf('first')
    doc.body.dataset.kept = 'yes'
    act(() => stepPresenting(1))

    act(() => stepPresenting(-1))

    const returned = screen
      .getByRole('dialog')
      .querySelector<HTMLIFrameElement>('iframe[title="first"]')
    expect(returned?.contentDocument?.body.dataset.kept).toBe('yes')
  })
})

describe('steps inside a slide', () => {
  const STEPPED =
    '<p id="a" data-step="1">One</p><p id="b" data-step="2">Two</p>'

  /** Writes `body` into a presented frame, as an agent's file would hold it. */
  async function fill(name: string, body: string): Promise<Document> {
    const doc = await documentOf(name)
    doc.body.innerHTML = body
    return doc
  }

  const dots = (name: string) => screen.findByRole('img', { name })
  const shows = (doc: Document, id: string) =>
    getComputedStyle(doc.getElementById(id) as Element).visibility

  it('reveals each step on a press before moving to the next frame', async () => {
    present(framesOf('first', 'second'))
    const doc = await fill('first', STEPPED)
    await dots('Step 0 of 2')
    expect(shows(doc, 'a')).toBe('hidden')

    await userEvent.keyboard('{ArrowRight}')
    await dots('Step 1 of 2')
    expect(shownFrame()?.title).toBe('first')
    await userEvent.keyboard('{ArrowRight}')
    await dots('Step 2 of 2')
    await userEvent.keyboard('{ArrowRight}')

    expect(shownFrame()?.title).toBe('second')
  })

  it('keeps a step entering while the slide changes something else', async () => {
    present(framesOf('first'))
    const doc = await fill(
      'first',
      '<p id="a" data-step="1" data-step-effect="fade">One</p>',
    )
    await dots('Step 0 of 1')
    await userEvent.keyboard('{ArrowRight}')
    await dots('Step 1 of 1')

    doc.body.append(doc.createElement('span'))
    await act(async () => {})

    expect(
      getComputedStyle(doc.getElementById('a') as Element).animationName,
    ).toBe('frameboard-step-fade')
  })

  it('hides the last revealed step on a press back', async () => {
    present(framesOf('first'))
    const doc = await fill('first', STEPPED)
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    await dots('Step 2 of 2')

    await userEvent.keyboard('{ArrowLeft}')

    await dots('Step 1 of 2')
    expect(shows(doc, 'b')).toBe('hidden')
    expect(shows(doc, 'a')).toBe('visible')
  })

  it('opens a stepped frame stepped back onto on its last step', async () => {
    present(framesOf('first', 'second'), ['second'])
    await documentOf('second')

    await userEvent.keyboard('{ArrowLeft}')
    const doc = await fill('first', STEPPED)

    await dots('Step 2 of 2')
    expect(shows(doc, 'b')).toBe('visible')
  })

  it('keeps Next live on the last frame while it holds a step', async () => {
    present(framesOf('only'))
    await fill('only', STEPPED)
    await dots('Step 0 of 2')

    expect(
      screen.getByRole('button', { name: 'Next frame' }),
    ).not.toHaveAttribute('aria-disabled')
  })

  it('draws no dots for a frame with no steps', async () => {
    present(framesOf('first'))
    await fill('first', '<p>Plain</p>')

    expect(screen.queryByRole('img', { name: /^Step / })).toBeNull()
  })
})

describe('focus on leave', () => {
  /** A button outside the overlay, standing for the toolbar or a palette row. */
  function buttonNamed(name: string): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('aria-label', name)
    document.body.append(button)
    return button
  }

  afterEach(() => {
    for (const button of document.body.querySelectorAll(':scope > button')) {
      button.remove()
    }
  })

  it('returns to the opener after Esc', async () => {
    const opener = buttonNamed('Present page')
    opener.focus()
    present(framesOf('first'))

    await userEvent.keyboard('{Escape}')

    expect(document.activeElement).toBe(opener)
  })

  it('returns to the opener after leaving from the bar', async () => {
    const opener = buttonNamed('Present page')
    opener.focus()
    present(framesOf('first'))

    await userEvent.click(
      screen.getByRole('button', { name: 'Leave presenting' }),
    )

    expect(document.activeElement).toBe(opener)
  })

  it('falls back to the Present page button once the opener is gone', async () => {
    const toolbar = buttonNamed('Present page')
    const row = buttonNamed('Present page row')
    row.focus()
    present(framesOf('first'))
    row.remove()

    await userEvent.keyboard('{Escape}')

    expect(document.activeElement).toBe(toolbar)
  })
})

describe('the bar', () => {
  const bar = () => screen.getByRole('toolbar', { name: 'Presenting' })
  const opacity = () => getComputedStyle(bar()).opacity

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('opens hidden, shows on a pointer move, and hides two seconds still', () => {
    present(framesOf('first'))
    const layer = screen.getByRole('dialog')
    expect(bar()).not.toHaveAttribute('data-shown')

    act(() => {
      layer.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
    })
    expect(bar()).toHaveAttribute('data-shown')

    act(() => vi.advanceTimersByTime(1999))
    expect(bar()).toHaveAttribute('data-shown')
    act(() => vi.advanceTimersByTime(1))
    expect(bar()).not.toHaveAttribute('data-shown')
  })

  it('keeps one width for a short name and a long one', () => {
    present(framesOf('a', 'a-frame-name-far-longer-than-the-slot-holds'))
    const short = bar().getBoundingClientRect().width

    act(() =>
      presentStore.setState({
        frame: 'studio/home/a-frame-name-far-longer-than-the-slot-holds',
      }),
    )

    expect(bar().getBoundingClientRect().width).toBe(short)
  })

  it('keeps the whole long name in the dialog label', () => {
    present(framesOf('a-frame-name-far-longer-than-the-slot-holds'))

    expect(screen.getByRole('dialog')).toHaveAccessibleName(
      'Presenting a-frame-name-far-longer-than-the-slot-holds, 1 of 1',
    )
  })

  it('leaves its count out of a text selection', () => {
    present(framesOf('first'))

    expect(getComputedStyle(screen.getByText('1 / 1')).userSelect).toBe('none')
  })

  it('fades its opacity', () => {
    present(framesOf('first'))

    expect(getComputedStyle(bar()).transitionProperty).toContain('opacity')
    expect(opacity()).toBe('0')
  })

  describe('under reduced motion', () => {
    beforeEach(async () => {
      await emulateReducedMotion(true)
    })

    afterEach(async () => {
      await emulateReducedMotion(false)
    })

    it('shows and hides with no fade', () => {
      present(framesOf('first'))

      expect(getComputedStyle(bar()).transitionDuration).toBe('0s')
    })
  })
})
