import '../styles.css'

import { act, render } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { bindKeys, registerActions } from '@/client/actions/registry'
import { liveStore } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import { chooseTheme, flipFrame, themeStore } from '@/client/theme/store'
import type { Finding } from '@/shared/records/check'
import type { FrameRecord } from '@/shared/records/list'
import { ringFocused } from '@/test/focus-ring'
import { ask, bridgeIn } from '@/test/frame-bridge'

import { openFindings } from './findings/open'
import { Frame, LabelRename } from './frame'
import { stampRenderedHash } from './frame-dom'
import { modeStore } from './mode'
import {
  holdMotion,
  motionHoldOf,
  playMotion,
  releaseMotion,
} from './motion/store'
import { enteredStore, enterFrame, leaveFrame } from './play/entered'
import { endPreview, setPreview } from './preview/store'
import { clear, select, selectElement, selectionStore } from './selection'
import { notesShownStore } from './speaker-notes/shown'
import {
  renamingFrame,
  startFrameRename,
  stopFrameRename,
} from './structure/actions'

function frame(name: string): FrameRecord {
  return {
    ref: `studio/home/${name}`,
    project: 'studio',
    page: 'home',
    name,
    path: `/board/studio/home/${name}.html`,
    box: { x: 0, y: 0, width: 390, height: 844 },
    order: 0,
    hidden: false,
    locked: false,
    hugWidth: false,
    hugHeight: false,
    scroll: false,
    widths: [],
    placed: true,
    modifiedAt: '2026-10-15T00:00:00.000Z',
  }
}

function finding(
  message: string,
  severity: Finding['severity'] = 'error',
): Finding {
  return {
    rule: 'theme',
    severity,
    frame: 'studio/home/a',
    path: 'studio/home/a.html',
    message,
    location: null,
  }
}

function Pair({ a, b }: { a: number; b: number }) {
  return (
    <>
      <Frame frame={frame('a')} live version={a} />
      <Frame frame={frame('b')} live version={b} />
    </>
  )
}

function iframeOf(container: HTMLElement, name: string): HTMLIFrameElement {
  const iframe = container.querySelector<HTMLIFrameElement>(
    `[data-frame="studio/home/${name}"] iframe`,
  )
  if (!iframe) throw new Error(`no iframe for ${name}`)
  return iframe
}

/** tinykeys reads a press only when it carries both a key and a code. */
function pressEscapeIn(iframe: HTMLIFrameElement): void {
  const inner = iframe.contentWindow as typeof window | null
  inner?.document.dispatchEvent(
    new inner.KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
    }),
  )
}

function loaded(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve) =>
    iframe.addEventListener('load', () => resolve(), { once: true }),
  )
}

/** Waits for a just rendered frame's page and starts the bridge in it, as the frame route would. */
async function bridged(
  iframe: HTMLIFrameElement,
  hash?: string,
): Promise<void> {
  await loaded(iframe)
  await bridgeIn(iframe, { hash })
}

describe('Frame in Play', () => {
  const cleanups: (() => void)[] = []

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.()
    act(() => modeStore.setState({ mode: 'edit' }))
  })

  it('hands Esc pressed inside the frame to the board, once per press after a reload', async () => {
    let exits = 0
    cleanups.push(
      registerActions([
        {
          id: 'mode.exitPlay',
          label: 'Exit Play',
          group: 'mode',
          palette: false,
          keys: ['Escape'],
          run: () => (exits += 1),
        },
      ]),
    )
    act(() => modeStore.setState({ mode: 'play' }))
    const { container, rerender } = render(
      <Frame frame={frame('a')} live version={0} />,
    )
    await bridged(iframeOf(container, 'a'))
    const reloaded = loaded(iframeOf(container, 'a'))
    rerender(<Frame frame={frame('a')} live version={1} />)
    await reloaded
    await bridgeIn(iframeOf(container, 'a'))

    pressEscapeIn(iframeOf(container, 'a'))
    await expect.poll(() => exits).toBe(1)
    pressEscapeIn(iframeOf(container, 'a'))

    await expect.poll(() => exits).toBe(2)
  })

  it('leaves an entered frame on Esc pressed in a field inside it', async () => {
    cleanups.push(
      registerActions([
        {
          id: 'play.leaveFrame',
          label: 'Leave frame',
          group: 'mode',
          palette: false,
          keys: ['Escape'],
          run: leaveFrame,
        },
      ]),
    )
    act(() => modeStore.setState({ mode: 'play' }))
    act(() => enterFrame('studio/home/a'))
    cleanups.push(() => act(() => leaveFrame()))
    const { container } = render(<Frame frame={frame('a')} live version={0} />)
    const iframe = iframeOf(container, 'a')
    await bridged(iframe)
    const inner = iframe.contentWindow as typeof window
    const slider = inner.document.createElement('input')
    slider.type = 'range'
    inner.document.body.append(slider)
    slider.focus()

    slider.dispatchEvent(
      new inner.KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
      }),
    )

    await expect.poll(() => enteredStore.getState().ref).toBeNull()
  })

  it('stands the entered tag below a laptop base rather than on its chin', () => {
    act(() => modeStore.setState({ mode: 'play' }))
    act(() => enterFrame('studio/home/a'))
    cleanups.push(() => act(() => leaveFrame()))
    const laptop: FrameRecord = {
      ...frame('a'),
      box: { x: 0, y: 0, width: 1440, height: 900 },
      device: 'laptop',
    }
    const { container, getByText } = render(
      <Frame frame={laptop} live version={0} />,
    )

    const box = container.querySelector('[data-frame]')?.getBoundingClientRect()
    const tag = getByText('In frame, Esc to leave').getBoundingClientRect()

    expect(tag.top).toBeGreaterThanOrEqual((box?.bottom ?? 0) + 42)
  })
})

