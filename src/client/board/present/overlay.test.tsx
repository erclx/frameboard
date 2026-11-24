import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { liveStore } from '@/client/live/store'
import type { Transition } from '@/shared/present-transition'
import type { FrameRecord } from '@/shared/records/list'
import { boardOf, frameOf, pageOf } from '@/test/board'
import { bridgeIn } from '@/test/frame-bridge'
import { emulateReducedMotion } from '@/test/motion'

import { useBoardActions } from '../board-actions'
import { selectionStore } from '../selection'
import { fitScale, presentScale } from './fit'
import { PresentOverlay } from './overlay'
import type { LoadTransitions } from './own-transitions'
import {
  presentStore,
  startPresenting,
  stepPresenting,
  toggleOverview,
} from './store'
import { type AudienceMessage, joinAudience, presentationIdOf } from './sync'

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
const barWidth = () =>
  screen.getByRole('toolbar', { name: 'Presenting' }).getBoundingClientRect()
    .width

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

  it('fits a phone by its shadow, two borders above and four below, around a centered body', () => {
    const phone = { box: { width: 390, height: 844 }, device: 'phone' as const }
    expect(presentScale(phone, { width: 1280, height: 800 })).toBeCloseTo(
      800 / 972,
    )
  })

  it('fits a laptop by its base aside and its shadow below', () => {
    const laptop = {
      box: { width: 1440, height: 900 },
      device: 'laptop' as const,
    }
    expect(presentScale(laptop, { width: 1660, height: 2000 })).toBeCloseTo(1)
    expect(presentScale(laptop, { width: 4000, height: 1038 })).toBeCloseTo(1)
  })

  it('fits a frame with no device by its box', () => {
    const bare = { box: { width: 390, height: 844 }, device: null }
    expect(presentScale(bare, { width: 1280, height: 800 })).toBeCloseTo(
      800 / 844,
    )
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

  it('fits a phone with its edge and drop shadow inside a short window', () => {
    present([
      frameOf('phone', {
        box: { x: 0, y: 0, width: 390, height: 844 },
        device: 'phone',
      }),
    ])

    const screen = document
      .querySelector('[data-bezel]')
      ?.getBoundingClientRect()
    const scale = (screen?.height ?? 0) / 844
    // The shadow reaches two borders above the screen and four below.
    const top = (screen?.top ?? 0) - 32 * scale
    const bottom = (screen?.bottom ?? 0) + 64 * scale

    expect(scale).toBeLessThan(window.innerHeight / (844 + 32))
    expect(top).toBeGreaterThanOrEqual(-0.5)
    expect(bottom).toBeLessThanOrEqual(window.innerHeight + 0.5)
  })

  it('centers a laptop by its body, which reaches further below than above', () => {
    present([
      frameOf('desktop', {
        box: { x: 0, y: 0, width: 1440, height: 900 },
        showDevice: true,
        device: 'laptop',
      }),
    ])

    const screen = document
      .querySelector('[data-bezel]')
      ?.getBoundingClientRect()
    const scale = (screen?.width ?? 0) / 1440
    const above = (screen?.top ?? 0) - 20 * scale
    const below = window.innerHeight - ((screen?.bottom ?? 0) + 42 * scale)

    expect(above).toBeCloseTo(below, 1)
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

  it('leaves once the board screen it draws on goes, as a removed page takes it', () => {
    const page = pageOf(framesOf('hero'))
    liveStore.setState({ board: boardOf(page) })
    const { unmount } = render(<Board />)
    act(() => startPresenting(page))

    unmount()

    expect(presentStore.getState().page).toBeNull()
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

describe('the presenter window', () => {
  /** A window as `window.open` answers, closed by its own `close` or by hand. */
  function fakeWindow(): Window & { closed: boolean } {
    const opened = { closed: false, focus: vi.fn() }
    return Object.assign(opened, {
      close: () => {
        opened.closed = true
      },
    }) as unknown as Window & { closed: boolean }
  }

  /** Puts the document in or out of full screen as the browser reports it. */
  function setFullscreen(on: boolean) {
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => (on ? document.documentElement : null),
    })
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })
  }

  const press = (name: string) =>
    userEvent.click(screen.getByRole('button', { name }))

  afterEach(() => {
    Reflect.deleteProperty(document, 'fullscreenElement')
    vi.restoreAllMocks()
  })

  it('opens from the bar at the address under the presented page', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(fakeWindow())
    present(framesOf('first'))

    await press('Presenter view')

    expect(open).toHaveBeenCalledTimes(1)
    expect(open.mock.calls[0]?.[0]).toMatch(
      /^\/p\/studio\/home\/presenter\?id=[a-z0-9-]+$/,
    )
  })

  it('keeps presenting when full screen ends while it is open', async () => {
    vi.spyOn(window, 'open').mockReturnValue(fakeWindow())
    present(framesOf('first'))
    setFullscreen(true)

    await press('Presenter view')
    setFullscreen(false)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('lets leaving full screen end presenting once it is closed by hand', async () => {
    const opened = fakeWindow()
    vi.spyOn(window, 'open').mockReturnValue(opened)
    present(framesOf('first'))
    await press('Presenter view')
    setFullscreen(true)

    opened.closed = true
    setFullscreen(false)

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('says the browser blocked it and presents on', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    present(framesOf('first'))

    await press('Presenter view')

    expect(screen.getByRole('status')).toHaveTextContent(
      'The browser blocked the presenter view',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('brings an open one forward rather than opening a second', async () => {
    const opened = fakeWindow()
    const open = vi.spyOn(window, 'open').mockReturnValue(opened)
    present(framesOf('first'))

    await press('Presenter view')
    await press('Presenter view')

    expect(open).toHaveBeenCalledTimes(1)
    expect(opened.focus).toHaveBeenCalledTimes(1)
  })

  it('closes with presenting', async () => {
    const opened = fakeWindow()
    vi.spyOn(window, 'open').mockReturnValue(opened)
    present(framesOf('first'))
    await press('Presenter view')

    await press('Leave presenting')

    expect(opened.closed).toBe(true)
  })

  it('takes the window full screen from the bar and on F', async () => {
    const request = vi
      .spyOn(document.documentElement, 'requestFullscreen')
      .mockResolvedValue(undefined)
    present(framesOf('first'))
    request.mockClear()

    await press('Full screen')
    await userEvent.keyboard('f')

    expect(request).toHaveBeenCalledTimes(2)
  })

  /** Opens the presenter view from the bar and joins its channel as the presenter window would. */
  async function joined() {
    const open = vi.spyOn(window, 'open').mockReturnValue(fakeWindow())
    await press('Presenter view')
    const url = String(open.mock.calls[0]?.[0])
    const id = presentationIdOf(url.slice(url.indexOf('?')))
    const received: AudienceMessage[] = []
    const link = joinAudience(id ?? '', (message) => received.push(message))
    return { received, link }
  }

  const lastFrame = (received: AudienceMessage[]) => {
    const last = received.at(-1)
    return last?.type === 'state' ? last.frame : last?.type
  }

  it('tells it each slide the audience moves to', async () => {
    present(framesOf('first', 'second'))
    const { received, link } = await joined()
    await expect.poll(() => lastFrame(received)).toBe('studio/home/first')

    await userEvent.keyboard('{ArrowRight}')

    await expect.poll(() => lastFrame(received)).toBe('studio/home/second')
    link.close()
  })

  it('steps the audience on its command', async () => {
    present(framesOf('first', 'second'))
    const { link } = await joined()

    link.step(1)

    await expect.poll(() => shownFrame()?.getAttribute('title')).toBe('second')
    link.close()
  })

  it('shows Full screen pressed while the window is full screen', () => {
    present(framesOf('first'))

    setFullscreen(true)

    expect(screen.getByRole('button', { name: 'Full screen' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
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

/** The pages a test already bridged, since the test server routes no frame. */
const bridged = new WeakSet<Document>()

/**
 * The loaded document of the presented frame named `name`, once it is the
 * frame's own, with the bridge the frame route would inject.
 */
async function documentOf(name: string): Promise<Document> {
  const { iframe, doc } = await vi.waitFor(() => {
    const iframe = screen
      .getByRole('dialog')
      .querySelector<HTMLIFrameElement>(`iframe[title="${name}"]`)
    const doc = iframe?.contentDocument
    if (
      !iframe ||
      !doc ||
      doc.URL === 'about:blank' ||
      doc.readyState !== 'complete'
    ) {
      throw new Error(`${name} is still loading`)
    }
    return { iframe, doc }
  })
  if (!bridged.has(doc)) {
    bridged.add(doc)
    await bridgeIn(iframe)
  }
  return doc
}

describe('a key pressed inside a slide', () => {
  /** Presses `key` at `target` in the slide's own window, answering whether the page's handler was prevented. */
  function pressIn(doc: Document, key: string, target: Element = doc.body) {
    const view = doc.defaultView as (Window & typeof globalThis) | null
    if (!view) throw new Error('The slide holds no window')
    const event = new view.KeyboardEvent('keydown', {
      key,
      code: key,
      bubbles: true,
      cancelable: true,
    })
    target.dispatchEvent(event)
    return event.defaultPrevented
  }

  it('steps the presentation on an arrow', async () => {
    present(framesOf('first', 'second'))
    const doc = await documentOf('first')

    const prevented = pressIn(doc, 'ArrowRight')

    expect(prevented).toBe(true)
    await expect.poll(() => shownFrame()?.title).toBe('second')
  })

  it('leaves an arrow to the page while the overview holds the keys', async () => {
    present(framesOf('first', 'second'))
    const doc = await documentOf('first')

    act(() => toggleOverview())

    await expect.poll(() => pressIn(doc, 'ArrowRight')).toBe(false)
    expect(shownFrame()?.title).toBe('first')
  })

  it('leaves a Space on a button in the slide to the page', async () => {
    present(framesOf('first', 'second'))
    const doc = await documentOf('first')
    doc.body.innerHTML = '<button>Go</button>'

    const prevented = pressIn(
      doc,
      'Space',
      doc.querySelector('button') as Element,
    )

    expect(prevented).toBe(false)
    expect(shownFrame()?.title).toBe('first')
  })
})

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

  it('keeps the bar one width from a slide with no steps to one with steps', async () => {
    present(framesOf('plain', 'stepped'))
    await fill('plain', '<p>Plain</p>')
    const before = barWidth()

    await userEvent.keyboard('{ArrowRight}')
    await fill('stepped', STEPPED)
    await dots('Step 0 of 2')

    expect(barWidth()).toBe(before)
  })

  it('keeps the bar one width on a slide with more steps than it draws dots for', async () => {
    present(framesOf('few', 'many'))
    await fill('few', STEPPED)
    await dots('Step 0 of 2')
    const before = barWidth()

    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    await fill(
      'many',
      Array.from(
        { length: 9 },
        (_, at) => `<p data-step="${at + 1}">${at + 1}</p>`,
      ).join(''),
    )

    expect((await dots('Step 0 of 9')).textContent).toBe('0/9')
    expect(barWidth()).toBe(before)
  })
})

describe('the count in the bar', () => {
  it('keeps the bar one width passing from frame 9 to frame 10', async () => {
    const names = Array.from({ length: 10 }, (_, at) => `frame-${at + 1}`)
    present(framesOf(...names), ['frame-9'])
    await screen.findByText('9 / 10')
    const before = barWidth()

    await userEvent.keyboard('{ArrowRight}')
    await screen.findByText('10 / 10')

    expect(barWidth()).toBe(before)
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

describe('a presented frame still loading', () => {
  const block = () =>
    screen.getByRole('dialog').querySelector('[data-loading-block]')

  function loaded(iframe: HTMLIFrameElement | null): Promise<void> {
    return new Promise((resolve) =>
      iframe?.addEventListener('load', () => resolve(), { once: true }),
    )
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('draws the block over a page still loading after a second', () => {
    present(framesOf('a'))

    act(() => vi.advanceTimersByTime(1000))

    expect(block()).not.toBeNull()
  })

  it('drops the block once the page loads', async () => {
    present(framesOf('a'))
    const load = loaded(shownFrame())
    act(() => vi.advanceTimersByTime(1000))

    await act(() => load)

    expect(block()).toBeNull()
  })

  it('shows a loaded page whose bridge never answers once the reply wait passes', async () => {
    present(framesOf('a'))
    const load = loaded(shownFrame())
    await act(() => load)
    const before = shownFrame()?.classList.contains('invisible')

    act(() => vi.advanceTimersByTime(5000))

    expect([before, shownFrame()?.classList.contains('invisible')]).toEqual([
      true,
      false,
    ])
  })

  it('draws the block under the device bezel', () => {
    present([
      frameOf('a', {
        box: { x: 0, y: 0, width: 390, height: 844 },
        device: 'phone',
      }),
    ])

    act(() => vi.advanceTimersByTime(1000))

    const bezel = screen.getByRole('dialog').querySelector('[data-bezel]')
    expect(bezel && block()?.compareDocumentPosition(bezel)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('rounds the block to a phone screen, so no grey shows past the bezel', () => {
    present([
      frameOf('a', {
        box: { x: 0, y: 0, width: 390, height: 844 },
        device: 'phone',
      }),
    ])

    act(() => vi.advanceTimersByTime(1000))

    const shown = block()
    expect(shown && getComputedStyle(shown).borderTopRightRadius).toBe('62px')
  })
})

describe('a presented frame in a device', () => {
  it('rounds a phone page to the bezel screen, so no white shows past it', () => {
    present([
      frameOf('a', {
        box: { x: 0, y: 0, width: 390, height: 844 },
        device: 'phone',
      }),
    ])

    const shown = shownFrame()

    expect(shown && getComputedStyle(shown).borderBottomLeftRadius).toBe('62px')
  })

  it('presents a foldable in the pose it holds, with no pose buttons', () => {
    present([
      frameOf('a', {
        box: { x: 0, y: 0, width: 890, height: 626 },
        device: 'foldable',
        pose: 'half',
      }),
    ])

    expect(
      document.querySelector('[data-bezel="foldable"] [data-bezel-fold]'),
    ).toHaveAttribute('data-bezel-fold', 'half')
    expect(document.querySelector('[data-poses]')).toBeNull()
  })

  it('leaves a page with no device square', () => {
    present(framesOf('a'))

    const shown = shownFrame()

    expect(shown && getComputedStyle(shown).borderTopLeftRadius).toBe('0px')
  })
})
