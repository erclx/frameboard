import '../styles.css'

import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { registerActions } from '@/client/actions/registry'
import { chooseTheme, flipFrame, themeStore } from '@/client/theme/store'
import type { Finding } from '@/shared/records/check'
import type { FrameRecord } from '@/shared/records/list'

import { Frame } from './frame'
import { modeStore } from './mode'

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
          keys: ['Escape'],
          run: () => (exits += 1),
        },
      ]),
    )
    act(() => modeStore.setState({ mode: 'play' }))
    const { container, rerender } = render(
      <Frame frame={frame('a')} live version={0} />,
    )
    await loaded(iframeOf(container, 'a'))
    const reloaded = loaded(iframeOf(container, 'a'))

    rerender(<Frame frame={frame('a')} live version={1} />)
    await reloaded
    pressEscapeIn(iframeOf(container, 'a'))

    expect(exits).toBe(1)
  })
})

describe('Frame', () => {
  it('loads its frame url with its reload counter', () => {
    const { container } = render(<Pair a={2} b={0} />)

    expect(iframeOf(container, 'a').getAttribute('src')).toBe(
      '/frames/studio/home/a.html?theme=light&v=2',
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

  it('draws a placeholder rather than a page when not live', () => {
    const { container } = render(
      <Frame frame={frame('far')} live={false} version={0} />,
    )

    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('[data-placeholder]')).not.toBeNull()
  })

  it('names the frame above it', () => {
    const { getByTitle } = render(
      <Frame frame={frame('checkout')} live={false} version={0} />,
    )

    expect(getByTitle('checkout')).toHaveTextContent('checkout')
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

    const mark = getByRole('img', { name: '2 check findings' })
    expect(mark).toHaveTextContent('2')
    expect(mark).toHaveAttribute('title', 'One theme alone.\nDefault font.')
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

    expect(getByRole('img')).toHaveAttribute('data-severity', 'error')
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

    expect(getByRole('img')).toHaveAttribute('data-severity', 'warning')
  })

  it('tints an error pill in the destructive hue and a warning pill in the note hue', () => {
    const { getAllByRole } = render(
      <>
        <Frame
          frame={frame('a')}
          live={false}
          version={0}
          findings={[finding('Cut off.')]}
        />
        <Frame
          frame={frame('b')}
          live={false}
          version={0}
          findings={[finding('Sized off the viewport.', 'warning')]}
        />
      </>,
    )
    const hue = (element: HTMLElement) =>
      getComputedStyle(element).getPropertyValue('--h').trim()

    const [error, warning] = getAllByRole('img')

    expect(error && hue(error)).toBe(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--destructive')
        .trim(),
    )
    expect(warning && hue(warning)).toBe(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--note')
        .trim(),
    )
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

    expect(queryByRole('img')).toBeNull()
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
    expect(getByRole('img').getBoundingClientRect().right).toBeLessThanOrEqual(
      Math.ceil(name.parentElement?.getBoundingClientRect().right ?? 0),
    )
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
    await loaded(iframe)
    const src = iframe.getAttribute('src')
    let loads = 0
    iframe.addEventListener('load', () => (loads += 1))

    act(() => chooseTheme('dark'))

    const root = iframe.contentDocument?.documentElement
    expect(root?.getAttribute('data-theme')).toBe('dark')
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
      '/frames/studio/home/a.html?theme=dark&v=1',
    )
  })

  it('shows a flipped frame in the opposite theme and leaves the others', async () => {
    act(() => chooseTheme('dark'))
    const { container } = render(<Pair a={0} b={0} />)
    await Promise.all([
      loaded(iframeOf(container, 'a')),
      loaded(iframeOf(container, 'b')),
    ])

    act(() => flipFrame('studio/home/a'))

    expect(themeOfRoot(iframeOf(container, 'a'))).toBe('light')
    expect(iframeOf(container, 'a').style.colorScheme).toBe('light')
    expect(themeOfRoot(iframeOf(container, 'b'))).toBe('dark')
  })
})

function themeOfRoot(iframe: HTMLIFrameElement): string | null {
  return (
    iframe.contentDocument?.documentElement.getAttribute('data-theme') ?? null
  )
}