describe('Frame', () => {
  describe('holding scroll', () => {
    function rootScrollbar(iframe: HTMLIFrameElement): string | undefined {
      const document = iframe.contentDocument
      if (!document) return undefined
      return getComputedStyle(document.documentElement).scrollbarWidth
    }

    it('hides its own scrollbar once its page loads', async () => {
      const { container } = render(
        <Frame frame={{ ...frame('a'), scroll: true }} live version={0} />,
      )

      await bridged(iframeOf(container, 'a'))

      await expect
        .poll(() => rootScrollbar(iframeOf(container, 'a')))
        .toBe('none')
    })

    it('keeps the scrollbar on a frame without the key', async () => {
      const { container } = render(
        <Frame frame={frame('a')} live version={0} />,
      )

      await bridged(iframeOf(container, 'a'))

      expect(rootScrollbar(iframeOf(container, 'a'))).toBe('auto')
    })

    it('shows it again when the key clears', async () => {
      const { container, rerender } = render(
        <Frame frame={{ ...frame('a'), scroll: true }} live version={0} />,
      )
      await bridged(iframeOf(container, 'a'))
      await expect
        .poll(() => rootScrollbar(iframeOf(container, 'a')))
        .toBe('none')

      rerender(<Frame frame={frame('a')} live version={0} />)

      await expect
        .poll(() => rootScrollbar(iframeOf(container, 'a')))
        .toBe('auto')
    })

    it('hides it again on the page a reload brings', async () => {
      const { container, rerender } = render(
        <Frame frame={{ ...frame('a'), scroll: true }} live version={0} />,
      )
      await bridged(iframeOf(container, 'a'))
      const reloaded = loaded(iframeOf(container, 'a'))

      rerender(
        <Frame frame={{ ...frame('a'), scroll: true }} live version={1} />,
      )
      await reloaded
      await bridgeIn(iframeOf(container, 'a'))

      await expect
        .poll(() => rootScrollbar(iframeOf(container, 'a')))
        .toBe('none')
    })
  })

  describe('in a device', () => {
    it('draws the bezel and stands its label above the body', () => {
      const { container } = render(
        <Frame frame={{ ...frame('a'), device: 'phone' }} live version={0} />,
      )

      const box = container
        .querySelector('[data-frame]')
        ?.getBoundingClientRect()
      const label = container.querySelector('[title="a"]')

      expect(container.querySelector('[data-bezel="phone"]')).not.toBeNull()
      expect(label?.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        (box?.top ?? 0) - 16,
      )
    })

    describe('Rotate under a phone', () => {
      const phone: FrameRecord = {
        ...frame('phone'),
        showDevice: true,
        device: 'phone',
      }
      const rotateOf = (container: HTMLElement) =>
        container.querySelector('[data-turns]')

      afterEach(() => {
        act(() => clear(selectionStore))
        act(() => liveStore.setState({ canWrite: false }))
      })

      it('offers Rotate to a writer once the phone is selected alone', () => {
        act(() => liveStore.setState({ canWrite: true }))
        const { container } = render(<Frame frame={phone} live version={0} />)

        act(() => select(selectionStore, 'studio/home', [phone.ref]))

        expect(rotateOf(container)).not.toBeNull()
      })

      it('offers no Rotate to a view-only tab, whose write the server refuses', () => {
        act(() => liveStore.setState({ canWrite: false }))
        const { container } = render(<Frame frame={phone} live version={0} />)

        act(() => select(selectionStore, 'studio/home', [phone.ref]))

        expect(rotateOf(container)).toBeNull()
      })
    })

    describe('a turned fixed phone', () => {
      const turned: FrameRecord = {
        ...frame('a'),
        box: { x: 0, y: 0, width: 844, height: 390 },
        showDevice: true,
        device: 'phone',
        turn: 'left',
      }

      const watching: (() => void)[] = []

      afterEach(() => {
        while (watching.length > 0) watching.pop()?.()
      })

      // Watches from before the rows land, so `settled` waits for the push a mounted rail would draw from.
      async function overflowing(phone: FrameRecord) {
        const rendered = render(<Frame frame={phone} live version={0} />)
        const iframe = iframeOf(rendered.container, 'a')
        await bridged(iframe)
        const watched = await ask(iframe, 'scroll', {})
        watching.push(watched.close)
        iframe.contentDocument?.body.insertAdjacentHTML(
          'beforeend',
          '<div style="height:2000px"></div>',
        )
        const settled = async () => {
          await expect
            .poll(() => watched.pushes.some((view) => view && view.size < 1))
            .toBe(true)
          await act(async () => {
            const { close } = await ask(iframe, 'live-body', {})
            close()
          })
        }
        return { ...rendered, iframe, settled }
      }

      it('draws the scroll rail while its page runs past the box', async () => {
        const { container } = await overflowing(turned)

        await expect
          .poll(() => container.querySelector('[data-rail-thumb]'))
          .not.toBeNull()
      })

      it("hides its page's own scrollbar, as a scroll frame does", async () => {
        const { iframe } = await overflowing(turned)

        await expect
          .poll(
            () =>
              iframe.contentDocument &&
              getComputedStyle(iframe.contentDocument.documentElement)
                .scrollbarWidth,
          )
          .toBe('none')
      })

      it('draws no rail once it hugs its page', async () => {
        const { container, settled } = await overflowing({
          ...turned,
          hugHeight: true,
        })
        await settled()

        expect(container.querySelector('[data-rail]')).toBeNull()
      })

      it('draws no rail upright, where an overflowing row is one a press drags back', async () => {
        const { turn: _turn, ...upright } = turned
        const { container, settled } = await overflowing({
          ...upright,
          box: { x: 0, y: 0, width: 390, height: 844 },
        })
        await settled()

        expect(container.querySelector('[data-rail]')).toBeNull()
      })
    })

    it('stands a scroll tablet’s rail past its volume buttons', async () => {
      const tablet: FrameRecord = {
        ...frame('a'),
        box: { x: 0, y: 0, width: 834, height: 400 },
        showDevice: true,
        device: 'tablet',
        scroll: true,
      }
      const { container } = render(<Frame frame={tablet} live version={0} />)
      const iframe = iframeOf(container, 'a')
      await bridged(iframe)
      iframe.contentDocument?.body.insertAdjacentHTML(
        'beforeend',
        '<div style="height:2000px"></div>',
      )

      await expect
        .poll(() => container.querySelector('[data-rail]'))
        .not.toBeNull()
      const rail = container.querySelector('[data-rail]')
      const volume = container.querySelector('[data-bezel-button="right"]')

      expect(rail?.getBoundingClientRect().left).toBeCloseTo(
        (volume?.getBoundingClientRect().right ?? 0) + 8,
      )
    })

    describe('a foldable', () => {
      const inbox: FrameRecord = {
        ...frame('inbox'),
        box: { x: 0, y: 0, width: 890, height: 626 },
        showDevice: true,
        device: 'foldable',
        pose: 'half',
      }
      const posesOf = (container: HTMLElement) =>
        container.querySelector('[data-poses]')

      afterEach(() => {
        act(() => clear(selectionStore))
        act(() => modeStore.setState({ mode: 'edit' }))
      })

      it('draws its body in the pose it holds', () => {
        const { container } = render(<Frame frame={inbox} live version={0} />)

        expect(
          container.querySelector('[data-bezel="foldable"] [data-bezel-fold]'),
        ).toHaveAttribute('data-bezel-fold', 'half')
      })

      it('shows the pose buttons under its body once selected alone', () => {
        const { container } = render(<Frame frame={inbox} live version={0} />)
        expect(posesOf(container)).toBeNull()

        act(() => select(selectionStore, 'studio/home', [inbox.ref]))

        const body = container
          .querySelector('[data-frame]')
          ?.getBoundingClientRect()
        expect(posesOf(container)?.getBoundingClientRect().top).toBeGreaterThan(
          (body?.bottom ?? 0) + 20,
        )
      })

      it('shows no buttons while another frame is selected with it', () => {
        const { container } = render(<Frame frame={inbox} live version={0} />)

        act(() =>
          select(selectionStore, 'studio/home', [inbox.ref, 'studio/home/a']),
        )

        expect(posesOf(container)).toBeNull()
      })

      it('shows no buttons in Play', () => {
        const { container } = render(<Frame frame={inbox} live version={0} />)
        act(() => select(selectionStore, 'studio/home', [inbox.ref]))

        act(() => modeStore.setState({ mode: 'play' }))

        expect(posesOf(container)).toBeNull()
      })

      it('shows no buttons with its device switched off', () => {
        const { showDevice: _shown, device: _device, ...plain } = inbox
        const { container } = render(<Frame frame={plain} live version={0} />)

        act(() => select(selectionStore, 'studio/home', [inbox.ref]))

        expect(posesOf(container)).toBeNull()
      })

      it('turns the buttons off on a locked frame, naming the lock', () => {
        const { container } = render(
          <Frame frame={{ ...inbox, locked: true }} live version={0} />,
        )

        act(() => select(selectionStore, 'studio/home', [inbox.ref]))

        expect(posesOf(container)?.querySelector('button')).toHaveAttribute(
          'title',
          'Unlock inbox to fold it',
        )
      })
    })

    it('draws no bezel with no device', () => {
      const { container } = render(
        <Frame frame={frame('a')} live version={0} />,
      )

      expect(container.querySelector('[data-bezel]')).toBeNull()
    })

    it('rounds a phone page at its foot to the bezel screen, square under the status bar', () => {
      const { container } = render(
        <Frame frame={{ ...frame('a'), device: 'phone' }} live version={0} />,
      )

      const style = getComputedStyle(iframeOf(container, 'a'))

      expect(style.borderTopLeftRadius).toBe('0px')
      expect(style.borderBottomRightRadius).toBe('62px')
    })

    it('starts a phone page 54 down its box, under the status bar', () => {
      const { container } = render(
        <Frame frame={{ ...frame('a'), device: 'phone' }} live version={0} />,
      )

      const box = container
        .querySelector('[data-frame]')
        ?.getBoundingClientRect()
      const page = iframeOf(container, 'a').getBoundingClientRect()

      expect(page.top).toBeCloseTo((box?.top ?? 0) + 54)
      expect(page.height).toBeCloseTo(844 - 54)
      expect(page.bottom).toBeCloseTo(box?.bottom ?? 0)
    })

    it.each(['tablet', 'laptop'] as const)(
      'gives a %s page its whole box',
      (device) => {
        const { container } = render(
          <Frame frame={{ ...frame('a'), device }} live version={0} />,
        )

        const box = container
          .querySelector('[data-frame]')
          ?.getBoundingClientRect()
        const page = iframeOf(container, 'a').getBoundingClientRect()

        expect(page.top).toBeCloseTo(box?.top ?? 0)
        expect(page.height).toBeCloseTo(844)
      },
    )

    it("paints the status bar in the page's fill and text color, again after a hand edit", async () => {
      const { container } = render(
        <Frame frame={{ ...frame('a'), device: 'phone' }} live version={0} />,
      )
      const iframe = iframeOf(container, 'a')
      await bridged(iframe)
      const body = iframe.contentDocument?.body
      if (!body) throw new Error('no frame body')

      body.style.background = 'rgb(12, 34, 56)'
      body.style.color = 'rgb(210, 220, 230)'
      await ask(iframe, 'restamp', { hash: 'd'.repeat(64) })

      const status = container.querySelector<HTMLElement>('[data-bezel-status]')
      await vi.waitFor(() => {
        expect(status && getComputedStyle(status).backgroundColor).toBe(
          'rgb(12, 34, 56)',
        )
      })
      expect(status && getComputedStyle(status).color).toBe(
        'rgb(210, 220, 230)',
      )
    })

    it('rounds a far phone frame placeholder to the bezel screen', () => {
      const { container } = render(
        <Frame
          frame={{ ...frame('far'), device: 'phone' }}
          live={false}
          version={0}
        />,
      )

      const placeholder = container.querySelector('[data-placeholder]')

      expect(
        placeholder && getComputedStyle(placeholder).borderTopRightRadius,
      ).toBe('62px')
    })

    it('rounds only a laptop page top corners, meeting its chin square', () => {
      const { container } = render(
        <Frame
          frame={{
            ...frame('a'),
            device: 'laptop',
            box: { ...frame('a').box, width: 1440, height: 900 },
          }}
          live
          version={0}
        />,
      )

      const style = getComputedStyle(iframeOf(container, 'a'))

      expect(style.borderTopLeftRadius).toBe('10px')
      expect(style.borderBottomLeftRadius).toBe('0px')
    })

    it('leaves a page with no device square', () => {
      const { container } = render(
        <Frame frame={frame('a')} live version={0} />,
      )

      expect(
        getComputedStyle(iframeOf(container, 'a')).borderTopLeftRadius,
      ).toBe('0px')
    })
  })

  it('loads its page from the frame port the socket handed over', () => {
    liveStore.setState({ framePort: 47123 })

    const { container } = render(<Frame frame={frame('a')} live version={0} />)

    expect(iframeOf(container, 'a').getAttribute('src')).toBe(
      `http://${location.hostname}:47123/frames/studio/home/a.html?theme=light&v=0`,
    )
  })

  it('loads no page and links no page alone before the frame port arrives', () => {
    liveStore.setState({ framePort: null })

    const { container } = render(<Frame frame={frame('a')} live version={0} />)

    expect(iframeOf(container, 'a').hasAttribute('src')).toBe(false)
    expect(container.querySelector('a[aria-label="Open a alone"]')).toBeNull()
  })

  it('loads its frame url with its reload counter', () => {
    const { container } = render(<Pair a={2} b={0} />)

    expect(iframeOf(container, 'a').getAttribute('src')).toBe(
      `${location.origin}/frames/studio/home/a.html?theme=light&v=2`,
    )
  })

  it('reloads only the frame whose counter changed', () => {
    const { container, rerender } = render(<Pair a={0} b={0} />)
    const untouched = iframeOf(container, 'b')

    rerender(<Pair a={1} b={0} />)

    expect(iframeOf(container, 'a').getAttribute('src')).toMatch(/&v=1$/)
    expect(iframeOf(container, 'b')).toBe(untouched)
    expect(untouched.getAttribute('src')).toMatch(/&v=0$/)
  })

  it('keeps the page it loaded when only its ref is renamed', () => {
    const { container, rerender } = render(
      <Frame frame={frame('a')} live version={0} />,
    )

    rerender(
      <Frame
        frame={{ ...frame('a'), ref: 'studio/start/a', page: 'start' }}
        live
        version={0}
      />,
    )

    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(
      `${location.origin}/frames/studio/home/a.html?theme=light&v=0`,
    )
  })

  it('reloads a renamed frame from its new path', () => {
    const renamed = { ...frame('a'), ref: 'studio/start/a', page: 'start' }
    const { container, rerender } = render(
      <Frame frame={frame('a')} live version={0} />,
    )
    rerender(<Frame frame={renamed} live version={0} />)

    rerender(<Frame frame={renamed} live version={1} />)

    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(
      `${location.origin}/frames/studio/start/a.html?theme=light&v=1`,
    )
  })

  it('draws a placeholder rather than a page when not live', () => {
    const { container } = render(
      <Frame frame={frame('far')} live={false} version={0} />,
    )

    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('[data-placeholder]')).not.toBeNull()
  })

  it('marks a locked frame on its label', () => {
    const { getByRole } = render(
      <Frame
        frame={{ ...frame('checkout'), locked: true }}
        live={false}
        version={0}
      />,
    )

    expect(getByRole('img', { name: 'Locked' })).toBeInTheDocument()
  })

  it('marks the label of a frame an agent changed', () => {
    const { getByRole } = render(
      <Frame frame={frame('checkout')} live={false} version={0} unseen />,
    )

    expect(getByRole('img', { name: 'Unseen change' })).toBeInTheDocument()
  })

  it('leaves the unseen mark to the claim while the frame is claimed', () => {
    const { queryByRole } = render(
      <Frame
        frame={frame('checkout')}
        live={false}
        version={0}
        unseen
        claim={{
          frame: 'studio/home/checkout',
          session: 's-1',
          agent: 'claude',
          tag: 'claude · studio',
          claimedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }}
      />,
    )

    expect(queryByRole('img', { name: 'Unseen change' })).toBeNull()
  })

  it("chips a kit frame's label with its kit", () => {
    const { getByTitle } = render(
      <Frame
        frame={{ ...frame('checkout'), kit: 'sketch' }}
        live={false}
        version={0}
      />,
    )

    expect(getByTitle('checkout')).toHaveTextContent('Kit sketch')
  })

  it('chips no kit on a plain frame', () => {
    const { getByTitle } = render(
      <Frame frame={frame('checkout')} live={false} version={0} />,
    )

    expect(getByTitle('checkout')).not.toHaveTextContent(/kit/i)
  })

  describe('the speaker note mark', () => {
    afterEach(() => {
      act(() => notesShownStore.setState({ shown: false }))
    })

    it('marks the label of a frame holding a note while notes are hidden', () => {
      const { getByTitle } = render(
        <Frame
          frame={{ ...frame('checkout'), speakerNotes: 'Open on the price.' }}
          live={false}
          version={0}
        />,
      )

      expect(getByTitle('checkout')).toHaveTextContent('Speaker note')
    })

    it('marks no label once notes are shown, since the strip holds the note', () => {
      notesShownStore.setState({ shown: true })

      const { getByTitle } = render(
        <Frame
          frame={{ ...frame('checkout'), speakerNotes: 'Open on the price.' }}
          live={false}
          version={0}
        />,
      )

      expect(getByTitle('checkout')).not.toHaveTextContent('Speaker note')
    })

    it('marks no label on a frame holding no note', () => {
      const { getByTitle } = render(
        <Frame frame={frame('checkout')} live={false} version={0} />,
      )

      expect(getByTitle('checkout')).not.toHaveTextContent('Speaker note')
    })
  })

  it('names the frame above it', () => {
    const { getByTitle } = render(
      <Frame frame={frame('checkout')} live={false} version={0} />,
    )

    expect(getByTitle('checkout')).toHaveTextContent('checkout')
  })

  it('draws the name at the label size in a regular weight', () => {
    const { getByTitle } = render(
      <Frame frame={frame('checkout')} live={false} version={0} />,
    )

    const style = getComputedStyle(getByTitle('checkout'))

    expect(style.fontSize).toBe('11px')
    expect(style.fontWeight).toBe('400')
  })

  it('marks the label with the count of its findings and lists each one', () => {
    const { getByRole } = render(
      <Frame
        frame={frame('checkout')}
        live={false}
        version={0}
        findings={[finding('One theme alone.'), finding('Default font.')]}
      />,
    )

    const mark = getByRole('button', { name: '2 check findings' })
    expect(mark).toHaveTextContent('2')
  })

  describe('findings popover', () => {
    const FINDINGS: Finding[] = [
      {
        ...finding('Sets its own colors for one theme alone.'),
        location: { line: 7, column: 3, startOffset: 60, endOffset: 91 },
      },
      {
        ...finding('Grows with the viewport.', 'warning'),
        rule: 'viewport',
      },
    ]

    afterEach(() => {
      act(() => openFindings(null))
      act(() => liveStore.setState({ canWrite: false }))
    })

    function renderMarked() {
      return render(
        <Frame
          frame={frame('checkout')}
          live={false}
          version={0}
          findings={FINDINGS}
        />,
      )
    }

    it('lists each finding by rule, line, and message once opened', async () => {
      const { findByRole } = renderMarked()

      act(() => openFindings('studio/home/checkout'))

      const list = await findByRole('dialog', {
        name: '2 findings on checkout',
      })
      expect(
        [...list.querySelectorAll('li')].map((item) => item.textContent),
      ).toEqual([
        'theme · line 7Sets its own colors for one theme alone.',
        'viewportGrows with the viewport.',
      ])
    })

    it('opens from the badge by keyboard', async () => {
      const { getByRole, findByRole } = renderMarked()

      getByRole('button', { name: '2 check findings' }).focus()
      await userEvent.keyboard('{Enter}')

      expect(await findByRole('dialog')).toBeInTheDocument()
    })

    it('opens with focus on the list, not on a card’s Turn off button', async () => {
      act(() => liveStore.setState({ canWrite: true }))
      const { getByRole, findByRole } = renderMarked()

      getByRole('button', { name: '2 check findings' }).focus()
      await userEvent.keyboard('{Enter}')

      const list = await findByRole('dialog')
      await expect.poll(() => document.activeElement).toBe(list)
      expect(
        getByRole('button', { name: 'Turn off in studio, theme' }),
      ).toBeInTheDocument()
    })

    it('closes on Esc before the board clears the selection', async () => {
      let clears = 0
      const unregister = registerActions([
        {
          id: 'selection.clear',
          label: 'Clear selection',
          group: 'selection',
          palette: false,
          keys: ['Escape'],
          run: () => {
            clears += 1
          },
        },
      ])
      const unbind = bindKeys(window)
      const { findByRole, queryByRole } = renderMarked()
      act(() => openFindings('studio/home/checkout'))
      await findByRole('dialog')

      await userEvent.keyboard('{Escape}')

      await expect.poll(() => queryByRole('dialog')).toBeNull()
      expect(clears).toBe(0)
      unbind()
      unregister()
    })
  })

  it('marks the pill error when any finding is an error', () => {
    const { getByRole } = render(
      <Frame
        frame={frame('checkout')}
        live={false}
        version={0}
        findings={[
          finding('Sized off the viewport.', 'warning'),
          finding('Cut off.'),
        ]}
      />,
    )

    expect(getByRole('button', { name: /check finding/ })).toHaveAttribute(
      'data-severity',
      'error',
    )
  })

  it('marks the pill warning when every finding is a warning', () => {
    const { getByRole } = render(
      <Frame
        frame={frame('checkout')}
        live={false}
        version={0}
        findings={[finding('Sized off the viewport.', 'warning')]}
      />,
    )

    expect(getByRole('button', { name: /check finding/ })).toHaveAttribute(
      'data-severity',
      'warning',
    )
  })

  describe('the mark’s form', () => {
    const CLEAR = 'rgba(0, 0, 0, 0)'
    const markOf = (findings: Finding[]) => {
      const { getByRole } = render(
        <Frame
          frame={frame('checkout')}
          live={false}
          version={0}
          findings={findings}
        />,
      )
      const mark = getByRole('button', { name: /check finding/ })
      return { mark, style: getComputedStyle(mark) }
    }

    it('draws warnings alone as a dot and a count with no fill or ring', () => {
      const { mark, style } = markOf([
        finding('Sized off the viewport.', 'warning'),
        finding('Generic font.', 'warning'),
      ])

      expect(mark).toHaveTextContent('2')
      expect(mark.querySelector('[data-findings-quiet]')).toBeVisible()
      expect(mark.querySelector('svg')).toBeNull()
      expect(style.backgroundColor).toBe(CLEAR)
      expect(style.boxShadow).toBe('none')
    })

    it('keeps the filled, ringed pill and its triangle for an error alone', () => {
      const { mark, style } = markOf([finding('Cut off.')])

      expect(mark.querySelector('svg')).toBeVisible()
      expect(mark.querySelector('[data-findings-quiet]')).toBeNull()
      expect(style.backgroundColor).not.toBe(CLEAR)
      expect(style.boxShadow).not.toBe('none')
    })

    it('keeps the filled pill for one error among warnings and counts every finding', () => {
      const { mark, style } = markOf([
        finding('Sized off the viewport.', 'warning'),
        finding('Generic font.', 'warning'),
        finding('Cut off.'),
      ])

      expect(mark).toHaveTextContent('3')
      expect(mark.querySelector('svg')).toBeVisible()
      expect(style.backgroundColor).not.toBe(CLEAR)
    })
  })

  it('marks nothing for a frame with no findings', () => {
    const { queryByRole } = render(
      <Frame
        frame={frame('checkout')}
        live={false}
        version={0}
        findings={[]}
      />,
    )

    expect(queryByRole('button', { name: /check finding/ })).toBeNull()
  })

  it('truncates the name and keeps the count on a narrow frame', () => {
    const narrow = {
      ...frame('a-very-long-frame-name-that-cannot-fit'),
      box: { x: 0, y: 0, width: 60, height: 100 },
    }
    const { getByRole, getByText } = render(
      <div className="relative" style={{ paddingTop: 40 }}>
        <Frame
          frame={narrow}
          live={false}
          version={0}
          findings={[finding('One theme alone.')]}
        />
      </div>,
    )

    const name = getByText(narrow.name)
    expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
    expect(
      getByRole('button', { name: /check finding/ }).getBoundingClientRect()
        .right,
    ).toBeLessThanOrEqual(
      Math.ceil(name.parentElement?.getBoundingClientRect().right ?? 0),
    )
  })

  it('keeps the count on a claimed narrow frame, truncating the claim tag', () => {
    const narrow = {
      ...frame('pricing'),
      box: { x: 0, y: 0, width: 136, height: 100 },
    }
    const { container, getByRole } = render(
      <div className="relative" style={{ paddingTop: 40 }}>
        <Frame
          frame={narrow}
          live={false}
          version={0}
          findings={[finding('One theme alone.'), finding('Default font.')]}
          claim={{
            frame: 'studio/home/pricing',
            session: 's-1',
            agent: 'claude',
            tag: 'claude · visual-style',
            claimedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }}
        />
      </div>,
    )

    // The label's children can overflow it, so the badge must hold the frame's edge.
    const edge = container
      .querySelector('[data-frame]')
      ?.getBoundingClientRect().right
    expect(
      getByRole('button', { name: '2 check findings' }).getBoundingClientRect()
        .right,
    ).toBeLessThanOrEqual(Math.ceil(edge ?? 0))
  })
})

describe('Frame theme', () => {
  afterEach(() => {
    act(() =>
      themeStore.setState({
        choice: 'system',
        system: 'light',
        flipped: new Set(),
      }),
    )
  })

  it("writes a theme change into the frame's root with no reload", async () => {
    const { container } = render(<Frame frame={frame('a')} live version={0} />)
    const iframe = iframeOf(container, 'a')
    await bridged(iframe)
    const src = iframe.getAttribute('src')
    let loads = 0
    iframe.addEventListener('load', () => (loads += 1))

    act(() => chooseTheme('dark'))

    await expect.poll(() => themeOfRoot(iframe)).toBe('dark')
    const root = iframe.contentDocument?.documentElement
    expect(root?.style.colorScheme).toBe('dark')
    expect(root?.classList.contains('dark')).toBe(true)
    expect(iframe.style.colorScheme).toBe('dark')
    expect(iframe.getAttribute('src')).toBe(src)
    expect(loads).toBe(0)
  })

  it('serves a frame that reloads after a theme change in the new theme', () => {
    const { container, rerender } = render(
      <Frame frame={frame('a')} live version={0} />,
    )
    act(() => chooseTheme('dark'))

    rerender(<Frame frame={frame('a')} live version={1} />)

    expect(iframeOf(container, 'a').getAttribute('src')).toBe(
      `${location.origin}/frames/studio/home/a.html?theme=dark&v=1`,
    )
  })

  it('sends the theme a page missed while it was loading', async () => {
    const { container } = render(<Frame frame={frame('a')} live version={0} />)
    const iframe = iframeOf(container, 'a')
    await loaded(iframe)

    act(() => chooseTheme('dark'))
    await bridgeIn(iframe)

    await expect.poll(() => themeOfRoot(iframe)).toBe('dark')
  })

  it('shows a flipped frame in the opposite theme and leaves the others', async () => {
    act(() => chooseTheme('dark'))
    const { container } = render(<Pair a={0} b={0} />)
    await Promise.all([
      bridged(iframeOf(container, 'a')),
      bridged(iframeOf(container, 'b')),
    ])
    await expect.poll(() => themeOfRoot(iframeOf(container, 'b'))).toBe('dark')

    act(() => flipFrame('studio/home/a'))

    await expect.poll(() => themeOfRoot(iframeOf(container, 'a'))).toBe('light')
    expect(iframeOf(container, 'a').style.colorScheme).toBe('light')
    expect(themeOfRoot(iframeOf(container, 'b'))).toBe('dark')
  })
})

describe('Frame on a new page', () => {
  const SHOWN = 'c'.repeat(64)
  const OTHER = 'd'.repeat(64)

  afterEach(() => {
    act(() => clear(selectionStore))
  })

  async function pickedOnReload(hash: string): Promise<void> {
    const { container, rerender } = render(
      <Frame frame={frame('a')} live version={0} />,
    )
    await bridged(iframeOf(container, 'a'), SHOWN)
    act(() =>
      selectElement(selectionStore, 'studio/home', {
        frame: 'studio/home/a',
        index: 4,
        hash: SHOWN,
      }),
    )
    const reloaded = loaded(iframeOf(container, 'a'))

    rerender(<Frame frame={frame('a')} live version={1} />)
    await reloaded
    await bridgeIn(iframeOf(container, 'a'), { hash })
  }

  it('drops an element picked in other bytes to its frame', async () => {
    await pickedOnReload(OTHER)

    await expect.poll(() => selectionStore.getState().element).toBeNull()
    expect(selectionStore.getState().frames).toEqual(['studio/home/a'])
  })

  it('keeps an element picked in the bytes the new page shows', async () => {
    await pickedOnReload(SHOWN)

    expect(selectionStore.getState().element?.index).toBe(4)
  })
})

function themeOfRoot(iframe: HTMLIFrameElement): string | null {
  return (
    iframe.contentDocument?.documentElement.getAttribute('data-theme') ?? null
  )
}

describe('Frame theme marker', () => {
  afterEach(() => {
    act(() =>
      themeStore.setState({
        choice: 'system',
        system: 'light',
        flipped: new Set(),
      }),
    )
  })

  it('keeps the sun of a frame following the board out of sight at rest', () => {
    const { container } = render(
      <Frame frame={frame('a')} live={false} version={0} />,
    )

    const marker = container.querySelector('[aria-label="Flip a to dark"]')
    expect(marker).not.toBeNull()
    expect(marker).not.toBeVisible()
  })

  it('draws the sun while the pointer is over the frame', () => {
    const { container, getByRole } = render(
      <Frame frame={frame('a')} live={false} version={0} />,
    )

    container
      .querySelector('[data-frame]')
      ?.setAttribute('data-label-hover', '')

    const marker = getByRole('button', { name: 'Flip a to dark' })
    expect(marker).toBeVisible()
    expect(marker).toHaveTextContent('')
    expect(marker.querySelector('svg')).not.toBeNull()
  })

  it.each([
    ['light', 'Dark', 'Dark: flip a to light'],
    ['dark', 'Light', 'Light: flip a to dark'],
  ] as const)(
    'names a frame flipped on a %s board by its shown theme first',
    (board, shown, label) => {
      act(() => chooseTheme(board))
      act(() => flipFrame('studio/home/a'))

      const { getByRole } = render(
        <Frame frame={frame('a')} live={false} version={0} />,
      )

      expect(getByRole('button', { name: label })).toHaveTextContent(shown)
    },
  )

  it('flips the frame back on a click', async () => {
    act(() => flipFrame('studio/home/a'))
    const { container, getByRole } = render(
      <Frame frame={frame('a')} live={false} version={0} />,
    )

    await userEvent.click(
      getByRole('button', { name: 'Dark: flip a to light' }),
    )

    expect(
      container.querySelector('[aria-label="Flip a to dark"]'),
    ).toHaveTextContent('')
  })
})

describe('Frame open-alone link', () => {
  afterEach(() => {
    act(() => {
      clear(selectionStore)
      modeStore.setState({ tool: 'move', mode: 'edit' })
    })
  })

  const link = (container: HTMLElement) =>
    container.querySelector<HTMLAnchorElement>('a[aria-label="Open a alone"]')

  it('opens the frame’s own address in a new tab', () => {
    const { container } = render(
      <Frame frame={frame('a')} live={false} version={0} />,
    )

    expect(link(container)).toHaveAttribute(
      'href',
      `${location.origin}/frames/studio/home/a.html`,
    )
    expect(link(container)).toHaveAttribute('target', '_blank')
    expect(link(container)).toHaveAttribute('rel', 'noopener')
  })

  it('stays out of sight at rest', () => {
    const { container } = render(
      <Frame frame={frame('a')} live={false} version={0} />,
    )

    expect(link(container)).not.toBeVisible()
  })

  it('shows while the pointer is over the frame', () => {
    const { container } = render(
      <Frame frame={frame('a')} live={false} version={0} />,
    )

    container
      .querySelector('[data-frame]')
      ?.setAttribute('data-label-hover', '')

    expect(link(container)).toBeVisible()
  })

  it('shows while the frame is selected', () => {
    act(() => select(selectionStore, 'studio/home', ['studio/home/a']))
    const { container } = render(
      <Frame frame={frame('a')} live={false} version={0} />,
    )

    expect(link(container)).toBeVisible()
  })

  it('is left out in Play', () => {
    act(() => modeStore.setState({ mode: 'play' }))
    const { container } = render(
      <Frame frame={frame('a')} live={false} version={0} />,
    )

    expect(link(container)).toBeNull()
  })
})

describe('Frame label focus rings', () => {
  afterEach(() => {
    act(() =>
      themeStore.setState({
        choice: 'system',
        system: 'light',
        flipped: new Set(),
      }),
    )
    document.documentElement.classList.remove('dark')
  })

  it.each(['light', 'dark'])(
    'rings the flipped theme marker at 3:1 or better on the canvas in %s',
    async (theme) => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
      act(() => flipFrame('studio/home/a'))
      const { getByRole } = render(
        <div className="bg-background">
          <Frame frame={frame('a')} live={false} version={0} />
        </div>,
      )

      const ring = await ringFocused(
        getByRole('button', { name: /^(Dark|Light): flip a/ }),
      )

      expect(ring).toBeGreaterThanOrEqual(3)
    },
  )

  it.each(['light', 'dark'])(
    'rings the sun marker at 3:1 or better on the canvas in %s',
    async (theme) => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
      const { container, getByRole } = render(
        <div className="bg-background">
          <Frame frame={frame('a')} live={false} version={0} />
        </div>,
      )
      container
        .querySelector('[data-frame]')
        ?.setAttribute('data-label-hover', '')

      const ring = await ringFocused(
        getByRole('button', { name: 'Flip a to dark' }),
      )

      expect(ring).toBeGreaterThanOrEqual(3)
    },
  )

  it.each(['light', 'dark'])(
    'rings the findings count at 3:1 or better on the canvas in %s',
    async (theme) => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
      const { getByRole } = render(
        <div className="bg-background">
          <Frame
            frame={frame('a')}
            live={false}
            version={0}
            findings={[finding('One theme alone.')]}
          />
        </div>,
      )

      const ring = await ringFocused(
        getByRole('button', { name: '1 check finding' }),
      )

      expect(ring).toBeGreaterThanOrEqual(3)
    },
  )
})

describe('Frame label at low zoom', () => {
  function renderCrowded(findings?: readonly Finding[]) {
    const view = render(
      <Frame
        frame={frame('checkout')}
        live={false}
        version={0}
        findings={findings}
      />,
    )
    const root = view.container.querySelector<HTMLElement>('[data-frame]')
    if (!root) throw new Error('no frame root')
    root.setAttribute('data-label-crowded', '')
    return { ...view, root }
  }

  it('hides a crowded label', () => {
    const { getByTitle } = renderCrowded()

    expect(getByTitle('checkout')).not.toBeVisible()
  })

  it('shows a crowded label under the pointer', () => {
    const { getByTitle, root } = renderCrowded()

    root.setAttribute('data-label-hover', '')

    expect(getByTitle('checkout')).toBeVisible()
  })

  describe('on a previewed frame', () => {
    afterEach(() => {
      act(() => endPreview(['studio/home/checkout']))
    })

    it('hides the preview chip with a crowded label', () => {
      act(() => setPreview(['studio/home/checkout'], 390))
      const { container } = renderCrowded()

      expect(container.querySelector('[data-preview-chip]')).not.toBeVisible()
    })

    it('shows the preview chip with a crowded label under the pointer', () => {
      act(() => setPreview(['studio/home/checkout'], 390))
      const { container, root } = renderCrowded()

      root.setAttribute('data-label-hover', '')

      expect(container.querySelector('[data-preview-chip]')).toBeVisible()
    })
  })

  it('shows a crowded label while the frame is selected', () => {
    const { getByTitle, root } = renderCrowded()

    root.setAttribute('data-selected', 'true')

    expect(getByTitle('checkout')).toBeVisible()
  })

  it('keeps a findings dot on the corner of a crowded frame', () => {
    const { container } = renderCrowded([finding('Raw color')])

    const dot = container.querySelector<HTMLElement>('[data-findings-dot]')
    expect(dot).toBeVisible()
    expect(dot?.dataset.findingsBadge).toBe('studio/home/checkout')
  })

  it('centers the findings dot on the top left corner, clear of a frame note', () => {
    const { container, root } = renderCrowded([finding('Raw color')])

    const dot = container.querySelector<HTMLElement>('[data-findings-dot]')
    const box = dot?.getBoundingClientRect()
    const corner = root.getBoundingClientRect()
    expect(box && box.left + box.width / 2).toBeCloseTo(corner.left, 0)
    expect(box && box.top + box.height / 2).toBeCloseTo(corner.top, 0)
  })

  it.each([
    [
      'grey for warnings alone',
      [finding('Generic font.', 'warning')],
      '--muted-foreground',
    ],
    [
      'red for one error among warnings',
      [finding('Generic font.', 'warning'), finding('Cut off.')],
      '--destructive',
    ],
  ])('fills the crowded frame’s dot %s', (_, findings, token) => {
    const { container } = renderCrowded(findings)
    const probe = document.createElement('i')
    probe.style.backgroundColor = `var(${token})`
    container.append(probe)

    const dot = container.querySelector<HTMLElement>('[data-findings-dot]')

    expect(dot && getComputedStyle(dot).backgroundColor).toBe(
      getComputedStyle(probe).backgroundColor,
    )
  })

  it('draws no findings dot while the label shows', () => {
    const { container } = render(
      <Frame
        frame={frame('checkout')}
        live={false}
        version={0}
        findings={[finding('Raw color')]}
      />,
    )

    expect(container.querySelector('[data-findings-dot]')).not.toBeVisible()
  })
})

describe('Frame preview', () => {
  afterEach(() => {
    act(() => endPreview(['studio/home/a']))
  })

  it('lays the live page out at the previewed width without reloading it', async () => {
    const { container } = render(<Frame frame={frame('a')} live version={0} />)
    const iframe = iframeOf(container, 'a')
    await loaded(iframe)
    const src = iframe.getAttribute('src')
    let loads = 0
    iframe.addEventListener('load', () => (loads += 1))

    act(() => setPreview(['studio/home/a'], 1440))

    expect(iframe.contentWindow?.innerWidth).toBe(1440)
    expect(iframe.getAttribute('src')).toBe(src)
    expect(loads).toBe(0)
  })

  it("flips the page's width media queries", async () => {
    const { container } = render(<Frame frame={frame('a')} live version={0} />)
    const iframe = iframeOf(container, 'a')
    await loaded(iframe)
    const phone = () => iframe.contentWindow?.matchMedia('(max-width: 600px)')
    const before = phone()?.matches

    act(() => setPreview(['studio/home/a'], 1440))

    expect(before).toBe(true)
    expect(phone()?.matches).toBe(false)
  })

  it('marks the label with the previewed width', () => {
    const { container } = render(<Frame frame={frame('a')} live version={0} />)

    act(() => setPreview(['studio/home/a'], 834))

    expect(container.querySelector('[data-preview-chip]')).toHaveTextContent(
      'Preview 834',
    )
  })

  it('draws a hugging height at its content height for the previewed width', async () => {
    const hugging = { ...frame('a'), hugHeight: true }
    const { container } = render(<Frame frame={hugging} live version={0} />)
    const iframe = iframeOf(container, 'a')
    await bridged(iframe)
    const document = iframe.contentDocument
    if (!document) throw new Error('no frame document')
    document.body.innerHTML = '<div style="height:320px"></div>'
    document.body.style.margin = '0'

    act(() => setPreview(['studio/home/a'], 1440))

    const root = container.querySelector<HTMLElement>('[data-frame]')
    await expect.poll(() => root?.style.height).toBe('320px')
  })

  it('reads a hugging height again when a kept drop stamps the page, with no load', async () => {
    const hugging = { ...frame('a'), hugHeight: true }
    const { container } = render(<Frame frame={hugging} live version={0} />)
    const iframe = iframeOf(container, 'a')
    await bridged(iframe)
    const document = iframe.contentDocument
    if (!document) throw new Error('no frame document')
    document.body.innerHTML = '<div style="height:320px"></div>'
    document.body.style.margin = '0'
    act(() => setPreview(['studio/home/a'], 1440))
    const root = container.querySelector<HTMLElement>('[data-frame]')
    await expect.poll(() => root?.style.height).toBe('320px')
    document.body.innerHTML = '<div style="height:480px"></div>'

    act(() => stampRenderedHash(iframe, 'd'.repeat(64)))

    await expect.poll(() => root?.style.height).toBe('480px')
  })

  it("reads a hugging height at the previewed width's reference height, not the box's", async () => {
    const hugging = {
      ...frame('a'),
      hugHeight: true,
      box: { x: 0, y: 0, width: 390, height: 1900 },
    }
    const { container } = render(<Frame frame={hugging} live version={0} />)
    const iframe = iframeOf(container, 'a')
    await bridged(iframe)
    const document = iframe.contentDocument
    if (!document) throw new Error('no frame document')
    document.body.innerHTML = '<div style="height:max(900px, 100vh)"></div>'
    document.body.style.margin = '0'

    act(() => setPreview(['studio/home/a'], 1440))

    const root = container.querySelector<HTMLElement>('[data-frame]')
    await expect.poll(() => root?.style.height).toBe('900px')
  })

  it('keeps a fixed height at a previewed width', async () => {
    const { container } = render(<Frame frame={frame('a')} live version={0} />)
    const iframe = iframeOf(container, 'a')
    await loaded(iframe)
    iframe.contentDocument?.body.replaceChildren()

    act(() => setPreview(['studio/home/a'], 1440))

    const root = container.querySelector<HTMLElement>('[data-frame]')
    expect(root?.style.height).toBe('844px')
  })

  it('keeps the chip inside the label of a narrow frame, truncating the name first', () => {
    const narrow = {
      ...frame('a'),
      name: 'a-very-long-frame-name-that-cannot-fit',
      box: { x: 0, y: 0, width: 60, height: 844 },
    }
    const { container, getByText } = render(
      <div className="relative" style={{ paddingTop: 40 }}>
        <Frame frame={narrow} live={false} version={0} />
      </div>,
    )

    act(() => setPreview(['studio/home/a'], 40))

    const chip = container.querySelector('[data-preview-chip]')
    const label = getByText(narrow.name).parentElement
    const name = getByText(narrow.name)
    expect(name.clientWidth).toBe(0)
    expect(chip?.getBoundingClientRect().right).toBeLessThanOrEqual(
      Math.ceil(label?.getBoundingClientRect().right ?? 0),
    )
  })

  it('gives a label narrowed by a preview the room its stored box holds', () => {
    const named = { ...frame('a'), name: 'checkout-summary-mobile' }
    const { container, getByText } = render(
      <div className="relative" style={{ paddingTop: 40 }}>
        <Frame frame={named} live={false} version={0} />
      </div>,
    )

    act(() => setPreview(['studio/home/a'], 60))

    const name = getByText(named.name)
    expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth)
    expect(container.querySelector('[data-preview-chip]')).toBeVisible()
  })

  it('draws at its stored width once the preview ends', () => {
    const { container } = render(<Frame frame={frame('a')} live version={0} />)
    act(() => setPreview(['studio/home/a'], 834))

    act(() => endPreview(['studio/home/a']))

    const root = container.querySelector<HTMLElement>('[data-frame]')
    expect(root?.style.width).toBe('390px')
    expect(container.querySelector('[data-preview-chip]')).toBeNull()
  })
})

describe('LabelRename', () => {
  const HERO = frame('hero')

  /** A server answering each rename with the frame under its new name, recording each body. */
  function server() {
    const sent: unknown[] = []
    const calls = createStructure(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { name: string }
      sent.push(body)
      return Response.json({ ...HERO, name: body.name })
    })
    return { calls, sent }
  }

  afterEach(() => act(() => stopFrameRename()))

  it('opens a field holding the name while the canvas renames the frame', () => {
    const { calls } = server()
    const view = render(<LabelRename frames={[HERO]} calls={calls} />)

    act(() => startFrameRename(HERO.ref, 'canvas'))

    expect(
      view.getByRole('textbox', { name: 'Rename frame hero' }),
    ).toHaveValue('hero')
  })

  it('hugs a short name on a frame wider than the field', () => {
    const { calls } = server()
    const view = render(<LabelRename frames={[HERO]} calls={calls} />)

    act(() => startFrameRename(HERO.ref, 'canvas'))

    const { width } = view
      .getByRole('textbox', { name: 'Rename frame hero' })
      .getBoundingClientRect()
    expect(width).toBeGreaterThan(20)
    expect(width).toBeLessThan(80)
  })

  it('stops a long name at 240 screen pixels on a frame wider than that', async () => {
    const { calls } = server()
    const view = render(<LabelRename frames={[HERO]} calls={calls} />)
    act(() => startFrameRename(HERO.ref, 'canvas'))

    await userEvent.keyboard(`{End}${'x'.repeat(80)}`)

    const field = view.getByRole('textbox', { name: 'Rename frame hero' })
    expect(field.getBoundingClientRect().width).toBe(240)
  })

  it('opens no field while another surface renames the frame', () => {
    const { calls } = server()
    const view = render(<LabelRename frames={[HERO]} calls={calls} />)

    act(() => startFrameRename(HERO.ref, 'inspector'))

    expect(view.queryByRole('textbox')).toBeNull()
  })

  it('renames the frame on Enter and closes the field', async () => {
    const { calls, sent } = server()
    const view = render(<LabelRename frames={[HERO]} calls={calls} />)
    act(() => startFrameRename(HERO.ref, 'canvas'))

    await userEvent.keyboard('cover{Enter}')

    expect(sent).toEqual([{ ref: HERO.ref, name: 'cover' }])
    expect(view.queryByRole('textbox')).toBeNull()
  })

  it('closes on Esc with nothing sent and the key kept from the board', async () => {
    const { calls, sent } = server()
    let reached = false
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') reached = true
    }
    window.addEventListener('keydown', onKey)
    const view = render(<LabelRename frames={[HERO]} calls={calls} />)
    act(() => startFrameRename(HERO.ref, 'canvas'))

    await userEvent.keyboard('cover{Escape}')
    window.removeEventListener('keydown', onKey)

    expect([sent, renamingFrame().ref, reached]).toEqual([[], null, false])
    expect(view.queryByRole('textbox')).toBeNull()
  })
})

describe('Frame label while the canvas renames it', () => {
  afterEach(() => act(() => stopFrameRename()))

  it('hides the label the field draws over', () => {
    const { getByTitle } = render(
      <Frame frame={frame('hero')} live={false} version={0} />,
    )

    act(() => startFrameRename('studio/home/hero', 'canvas'))

    expect(getByTitle('hero')).not.toBeVisible()
  })
})

describe('Frame held at a moment', () => {
  afterEach(() => {
    act(() => {
      releaseMotion('studio/home/a')
      modeStore.setState({ mode: 'edit' })
    })
  })

  it('names the held moment in the label', () => {
    const { getByRole } = render(<Frame frame={frame('a')} live version={0} />)

    act(() => holdMotion('studio/home/a', 1250))

    expect(
      getByRole('button', { name: 'Held at 1.25 s. Resume' }),
    ).toBeVisible()
  })

  it('resumes the frame when the chip is pressed', async () => {
    const { getByRole } = render(<Frame frame={frame('a')} live version={0} />)
    act(() => holdMotion('studio/home/a', 1250))

    await userEvent.click(getByRole('button', { name: /^Held at/ }))

    expect(motionHoldOf('studio/home/a')).toBeUndefined()
  })

  it('shows no chip while the board plays the frame', () => {
    const { queryByRole } = render(
      <Frame frame={frame('a')} live version={0} />,
    )

    act(() => playMotion('studio/home/a', 500))

    expect(queryByRole('button', { name: /^Held at/ })).toBeNull()
  })

  it('hands the frame back to its own clock on entering Play', () => {
    render(<Frame frame={frame('a')} live version={0} />)
    act(() => holdMotion('studio/home/a', 1250))

    act(() => modeStore.setState({ mode: 'play' }))

    expect(motionHoldOf('studio/home/a')).toBeUndefined()
  })

  it('drops the hold when the frame leaves the canvas', () => {
    const { unmount } = render(<Frame frame={frame('a')} live version={0} />)
    act(() => holdMotion('studio/home/a', 1250))

    unmount()

    expect(motionHoldOf('studio/home/a')).toBeUndefined()
  })
})

describe('Frame while its page loads', () => {
  // Timers alone, so the iframe's own load still arrives from the browser.
  function fakeTimers() {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  }

  function blockOf(container: HTMLElement): HTMLElement | null {
    return container.querySelector<HTMLElement>('[data-loading-block]')
  }

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    act(() =>
      themeStore.setState({
        choice: 'system',
        system: 'light',
        flipped: new Set(),
      }),
    )
  })

  it('draws no block in its first second', () => {
    fakeTimers()
    const { container } = render(<Frame frame={frame('a')} live version={0} />)

    act(() => vi.advanceTimersByTime(999))

    expect(blockOf(container)).toBeNull()
  })

  it('draws the block over a page still loading after a second', () => {
    fakeTimers()
    const { container } = render(<Frame frame={frame('a')} live version={0} />)

    act(() => vi.advanceTimersByTime(1000))

    expect(blockOf(container)).not.toBeNull()
  })

  it('marks the iframe busy while the block shows', () => {
    fakeTimers()
    const { container } = render(<Frame frame={frame('a')} live version={0} />)

    act(() => vi.advanceTimersByTime(1000))

    expect(iframeOf(container, 'a').getAttribute('aria-busy')).toBe('true')
  })

  it('draws the block under a device bezel', () => {
    fakeTimers()
    const { container } = render(
      <Frame frame={{ ...frame('a'), device: 'phone' }} live version={0} />,
    )

    act(() => vi.advanceTimersByTime(1000))

    const bezel = container.querySelector('[data-bezel]')
    expect(bezel && blockOf(container)?.compareDocumentPosition(bezel)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('rounds the block to a phone screen, so it stays inside the bezel', () => {
    fakeTimers()
    const { container } = render(
      <Frame frame={{ ...frame('a'), device: 'phone' }} live version={0} />,
    )

    act(() => vi.advanceTimersByTime(1000))

    const block = blockOf(container)
    expect(block && getComputedStyle(block).borderBottomLeftRadius).toBe('62px')
  })

  it('keeps the block square with no device', () => {
    fakeTimers()
    const { container } = render(<Frame frame={frame('a')} live version={0} />)

    act(() => vi.advanceTimersByTime(1000))

    const block = blockOf(container)
    expect(block && getComputedStyle(block).borderTopLeftRadius).toBe('0px')
  })

  it('drops the block once the page loads', async () => {
    fakeTimers()
    const { container } = render(<Frame frame={frame('a')} live version={0} />)
    const load = loaded(iframeOf(container, 'a'))
    act(() => vi.advanceTimersByTime(1000))

    await act(() => load)

    expect(blockOf(container)).toBeNull()
  })

  it('draws no block over a painted page reloading', async () => {
    fakeTimers()
    const { container, rerender } = render(
      <Frame frame={frame('a')} live version={0} />,
    )
    await act(() => loaded(iframeOf(container, 'a')))

    rerender(<Frame frame={frame('a')} live version={1} />)
    act(() => vi.advanceTimersByTime(1000))

    expect(blockOf(container)).toBeNull()
  })

  it('waits a second again for a frame brought back live', async () => {
    fakeTimers()
    const { container, rerender } = render(
      <Frame frame={frame('a')} live version={0} />,
    )
    await act(() => loaded(iframeOf(container, 'a')))
    rerender(<Frame frame={frame('a')} live={false} version={0} />)

    rerender(<Frame frame={frame('a')} live version={0} />)
    act(() => vi.advanceTimersByTime(1000))

    expect(blockOf(container)).not.toBeNull()
  })

  it("fills the block from a flipped frame's own theme", () => {
    fakeTimers()
    act(() => flipFrame('studio/home/a'))
    const { container } = render(<Frame frame={frame('a')} live version={0} />)

    act(() => vi.advanceTimersByTime(1000))

    const block = blockOf(container)
    expect(block && getComputedStyle(block).backgroundColor).toBe(
      'rgb(54, 54, 54)',
    )
  })

  it('fills the block light for a frame flipped light on a dark board', () => {
    fakeTimers()
    act(() => chooseTheme('dark'))
    act(() => flipFrame('studio/home/a'))
    const { container } = render(<Frame frame={frame('a')} live version={0} />)

    act(() => vi.advanceTimersByTime(1000))

    const block = blockOf(container)
    expect(block && getComputedStyle(block).backgroundColor).toBe(
      'rgb(242, 242, 242)',
    )
  })
})
